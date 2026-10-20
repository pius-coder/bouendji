/**
 * Durcissement de l'API : audiences de jeton, tolérance de rejeu du refresh,
 * limites de débit par route, purge des données mortes.
 *
 * Ces quatre sujets ont un point commun : ils ne se voient pas dans un test
 * « heureux ». Il faut donc provoquer le cas limite — un jeton de la mauvaise
 * surface, une réponse de refresh perdue puis rejouée, la 11e tentative de
 * connexion, une ligne expirée qui traîne — et vérifier ce qui se passe
 * **réellement** en base, pas seulement le code de statut.
 *
 * `RATE_LIMIT_ENFORCE=1` est posé avant le premier import : les limites sont
 * désactivées par défaut en test (voir config.ts) pour que les suites
 * fonctionnelles ne dépendent pas d'un budget de requêtes. Ici, on les veut.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

process.env.RATE_LIMIT_ENFORCE = "1";

const { db, call, closeAll, enrollDevice, seedApp, signProof } = await import("./support.js");
const { ADMIN_AUDIENCE, MOBILE_AUDIENCE, issueAdminToken } = await import("../src/lib/auth.js");
const { BUNDLE_PATH } = await import("../src/routes/bundle.js");
const { purgeExpired } = await import("../src/services/maintenance.js");
const { decodeJwt, SignJWT } = await import("jose");

const seed = await seedApp({ deviceLimit: 1 });
const PASSWORD = "mot-de-passe-de-test";

after(closeAll);

/* ------------------------------------------------------------------ outils */

/** Chaque test travaille derrière sa propre IP : les compteurs ne se mélangent pas. */
let ipCounter = 10;
function nextIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

type Device = Awaited<ReturnType<typeof enrollDevice>>;

async function registerUser(label: string, ip = nextIp()) {
  const device = await enrollDevice({ deviceName: `Pixel ${label}` });
  const email = `${label}-${randomUUID().slice(0, 8)}@example.test`;
  const body = { appId: seed.appId, email, password: PASSWORD, name: "Testeur Test", locale: "fr" };
  const res = await call("POST", "/v1/auth/register", {
    payload: body,
    headers: {
      "x-device-token": device.deviceToken,
      "x-forwarded-for": ip,
      ...signProof(device.keys.signing, "POST", "/v1/auth/register", JSON.stringify(body)),
    },
  });
  assert.equal(res.status, 201, `inscription attendue en 201 : ${res.text}`);
  return { device, email, session: res.body };
}

async function loginAt(device: Device, email: string, password: string, ip: string) {
  const body = { email, password };
  return call("POST", "/v1/auth/login", {
    payload: body,
    headers: {
      "x-device-token": device.deviceToken,
      "x-forwarded-for": ip,
      ...signProof(device.keys.signing, "POST", "/v1/auth/login", JSON.stringify(body)),
    },
  });
}

async function refreshAt(device: Device, refreshToken: string, ip = nextIp()) {
  const body = { refreshToken };
  return call("POST", "/v1/auth/refresh", {
    payload: body,
    headers: {
      "x-device-token": device.deviceToken,
      "x-forwarded-for": ip,
      ...signProof(device.keys.signing, "POST", "/v1/auth/refresh", JSON.stringify(body)),
    },
  });
}

async function sessionsOf(userId: string, deviceId: string) {
  return db.query<Record<string, any>>(
    "SELECT id, revoked_at, replaced_by_id, replaced_at, expires_at FROM auth_sessions WHERE user_id = $1 AND device_id = $2 ORDER BY created_at",
    [userId, deviceId],
  );
}

/** Fabrique un jeton avec une clé et une audience choisies séparément. */
async function forgeToken(input: { keyPrefix: "user" | "admin"; audience: string; subject: string; typ: string; claims?: Record<string, unknown> }) {
  const key = new TextEncoder().encode(`${input.keyPrefix}:${process.env.JWT_SECRET}`);
  return new SignJWT({ typ: input.typ, ...(input.claims ?? {}) })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.subject)
    .setIssuedAt()
    .setIssuer("vpn-api")
    .setAudience(input.audience)
    .setExpirationTime(Math.floor(Date.now() / 1000) + 600)
    .sign(key);
}

/* --------------------------------------------------- 1. audiences (D17) */

test("audience : un jeton mobile est refusé par les routes d'administration", async () => {
  const { session } = await registerUser("aud-mobile");

  const payload = decodeJwt(session.accessToken);
  assert.equal(payload.aud, MOBILE_AUDIENCE, "le jeton mobile porte son audience");

  const res = await call("GET", "/v1/admin/me", { headers: { authorization: `Bearer ${session.accessToken}` } });
  assert.equal(res.status, 401, res.text);
  assert.equal(res.body.error.code, "UNAUTHENTICATED");
});

test("audience : un jeton d'administration est refusé par les routes mobiles", async () => {
  const adminId = `adm_${randomUUID().slice(0, 8)}`;
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role)
     VALUES ($1, $2, 'x', 'Admin test', 'platform', 'owner')`,
    [adminId, `${adminId}@example.test`],
  );
  const { token } = await issueAdminToken({ adminId, role: "platform", communityId: null });
  assert.equal(decodeJwt(token).aud, ADMIN_AUDIENCE, "le jeton admin porte son audience");

  // Contrôle positif : sur sa propre surface, il passe.
  const own = await call("GET", "/v1/admin/me", { headers: { authorization: `Bearer ${token}` } });
  assert.equal(own.status, 200, own.text);

  const device = await enrollDevice();
  const mobile = await call("GET", "/v1/me", {
    headers: {
      authorization: `Bearer ${token}`,
      ...signProof(device.keys.signing, "GET", "/v1/me", ""),
    },
  });
  assert.equal(mobile.status, 401, mobile.text);
  assert.equal(mobile.body.error.code, "UNAUTHENTICATED");
});

test("audience : le claim est vérifié, pas seulement la clé de signature", async () => {
  const { device, session } = await registerUser("aud-forge");

  // Clé mobile correcte, audience admin : la signature passe, l'audience non.
  const wrongAudience = await forgeToken({
    keyPrefix: "user",
    audience: ADMIN_AUDIENCE,
    subject: String(session.user.id),
    typ: "user",
    claims: { did: device.deviceId, cid: seed.communityId, sid: "ses_faux" },
  });
  const asAdmin = await call("GET", "/v1/admin/me", { headers: { authorization: `Bearer ${wrongAudience}` } });
  assert.equal(asAdmin.status, 401, asAdmin.text);

  // Et l'inverse : clé admin correcte, audience mobile.
  const adminId = `adm_${randomUUID().slice(0, 8)}`;
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role)
     VALUES ($1, $2, 'x', 'Admin forgé', 'platform', 'owner')`,
    [adminId, `${adminId}@example.test`],
  );
  const wrongWay = await forgeToken({ keyPrefix: "admin", audience: MOBILE_AUDIENCE, subject: adminId, typ: "admin" });
  const asMobile = await call("GET", "/v1/me", {
    headers: { authorization: `Bearer ${wrongWay}`, ...signProof(device.keys.signing, "GET", "/v1/me", "") },
  });
  assert.equal(asMobile.status, 401, asMobile.text);
});

/* ------------------------------------------- 2. rejeu du refresh toléré */

test("refresh : un rejeu immédiat du jeton remplacé rend une paire neuve sur la même session", async () => {
  const ip = nextIp();
  const { device, session } = await registerUser("replay-ok", ip);

  const rotated = await refreshAt(device, session.refreshToken, ip);
  assert.equal(rotated.status, 200, rotated.text);

  // La réponse précédente est « perdue » : le client rejoue le seul jeton qu'il a.
  const replay = await refreshAt(device, session.refreshToken, ip);
  assert.equal(replay.status, 200, replay.text);
  assert.notEqual(replay.body.refreshToken, session.refreshToken);
  assert.notEqual(replay.body.refreshToken, rotated.body.refreshToken, "un secret neuf, pas l'ancien");

  const rows = await sessionsOf(String(session.user.id), device.deviceId);
  assert.equal(rows.length, 2, "aucune session créée par la reprise");
  const current = rows[1]!;
  assert.equal(current.revoked_at, null, "la session courante reste vivante");

  const access = decodeJwt(replay.body.accessToken);
  assert.equal(access.sid, current.id, "le jeton d'accès reste lié à la session courante");
  assert.equal(access.aud, MOBILE_AUDIENCE);

  // Le jeton de la rotation dont la réponse s'est perdue est remplacé sur place.
  const orphan = await refreshAt(device, rotated.body.refreshToken, ip);
  assert.equal(orphan.status, 401);
  assert.equal(rows[0]!.revoked_at != null, true, "l'ancienne session reste révoquée");

  // Et la paire rendue par la reprise fonctionne : le client n'est pas éjecté.
  const next = await refreshAt(device, replay.body.refreshToken, ip);
  assert.equal(next.status, 200, next.text);

  const client = await call("GET", "/v1/me", {
    headers: {
      authorization: `Bearer ${next.body.accessToken}`,
      "x-forwarded-for": ip,
      ...signProof(device.keys.signing, "GET", "/v1/me", ""),
    },
  });
  assert.equal(client.status, 200, client.text);
});

test("refresh : un rejeu de 6 minutes révoque la chaîne et tue la session courante", async () => {
  const ip = nextIp();
  const { device, session } = await registerUser("replay-late", ip);

  const rotated = await refreshAt(device, session.refreshToken, ip);
  assert.equal(rotated.status, 200, rotated.text);

  // Horloge simulée : le remplacement date de 6 minutes, au-delà de la fenêtre.
  await db.query(
    "UPDATE auth_sessions SET replaced_at = now() - interval '6 minutes' WHERE device_id = $1 AND replaced_by_id IS NOT NULL",
    [device.deviceId],
  );

  const replay = await refreshAt(device, session.refreshToken, ip);
  assert.equal(replay.status, 401, replay.text);
  assert.equal(replay.body.error.code, "UNAUTHENTICATED");

  const rows = await sessionsOf(String(session.user.id), device.deviceId);
  assert.equal(rows.length, 2);
  assert.ok(
    rows.every((row) => row.revoked_at != null),
    "au-delà de la fenêtre, toute la chaîne est morte — vol probable",
  );

  const current = await refreshAt(device, rotated.body.refreshToken, ip);
  assert.equal(current.status, 401, "la session courante ne survit pas à la détection");
});

/* ------------------------------------------------- 3. limites de débit */

test("429 : login limité à 10 tentatives par IP sur 15 minutes", async () => {
  const ip = nextIp();
  const device = await enrollDevice();
  const email = `inconnu-${randomUUID().slice(0, 8)}@example.test`;

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const res = await loginAt(device, email, "mauvais-mot-de-passe", ip);
    assert.equal(res.status, 401, `tentative ${attempt} : ${res.text}`);
  }

  const blocked = await loginAt(device, email, "mauvais-mot-de-passe", ip);
  assert.equal(blocked.status, 429, blocked.text);
  assert.equal(blocked.body.error.code, "RATE_LIMITED");
  assert.ok(Number(blocked.body.error.retryAfter) > 0, "le client sait combien de temps attendre");
  assert.ok(blocked.headers["retry-after"], "l'en-tête retry-after accompagne le corps");
  assert.match(blocked.body.error.message, /Trop de requêtes/);
  assert.ok(blocked.body.error.requestId, "l'enveloppe d'erreur du projet, pas celle de Fastify");
});

test("429 : le compteur par email tient même en changeant d'IP", async () => {
  const device = await enrollDevice();
  const email = `cible-${randomUUID().slice(0, 8)}@example.test`;

  // Une IP neuve à chaque essai : le plafond par IP ne peut pas être la cause.
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    const res = await loginAt(device, email, "mauvais-mot-de-passe", nextIp());
    assert.equal(res.status, 401, `tentative ${attempt} : ${res.text}`);
  }

  const blocked = await loginAt(device, email, "mauvais-mot-de-passe", nextIp());
  assert.equal(blocked.status, 429, blocked.text);
  assert.equal(blocked.body.error.code, "RATE_LIMITED");
});

test("429 : le bundle est limité à 30 tirages par minute et par appareil", async () => {
  const ip = nextIp();
  const first = await enrollDevice();

  const pull = (deviceToken: string) =>
    call("GET", BUNDLE_PATH, { headers: { "x-device-token": deviceToken, "x-forwarded-for": ip } });

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const res = await pull(first.deviceToken);
    // Sans bearer, la route répond 401 : ce qui compte ici est qu'elle réponde.
    assert.notEqual(res.status, 429, `tirage ${attempt} refusé trop tôt`);
  }

  const blocked = await pull(first.deviceToken);
  assert.equal(blocked.status, 429, blocked.text);
  assert.equal(blocked.body.error.code, "RATE_LIMITED");

  // Un autre appareil n'hérite pas du compteur du premier.
  const second = await enrollDevice();
  const other = await pull(second.deviceToken);
  assert.notEqual(other.status, 429, "les compteurs sont par appareil, pas globaux");
});

test("webhook de paiement : un fournisseur qui rejoue n'est jamais étranglé", async () => {
  const ip = nextIp();
  const body = { transId: `mock_${randomUUID().slice(0, 8)}`, externalId: `ord_${randomUUID().slice(0, 8)}`, status: "SUCCESSFUL", amount: 2000 };

  // 305 rejeux : au-delà du plafond global de 300/min. Sans l'exemption, la
  // 301e réponse serait un 429 et un paiement encaissé serait perdu.
  for (let attempt = 1; attempt <= 305; attempt += 1) {
    const res = await call("POST", "/v1/payments/webhook/mock", {
      payload: body,
      headers: { "x-forwarded-for": ip },
    });
    assert.notEqual(res.status, 429, `rejeu ${attempt} étranglé`);
  }
});

/* --------------------------------------------------------------- 4. purge */

test("purge : n'enlève que ce qui est expiré", async () => {
  const ip = nextIp();
  const { device, session } = await registerUser("purge", ip);
  const userId = String(session.user.id);
  const spare = await enrollDevice({ deviceName: "Appareil spare" });

  await db.query(
    `INSERT INTO bundles (id, user_id, device_id, revision, config_count, payload, expires_at)
     VALUES ('bun_purge_old', $1, $2, 1, 0, '{}'::jsonb, now() - interval '1 minute'),
            ('bun_purge_live', $1, $3, 1, 0, '{}'::jsonb, now() + interval '1 hour')`,
    [userId, device.deviceId, spare.deviceId],
  );

  await db.query(
    `INSERT INTO device_nonces (nonce, device_id, seen_at)
     VALUES ('nonce_purge_old', $1, now() - interval '11 minutes'),
            ('nonce_purge_live', $1, now())`,
    [device.deviceId],
  );

  await db.query(
    `INSERT INTO enroll_challenges (id, nonce, installation_id, expires_at)
     VALUES ('chal_purge_old', 'n-old', 'inst-old', now() - interval '1 minute'),
            ('chal_purge_live', 'n-live', 'inst-live', now() + interval '5 minutes')`,
  );

  await db.query(
    `INSERT INTO auth_sessions (id, user_id, device_id, refresh_hash, expires_at, revoked_at)
     VALUES ('ses_purge_exp', $1, $2, 'hash-exp', now() - interval '1 minute', NULL),
            ('ses_purge_old', $1, $2, 'hash-old', now() + interval '1 day', now() - interval '8 days'),
            ('ses_purge_keep', $1, $2, 'hash-keep', now() + interval '1 day', now() - interval '3 days')`,
    [userId, spare.deviceId],
  );

  const purged = await purgeExpired(db);

  assert.equal(purged.bundles, 1, "seul le bundle expiré part");
  assert.equal(purged.deviceNonces, 1, "seul le nonce de plus de 10 minutes part");
  assert.equal(purged.enrollChallenges, 1, "seul le challenge expiré part");
  assert.equal(purged.authSessions, 2, "session expirée + révoquée depuis plus de 7 jours");

  assert.equal(await db.scalar("SELECT count(*)::int FROM bundles WHERE id = 'bun_purge_old'"), 0);
  assert.equal(await db.scalar("SELECT count(*)::int FROM bundles WHERE id = 'bun_purge_live'"), 1);
  assert.equal(await db.scalar("SELECT count(*)::int FROM device_nonces WHERE nonce = 'nonce_purge_old'"), 0);
  assert.equal(await db.scalar("SELECT count(*)::int FROM device_nonces WHERE nonce = 'nonce_purge_live'"), 1);
  assert.equal(await db.scalar("SELECT count(*)::int FROM enroll_challenges WHERE id = 'chal_purge_old'"), 0);
  assert.equal(await db.scalar("SELECT count(*)::int FROM enroll_challenges WHERE id = 'chal_purge_live'"), 1);
  assert.equal(await db.scalar("SELECT count(*)::int FROM auth_sessions WHERE id = 'ses_purge_exp'"), 0);
  assert.equal(await db.scalar("SELECT count(*)::int FROM auth_sessions WHERE id = 'ses_purge_old'"), 0);
  assert.equal(
    await db.scalar("SELECT count(*)::int FROM auth_sessions WHERE id = 'ses_purge_keep'"),
    1,
    "une révocation de 3 jours reste auditable",
  );
  assert.equal(
    await db.scalar("SELECT count(*)::int FROM auth_sessions WHERE user_id = $1 AND device_id = $2 AND revoked_at IS NULL", [
      userId,
      device.deviceId,
    ]),
    1,
    "la session vivante du compte est intacte",
  );

  // Deux purges d'affilée ne trouvent plus rien : l'opération est idempotente.
  const again = await purgeExpired(db);
  assert.deepEqual(again, { bundles: 0, deviceNonces: 0, enrollChallenges: 0, authSessions: 0 });
});
