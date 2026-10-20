/**
 * Appareils : challenge, enrôlement à deux clés, liste, révocation.
 *
 * Le modèle vient de D4 : deux paires EC P-256 dans le Keystore Android.
 * `signingKey` signe chaque requête, `agreementKey` sert à l'ECDH qui scelle le
 * bundle. Aucune des deux clés privées ne quitte le téléphone ; la base ne
 * stocke que le SPKI public.
 *
 * L'enrôlement prouve la possession de la clé de signature : le client signe la
 * forme canonique habituelle (`canonicalProof`, lib/crypto.ts) avec, comme
 * nonce, celui du challenge. `verifyDeviceProof` ne peut pas être réutilisé ici
 * — il lit la clé publique en base, or la ligne `devices` n'existe pas encore.
 * Dès l'enrôlement terminé, toutes les routes repassent par
 * `verifyDeviceProof`.
 *
 * Ce que l'enrôlement ne prouve pas : que l'APK est officiel. Play Integrity
 * reste une corroboration (`integrity_ok`), jamais la seule défense.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Database, Row } from "../db.js";
import { canonicalProof, hashToken, newId, newNonce, newToken, parseSpki, verifyDeviceSignature } from "../lib/crypto.js";
import { fail } from "../lib/errors.js";
import { ensureDeviceSlot, parseBody, requireSession, toDeviceDto } from "./me.js";

/** Durée de vie d'un challenge : celle des nonces du contrat (60 s). */
const CHALLENGE_TTL_SECONDS = 60;

/* --------------------------------------------------------------- contrats */

const challengeSchema = z
  .object({
    installationId: z.string().trim().min(8).max(190),
    purpose: z.enum(["enroll", "login", "refresh"]),
  })
  .strict();

const enrollSchema = z
  .object({
    challengeId: z.string().trim().min(1).max(190),
    installationId: z.string().trim().min(8).max(190),
    deviceName: z.string().trim().min(2).max(64),
    platform: z.enum(["android", "ios"]).optional(),
    /** Base64 SPKI, EC P-256, usage SIGN. */
    signingKey: z.string().min(40).max(4096),
    /** Base64 SPKI, EC P-256, usage AGREE. */
    agreementKey: z.string().min(40).max(4096),
    appVersion: z.string().trim().min(1).max(64),
    androidVersion: z.number().int().min(1).max(1000),
    /** Optionnel : stocké, pas encore appliqué (`integrity.enforce`). */
    integrityToken: z.string().max(8192).optional(),
  })
  .strict();

const deviceIdParams = z.object({ deviceId: z.string().trim().min(1).max(190) });

/* -------------------------------------------------------------- validation */

/**
 * Le champ est public (JWK/SPKI), mais son type ne l'est pas : accepter une clé
 * RSA « parce que c'est une clé » ferait échouer l'ECDH au moment du bundle,
 * loin de la cause. On refuse à l'entrée.
 */
function assertEcP256(spkiB64: string, field: "signingKey" | "agreementKey"): void {
  let key;
  try {
    key = parseSpki(spkiB64);
  } catch {
    throw fail.validation({ [field]: "Clé publique illisible (SPKI base64 attendu)." });
  }
  if (key.asymmetricKeyType !== "ec") {
    throw fail.validation({ [field]: "Clé EC P-256 attendue." });
  }
  const curve = (key.asymmetricKeyDetails as { namedCurve?: string } | undefined)?.namedCurve;
  if (curve !== "prime256v1" && curve !== "secp256r1") {
    throw fail.validation({ [field]: "Courbe prime256v1 (P-256) attendue." });
  }
}

/** En-têtes de preuve, mêmes noms que `verifyDeviceProof`. */
function proofHeaders(req: FastifyRequest): { timestamp: string; nonce: string; signature: string } {
  const timestamp = req.headers["x-device-timestamp"];
  const nonce = req.headers["x-device-nonce"];
  const signature = req.headers["x-device-signature"];
  if (typeof timestamp !== "string" || typeof nonce !== "string" || typeof signature !== "string") {
    throw fail.deviceProof("En-têtes de preuve manquants.");
  }
  return { timestamp, nonce, signature };
}

/* ------------------------------------------------------------------ routes */

export function registerDeviceRoutes(app: FastifyInstance, db: Database): void {
  /**
   * Challenge public. Il ne donne aucun droit : il fixe un nonce à usage unique
   * et l'heure serveur, pour que le client puisse signer sans horloge fiable.
   */
  app.post("/v1/devices/challenges", async (req: FastifyRequest) => {
    const input = parseBody(challengeSchema, req.body);

    await db.query("DELETE FROM enroll_challenges WHERE expires_at < now() - interval '1 day'");

    const challengeId = newId();
    const nonce = newNonce(24);
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_SECONDS * 1000);

    await db.query(
      `INSERT INTO enroll_challenges (id, nonce, installation_id, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [challengeId, nonce, input.installationId, expiresAt],
    );

    return {
      challengeId,
      nonce,
      expiresAt: expiresAt.toISOString(),
      serverTime: new Date().toISOString(),
    };
  });

  /**
   * Enrôlement. Le challenge est consommé dans la même transaction que la
   * création de l'appareil : un challenge ne peut pas produire deux appareils.
   */
  app.post("/v1/devices/enroll", async (req: FastifyRequest, reply) => {
    const input = parseBody(enrollSchema, req.body);
    const proof = proofHeaders(req);

    // Horodatage : même tolérance que `verifyDeviceProof` (±120 s).
    const ts = Number(proof.timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 120_000) {
      throw fail.deviceProof("Horodatage hors tolérance.");
    }

    const challenge = await db.one<Row>(
      `SELECT id, nonce, installation_id, expires_at, used_at
         FROM enroll_challenges WHERE id = $1`,
      [input.challengeId],
    );
    if (!challenge || challenge.used_at) throw fail.deviceProof("Challenge inconnu ou déjà utilisé.");
    if (String(challenge.installation_id) !== input.installationId) {
      throw fail.deviceProof("Challenge émis pour une autre installation.");
    }
    if (new Date(challenge.expires_at as Date | string).getTime() <= Date.now()) {
      throw fail.deviceProof("Challenge expiré : demandez-en un nouveau.");
    }
    // Le nonce signé doit être celui du challenge, sinon le challenge ne prouve
    // rien et la signature pourrait couvrir une autre requête.
    if (proof.nonce !== challenge.nonce) throw fail.deviceProof("Nonce différent de celui du challenge.");

    assertEcP256(input.signingKey, "signingKey");
    assertEcP256(input.agreementKey, "agreementKey");

    const rawBody = req.rawBody ?? "";
    const message = canonicalProof({
      method: req.method,
      path: req.url.split("?")[0] ?? req.url,
      body: rawBody,
      timestamp: proof.timestamp,
      nonce: proof.nonce,
    });
    if (!verifyDeviceSignature(input.signingKey, message, proof.signature)) {
      throw fail.deviceProof("Signature d'enrôlement invalide.");
    }

    const existing = await db.one<Row>("SELECT id, status FROM devices WHERE installation_id = $1", [
      input.installationId,
    ]);
    if (existing) {
      throw fail.conflict(
        existing.status === "revoked"
          ? "Cette installation a été révoquée : contactez le support."
          : "Cette installation est déjà enrôlée.",
      );
    }

    const deviceToken = newToken(32);
    const deviceId = newId();

    const consumed = await db.tx(async (q) => {
      const used = await q.query(
        "UPDATE enroll_challenges SET used_at = now() WHERE id = $1 AND used_at IS NULL RETURNING id",
        [challenge.id],
      );
      if (used.length === 0) return false;

      await q.query(
        `INSERT INTO devices
           (id, user_id, installation_id, name, platform, signing_key, agreement_key,
            status, device_token_hash, app_version, android_version, integrity_ok, last_seen_at)
         VALUES ($1, NULL, $2, $3, $4, $5, $6, 'enrolled', $7, $8, $9, $10, now())`,
        [
          deviceId,
          input.installationId,
          input.deviceName,
          input.platform ?? "android",
          input.signingKey,
          input.agreementKey,
          hashToken(deviceToken),
          input.appVersion,
          input.androidVersion,
          Boolean(input.integrityToken),
        ],
      );
      return true;
    });
    if (!consumed) throw fail.deviceProof("Challenge inconnu ou déjà utilisé.");

    return reply.code(201).send({
      deviceId,
      deviceToken,
      serverTime: new Date().toISOString(),
      // Champ additif : l'app doit savoir si l'appareil consomme une place.
      status: "enrolled",
    });
  });

  /** Liste des appareils du compte. `current` désigne l'appareil de la session. */
  app.get("/v1/me/devices", async (req: FastifyRequest) => {
    const auth = await requireSession(db, req);
    const rows = await db.query<Row>(
      "SELECT * FROM devices WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100",
      [auth.userId],
    );
    return { items: rows.map((row) => toDeviceDto(row, auth.deviceId)) };
  });

  /**
   * Révocation. Un identifiant d'appareil existant qui appartient à un autre
   * compte renvoie **403** : le distinguer d'un identifiant inexistant (404)
   * n'apprend rien d'exploitable, mais 404 laisserait croire à une suppression
   * silencieuse (brief api-bundle).
   */
  app.delete("/v1/me/devices/:deviceId", async (req: FastifyRequest<{ Params: { deviceId: string } }>, reply) => {
    const auth = await requireSession(db, req);
    const params = deviceIdParams.safeParse(req.params ?? {});
    if (!params.success) throw fail.validation({ deviceId: "Identifiant d'appareil invalide." });

    const target = await db.one<Row>("SELECT id, user_id FROM devices WHERE id = $1", [params.data.deviceId]);
    if (!target) throw fail.notFound("Appareil introuvable.");
    if (target.user_id !== auth.userId) throw fail.forbidden("Cet appareil appartient à un autre compte.");

    await db.tx(async (q) => {
      await q.query("UPDATE devices SET status = 'revoked', revoked_at = now() WHERE id = $1", [target.id]);
      // Révoquer un appareil invalide ses sessions : le contrat l'exige, et
      // c'est ce qui empêche un jeton déjà émis de survivre à la révocation.
      await q.query("UPDATE auth_sessions SET revoked_at = now() WHERE device_id = $1 AND revoked_at IS NULL", [
        target.id,
      ]);
    });

    return reply.code(204).send();
  });

  /**
   * Promotion explicite de l'appareil courant quand une place s'est libérée.
   * Utile après révocation d'un ancien appareil sans avoir à se reconnecter.
   */
  app.post("/v1/me/devices/current/activate", async (req: FastifyRequest) => {
    const auth = await requireSession(db, req);
    const slot = await ensureDeviceSlot(db, auth.userId, auth.deviceId);
    const device = await db.one<Row>("SELECT * FROM devices WHERE id = $1", [auth.deviceId]);
    if (!device) throw fail.notFound("Appareil introuvable.");
    if (slot.status !== "active") {
      throw fail.deviceLimit(
        "Aucune place disponible : révoquez un appareil existant avant d'activer celui-ci.",
      );
    }
    return toDeviceDto(device, auth.deviceId);
  });
}
