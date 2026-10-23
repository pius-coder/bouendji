/**
 * Tirage du bundle chiffré.
 *
 * Rien en clair ne sort d'ici : la réponse ne contient que l'enveloppe scellée
 * (`SealedEnvelope`, lib/crypto.ts) et des métadonnées de version. Le tableau de
 * configurations — donc les URI VLESS — n'existe qu'à l'intérieur du chiffré,
 * déchiffrable seulement par la clé AGREE de l'appareil, qui ne quitte pas le
 * Keystore Android.
 *
 * Quatre invariants :
 *
 * 1. **Versionné par la révision du pool.** `poolRevision(db)` bouge quand un
 *    endpoint apparaît, devient actif, draine ou expire ; il ne bouge pas sur un
 *    heartbeat (D10). L'app ne retélécharge donc que quand le contenu change.
 * 2. **`maxSessionSeconds` voyage avec chaque configuration** (D25) et vient de
 *    `env.ingest.reconnectAfterSeconds` : une rotation décidée côté serveur,
 *    jamais une constante dans l'app.
 * 3. **Le bundle expire à la fin des droits**, ou plus tôt seulement si
 *    *toutes* les configurations servies sont mortes avant (D49). Il ne meurt
 *    plus avec son maillon le plus faible : quatre nœuds de lab à 4 h 30 ne
 *    doivent pas couper l'app six fois par jour.
 * 4. **Un seul tier par bundle** (D45) : celui du forfait actif. Les deux
 *    infrastructures ne se mélangent jamais.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { VlessConfig } from "@vpn/contract";
import { env } from "../config.js";
import type { Database, Row } from "../db.js";
import { newId, sealForDevice, sha256Hex, type SealedEnvelope } from "../lib/crypto.js";
import { rateLimitError } from "../lib/attempts.js";
import { fail } from "../lib/errors.js";
import { endpointToConfig, poolRevision, servedEndpoints, type EndpointRow } from "../services/endpoints.js";
import { ensureDeviceSlot, loadEntitlement, requireSession } from "./me.js";

export const BUNDLE_PATH = "/v1/configuration-bundles/current";

/** Configuration telle que le client la reçoit, une fois déchiffrée. */
export interface BundleConfig extends VlessConfig {
  /** Durée maximale d'une session sur ce nœud, en secondes (D25). */
  maxSessionSeconds: number;
}

export interface BundlePlaintext {
  revision: number;
  issuedAt: string;
  expiresAt: string;
  configs: BundleConfig[];
}

export interface BundleResponse {
  revision: number;
  issuedAt: string;
  expiresAt: string;
  configCount: number;
  envelope: SealedEnvelope;
}

const iso = (value: Date | string): string => (value instanceof Date ? value.toISOString() : new Date(value).toISOString());

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

/** `If-None-Match` peut lister plusieurs valeurs et un préfixe faible `W/`. */
export function etagMatches(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  return header
    .split(",")
    .map((value) => value.trim().replace(/^W\//, ""))
    .some((value) => value === etag || value === "*");
}

/**
 * L'ETag identifie compte + appareil + révision **et le jeu de configurations
 * servi** (identifiants et expirations). La révision seule ne suffit plus :
 * une transition de santé (D48) ou une expiration de nœud peut changer la
 * réponse sans qu'aucun enregistrement n'ait bougé, et un 304 servirait alors
 * une liste morte. Les octets du chiffré, eux, changent à chaque scellement
 * (IV), donc ils ne peuvent pas entrer dans l'ETag.
 */
export function bundleEtag(deviceId: string, revision: number, rows: EndpointRow[] = []): string {
  const served = rows
    .map((row) => `${row.id}@${new Date(row.expires_at).getTime()}`)
    .sort()
    .join(",");
  return `"b${revision}-${sha256Hex(`${deviceId}:${revision}:${served}`).slice(0, 16)}"`;
}

/**
 * Expiration d'un bundle (D49) : le plus tôt de la fin des droits et de la
 * **dernière** configuration servie. Première itération : la plus courte tuait
 * le bundle de tous les autres. Sans configuration utilisable, le bundle naît
 * expiré — une liste vide signée est un retrait valide, pas une panne
 * silencieuse, et un bundle né expiré n'est jamais servi en 304.
 */
export function bundleExpiry(input: { issuedAt: Date; subscriptionEndsAt: string | null; rows: EndpointRow[] }): Date {
  const rightsEndsAt = input.subscriptionEndsAt ? new Date(input.subscriptionEndsAt).getTime() : Number.POSITIVE_INFINITY;
  const configs = input.rows.map((row) => new Date(row.expires_at).getTime());
  const lastConfigExpiry = configs.length > 0 ? Math.max(...configs) : input.issuedAt.getTime();
  return new Date(Math.min(rightsEndsAt, lastConfigExpiry));
}

/**
 * Alloue une identité du pool fixe du nœud à cet appareil (D69, §4.10).
 *
 * Le pool de 200 UUID est écrit à l'enregistrement du nœud : aucune
 * inscription ne provoque de rechargement d'Xray.
 *
 * Deux temps, et l'ordre est ce qui garantit « un UUID par appareil » :
 *
 * 1. **Une grant vivante est l'identité de cet appareil.** On la relit et on
 *    rafraîchit son échéance (un renouvellement de droits l'étend) au lieu
 *    d'allouer à nouveau. Sans ce temps, la requête du §4.10 — qui exclut les
 *    UUID vivants, y compris celui de l'appareil lui-même — choisirait un autre
 *    UUID à chaque tirage, et une grant révoquée pourrait ressusciter un UUID
 *    qu'un autre appareil détient maintenant.
 * 2. **Sinon, la requête du §4.10** : première identité libre du pool. Le
 *    conflit ne peut porter que sur une grant expirée ou révoquée de ce même
 *    appareil (le cas 1 les a écartées), donc on peut y réécrire l'identité.
 *
 * L'échéance est `min(fin des droits, expiration du nœud)` : une identité ne
 * survit jamais au nœud qui la sert. `RETURNING` ne renvoie rien quand le pool
 * est épuisé — l'appelant retombe alors sur le credential partagé plutôt que
 * d'inventer un UUID que le nœud ne connaît pas.
 */
async function allocateGrant(
  db: Database,
  input: { userId: string; deviceId: string; row: EndpointRow; subscriptionEndsAt: string | null },
): Promise<string | null> {
  const live = await db.query<{ identity: string }>(
    `UPDATE config_grants
        SET expires_at = LEAST(COALESCE($3::timestamptz, 'infinity'::timestamptz), $4::timestamptz)
      WHERE device_id = $1 AND endpoint_id = $2
        AND revoked_at IS NULL AND expires_at > now()
      RETURNING identity`,
    [input.deviceId, input.row.id, input.subscriptionEndsAt, new Date(input.row.expires_at)],
  );
  if (live[0]) return live[0].identity;

  const rows = await db.query<{ identity: string }>(
    `INSERT INTO config_grants (id, user_id, device_id, endpoint_id, identity, expires_at)
     SELECT $1, $2, $3, $4, pool.uuid,
            LEAST(COALESCE($5::timestamptz, 'infinity'::timestamptz), $6::timestamptz)
       FROM (SELECT jsonb_array_elements_text(client_pool) AS uuid FROM endpoints WHERE id = $4) pool
      WHERE NOT EXISTS (
        SELECT 1 FROM config_grants g
         WHERE g.endpoint_id = $4 AND g.identity = pool.uuid AND g.expires_at > now() AND g.revoked_at IS NULL)
      LIMIT 1
     ON CONFLICT (device_id, endpoint_id) DO UPDATE
        SET identity = EXCLUDED.identity,
            expires_at = EXCLUDED.expires_at,
            issued_at = now(),
            revoked_at = NULL
     RETURNING identity`,
    [
      newId(),
      input.userId,
      input.deviceId,
      input.row.id,
      input.subscriptionEndsAt,
      new Date(input.row.expires_at),
    ],
  );
  return rows[0]?.identity ?? null;
}

/**
 * Construit et scelle le bundle, puis mémorise l'enveloppe (pas le clair).
 *
 * Exporté pour être testable sans HTTP : le calcul d'expiration et la forme du
 * clair sont les parties faciles à casser sans rien voir côté réponse.
 */
export async function buildBundle(
  db: Database,
  input: {
    userId: string;
    deviceId: string;
    agreementKey: string;
    rows: EndpointRow[];
    subscriptionEndsAt: string | null;
  },
): Promise<{ body: BundleResponse; plaintext: BundlePlaintext; etag: string }> {
  const revision = await poolRevision(db);
  const maxSessionSeconds = env.ingest.reconnectAfterSeconds;

  /*
   * Une identité par appareil n'est écrite dans le bundle que si le nœud servi
   * est en `per_device` (D69, §4.10). En `shared` — la nature des nœuds de lab —
   * le comportement ne change pas : le credential du nœud, déchiffré, part à
   * l'intérieur de l'enveloppe scellée.
   */
  const configs: BundleConfig[] = [];
  for (const row of input.rows) {
    const identity =
      row.identity_mode === "per_device"
        ? await allocateGrant(db, {
            userId: input.userId,
            deviceId: input.deviceId,
            row,
            subscriptionEndsAt: input.subscriptionEndsAt,
          })
        : null;
    configs.push({ ...endpointToConfig(row, identity), maxSessionSeconds });
  }

  const issuedAt = new Date();
  const expiresAt = bundleExpiry({ issuedAt, subscriptionEndsAt: input.subscriptionEndsAt, rows: input.rows });

  const plaintext: BundlePlaintext = {
    revision,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    configs,
  };

  const envelope = sealForDevice(input.agreementKey, JSON.stringify(plaintext), {
    deviceId: input.deviceId,
    revision,
  });

  const body: BundleResponse = {
    revision,
    issuedAt: plaintext.issuedAt,
    expiresAt: plaintext.expiresAt,
    configCount: configs.length,
    envelope,
  };

  await db.query(
    `INSERT INTO bundles (id, user_id, device_id, revision, config_count, payload, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
     ON CONFLICT (device_id) DO UPDATE
        SET revision = EXCLUDED.revision,
            config_count = EXCLUDED.config_count,
            payload = EXCLUDED.payload,
            created_at = now(),
            expires_at = EXCLUDED.expires_at`,
    [newId(), input.userId, input.deviceId, revision, configs.length, JSON.stringify(body), expiresAt],
  );

  return { body, plaintext, etag: bundleEtag(input.deviceId, revision, input.rows) };
}

/**
 * Bundle déjà émis, réutilisable seulement si la révision **et** l'expiration
 * calculée n'ont pas bougé. Renvoyer un ancien chiffré après un renouvellement
 * d'abonnement écourterait l'accès sans raison visible.
 */
async function cachedBundle(
  db: Database,
  deviceId: string,
  revision: number,
  expiresAt: string,
): Promise<BundleResponse | null> {
  const row = await db.one<Row>("SELECT revision, expires_at, payload FROM bundles WHERE device_id = $1", [deviceId]);
  if (!row) return null;
  if (Number(row.revision) !== revision) return null;
  if (iso(row.expires_at as Date | string) !== expiresAt) return null;
  const payload = parseJsonObject(row.payload);
  if (!payload || typeof payload.envelope !== "object") return null;
  return payload as unknown as BundleResponse;
}

export function registerBundleRoutes(app: FastifyInstance, db: Database): void {
  /**
   * 30 tirages / minute **par appareil**. Un appareil qui redemande son bundle
   * en boucle (client cassé, écran qui se réveille) ne doit pas noyer le reste
   * du trafic. La clé est le jeton d'appareil, haché : compter par IP punirait
   * tous les clients derrière le même NAT mobile.
   */
  const bundleLimit = env.rateLimit.enforce
    ? {
        config: {
          rateLimit: {
            max: env.rateLimit.bundle.max,
            timeWindow: env.rateLimit.bundle.window,
            keyGenerator: (req: FastifyRequest) => {
              const token = req.headers["x-device-token"];
              return typeof token === "string" && token.length > 0
                ? `dev:${sha256Hex(token).slice(0, 24)}`
                : `ip:${req.ip}`;
            },
            errorResponseBuilder: rateLimitError,
          },
        },
      }
    : {};

  app.get(BUNDLE_PATH, bundleLimit, async (req: FastifyRequest, reply) => {
    // Preuve d'appareil + propriété : un bundle ne se demande pas avec le
    // jeton d'un autre compte, ni avec un appareil qui n'est pas le sien.
    const auth = await requireSession(db, req);
    if (auth.device.status === "revoked") throw fail.deviceRevoked();

    const { entitlement } = await loadEntitlement(db, auth.userId);
    if (!entitlement.active) throw fail.subscriptionRequired();

    // Le contrat exige un appareil `active` pour consommer une place. La
    // promotion est tentée ici : après révocation d'un ancien appareil, la
    // place libérée est reprise sans route supplémentaire.
    const slot = await ensureDeviceSlot(db, auth.userId, auth.deviceId);
    if (slot.status !== "active") {
      throw fail.forbidden("Cet appareil n'est pas actif : révoquez un appareil pour libérer une place.");
    }

    const agreementKey = String(auth.device.agreement_key ?? "");
    if (!agreementKey) throw fail.forbidden("Clé d'accord absente : réenrôlez cet appareil.");

    /*
     * D45 : un bundle ne contient qu'un tier, celui que le forfait actif
     * achète. `servedEndpoints` retire déjà les nœuds `down` (D47) et ceux qui
     * meurent dans la fenêtre de drain.
     */
    const rows = await servedEndpoints(db, entitlement.endpointTier);
    const revision = await poolRevision(db);
    const expectedExpiresAt = bundleExpiry({
      issuedAt: new Date(),
      subscriptionEndsAt: entitlement.endsAt,
      rows,
    });
    const etag = bundleEtag(auth.deviceId, revision, rows);

    /*
     * D48/D49 : un 304 n'est valable que si l'enveloppe que l'appareil garde
     * n'est pas déjà expirée. Sinon le client conserverait une liste morte en
     * croyant être à jour — exactement le défaut que la révision seule laissait
     * passer.
     */
    if (etagMatches(req.headers["if-none-match"], etag) && expectedExpiresAt.getTime() > Date.now()) {
      // 304 : rien à retélécharger, et aucune date repoussée (contrat §8).
      return reply.code(304).send();
    }

    let body = await cachedBundle(db, auth.deviceId, revision, expectedExpiresAt.toISOString());
    if (!body) {
      const built = await buildBundle(db, {
        userId: auth.userId,
        deviceId: auth.deviceId,
        agreementKey,
        rows,
        subscriptionEndsAt: entitlement.endsAt,
      });
      body = built.body;
    }

    reply.header("etag", etag);
    // Le bundle est privé : aucun cache intermédiaire ne doit le garder.
    reply.header("cache-control", "no-store");
    return body;
  });
}
