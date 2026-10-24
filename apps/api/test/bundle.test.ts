/**
 * Bundle chiffré.
 *
 * Ce que ces tests prouvent :
 * - la réponse ne contient **que** l'enveloppe : ni URI, ni UUID, ni nom d'hôte
 *   en clair (on cherche même la sous-chaîne « vless » dans le corps HTTP) ;
 * - le clair se déchiffre avec la clé AGREE de l'appareil et le contexte
 *   (`deviceId` + révision) — une autre clé échoue ;
 * - `maxSessionSeconds` vient du serveur (`env.ingest.reconnectAfterSeconds`,
 *   D25) et n'est pas une constante de l'app ;
 * - la révision ne bouge pas tant que le pool ne bouge pas, et l'ETag permet un
 *   304 sans repousser aucune date ;
 * - un appareil d'un autre compte est refusé en **403**, pas en 404 ;
 * - sans abonnement, sans place d'appareil, ou appareil révoqué : refus explicite.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

const {
  app,
  db,
  call,
  closeAll,
  deviceClient,
  enrollDevice,
  grantSubscription,
  newKeyPair,
  publishEndpoint,
  seedApp,
  signProof,
} = await import("./support.js");

const { openEnvelope } = await import("../src/lib/crypto.js");
const { parseVlessUri } = await import("../src/lib/vless.js");
const { poolRevision } = await import("../src/services/endpoints.js");
const { issueAccessToken } = await import("../src/lib/auth.js");

const BUNDLE = "/v1/configuration-bundles/current";
const PASSWORD = "mot-de-passe-de-test";
const seed = await seedApp({ deviceLimit: 1 });

after(closeAll);

/* ------------------------------------------------------------------ outils */

interface Account {
  device: Awaited<ReturnType<typeof enrollDevice>>;
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  client: ReturnType<typeof deviceClient>;
}

let phoneSeq = 0;
function nextPhone(): string {
  phoneSeq += 1;
  return `+2376${String(phoneSeq).padStart(8, "0")}`;
}

async function createAccount(label: string): Promise<Account> {
  const device = await enrollDevice({ deviceName: `Pixel ${label}` });
  const email = `${label}-${randomUUID().slice(0, 8)}@example.test`;
  const body = {
    appId: seed.appId,
    email,
    password: PASSWORD,
    name: "Testeur Bundle",
    phone: nextPhone(),
    locale: "fr",
  };
  const registered = await call("POST", "/v1/auth/register", {
    payload: body,
    headers: {
      "x-device-token": device.deviceToken,
      ...signProof(device.keys.signing, "POST", "/v1/auth/register", JSON.stringify(body)),
    },
  });
  assert.equal(registered.status, 201, registered.text);

  return {
    device,
    userId: String(registered.body.user.id),
    email,
    accessToken: String(registered.body.accessToken),
    refreshToken: String(registered.body.refreshToken),
    client: deviceClient({ accessToken: String(registered.body.accessToken), signing: device.keys.signing }),
  };
}

/* ------------------------------------------------------------------ graine */

const account = await createAccount("bundle");
const subscriptionEndsAt = await grantSubscription(seed, account.userId, { days: 30 });

const nodeA = await publishEndpoint("bundle-node-a", { host: "node1.example.net", region: "eu" });
const nodeB = await publishEndpoint("bundle-node-b", { host: "node2.example.net", region: "af" });

const AGREEMENT_PEM = account.device.keys.agreement.pem;
const DEVICE_ID = account.device.deviceId;
const MAX_SESSION_SECONDS = 3300; // ENDPOINT_RECONNECT_AFTER posé par support.ts

function decrypt(body: Record<string, any>, pem = AGREEMENT_PEM) {
  return JSON.parse(openEnvelope(body.envelope, pem, { deviceId: DEVICE_ID, revision: Number(body.revision) }));
}

/* -------------------------------------------------------------------- tests */

test("le bundle est une enveloppe scellée qui se déchiffre avec la clé AGREE", async () => {
  const res = await account.client("GET", BUNDLE);
  assert.equal(res.status, 200, res.text);

  // Forme publiée : rien d'autre que l'enveloppe et des métadonnées de version.
  assert.deepEqual(Object.keys(res.body).sort(), ["configCount", "envelope", "expiresAt", "issuedAt", "revision"]);
  assert.equal(typeof res.body.revision, "number");
  assert.equal(await poolRevision(db), res.body.revision, "révision = celle du pool");
  assert.equal(res.body.configCount, 2);
  assert.equal(res.body.envelope.version, 1);
  assert.equal(res.headers["cache-control"], "no-store");

  // Aucune fuite : ni schéma, ni hôte, ni UUID de credential, dans le corps.
  const text = res.text;
  assert.ok(!text.includes("vless"), "aucune URI dans la réponse");
  assert.ok(!text.includes("node1.example.net"), "aucun hôte en clair");
  assert.ok(!text.includes(nodeA.credential), "aucun UUID en clair");
  assert.ok(!text.includes(nodeB.credential), "aucun UUID en clair (2)");

  const plaintext = decrypt(res.body);
  assert.equal(plaintext.revision, res.body.revision);
  assert.equal(plaintext.issuedAt, res.body.issuedAt);
  assert.equal(plaintext.expiresAt, res.body.expiresAt);
  assert.equal(plaintext.configs.length, res.body.configCount);

  for (const config of plaintext.configs) {
    assert.deepEqual(
      Object.keys(config).sort(),
      ["expiresAt", "id", "label", "maxSessionSeconds", "region", "uri"],
      "forme exacte d'une configuration",
    );
    assert.equal(config.maxSessionSeconds, MAX_SESSION_SECONDS, "valeur serveur, pas une constante de l'app");
    // On lit l'URI sans jamais l'écrire en clair dans le fichier de test.
    const parsed = parseVlessUri(config.uri);
    assert.match(parsed.host, /^node[12]\.example\.net$/);
    assert.equal(parsed.port, 443);
    assert.equal(parsed.params.type, "ws");
    assert.ok(parsed.params.path?.startsWith("/ws/"));
  }

  assert.deepEqual(
    plaintext.configs.map((config: { region: string }) => config.region).sort(),
    ["af", "eu"],
  );

  // D49 : le bundle n'expire jamais après les droits, mais il vit tant que la
  // **dernière** configuration servie vit — un nœud qui meurt ne doit pas périr
  // le bundle des autres. Chaque configuration porte sa propre échéance.
  const expiresAt = new Date(plaintext.expiresAt).getTime();
  const latestConfig = Math.max(...plaintext.configs.map((config: { expiresAt: string }) => new Date(config.expiresAt).getTime()));
  assert.ok(expiresAt <= new Date(subscriptionEndsAt).getTime(), "pas au-delà des droits");
  assert.equal(expiresAt, Math.min(latestConfig, new Date(subscriptionEndsAt).getTime()), "égale au maximum des configurations, borné par les droits");

  // Une autre clé privée ne déchiffre pas : le contexte d'ECDH est lié à l'appareil.
  const other = newKeyPair();
  assert.throws(() => decrypt(res.body, other.pem), "une clé étrangère ne doit pas ouvrir le bundle");
});

test("la révision et le chiffré sont stables tant que le pool ne bouge pas", async () => {
  const first = await account.client("GET", BUNDLE);
  const second = await account.client("GET", BUNDLE);
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);

  assert.equal(first.body.revision, second.body.revision);
  assert.equal(first.body.envelope.ciphertext, second.body.envelope.ciphertext, "bundle mémorisé, pas rescellé");
  assert.equal(first.headers.etag, second.headers.etag);
  assert.ok(String(first.headers.etag).includes(String(first.body.revision)));
});

test("If-None-Match renvoie 304 sans corps et sans repousser de date", async () => {
  const first = await account.client("GET", BUNDLE);
  const etag = String(first.headers.etag);

  const cached = await account.client("GET", BUNDLE, undefined, { "if-none-match": etag });
  assert.equal(cached.status, 304);
  assert.equal(cached.text, "");

  const weak = await account.client("GET", BUNDLE, undefined, { "if-none-match": `W/${etag}` });
  assert.equal(weak.status, 304);

  const stale = await account.client("GET", BUNDLE, undefined, { "if-none-match": '"b1-mort"' });
  assert.equal(stale.status, 200);
  assert.equal(stale.body.revision, first.body.revision);
});

test("un nouvel endpoint dans le pool change la révision et le contenu", async () => {
  const before = await account.client("GET", BUNDLE);
  const nodeC = await publishEndpoint("bundle-node-c", { host: "node3.example.net", region: "us" });

  const after = await account.client("GET", BUNDLE);
  assert.equal(after.status, 200, after.text);
  assert.equal(after.body.revision, nodeC.poolRevision);
  assert.ok(after.body.revision > before.body.revision, "la révision avance");
  assert.equal(after.body.configCount, 3);
  assert.notEqual(after.headers.etag, before.headers.etag);
  assert.notEqual(after.body.envelope.ciphertext, before.body.envelope.ciphertext);

  const plaintext = decrypt(after.body);
  assert.deepEqual(
    plaintext.configs.map((config: { region: string }) => config.region).sort(),
    ["af", "eu", "us"],
  );
});

test("preuve d'appareil invalide → 401, jamais de bundle", async () => {
  const forged = await account.client("GET", BUNDLE, undefined, {
    "x-device-signature": Buffer.from("signature-bidon").toString("base64"),
  });
  assert.equal(forged.status, 401);
  assert.equal(forged.body.error.code, "DEVICE_PROOF_INVALID");
  assert.equal(forged.body.envelope, undefined);

  const unsigned = await call("GET", BUNDLE, { headers: { authorization: `Bearer ${account.accessToken}` } });
  assert.equal(unsigned.status, 401);
  assert.equal(unsigned.body.error.code, "DEVICE_PROOF_INVALID");
});

test("bundle d'un appareil appartenant à un autre compte → 403", async () => {
  const intruder = await createAccount("intrus");

  // Session fabriquée : le compte A avec l'appareil B. La base l'accepte (aucune
  // contrainte croisée), donc c'est à la route de refuser.
  const sessionId = randomUUID();
  await db.query(
    `INSERT INTO auth_sessions (id, user_id, device_id, refresh_hash, expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '1 hour')`,
    [sessionId, account.userId, intruder.device.deviceId, `hash-${sessionId}`],
  );
  const forged = await issueAccessToken({
    userId: account.userId,
    deviceId: intruder.device.deviceId,
    communityId: seed.communityId,
    sessionId,
  });

  // Preuve valide, signée par le vrai propriétaire de l'appareil : la seule
  // chose qui cloche est le rattachement au compte.
  const client = deviceClient({ accessToken: forged.token, signing: intruder.device.keys.signing });
  const res = await client("GET", BUNDLE);
  assert.equal(res.status, 403, res.text);
  assert.equal(res.body.error.code, "FORBIDDEN");
  assert.equal(res.body.envelope, undefined);
});

test("appareil révoqué → 403 DEVICE_REVOKED", async () => {
  const revoked = await createAccount("revoque");
  await grantSubscription(seed, revoked.userId, { days: 30 });

  const del = await revoked.client("DELETE", `/v1/me/devices/${revoked.device.deviceId}`);
  assert.equal(del.status, 204);

  // La révocation tue aussi la session : la route répond d'abord « session
  // révoquée ». C'est le comportement correct, mais il masque l'état appareil.
  const afterRevoke = await revoked.client("GET", BUNDLE);
  assert.equal(afterRevoke.status, 401);
  assert.equal(afterRevoke.body.error.code, "UNAUTHENTICATED");

  // Nouvelle tentative de connexion avec le jeton de l'appareil révoqué : là,
  // c'est bien l'état de l'appareil qui répond.
  const relogin = await call("POST", "/v1/auth/login", {
    payload: { appId: seed.appId, email: revoked.email, password: PASSWORD },
    headers: {
      "x-device-token": revoked.device.deviceToken,
      ...signProof(revoked.device.keys.signing, "POST", "/v1/auth/login", JSON.stringify({ appId: seed.appId, email: revoked.email, password: PASSWORD })),
    },
  });
  assert.equal(relogin.status, 403);
  assert.equal(relogin.body.error.code, "DEVICE_REVOKED");

  // Et si une session vivante existait malgré tout sur cet appareil (ligne
  // insérée hors API), le bundle refuse en 403 DEVICE_REVOKED, pas en 401 muet.
  const sessionId = randomUUID();
  await db.query(
    `INSERT INTO auth_sessions (id, user_id, device_id, refresh_hash, expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '1 hour')`,
    [sessionId, revoked.userId, revoked.device.deviceId, `hash2-${sessionId}`],
  );
  const live = await issueAccessToken({
    userId: revoked.userId,
    deviceId: revoked.device.deviceId,
    communityId: seed.communityId,
    sessionId,
  });
  const zombie = deviceClient({ accessToken: live.token, signing: revoked.device.keys.signing });
  const res = await zombie("GET", BUNDLE);
  assert.equal(res.status, 403, res.text);
  assert.equal(res.body.error.code, "DEVICE_REVOKED");
});

test("sans abonnement actif → 402 SUBSCRIPTION_REQUIRED", async () => {
  const free = await createAccount("sans-droit");
  const res = await free.client("GET", BUNDLE);
  assert.equal(res.status, 402, res.text);
  assert.equal(res.body.error.code, "SUBSCRIPTION_REQUIRED");
  assert.equal(res.body.envelope, undefined);
});

test("quota : le 2e appareil reste enrolled, puis la place libérée est reprise", async () => {
  const owner = await createAccount("quota");
  await grantSubscription(seed, owner.userId, { days: 30 });

  // Deuxième appareil du même compte : plan à une place, la première est prise.
  const second = await enrollDevice({ deviceName: "Pixel bis" });
  const loginBody = { appId: seed.appId, email: owner.email, password: PASSWORD };
  const logged = await call("POST", "/v1/auth/login", {
    payload: loginBody,
    headers: {
      "x-device-token": second.deviceToken,
      ...signProof(second.keys.signing, "POST", "/v1/auth/login", JSON.stringify(loginBody)),
    },
  });
  assert.equal(logged.status, 200, logged.text);
  assert.equal(logged.body.device.status, "enrolled", "quota atteint : appareil connu, sans place");

  const client = deviceClient({ accessToken: String(logged.body.accessToken), signing: second.keys.signing });
  const denied = await client("GET", BUNDLE);
  assert.equal(denied.status, 403, denied.text);
  assert.equal(denied.body.error.code, "FORBIDDEN");

  // Révocation de l'ancien appareil par le nouveau, puis reprise de la place.
  const revoke = await client("DELETE", `/v1/me/devices/${owner.device.deviceId}`);
  assert.equal(revoke.status, 204, revoke.text);

  const allowed = await client("GET", BUNDLE);
  assert.equal(allowed.status, 200, allowed.text);
  assert.ok(allowed.body.envelope);

  const status = await db.scalar("SELECT status FROM devices WHERE id = $1", [second.deviceId]);
  assert.equal(status, "active", "l'appareil courant a consommé la place libérée");

  // Un appareil d'un autre compte reste un 403, même avec un identifiant valide.
  const foreign = await client("DELETE", `/v1/me/devices/${account.device.deviceId}`);
  assert.equal(foreign.status, 403);
  assert.equal(foreign.body.error.code, "FORBIDDEN");
});
