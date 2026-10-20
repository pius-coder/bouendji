/**
 * Tirage du bundle chiffré.
 *
 * Rien en clair ne sort d'ici : la réponse ne contient que l'enveloppe scellée
 * (`SealedEnvelope`, lib/crypto.ts) et des métadonnées de version. Le tableau de
 * configurations — donc les URI VLESS — n'existe qu'à l'intérieur du chiffré,
 * déchiffrable seulement par la clé AGREE de l'appareil, qui ne quitte pas le
 * Keystore Android.
 *
 * Trois invariants :
 *
 * 1. **Versionné par la révision du pool.** `poolRevision(db)` bouge quand un
 *    endpoint apparaît, devient actif, draine ou expire ; il ne bouge pas sur un
 *    heartbeat (D10). L'app ne retélécharge donc que quand le contenu change.
 * 2. **`maxSessionSeconds` voyage avec chaque configuration** (D25) et vient de
 *    `env.ingest.reconnectAfterSeconds` : une rotation décidée côté serveur,
 *    jamais une constante dans l'app.
 * 3. **Le bundle expire au plus tôt** de la fin des droits et de la première
 *    configuration expirée. Un bundle ne promet jamais un accès que les droits
 *    ne couvrent pas.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { VlessConfig } from "@vpn/contract";
import { env } from "../config.js";
import type { Database, Row } from "../db.js";
import { deviceIdentity, newId, sealForDevice, sha256Hex, type SealedEnvelope } from "../lib/crypto.js";
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
 * L'ETag identifie compte + appareil + révision : il ne dépend pas des octets du
 * chiffré (l'IV change à chaque scellement), sinon un 304 serait impossible.
 */
export function bundleEtag(deviceId: string, revision: number): string {
  return `"b${revision}-${sha256Hex(`${deviceId}:${revision}`).slice(0, 16)}"`;
}

/**
 * Expiration d'un bundle : le plus tôt de la fin des droits et de la première
 * configuration servie. Sans configuration utilisable, le bundle naît expiré —
 * une liste vide signée est un retrait valide, pas une panne silencieuse.
 */
export function bundleExpiry(input: { issuedAt: Date; subscriptionEndsAt: string | null; rows: EndpointRow[] }): Date {
  const candidates: number[] = [];
  if (input.subscriptionEndsAt) candidates.push(new Date(input.subscriptionEndsAt).getTime());
  for (const row of input.rows) candidates.push(new Date(row.expires_at).getTime());
  const value = candidates.length > 0 ? Math.min(...candidates) : input.issuedAt.getTime();
  return new Date(value);
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

  const configs: BundleConfig[] = input.rows.map((row) => ({
    ...endpointToConfig(
      row,
      // Une identité dérivée par appareil n'a de sens qu'en mode `per_device`
      // (D12) ; `endpointToConfig` l'ignore en mode `shared`.
      row.identity_mode === "per_device" ? deviceIdentity(input.userId, input.deviceId, row.id) : null,
    ),
    maxSessionSeconds,
  }));

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

  return { body, plaintext, etag: bundleEtag(input.deviceId, revision) };
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

    const revision = await poolRevision(db);
    const etag = bundleEtag(auth.deviceId, revision);
    if (etagMatches(req.headers["if-none-match"], etag)) {
      // 304 : rien à retélécharger, et aucune date repoussée (contrat §8).
      return reply.code(304).send();
    }

    const rows = await servedEndpoints(db);
    const expectedExpiresAt = bundleExpiry({
      issuedAt: new Date(),
      subscriptionEndsAt: entitlement.endsAt,
      rows,
    }).toISOString();

    let body = await cachedBundle(db, auth.deviceId, revision, expectedExpiresAt);
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
