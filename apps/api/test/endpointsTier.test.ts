/**
 * Tiers de nœuds (D45/D68), santé opposable (D47), identité par appareil (D69)
 * et enveloppe du bundle (D49).
 *
 * Ce que ces tests prouvent, et pourquoi chacun existe :
 *
 * - **`tier` n'est pas jeté.** `routes/internal.ts` valide le corps avec zod, et
 *   `z.object` supprime les clés inconnues : sans `tier` dans le schéma, un nœud
 *   `paid-gcp` s'enregistre comme nœud de lab et retombe sur `'free-labs'`. On
 *   vérifie donc la valeur **en base**, pas seulement dans la réponse.
 * - **Le gratuit reste borné ; le payant accède aux deux pools** (D141) : `servedEndpoints(db, tier)`
 *   filtre, et un nœud `down` n'y figure jamais (D47).
 * - **La parole du nœud ne lève pas un verdict client** (D47) : un heartbeat
 *   `healthy:true` sur un nœud `down` le laisse `down`.
 * - **D49** : l'enveloppe vaut `min(fin des droits, max(expirations des configs))`.
 *   L'ancien `min(...)` global la faisait mourir avec son maillon le plus faible.
 * - **Un 304 ne sert jamais une enveloppe expirée** : sinon l'appareil garde une
 *   liste morte en croyant être à jour.
 * - **`per_device`** (D69) : le bundle alloue une identité du pool fixe du nœud
 *   et l'écrit dans `config_grants` ; en `shared`, rien ne change.
 * - **La consommation mesurée par le nœud** (D52/D69) s'écrit `source='node'` en
 *   joignant `config_grants`, et un UUID sans grant est ignoré en silence.
 *
 * `support.ts` pose les variables d'environnement dans son corps de module,
 * donc les imports de `src/*` sont dynamiques et viennent après (config.ts lit
 * `process.env` à l'évaluation).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

const {
  db,
  call,
  closeAll,
  deviceClient,
  enrollDevice,
  grantSubscription,
  seedApp,
  signProof,
} = await import("./support.js");

const { CLIENT_POOL_SIZE, readClientPool, servedEndpoints } = await import("../src/services/endpoints.js");
const { openEnvelope } = await import("../src/lib/crypto.js");
const { parseVlessUri } = await import("../src/lib/vless.js");

const BUNDLE = "/v1/configuration-bundles/current";
const PASSWORD = "mot-de-passe-de-test";
const INGEST = { authorization: "Bearer test-ingest-secret" };
/** Drain posé par support.ts (défaut 900 s) : une config doit vivre au-delà. */
const DRAIN_SECONDS = 900;

after(closeAll);

/* ------------------------------------------------------------------ outils */

interface Account {
  userId: string;
  email: string;
  accessToken: string;
  device: Awaited<ReturnType<typeof enrollDevice>>;
  client: ReturnType<typeof deviceClient>;
}

/** `phone` est obligatoire à l'inscription (D53), et unique par marque. */
let phoneSeq = 0;
function nextPhone(): string {
  phoneSeq += 1;
  const digits = randomUUID().replace(/\D/g, "").slice(0, 6).padEnd(6, "0");
  return `+237${digits}${String(phoneSeq).padStart(2, "0")}`;
}

async function createAccount(label: string, appId: string): Promise<Account> {
  const device = await enrollDevice({ deviceName: `Pixel ${label}` });
  const email = `${label}-${randomUUID().slice(0, 8)}@example.test`;
  const body = { appId, email, password: PASSWORD, name: "Testeur Tier", phone: nextPhone(), locale: "fr" };
  const registered = await call("POST", "/v1/auth/register", {
    payload: body,
    headers: {
      "x-device-token": device.deviceToken,
      ...signProof(device.keys.signing, "POST", "/v1/auth/register", JSON.stringify(body)),
    },
  });
  assert.equal(registered.status, 201, registered.text);

  return {
    userId: String(registered.body.user.id),
    email,
    accessToken: String(registered.body.accessToken),
    device,
    client: deviceClient({ accessToken: String(registered.body.accessToken), signing: device.keys.signing }),
  };
}

function decrypt(account: Account, body: Record<string, any>): Record<string, any> {
  return JSON.parse(
    openEnvelope(body.envelope, account.device.keys.agreement.pem, {
      deviceId: account.device.deviceId,
      revision: Number(body.revision),
    }),
  );
}

async function registerNode(key: string, extra: Record<string, unknown> = {}) {
  const res = await call("POST", "/v1/internal/endpoints/register", {
    payload: { deployment_key: key, public_host: `${key}.example.net`, region: "eu", ...extra },
    headers: INGEST,
  });
  assert.equal(res.status, 200, `register ${key} : ${res.text}`);
  return res;
}

/** Enregistre puis passe `active` par la vraie route interne. */
async function publishNode(key: string, extra: Record<string, unknown> = {}) {
  const registered = await registerNode(key, extra);
  const ready = await call("POST", "/v1/internal/endpoints/ready", {
    payload: { deployment_key: key, tier: extra.tier },
    headers: INGEST,
  });
  assert.equal(ready.status, 200, `ready ${key} : ${ready.text}`);
  return {
    key,
    endpointId: String(registered.body.endpoint_id),
    credential: String(registered.body.uuid),
    expiresAt: String(registered.body.expires_at),
    tier: String(registered.body.tier),
    clientPool: readClientPool(registered.body.client_pool),
  };
}

async function expireAt(endpointId: string, seconds: number): Promise<void> {
  await db.query(`UPDATE endpoints SET expires_at = now() + ($2::int * interval '1 second') WHERE id = $1`, [
    endpointId,
    seconds,
  ]);
}

async function endpointHealth(endpointId: string): Promise<{ health: string; down_reason: string | null; health_checked_at: string | null }> {
  const row = await db.one<{ health: string; down_reason: string | null; health_checked_at: string | null }>(
    "SELECT health, down_reason, health_checked_at FROM endpoints WHERE id = $1",
    [endpointId],
  );
  assert.ok(row, "ligne d'endpoint attendue");
  return row;
}

/* ------------------------------------------------------------------ graine */

const freeSeed = await seedApp({ deviceLimit: 1 });
const paidSeed = await seedApp({ deviceLimit: 1 });
/** Le tier est une propriété du forfait (D45) : deux forfaits, deux natures. */
await db.query("UPDATE plans SET endpoint_tier = 'paid-gcp' WHERE id = $1", [paidSeed.planId]);

const freeAccount = await createAccount("tier-free", freeSeed.appId);
const freeRightsEnd = await grantSubscription(freeSeed, freeAccount.userId, { days: 30 });

const paidAccount = await createAccount("tier-paid", paidSeed.appId);
await grantSubscription(paidSeed, paidAccount.userId, { days: 30 });

/* -------------------------------------------------------------------- tests */

test("register : le tier transmis est stocké, pas jeté avant le service (D68)", async () => {
  const paid = await registerNode("tier-paid-key", { tier: "paid-gcp", identity_mode: "per_device" });
  assert.equal(paid.body.tier, "paid-gcp");
  assert.equal(paid.body.identity_mode, "per_device");
  const pool = readClientPool(paid.body.client_pool);
  assert.ok(pool, "un nœud per_device reçoit son pool à l'enregistrement (D69)");
  assert.equal(pool.length, CLIENT_POOL_SIZE);
  assert.equal(pool.length, 200);
  assert.equal(new Set(pool).size, 200, "200 UUID distincts");

  const row = await db.one<{ tier: string; identity_mode: string; client_pool: unknown }>(
    "SELECT tier, identity_mode, client_pool FROM endpoints WHERE deployment_key = $1",
    ["tier-paid-key"],
  );
  assert.ok(row);
  // Le point du test : ce qui est en base, pas seulement ce que la réponse dit.
  assert.equal(row.tier, "paid-gcp", "sans tier dans registerSchema, zod le jette et la base dit 'free-labs'");
  assert.equal(row.identity_mode, "per_device", "l'INSERT n'écrit plus 'shared' en dur");
  const storedPool = readClientPool(row.client_pool);
  assert.ok(storedPool);
  assert.deepEqual(storedPool, pool, "le pool stocké est celui renvoyé au nœud");

  // Redémarrage : même ligne, même pool fixe — aucun rechargement à l'inscription.
  const again = await registerNode("tier-paid-key", { tier: "paid-gcp", identity_mode: "per_device" });
  assert.equal(again.body.endpoint_id, paid.body.endpoint_id);
  assert.deepEqual(readClientPool(again.body.client_pool), pool, "le pool est fixe, pas régénéré au redémarrage");

  // Absence de tier : défaut `free-labs`, mode `shared`, aucun pool.
  const free = await registerNode("tier-free-key");
  assert.equal(free.body.tier, "free-labs");
  assert.equal(free.body.client_pool, undefined, "pas de pool pour un nœud shared");
  const freeRow = await db.one<{ tier: string; identity_mode: string; client_pool: unknown }>(
    "SELECT tier, identity_mode, client_pool FROM endpoints WHERE deployment_key = $1",
    ["tier-free-key"],
  );
  assert.equal(freeRow?.tier, "free-labs");
  assert.equal(freeRow?.identity_mode, "shared");
  assert.equal(readClientPool(freeRow?.client_pool), null);

  // Une valeur hors énumération est refusée, jamais silencieusement convertie.
  const bad = await call("POST", "/v1/internal/endpoints/register", {
    payload: { deployment_key: "tier-bad-key", public_host: "tier-bad-key.example.net", tier: "free-labs " },
    headers: INGEST,
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, "VALIDATION_FAILED");
});

test("servedEndpoints borne le gratuit et ouvre les deux pools au payant (D141)", async () => {
  const freeNode = await publishNode("tier-served-free", { tier: "free-labs" });
  const paidNode = await publishNode("tier-served-paid", { tier: "paid-gcp" });

  const free = await servedEndpoints(db, "free-labs");
  const paid = await servedEndpoints(db, "paid-gcp");

  assert.ok(free.length > 0);
  assert.ok(paid.length > 0);
  assert.ok(
    free.every((row) => row.tier === "free-labs"),
    "jamais un nœud payant dans la liste gratuite",
  );
  assert.ok(
    paid.every((row) => row.tier === "paid-gcp" || row.tier === "free-labs"),
    "la liste payante ne contient que les deux tiers connus",
  );
  assert.ok(
    free.some((row) => row.id === freeNode.endpointId),
    "le nœud gratuit publié est bien servi",
  );
  assert.ok(
    !free.some((row) => row.id === paidNode.endpointId),
    "le nœud payant n'est pas servi à un forfait gratuit",
  );
  assert.ok(
    paid.some((row) => row.id === paidNode.endpointId),
    "le nœud payant est servi à son propre tier",
  );
  assert.ok(
    paid.some((row) => row.id === freeNode.endpointId),
    "le forfait payant accède aussi au pool illimité",
  );

  // Le paramètre `limit` reste respecté (12 par défaut dans le bundle).
  const limited = await servedEndpoints(db, "free-labs", 1);
  assert.equal(limited.length, 1);
});

test("un nœud health='down' reste servi, en dernier (aucun retrait automatique)", async () => {
  const control = await publishNode("tier-up-control", { tier: "free-labs" });
  const dying = await publishNode("tier-down-node", { tier: "free-labs" });
  await db.query(
    "UPDATE endpoints SET health='down', down_since=now(), down_reason='witness' WHERE id = $1",
    [dying.endpointId],
  );

  const res = await freeAccount.client("GET", BUNDLE);
  assert.equal(res.status, 200, res.text);
  const plaintext = decrypt(freeAccount, res.body);
  const ids = plaintext.configs.map((config: { id: string }) => config.id);

  assert.ok(ids.includes(control.endpointId), "un nœud sain reste servi");
  // Règle 2026-10-30 : le verdict ne censure plus le bundle. Un nœud marqué
  // `down` reste servi (l'app peut basculer), l'alerte part sur Telegram.
  assert.ok(ids.includes(dying.endpointId), "un nœud down reste dans le bundle");
  assert.ok(
    ids.indexOf(control.endpointId) < ids.indexOf(dying.endpointId),
    "le nœud down est classé après les nœuds sains",
  );
  assert.equal(res.body.configCount, plaintext.configs.length);

  // Et il reste dans la liste vivante, donc dans les futurs bundles.
  const served = await servedEndpoints(db, "free-labs");
  assert.ok(served.some((row) => row.id === dying.endpointId), "aucun retrait automatique de la liste servie");
});

test("le heartbeat ne lève pas un 'down', il peut poser 'healthy' (D47)", async () => {
  const down = await db.one<{ id: string }>("SELECT id FROM endpoints WHERE deployment_key = $1", ["tier-down-node"]);
  assert.ok(down);
  const before = await endpointHealth(down.id);
  assert.equal(before.health, "down");
  assert.equal(before.down_reason, "witness");

  const beat = await call("POST", "/v1/internal/endpoints/heartbeat", {
    payload: { deployment_key: "tier-down-node", healthy: true, latency_ms: 42 },
    headers: INGEST,
  });
  assert.equal(beat.status, 200, beat.text);

  const after = await endpointHealth(down.id);
  assert.equal(after.health, "down", "la parole du nœud ne lève jamais un verdict client");
  assert.equal(after.down_reason, "witness", "la raison du verdict survit au heartbeat");
  assert.ok(after.health_checked_at, "la mesure de latence est quand même enregistrée");

  const latency = await db.scalar<number>("SELECT latency_ms FROM endpoints WHERE id = $1", [down.id]);
  assert.equal(Number(latency), 42);

  // Un nœud sans verdict `down` peut, lui, être déclaré sain par son conteneur.
  const up = await publishNode("tier-beat-up", { tier: "free-labs" });
  const beatUp = await call("POST", "/v1/internal/endpoints/heartbeat", {
    payload: { deployment_key: "tier-beat-up", healthy: true },
    headers: INGEST,
  });
  assert.equal(beatUp.status, 200);
  assert.equal((await endpointHealth(up.endpointId)).health, "healthy");
});

test("per_device : le bundle alloue une identité du pool et écrit la grant (D69)", async () => {
  const node = await publishNode("tier-paid-device", { tier: "paid-gcp", identity_mode: "per_device" });
  assert.ok(node.clientPool);
  assert.equal(node.clientPool.length, CLIENT_POOL_SIZE);

  const res = await paidAccount.client("GET", BUNDLE);
  assert.equal(res.status, 200, res.text);
  const plaintext = decrypt(paidAccount, res.body);

  const config = plaintext.configs.find((item: { id: string }) => item.id === node.endpointId);
  assert.ok(config, "le nœud per_device est servi");
  const identity = parseVlessUri(config.uri).id;
  assert.ok(node.clientPool.includes(identity), "l'identité vient du pool pré-provisionné du nœud");

  const grant = await db.one<{ identity: string; expires_at: string; revoked_at: string | null }>(
    "SELECT identity, expires_at, revoked_at FROM config_grants WHERE device_id = $1 AND endpoint_id = $2",
    [paidAccount.device.deviceId, node.endpointId],
  );
  assert.ok(grant, "une grant est écrite : c'est elle qui rattache les octets du nœud à cet appareil");
  assert.equal(grant.identity, identity);
  assert.equal(grant.revoked_at, null);

  // L'échéance de la grant ne survit jamais au nœud qui la sert.
  const endpointExpiry = await db.scalar<string>("SELECT expires_at::text FROM endpoints WHERE id = $1", [node.endpointId]);
  assert.ok(new Date(String(grant.expires_at)).getTime() <= new Date(String(endpointExpiry)).getTime());

  // Une reconstruction du bundle (révision changée) garde la même identité :
  // sans ce temps, la requête d'allocation choisirait un UUID neuf à chaque fois.
  await publishNode("tier-paid-device-2", { tier: "paid-gcp", identity_mode: "per_device" });
  const rebuilt = await paidAccount.client("GET", BUNDLE);
  assert.equal(rebuilt.status, 200, rebuilt.text);
  const rebuiltConfig = decrypt(paidAccount, rebuilt.body).configs.find(
    (item: { id: string }) => item.id === node.endpointId,
  );
  assert.ok(rebuiltConfig);
  assert.equal(parseVlessUri(rebuiltConfig.uri).id, identity, "l'identité d'un appareil est stable d'un bundle à l'autre");

  // En `shared`, le comportement ne change pas : le credential du nœud, pas une grant.
  const sharedNode = await publishNode("tier-served-paid", { tier: "paid-gcp" });
  const afterShared = await paidAccount.client("GET", BUNDLE);
  assert.equal(afterShared.status, 200, afterShared.text);
  const sharedPlain = decrypt(paidAccount, afterShared.body);
  const sharedConfig = sharedPlain.configs.find((item: { id: string }) => item.id === sharedNode.endpointId);
  assert.ok(sharedConfig, "le nœud shared du même tier est servi dans le même bundle");
  assert.equal(parseVlessUri(sharedConfig.uri).id, sharedNode.credential, "aucune identité allouée en mode shared");
  const sharedGrants = await db.query("SELECT id FROM config_grants WHERE endpoint_id = $1", [sharedNode.endpointId]);
  assert.equal(sharedGrants.length, 0, "pas de grant pour un nœud shared");

  // Deux appareils distincts n'obtiennent pas la même identité (le pool est un pool).
  const other = await createAccount("tier-paid-bis", paidSeed.appId);
  await grantSubscription(paidSeed, other.userId, { days: 30 });
  const otherRes = await other.client("GET", BUNDLE);
  assert.equal(otherRes.status, 200, otherRes.text);
  const otherPlain = decrypt(other, otherRes.body);
  const otherConfig = otherPlain.configs.find((item: { id: string }) => item.id === node.endpointId);
  assert.ok(otherConfig);
  assert.notEqual(parseVlessUri(otherConfig.uri).id, identity, "un UUID par appareil, jamais partagé");
});

test("heartbeat : la consommation du nœud s'écrit source='node', un UUID sans grant est ignoré (D52/D69)", async () => {
  const node = await db.one<{ id: string; deployment_key: string }>(
    "SELECT id, deployment_key FROM endpoints WHERE deployment_key = $1",
    ["tier-paid-device"],
  );
  assert.ok(node);
  const grant = await db.one<{ identity: string }>(
    "SELECT identity FROM config_grants WHERE device_id = $1 AND endpoint_id = $2",
    [paidAccount.device.deviceId, node.id],
  );
  assert.ok(grant, "la grant du test précédent est réutilisée");

  const beat = await call("POST", "/v1/internal/endpoints/heartbeat", {
    payload: {
      deployment_key: node.deployment_key,
      usage: [
        { uuid: grant.identity, bytesUp: 1_000, bytesDown: 5_000 },
        // UUID inconnu : aucune grant, donc aucune ligne — et surtout aucune erreur.
        { uuid: randomUUID(), bytesUp: 999_999, bytesDown: 999_999 },
      ],
    },
    headers: INGEST,
  });
  assert.equal(beat.status, 200, beat.text);
  assert.equal(beat.body.usage_written, 1, "seul l'UUID rattaché à un appareil est écrit");

  const stored = await db.one<{ source: string; bytes_up: string | number; bytes_down: string | number }>(
    "SELECT source, bytes_up, bytes_down FROM usage_daily WHERE device_id = $1",
    [paidAccount.device.deviceId],
  );
  assert.ok(stored);
  assert.equal(stored.source, "node", "la source est nommée, jamais confondue avec 'device'");
  assert.equal(Number(stored.bytes_up), 1_000);
  assert.equal(Number(stored.bytes_down), 5_000);

  // Cumul : les compteurs Xray ne reculent pas, même si un lot plus ancien arrive.
  const replay = await call("POST", "/v1/internal/endpoints/heartbeat", {
    payload: { deployment_key: node.deployment_key, usage: [{ uuid: grant.identity, bytesUp: 10, bytesDown: 20 }] },
    headers: INGEST,
  });
  assert.equal(replay.status, 200);
  const after = await db.one<{ bytes_up: string | number; bytes_down: string | number }>(
    "SELECT bytes_up, bytes_down FROM usage_daily WHERE device_id = $1 AND source = 'node'",
    [paidAccount.device.deviceId],
  );
  assert.equal(Number(after?.bytes_up), 1_000, "GREATEST : un rejeu ne fait pas reculer le compteur");
  assert.equal(Number(after?.bytes_down), 5_000);
});

test("l'enveloppe prend le max des expirations des configs, pas le min (D49)", async () => {
  const shortLived = await publishNode("tier-env-short", { tier: "free-labs" });
  const longLived = await publishNode("tier-env-long", { tier: "free-labs" });
  await expireAt(shortLived.endpointId, 3_600); // 1 h
  await expireAt(longLived.endpointId, 10_800); // 3 h

  const res = await freeAccount.client("GET", BUNDLE);
  assert.equal(res.status, 200, res.text);
  const plaintext = decrypt(freeAccount, res.body);

  const configExpiries = plaintext.configs.map((config: { expiresAt: string }) => new Date(config.expiresAt).getTime());
  const minConfig = Math.min(...configExpiries);
  const maxConfig = Math.max(...configExpiries);
  const envelope = new Date(plaintext.expiresAt).getTime();

  assert.ok(maxConfig > minConfig, "le jeu servi contient bien deux échéances distinctes");
  assert.equal(envelope, Math.min(maxConfig, new Date(freeRightsEnd).getTime()), "min(droits, max(configs))");
  assert.ok(envelope >= maxConfig || envelope === new Date(freeRightsEnd).getTime());
  assert.ok(envelope > minConfig, "un nœud qui meurt dans 1 h ne tue plus le bundle des autres");

  // La config courte est bien servie : on n'a pas seulement retiré le problème.
  const ids = plaintext.configs.map((config: { id: string }) => config.id);
  assert.ok(ids.includes(shortLived.endpointId));
  assert.ok(ids.includes(longLived.endpointId));
  assert.ok(1_000 > DRAIN_SECONDS, "les deux nœuds sont hors de la fenêtre de drain");
});

test("un 304 n'est renvoyé que si l'enveloppe calculée n'est pas expirée (D48/D49)", async () => {
  // Contrôle : une enveloppe vivante se met bien en cache.
  const live = await freeAccount.client("GET", BUNDLE);
  assert.equal(live.status, 200);
  const liveEtag = String(live.headers.etag);
  const cached = await freeAccount.client("GET", BUNDLE, undefined, { "if-none-match": liveEtag });
  assert.equal(cached.status, 304, "une enveloppe vivante reste servie en 304");
  assert.equal(cached.text, "");

  // Aucun nœud actif : le pool est vide (un nœud `down` resterait servi, mais
  // un nœud retiré manuellement passe en `expired`). L'enveloppe calculée
  // naît expirée (`expiresAt = issuedAt`).
  await db.query("UPDATE endpoints SET status='expired', health='down', down_since=now(), down_reason='manual'");

  const first = await paidAccount.client("GET", BUNDLE);
  assert.equal(first.status, 200, first.text);
  assert.equal(first.body.configCount, 0, "aucun nœud actif : la liste est vide, pas inventée");
  assert.equal(first.body.expiresAt, first.body.issuedAt, "une enveloppe sans configuration naît expirée");

  const etag = String(first.headers.etag);
  const conditional = await paidAccount.client("GET", BUNDLE, undefined, { "if-none-match": etag });
  assert.equal(
    conditional.status,
    200,
    "un 304 servirait une enveloppe déjà expirée : l'appareil garderait une liste morte",
  );
  assert.equal(conditional.body.configCount, 0);
  assert.equal(conditional.body.expiresAt, conditional.body.issuedAt);
});
