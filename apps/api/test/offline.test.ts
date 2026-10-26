/**
 * Fichier de secours hors-ligne — le seul contrat où une erreur de format ne se
 * voit **pas** au build : l'admin télécharge un fichier qui a l'air bon, et
 * l'application le refuse sur le téléphone, au pire moment.
 *
 * On vérifie donc contre le contrat Kotlin, pas contre nous-mêmes :
 *   1. signature Ed25519 sur la chaîne textuelle documentée ;
 *   2. enveloppe réellement déchiffrable avec la clé privée de l'appareil ;
 *   3. clés du JSON identiques à celles de `BundlePayload` ;
 *   4. rien du contenu ne sort dans la vue admin.
 */
import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID, verify } from "node:crypto";
import { after, test } from "node:test";

const ed = generateKeyPairSync("ed25519");
process.env.OFFLINE_BUNDLE_SIGNING_KEY = ed.privateKey
  .export({ format: "der", type: "pkcs8" })
  .toString("base64");
process.env.OFFLINE_BUNDLE_TTL_MINUTES = "60";

const { app, db, call, seedApp, publishEndpoint, newKeyPair, closeAll } = await import("./support.js");
const { openAdminSession } = await import("../src/lib/auth.js");
const { openEnvelope } = await import("../src/lib/crypto.js");
const { offlineSignedMessage } = await import("../src/services/offlineBundles.js");

after(async () => {
  await closeAll();
});

const seed = await seedApp();
const suffix = randomUUID().slice(0, 8);

async function makeAdmin(id: string, platformRole: "owner" | "none", communityId?: string): Promise<string> {
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active, must_change_password)
     VALUES ($1, $2, 'scrypt$16384$8$1$x$y', $1, $3, $4, true, false)`,
    [id, `${id}@test.local`, platformRole === "owner" ? "platform" : "partner", platformRole],
  );
  if (communityId) {
    await db.query(
      `INSERT INTO community_memberships (id, admin_user_id, community_id, role, status)
       VALUES ($1, $2, $3, 'community_admin', 'active')`,
      [`mem_${id}`, id, communityId],
    );
  }
  const { token } = await openAdminSession(db, { adminId: id });
  return token;
}

/** Appareil enrôlé : on ne teste pas l'enrôlement ici, seulement la clé ACORD. */
async function makeDevice(communityId: string, status = "enrolled") {
  const userId = `usr_${randomUUID().slice(0, 8)}`;
  const deviceId = `dev_${randomUUID().slice(0, 8)}`;
  const agreement = newKeyPair();
  const signing = newKeyPair();

  await db.query(
    `INSERT INTO users (id, app_id, community_id, email, password_hash, name)
     VALUES ($1, $2, $3, $4, 'scrypt$16384$8$1$x$y', 'Titulaire')`,
    [userId, seed.appId, communityId, `${userId}@test.local`],
  );
  await db.query(
    `INSERT INTO devices (id, user_id, installation_id, name, signing_key, agreement_key, status, device_token_hash)
     VALUES ($1, $2, $3, 'Pixel test', $4, $5, $6, 'hash')`,
    [deviceId, userId, `inst-${deviceId}`, signing.spki, agreement.spki, status],
  );
  return { userId, deviceId, agreement, signing };
}

function issue(deviceId: string, token: string, body: unknown = { ttlHours: 1 }) {
  return call("POST", `/v1/admin/devices/${deviceId}/offline-bundles`, {
    payload: body,
    headers: { authorization: `Bearer ${token}` },
  });
}

const owner = await makeAdmin("adm_off_owner", "owner");
const otherCommunity = `com_${suffix}`;
await db.query("INSERT INTO communities (id, name, slug, commission_bps) VALUES ($1, 'Autre', $2, 1500)", [
  otherCommunity,
  `autre-${suffix}`,
]);
const foreignAdmin = await makeAdmin("adm_off_foreign", "none", otherCommunity);

await publishEndpoint(`offline-test-${suffix}`);

/* ------------------------------------------------------------------- tests */

test("émission : signature vérifiable et enveloppe ouverte par l'appareil", async () => {
  const device = await makeDevice(seed.communityId);

  const res = await issue(device.deviceId, owner);
  assert.equal(res.status, 201, res.text);

  const file = res.body.file as Record<string, any>;
  assert.equal(file.v, 1);
  assert.equal(file.deviceId, device.deviceId);
  assert.equal(res.body.endpointCount, 1);

  // 1. la chaîne signée est celle que l'app reconstruit
  const message = offlineSignedMessage(file as never);
  const ok = verify(null, Buffer.from(message, "utf8"), ed.publicKey, Buffer.from(file.sig, "base64"));
  assert.equal(ok, true, "signature Ed25519 invalide");

  // 2. l'enveloppe s'ouvre avec la clé privée ACORD de l'appareil
  const plaintext = openEnvelope(file.envelope, device.agreement.pem, {
    deviceId: String(file.deviceId),
    revision: Number(file.revision),
  });
  const payload = JSON.parse(plaintext) as Record<string, any>;

  // 3. exactement les clés de `BundlePayload` (l'app refuse les inconnues)
  assert.deepEqual(Object.keys(payload).sort(), ["configs", "expiresAt", "issuedAt", "revision"]);
  assert.equal(payload.configs.length, 1);
  assert.deepEqual(Object.keys(payload.configs[0]).sort(), [
    "expiresAt",
    "id",
    "label",
    "maxSessionSeconds",
    "region",
    "uri",
  ]);
  assert.match(payload.configs[0].uri as string, /^vless:\/\//);
  assert.equal(payload.configs[0].maxSessionSeconds, 3300);
  assert.equal(typeof payload.revision, "number");
});

test("une enveloppe scellée pour un appareil ne s'ouvre pas pour un autre", async () => {
  const device = await makeDevice(seed.communityId);
  const intruder = await makeDevice(seed.communityId);

  const res = await issue(device.deviceId, owner);
  assert.equal(res.status, 201, res.text);

  assert.throws(
    () =>
      openEnvelope(res.body.file.envelope, intruder.agreement.pem, {
        deviceId: device.deviceId,
        revision: Number(res.body.file.revision),
      }),
    "une clé étrangère ne doit pas déchiffrer le fichier",
  );
});

test("une signature ne couvre pas un autre identifiant de bundle", async () => {
  const device = await makeDevice(seed.communityId);
  const res = await issue(device.deviceId, owner);
  const file = res.body.file as Record<string, any>;
  const forged = { ...file, bundleId: `bdg_${randomUUID()}` };
  const ok = verify(
    null,
    Buffer.from(offlineSignedMessage(forged as never), "utf8"),
    ed.publicKey,
    Buffer.from(forged.sig, "base64"),
  );
  assert.equal(ok, false);
});

test("un administrateur d'une autre communauté ne peut pas émettre", async () => {
  const device = await makeDevice(seed.communityId);
  const res = await issue(device.deviceId, foreignAdmin);
  assert.equal(res.status, 403, res.text);
});

test("un appareil révoqué ne reçoit rien", async () => {
  const device = await makeDevice(seed.communityId, "revoked");
  const res = await issue(device.deviceId, owner);
  assert.equal(res.status, 403, res.text);
  assert.equal(res.body.error.code, "DEVICE_REVOKED");
});

test("la vue admin ne montre aucun contenu chiffré", async () => {
  const device = await makeDevice(seed.communityId);
  await issue(device.deviceId, owner);

  const res = await call("GET", `/v1/admin/offline-bundles?deviceId=${device.deviceId}`, {
    headers: { authorization: `Bearer ${owner}` },
  });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.bundles.length, 1);

  const [bundle] = res.body.bundles as Record<string, any>[];
  assert.deepEqual(Object.keys(bundle).sort(), ["consumedAt", "deviceId", "expired", "id", "notAfter", "userId"]);
  assert.equal(res.text.includes("ciphertext"), false);
  assert.equal(res.text.includes("vless://"), false);
});

test("validité courte et corps strict", async () => {
  const device = await makeDevice(seed.communityId);

  const tooLong = await issue(device.deviceId, owner, { ttlHours: 100 });
  assert.equal(tooLong.status, 400);

  const unknownField = await issue(device.deviceId, owner, { ttlHours: 1, userId: "usr_autre" });
  assert.equal(unknownField.status, 400, "le titulaire ne se choisit pas dans le corps");

  const res = await issue(device.deviceId, owner, {});
  assert.equal(res.status, 201, res.text);
  const minutes = (new Date(res.body.notAfter).getTime() - Date.now()) / 60_000;
  assert.ok(minutes > 58 && minutes <= 61, `validité par défaut attendue ~60 min, obtenu ${minutes}`);
});
