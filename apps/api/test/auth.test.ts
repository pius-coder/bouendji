/**
 * Authentification et appareils.
 *
 * Ce que ces tests prouvent, et rien de plus :
 * - l'enrôlement n'accepte que deux clés EC P-256 et consomme le challenge ;
 * - l'inscription refuse un email déjà pris et un appareil déjà rattaché ;
 * - la connexion ne dit jamais si l'email existe ;
 * - le refresh est rotatif : l'ancien jeton meurt, et le rejouer révoque la
 *   famille (compte + appareil) ;
 * - une preuve d'appareil absente, fausse ou rejouée est un 401 ;
 * - la déconnexion tue la session côté serveur, pas seulement côté client.
 *
 * Rien n'est simulé cryptographiquement : les clés sont de vraies clés EC P-256
 * générées par le test, et la signature est vérifiée par le code de production.
 */
import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { after, test } from "node:test";

const { db, call, closeAll, deviceClient, enrollDevice, seedApp, signProof } = await import("./support.js");

const seed = await seedApp({ deviceLimit: 1 });
const PASSWORD = "mot-de-passe-de-test";

after(closeAll);

/* ------------------------------------------------------------------ outils */

/**
 * D53 : le téléphone est obligatoire et unique par marque. Un compteur suffit :
 * ces numéros ne sont jamais joignables, ils ne servent qu'à la contrainte.
 */
let phoneSeq = 0;
function nextPhone(): string {
  phoneSeq += 1;
  return `+2376${String(phoneSeq).padStart(8, "0")}`;
}

function registrable(
  device: { deviceToken: string; keys: { signing: { spki: string; pem: string } } },
  email: string,
  phone = nextPhone(),
) {
  const body = { appId: seed.appId, email, password: PASSWORD, name: "Testeur Test", phone, locale: "fr" };
  const raw = JSON.stringify(body);
  return call("POST", "/v1/auth/register", {
    payload: body,
    // Le corps signé est exactement celui qui part : `call` le sérialise de la
    // même façon, l'ordre des clés est celui de l'objet.
    headers: {
      "x-device-token": device.deviceToken,
      ...signProof(device.keys.signing, "POST", "/v1/auth/register", raw),
    },
  });
}

async function loginWith(device: { deviceToken: string; keys: { signing: { spki: string; pem: string } } }, email: string, password = PASSWORD) {
  const body = { appId: seed.appId, email, password };
  return call("POST", "/v1/auth/login", {
    payload: body,
    headers: {
      "x-device-token": device.deviceToken,
      ...signProof(device.keys.signing, "POST", "/v1/auth/login", JSON.stringify(body)),
    },
  });
}

async function refreshWith(device: { deviceToken: string; keys: { signing: { spki: string; pem: string } } }, refreshToken: string) {
  const body = { refreshToken };
  return call("POST", "/v1/auth/refresh", {
    payload: body,
    headers: {
      "x-device-token": device.deviceToken,
      ...signProof(device.keys.signing, "POST", "/v1/auth/refresh", JSON.stringify(body)),
    },
  });
}

async function registerFreshUser(label: string) {
  const device = await enrollDevice({ deviceName: `Pixel ${label}` });
  const email = `${label}-${randomUUID().slice(0, 8)}@example.test`;
  const res = await registrable(device, email);
  assert.equal(res.status, 201, `inscription attendue en 201 : ${res.text}`);
  return { device, email, session: res.body };
}

/* -------------------------------------------------------------------- tests */

test("enrôlement : challenge court, deux clés EC P-256, jeton d'appareil", async () => {
  const device = await enrollDevice();
  assert.ok(device.deviceId);
  assert.ok(device.deviceToken.length >= 40, "le jeton d'appareil doit être long");
  assert.equal(device.status, "enrolled");

  const row = await db.one<Record<string, any>>("SELECT * FROM devices WHERE id = $1", [device.deviceId]);
  assert.ok(row, "ligne devices créée");
  assert.equal(row.signing_key, device.keys.signing.spki);
  assert.equal(row.agreement_key, device.keys.agreement.spki);
  assert.equal(row.user_id, null, "l'appareil n'est pas encore rattaché");
  assert.notEqual(row.device_token_hash, device.deviceToken, "le jeton est stocké haché");
  assert.equal(row.integrity_ok, false);

  // Le challenge est consommé : il ne peut pas servir deux fois.
  const replayChallenge = await db.one<Record<string, any>>(
    "SELECT used_at FROM enroll_challenges WHERE installation_id = $1",
    [device.installationId],
  );
  assert.ok(replayChallenge?.used_at, "challenge marqué utilisé");
});

test("enrôlement : une clé RSA est refusée avant toute écriture", async () => {
  const installationId = `inst-${randomUUID()}`;
  const challenge = await call("POST", "/v1/devices/challenges", { payload: { installationId, purpose: "enroll" } });
  assert.equal(challenge.status, 200);

  const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const rsaSpki = rsa.publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const ecSpki = ec.publicKey.export({ format: "der", type: "spki" }).toString("base64");

  const res = await call("POST", "/v1/devices/enroll", {
    payload: {
      challengeId: challenge.body.challengeId,
      installationId,
      deviceName: "Mauvais appareil",
      platform: "android",
      signingKey: rsaSpki,
      agreementKey: ecSpki,
      appVersion: "1.0.0",
      androidVersion: 34,
    },
    headers: {
      "x-device-timestamp": String(Date.now()),
      "x-device-nonce": String(challenge.body.nonce),
      "x-device-signature": "AAAA",
    },
  });

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "VALIDATION_FAILED");
  assert.match(JSON.stringify(res.body.error.details), /signingKey/);
  const rows = await db.query("SELECT id FROM devices WHERE installation_id = $1", [installationId]);
  assert.equal(rows.length, 0, "aucune ligne créée");
});

test("inscription : 201, email normalisé, puis 409 sur doublon", async () => {
  const device = await enrollDevice();
  const email = `Doublon-${randomUUID().slice(0, 8)}@Example.test`;
  const first = await registrable(device, email);
  assert.equal(first.status, 201, first.text);

  assert.ok(first.body.accessToken);
  assert.ok(first.body.refreshToken);
  assert.equal(first.body.user.email, email.toLowerCase(), "email stocké en minuscules");
  assert.equal(first.body.user.emailVerified, false);
  assert.equal(first.body.device.status, "active", "premier appareil d'un compte neuf");

  const user = await db.one<Record<string, any>>("SELECT * FROM users WHERE id = $1", [first.body.user.id]);
  assert.ok(user?.password_hash.startsWith("scrypt$"), "mot de passe haché en scrypt");
  assert.equal(user?.community_id, seed.communityId);

  // Même email, autre appareil : refus explicite.
  const otherDevice = await enrollDevice();
  const duplicate = await registrable(otherDevice, email);
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, "CONFLICT");

  // Même appareil, autre email : il est déjà rattaché, on ne le déplace pas.
  const rebound = await registrable(device, `autre-${randomUUID().slice(0, 8)}@example.test`);
  assert.equal(rebound.status, 409);
});

test("connexion : mauvais mot de passe et email inconnu donnent le même 401", async () => {
  const { device, email } = await registerFreshUser("login");

  const wrongPassword = await loginWith(device, email, "mauvais-mot-de-passe");
  assert.equal(wrongPassword.status, 401);
  assert.equal(wrongPassword.body.error.code, "INVALID_CREDENTIALS");

  const unknown = await loginWith(device, `inconnu-${randomUUID().slice(0, 8)}@example.test`);
  assert.equal(unknown.status, 401);
  assert.equal(unknown.body.error.code, "INVALID_CREDENTIALS");
  assert.equal(unknown.body.error.message, wrongPassword.body.error.message, "aucune distinction de message");

  const ok = await loginWith(device, email);
  assert.equal(ok.status, 200, ok.text);
  assert.ok(ok.body.accessToken);
});

test("refresh rotatif : l'ancien jeton meurt, le rejouer depuis un autre appareil révoque la chaîne", async () => {
  const { device, session } = await registerFreshUser("refresh");
  const client = deviceClient({ accessToken: session.accessToken, signing: device.keys.signing });

  const rotated = await refreshWith(device, session.refreshToken);
  assert.equal(rotated.status, 200, rotated.text);
  assert.notEqual(rotated.body.refreshToken, session.refreshToken, "nouveau jeton de rafraîchissement");
  assert.equal(
    rotated.body.refreshExpiresAt,
    session.refreshExpiresAt,
    "une rotation ne prolonge pas l'échéance absolue",
  );

  const withNewToken = deviceClient({ accessToken: rotated.body.accessToken, signing: device.keys.signing });
  const me = await withNewToken("GET", "/v1/me");
  assert.equal(me.status, 200, me.text);

  // La rotation laisse une trace : c'est elle qui distingue plus tard une
  // reprise réseau (même appareil, < 5 min) d'un vol.
  const chain = await db.query<Record<string, any>>(
    "SELECT id, replaced_by_id, replaced_at FROM auth_sessions WHERE user_id = $1 AND device_id = $2 ORDER BY created_at",
    [session.user.id, device.deviceId],
  );
  assert.equal(chain.length, 2, "deux lignes : l'ancienne et la nouvelle");
  assert.equal(chain[0]?.replaced_by_id, chain[1]?.id, "l'ancienne pointe vers la nouvelle");
  assert.ok(chain[0]?.replaced_at, "le remplacement est horodaté");

  // Jeton mort présenté depuis un **autre** appareil : on ne sait pas lequel
  // des deux est légitime, donc la famille entière tombe.
  const intruder = await enrollDevice({ deviceName: "Autre appareil" });
  const replay = await refreshWith(intruder, session.refreshToken);
  assert.equal(replay.status, 401);
  assert.equal(replay.body.error.code, "UNAUTHENTICATED");

  const sessions = await db.query<Record<string, any>>(
    "SELECT revoked_at FROM auth_sessions WHERE user_id = $1 AND device_id = $2",
    [session.user.id, device.deviceId],
  );
  assert.equal(sessions.length, 2, "deux lignes : l'ancienne et la nouvelle");
  assert.ok(
    sessions.every((row) => row.revoked_at != null),
    "la chaîne entière est révoquée après un rejeu depuis un autre appareil",
  );

  const afterRevoke = await refreshWith(device, rotated.body.refreshToken);
  assert.equal(afterRevoke.status, 401, "le jeton courant est mort lui aussi");
});

test("preuve d'appareil : absente, fausse ou rejouée → 401", async () => {
  const { device, session } = await registerFreshUser("proof");
  const client = deviceClient({ accessToken: session.accessToken, signing: device.keys.signing });

  const noHeaders = await call("GET", "/v1/me", { headers: { authorization: `Bearer ${session.accessToken}` } });
  assert.equal(noHeaders.status, 401);
  assert.equal(noHeaders.body.error.code, "DEVICE_PROOF_INVALID");

  const forged = await client("GET", "/v1/me", undefined, { "x-device-signature": Buffer.from("faux").toString("base64") });
  assert.equal(forged.status, 401);
  assert.equal(forged.body.error.code, "DEVICE_PROOF_INVALID");

  // Même preuve deux fois : le nonce est à usage unique.
  const proof = signProof(device.keys.signing, "GET", "/v1/me", "");
  const first = await call("GET", "/v1/me", {
    headers: { authorization: `Bearer ${session.accessToken}`, ...proof },
  });
  assert.equal(first.status, 200, first.text);

  const replayed = await call("GET", "/v1/me", {
    headers: { authorization: `Bearer ${session.accessToken}`, ...proof },
  });
  assert.equal(replayed.status, 401);
  assert.equal(replayed.body.error.code, "DEVICE_PROOF_INVALID");
});

test("déconnexion : 204, puis la session ne vaut plus rien", async () => {
  const { device, session } = await registerFreshUser("logout");
  const client = deviceClient({ accessToken: session.accessToken, signing: device.keys.signing });

  assert.equal((await client("GET", "/v1/me")).status, 200);

  const out = await client("POST", "/v1/auth/logout");
  assert.equal(out.status, 204);
  assert.equal(out.text, "");

  const after = await client("GET", "/v1/me");
  assert.equal(after.status, 401);

  const refresh = await refreshWith(device, session.refreshToken);
  assert.equal(refresh.status, 401, "le refresh de la session déconnectée est mort aussi");
});

test("un appareil rattaché à un autre compte ne peut pas se connecter", async () => {
  const first = await registerFreshUser("owner");
  const second = await registerFreshUser("intrus");

  // L'appareil du second tente de se connecter sur le compte du premier.
  const stolen = await loginWith(second.device, first.email, PASSWORD);
  assert.equal(stolen.status, 409);
  assert.equal(stolen.body.error.code, "CONFLICT");

  // Et l'appareil reste sur son compte.
  const owner = await db.scalar("SELECT user_id FROM devices WHERE id = $1", [second.device.deviceId]);
  assert.equal(owner, second.session.user.id);
});

test("le profil se lit et se met à jour, la communauté vient de la session", async () => {
  const { device, session } = await registerFreshUser("profil");
  const client = deviceClient({ accessToken: session.accessToken, signing: device.keys.signing });

  const me = await client("GET", "/v1/me");
  assert.equal(me.status, 200, me.text);
  assert.equal(me.body.user.id, session.user.id);
  assert.equal(me.body.community.id, seed.communityId);
  assert.equal(me.body.device.current, true);
  assert.equal(me.body.entitlement.active, false, "aucun abonnement dans ce test");
  assert.equal(me.body.devicesUsed, 1);

  const patched = await client("PATCH", "/v1/me", { name: "Nom Changé", locale: "en" });
  assert.equal(patched.status, 200, patched.text);
  assert.equal(patched.body.name, "Nom Changé");
  assert.equal(patched.body.locale, "en");

  // Corps strict : un champ inconnu est refusé, pas ignoré.
  const extra = await client("PATCH", "/v1/me", { name: "X Y", communityId: "com_autre" });
  assert.equal(extra.status, 400);
  assert.equal(extra.body.error.code, "VALIDATION_FAILED");
});
