/**
 * Outillage partagé des tests de ce lot (`auth.test.ts`, `bundle.test.ts`).
 *
 * Pourquoi un module et pas deux copies : la signature de preuve d'appareil doit
 * être **exactement** celle que le serveur reconstruit. Deux implémentations
 * divergentes testeraient deux protocoles différents.
 *
 * Aucune variable d'environnement n'est posée par les fichiers de test : elles
 * le sont ici, dans le corps du module, donc avant les imports dynamiques de
 * `src/*` (config.ts lit `process.env` à l'évaluation).
 */
import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "memory://";
process.env.MASTER_KEY = Buffer.alloc(32, 11).toString("base64");
process.env.JWT_SECRET = "test-secret-test-secret-test-secret";
process.env.PUBLIC_BASE_URL = "http://localhost:8080";
/** Ingestion : les tests peuplent le pool par la vraie route interne. */
process.env.ENDPOINT_INGEST_SECRET = "test-ingest-secret";
process.env.ENDPOINT_AUTO_APPROVE = "true";
/** D25 : la valeur doit venir du serveur, le test la fixe pour l'affirmer. */
process.env.ENDPOINT_RECONNECT_AFTER = "3300";
process.env.ACCESS_TOKEN_TTL = "900";
process.env.REFRESH_TOKEN_TTL_DAYS = "45";

const { createDb } = await import("../src/db.js");
const { buildApp } = await import("../src/app.js");
const { canonicalProof } = await import("../src/lib/crypto.js");

export const db = await createDb();
// Toutes les migrations versionnées (000, 001, puis celles des lots : 010-012,
// etc.) sont appliquées par l'exécuteur du lot R0, dans `createDb`.
export const app = await buildApp({ db });

export async function closeAll(): Promise<void> {
  await app.close();
  await db.close();
}

/* ------------------------------------------------------------------ clés */

export interface KeyPair {
  /** Base64 SPKI (ce que le serveur stocke). */
  spki: string;
  /** PEM PKCS#8 (ce que seul le téléphone posséderait). */
  pem: string;
}

export interface DeviceKeys {
  signing: KeyPair;
  agreement: KeyPair;
}

export function newKeyPair(): KeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    spki: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
    pem: privateKey.export({ format: "pem", type: "pkcs8" }) as string,
  };
}

/* ------------------------------------------------------------- signatures */

export type ProofHeaders = Record<string, string>;

export function signProof(keys: KeyPair, method: string, path: string, body: string, nonce = randomUUID()): ProofHeaders {
  const timestamp = String(Date.now());
  const signature = sign("sha256", Buffer.from(canonicalProof({ method, path, body, timestamp, nonce }), "utf8"), keys.pem).toString(
    "base64",
  );
  return {
    "x-device-timestamp": timestamp,
    "x-device-nonce": nonce,
    "x-device-signature": signature,
  };
}

/* ------------------------------------------------------------------ appels */

export interface Reply {
  status: number;
  body: Record<string, any>;
  text: string;
  headers: Record<string, unknown>;
}

function toReply(res: { statusCode: number; body: string; headers: Record<string, unknown> }): Reply {
  let body: Record<string, any> = {};
  try {
    body = JSON.parse(res.body) as Record<string, any>;
  } catch {
    body = {};
  }
  return { status: res.statusCode, body, text: res.body, headers: res.headers };
}

export async function call(
  method: string,
  url: string,
  options: { payload?: unknown; headers?: Record<string, string> } = {},
): Promise<Reply> {
  const body = options.payload === undefined ? undefined : JSON.stringify(options.payload);
  const res = await app.inject({
    method: method as never,
    url,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.headers ?? {}),
    },
    ...(body === undefined ? {} : { payload: body }),
  });
  return toReply(res);
}

/**
 * Client d'un appareil : chaque requête porte un bearer **et** une preuve
 * fraîche (nonce neuf, horodatage courant), exactement comme l'app.
 */
export function deviceClient(input: { accessToken: string; signing: KeyPair }) {
  return async (method: string, url: string, payload?: unknown, extraHeaders: Record<string, string> = {}): Promise<Reply> => {
    const path = url.split("?")[0] ?? url;
    const body = payload === undefined ? "" : JSON.stringify(payload);
    return call(method, url, {
      ...(payload === undefined ? {} : { payload }),
      headers: {
        authorization: `Bearer ${input.accessToken}`,
        ...signProof(input.signing, method, path, body),
        ...extraHeaders,
      },
    });
  };
}

/* --------------------------------------------------------------- appareils */

export interface EnrolledDevice {
  deviceId: string;
  deviceToken: string;
  keys: DeviceKeys;
  installationId: string;
  status: string;
}

export async function enrollDevice(options: { installationId?: string; deviceName?: string } = {}): Promise<EnrolledDevice> {
  const keys: DeviceKeys = { signing: newKeyPair(), agreement: newKeyPair() };
  const installationId = options.installationId ?? `inst-${randomUUID()}`;

  const challenge = await call("POST", "/v1/devices/challenges", {
    payload: { installationId, purpose: "enroll" },
  });
  assert.equal(challenge.status, 200, `challenge attendu en 200 : ${challenge.text}`);

  const body = JSON.stringify({
    challengeId: challenge.body.challengeId,
    installationId,
    deviceName: options.deviceName ?? "Pixel test",
    platform: "android",
    signingKey: keys.signing.spki,
    agreementKey: keys.agreement.spki,
    appVersion: "1.0.0",
    androidVersion: 34,
  });

  const res = await app.inject({
    method: "POST",
    url: "/v1/devices/enroll",
    headers: {
      "content-type": "application/json",
      // Le nonce signé est celui du challenge : c'est ce qui rend la preuve
      // d'enrôlement non rejouable.
      ...signProof(keys.signing, "POST", "/v1/devices/enroll", body, String(challenge.body.nonce)),
    },
    payload: body,
  });
  const reply = toReply(res);
  assert.equal(reply.status, 201, `enrôlement attendu en 201 : ${reply.text}`);

  return {
    deviceId: String(reply.body.deviceId),
    deviceToken: String(reply.body.deviceToken),
    keys,
    installationId,
    status: String(reply.body.status),
  };
}

/* ------------------------------------------------------------------ graine */

export interface Seed {
  communityId: string;
  appId: string;
  planId: string;
}

export async function seedApp(options: { deviceLimit?: number; priceXaf?: number } = {}): Promise<Seed> {
  const suffix = randomUUID().slice(0, 8);
  const communityId = `com_${suffix}`;
  const appId = `app_${suffix}`;
  const planId = `plan_${suffix}`;

  await db.query("INSERT INTO communities (id, name, slug, commission_bps) VALUES ($1, $2, $3, $4)", [
    communityId,
    "Communauté test",
    `com-${suffix}`,
    2000,
  ]);
  await db.query("INSERT INTO apps (id, community_id, slug, name, package_name) VALUES ($1, $2, $3, $4, $5)", [
    appId,
    communityId,
    `app-${suffix}`,
    "App test",
    `com.example.${suffix.replace(/-/g, "")}`,
  ]);
  await db.query(
    `INSERT INTO plans (id, app_id, code, name, description, price_xaf, duration_days, device_limit, active)
     VALUES ($1, $2, $3, $4, '', $5, $6, $7, true)`,
    [planId, appId, "mensuel", "Mensuel", options.priceXaf ?? 2000, 30, options.deviceLimit ?? 1],
  );

  return { communityId, appId, planId };
}

/**
 * Abonnement actif. `subscriptions.order_id` est une clé étrangère obligatoire :
 * on crée donc la commande payée qui le justifie, comme le ferait un webhook.
 */
export async function grantSubscription(
  seed: Seed,
  userId: string,
  options: { days?: number; startsAt?: Date } = {},
): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const orderId = `ord_${suffix}`;
  const startsAt = options.startsAt ?? new Date();
  const endsAt = new Date(startsAt.getTime() + (options.days ?? 30) * 86_400_000);

  await db.query(
    `INSERT INTO orders (id, user_id, app_id, plan_id, community_id, amount_xaf, status, provider, paid_at, activated_at)
     VALUES ($1, $2, $3, $4, $5, 2000, 'paid', 'mock', now(), now())`,
    [orderId, userId, seed.appId, seed.planId, seed.communityId],
  );
  await db.query(
    `INSERT INTO subscriptions (id, user_id, plan_id, order_id, status, starts_at, ends_at)
     VALUES ($1, $2, $3, $4, 'active', $5, $6)`,
    [`sub_${suffix}`, userId, seed.planId, orderId, startsAt, endsAt],
  );

  return endsAt.toISOString();
}

/* ------------------------------------------------------------------ pool */

/** Publie un endpoint par la vraie route interne, puis le passe `active`. */
export async function publishEndpoint(
  deploymentKey: string,
  options: { host?: string; region?: string; port?: number } = {},
): Promise<{ endpointId: string; credential: string; expiresAt: string; poolRevision: number }> {
  const headers = { authorization: "Bearer test-ingest-secret" };
  const registered = await call("POST", "/v1/internal/endpoints/register", {
    payload: {
      deployment_key: deploymentKey,
      public_host: options.host ?? "node1.example.net",
      region: options.region ?? "eu",
      port: options.port,
    },
    headers,
  });
  assert.equal(registered.status, 200, `register attendu en 200 : ${registered.text}`);

  const ready = await call("POST", "/v1/internal/endpoints/ready", {
    payload: { deployment_key: deploymentKey },
    headers,
  });
  assert.equal(ready.status, 200, `ready attendu en 200 : ${ready.text}`);

  return {
    endpointId: String(registered.body.endpoint_id),
    credential: String(registered.body.uuid),
    expiresAt: String(registered.body.expires_at),
    poolRevision: Number(ready.body.pool_revision),
  };
}
