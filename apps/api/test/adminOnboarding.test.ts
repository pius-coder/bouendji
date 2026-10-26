/**
 * Onboarding en libre-service (R4) : routes, contraintes et règles pures.
 *
 * Vrai `buildApp`, vraie base PGlite. Les migrations 040-044 sont appliquées
 * explicitement (le lanceur de migrations R0 n'est pas dans cette copie).
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "memory://";
process.env.MASTER_KEY = Buffer.alloc(32, 11).toString("base64");
process.env.JWT_SECRET = "test-secret-onboarding-test-secret";
{
  const { generateKeyPairSync } = await import("node:crypto");
  const ed = generateKeyPairSync("ed25519");
  process.env.OFFLINE_BUNDLE_SIGNING_KEY = ed.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
}

const { createDb } = await import("../src/db.js");
const { buildApp } = await import("../src/app.js");
const { issueAdminToken } = await import("../src/lib/auth.js");
const { verifyPassword } = await import("../src/lib/crypto.js");
const { normalizeWhatsappNumber, packageNameForCommunity, slugFromName, generateTemporaryPassword, validateLogo, waMeLink } =
  await import("../src/lib/onboarding.js");
const m040 = await import("../src/migrations/040_communities_whatsapp.js");
const m041 = await import("../src/migrations/041_apps_one_per_community.js");
const m042 = await import("../src/migrations/042_admin_onboarding.js");
const m043 = await import("../src/migrations/043_app_logos.js");
const m044 = await import("../src/migrations/044_admin_users_onboarding.js");

const db = await createDb();
const app = await buildApp({ db });

after(async () => {
  await app.close();
  await db.close();
});

/* ---------------------------------------------------------- migrations */

// Idempotence : appliquées deux fois, sans erreur.
for (const m of [m040, m041, m042, m043, m044]) {
  await m.up(db);
  await m.up(db);
}

/* ------------------------------------------------------------ graine */

const OWNER = "adm_ob_owner";
const NEW_ADMIN = "adm_ob_new"; // sans communauté
const CA_A = "adm_ob_ca_a"; // community_admin de COM_A
const SUPPORT_A = "adm_ob_support_a"; // support de COM_A
const CREATED = "adm_ob_created"; // crée sa communauté pendant le test
const COM_A = "com_ob_a";
const COM_B = "com_ob_b";
const APP_A = "app_ob_a";
const APP_B = "app_ob_b";

await db.query(`INSERT INTO communities (id, name, slug, commission_bps) VALUES ($1, 'Communauté A', 'communaute-a', 2000)`, [COM_A]);
await db.query(`INSERT INTO communities (id, name, slug, commission_bps) VALUES ($1, 'Communauté B', 'communaute-b', 2000)`, [COM_B]);
await db.query(`INSERT INTO apps (id, community_id, slug, name, package_name, theme, support_url) VALUES ($1, $2, 'app-ob-a', 'App A', 'cm.ob.a.vpn', 'halo', 'https://aide.a.example')`, [APP_A, COM_A]);
await db.query(`INSERT INTO apps (id, community_id, slug, name, package_name, theme, support_url) VALUES ($1, $2, 'app-ob-b', 'App B', 'cm.ob.b.vpn', 'halo', 'https://aide.b.example')`, [APP_B, COM_B]);

for (const [id, email, platformRole, legacyRole] of [
  [OWNER, "owner-ob@example.com", "owner", "platform"],
  [NEW_ADMIN, "new-ob@example.com", "none", "partner"],
  [CA_A, "ca-ob@example.com", "none", "partner"],
  [SUPPORT_A, "support-ob@example.com", "none", "partner"],
  [CREATED, "created-ob@example.com", "none", "partner"],
] as const) {
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active)
     VALUES ($1, $2, 'scrypt$16384$8$1$x$y', $3, $4, $5, true)`,
    [id, email, id.replace("adm_ob_", "Admin "), legacyRole, platformRole],
  );
}
await db.query(
  `INSERT INTO community_memberships (id, admin_user_id, community_id, role, status) VALUES
   ('mem_ob_ca', $1, $2, 'community_admin', 'active'),
   ('mem_ob_support', $3, $2, 'support', 'active')`,
  [CA_A, COM_A, SUPPORT_A],
);

const tokens: Record<string, string> = {};
for (const id of [OWNER, NEW_ADMIN, CA_A, SUPPORT_A, CREATED]) {
  const { token } = await issueAdminToken({ adminId: id, role: id === OWNER ? "platform" : "partner", communityId: null });
  tokens[id] = token;
}

async function call(method: "GET" | "POST" | "PATCH", url: string, as: string, payload?: unknown) {
  const res = await app.inject({
    method,
    url: `/v1/admin${url}`,
    headers: { authorization: `Bearer ${tokens[as]}` },
    ...(payload === undefined ? {} : { payload: payload as never }),
  });
  let json: Record<string, any> = {};
  try {
    json = res.json() as Record<string, any>;
  } catch {
    json = {};
  }
  return { status: res.statusCode, body: json, text: res.body };
}

/* ------------------------------------------------ règles pures (lib) */

test("numéro WhatsApp : 9 chiffres, +237 facultatif, espaces tolérés", () => {
  assert.equal(normalizeWhatsappNumber("612345678"), "612345678");
  assert.equal(normalizeWhatsappNumber("+237612345678"), "612345678");
  assert.equal(normalizeWhatsappNumber("+237 612 345 678"), "612345678");
  assert.equal(normalizeWhatsappNumber("61234567"), null);
  assert.equal(normalizeWhatsappNumber("6123456789"), null);
  assert.equal(normalizeWhatsappNumber("+33612345678"), null);
  assert.equal(normalizeWhatsappNumber("abc"), null);
});

test("lien wa.me : numéro en 237 et texte encodé", () => {
  assert.equal(waMeLink("612345678", "Bonjour & bienvenue"), "https://wa.me/237612345678?text=Bonjour%20%26%20bienvenue");
});

test("paquet et slug dérivés côté serveur", () => {
  assert.equal(packageNameForCommunity("ma-communaute"), "cm.ma_communaute.vpn");
  assert.equal(packageNameForCommunity("2026-club"), "cm.c2026_club.vpn");
  assert.equal(slugFromName("Béné Ndji !"), "bene-ndji");
  assert.equal(slugFromName("A"), null);
});

test("mot de passe temporaire : 16 caractères, sans caractères ambigus, varie", () => {
  const a = generateTemporaryPassword();
  const b = generateTemporaryPassword();
  assert.equal(a.length, 16);
  assert.match(a, /^[abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789]+$/);
  assert.notEqual(a, b);
});

test("logo : PNG et SVG acceptés, contenu contrôlé, 1 Mo au plus", () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("corps")]);
  const ok = validateLogo("image/png", png.toString("base64"));
  assert.equal(typeof ok, "object");
  assert.equal(validateLogo("image/png", Buffer.from("pas un png").toString("base64")), "le fichier n'est pas un PNG.");
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>').toString("base64");
  assert.equal(typeof validateLogo("image/svg+xml", svg), "object");
  const evil = Buffer.from('<svg><script>alert(1)</script></svg>').toString("base64");
  assert.match(String(validateLogo("image/svg+xml", evil)), /SVG refusé/);
  const handler = Buffer.from('<svg onload="x()"></svg>').toString("base64");
  assert.match(String(validateLogo("image/svg+xml", handler)), /SVG refusé/);
  const big = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(1_048_577)]);
  assert.equal(validateLogo("image/png", big.toString("base64")), "1 Mo maximum.");
  assert.match(String(validateLogo("image/gif", png.toString("base64"))), /PNG ou SVG/);
});

/* ------------------------------------------------ contraintes SQL */

test("migration 041 refuse une base où une communauté a deux applications", async () => {
  const other = await createDb();
  try {
    await other.query(`INSERT INTO communities (id, name, slug, commission_bps) VALUES ('c_dup', 'Dup', 'dup', 2000)`);
    for (const id of ["a_dup_1", "a_dup_2"]) {
      await other.query(
        `INSERT INTO apps (id, community_id, slug, name, package_name, theme) VALUES ($1, 'c_dup', $2, 'Dup', $3, 'halo')`,
        [id, `slug-${id}`, `cm.${id}.vpn`],
      );
    }
    await assert.rejects(() => m041.up(other), /communautés avec plusieurs applications : c_dup/);
  } finally {
    await other.close();
  }
});

test("contrainte : une seule application par communauté (index unique)", async () => {
  await assert.rejects(
    () =>
      db.query(
        `INSERT INTO apps (id, community_id, slug, name, package_name, theme) VALUES ('app_ob_extra', $1, 'extra', 'Extra', 'cm.extra.vpn', 'halo')`,
        [COM_A],
      ),
    /apps_community_id_uq|unique/i,
  );
});

test("contrainte : une seule communauté créée par compte (created_by unique)", async () => {
  await db.query(`INSERT INTO communities (id, name, slug, created_by) VALUES ('c_by_1', 'Un', 'un-cree', $1)`, [CREATED]);
  await assert.rejects(
    () => db.query(`INSERT INTO communities (id, name, slug, created_by) VALUES ('c_by_2', 'Deux', 'deux-cree', $1)`, [CREATED]),
    /created_by|unique/i,
  );
});

/* ------------------------------------------------ onboarding : communauté */

test("communauté : un admin sans communauté crée la sienne, une seule fois", async () => {
  const created = await call("POST", "/onboarding/community", NEW_ADMIN, {
    name: "Réseau Ndji",
    whatsappGroupUrl: "https://chat.whatsapp.com/AbCdEfGhIjKlMnOp",
    contactWhatsapp: "+237 612 345 678",
  });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.body.slug, "reseau-ndji");
  assert.equal(created.body.contactWhatsapp, "612345678");
  assert.equal(created.body.whatsappGroupUrl, "https://chat.whatsapp.com/AbCdEfGhIjKlMnOp");

  const membership = await db.one<{ role: string }>(
    `SELECT role FROM community_memberships WHERE admin_user_id = $1 AND community_id = $2`,
    [NEW_ADMIN, created.body.id],
  );
  assert.equal(membership?.role, "community_admin");

  const again = await call("POST", "/onboarding/community", NEW_ADMIN, { name: "Autre communauté" });
  assert.equal(again.status, 409);
  const count = await db.scalar<number>(`SELECT count(*)::int FROM communities WHERE created_by = $1`, [NEW_ADMIN]);
  assert.equal(Number(count), 1);
});

test("communauté : refusée à un admin qui a déjà une appartenance active", async () => {
  const res = await call("POST", "/onboarding/community", CA_A, { name: "Encore une" });
  assert.equal(res.status, 409);
});

test("communauté : lien WhatsApp et numéro invalides refusés avec le champ nommé", async () => {
  const badLink = await call("POST", "/onboarding/community", CREATED, {
    name: "Test lien",
    whatsappGroupUrl: "https://example.com/groupe",
  });
  assert.equal(badLink.status, 400);
  assert.ok(badLink.body.error.details?.whatsappGroupUrl);

  const badNumber = await call("POST", "/onboarding/community", CREATED, { name: "Test numéro", contactWhatsapp: "12345" });
  assert.equal(badNumber.status, 400);
  assert.ok(badNumber.body.error.details?.contactWhatsapp);
});

/* ------------------------------------------------ onboarding : application */

test("application : refusée sans communauté, puis créée avec paquet calculé côté serveur", async () => {
  const nobody = await call("POST", "/apps", SUPPORT_A, {
    name: "Ma marque",
    theme: "halo",
    supportUrl: "https://aide.example.com",
  });
  assert.equal(nobody.status, 403);

  // CREATED a déjà une communauté (créée plus haut, dans le test « unique »).
  const created = await call("POST", "/apps", CREATED, {
    name: "Ma marque",
    theme: "mono",
    accent: "#1a2b3c",
    supportUrl: "https://aide.example.com",
    supportEmail: "contact@example.com",
  });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.body.packageName, "cm.un_cree.vpn");
  assert.equal(created.body.accent, "#1A2B3C");
  assert.equal(created.body.communityId, "c_by_1");

  const second = await call("POST", "/apps", CREATED, {
    name: "Deuxième",
    theme: "halo",
    supportUrl: "https://aide.example.com",
  });
  assert.equal(second.status, 409);
});

test("application : la marque est validée comme pour un build (422 nommant le champ)", async () => {
  const badUrl = await call("POST", "/apps", NEW_ADMIN, { name: "Marque", theme: "halo", supportUrl: "http://insecure.example" });
  assert.equal(badUrl.status, 422);
  assert.ok(badUrl.body.error.details?.supportUrl);

  const badTheme = await call("POST", "/apps", NEW_ADMIN, { name: "Marque", theme: "inconnu", supportUrl: "https://a.example" });
  assert.equal(badTheme.status, 400);
});

test("application : une communauté qui a déjà une app refuse la seconde (409)", async () => {
  // NEW_ADMIN a sa communauté sans application : la première passe, la seconde non.
  const first = await call("POST", "/apps", NEW_ADMIN, {
    name: "Marque Ndji",
    theme: "billet",
    supportUrl: "https://aide.ndji.example",
  });
  assert.equal(first.status, 201, first.text);
  const again = await call("POST", "/apps", NEW_ADMIN, {
    name: "Marque bis",
    theme: "billet",
    supportUrl: "https://aide.ndji.example",
  });
  assert.equal(again.status, 409);
});

/* ------------------------------------------------ modification de l'application */

test("PATCH application : périmètre, thème validé, paquet immuable, build en cours", async () => {
  const foreign = await call("PATCH", `/apps/${APP_B}`, CA_A, { name: "Pirate" });
  assert.equal(foreign.status, 403);

  const ok = await call("PATCH", `/apps/${APP_A}`, CA_A, {
    name: "App A renommée",
    theme: "vector",
    accent: "#00ff00",
    privacyUrl: "https://a.example/confidentialite",
  });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.body.name, "App A renommée");
  assert.equal(ok.body.packageName, "cm.ob.a.vpn");
  assert.equal(ok.body.privacyUrl, "https://a.example/confidentialite");

  const badTheme = await call("PATCH", `/apps/${APP_A}`, CA_A, { theme: "neon" });
  assert.equal(badTheme.status, 400);

  const badPrivacy = await call("PATCH", `/apps/${APP_A}`, CA_A, { privacyUrl: "http://a.example" });
  assert.equal(badPrivacy.status, 400);

  await db.query(
    `INSERT INTO builds (id, app_id, version_code, version_name, theme, status) VALUES ('b_ob_run', $1, 1, '1.0.0', 'halo', 'running')`,
    [APP_A],
  );
  const busy = await call("PATCH", `/apps/${APP_A}`, CA_A, { name: "Pendant le build" });
  assert.equal(busy.status, 409);
  await db.query(`DELETE FROM builds WHERE id = 'b_ob_run'`);
});

test("logo : PNG accepté, SVG avec script refusé, taille dépassée refusée", async () => {
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("contenu")]);
  const ok = await call("POST", `/apps/${APP_A}/logo`, CA_A, { mime: "image/png", data: png.toString("base64") });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.body.logoKey, `db:app_logos/${APP_A}`);
  const stored = await db.one<{ mime: string }>(`SELECT mime FROM app_logos WHERE app_id = $1`, [APP_A]);
  assert.equal(stored?.mime, "image/png");
  const row = await db.one<{ logo_key: string }>(`SELECT logo_key FROM apps WHERE id = $1`, [APP_A]);
  assert.equal(row?.logo_key, `db:app_logos/${APP_A}`);

  const evil = Buffer.from('<svg><script>x()</script></svg>').toString("base64");
  const refused = await call("POST", `/apps/${APP_A}/logo`, CA_A, { mime: "image/svg+xml", data: evil });
  assert.equal(refused.status, 422);
  assert.ok(refused.body.error.details?.logo);

  const tooBig = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(1_048_569)]);
  const big = await call("POST", `/apps/${APP_A}/logo`, CA_A, { mime: "image/png", data: tooBig.toString("base64") });
  assert.equal(big.status, 422);

  const foreign = await call("POST", `/apps/${APP_B}/logo`, CA_A, { mime: "image/png", data: png.toString("base64") });
  assert.equal(foreign.status, 403);
});

/* ------------------------------------------------ avancement */

test("avancement : étape, guide, récapitulatif daté", async () => {
  const start = await call("GET", "/onboarding", NEW_ADMIN);
  assert.equal(start.status, 200);
  assert.equal(start.body.step, 0);
  assert.equal(start.body.completedAt, null);

  const step = await call("PATCH", "/onboarding", NEW_ADMIN, { step: 2 });
  assert.equal(step.status, 200);
  assert.equal(step.body.step, 2);

  const guide = await call("PATCH", "/onboarding", NEW_ADMIN, { guideStep: 3, guideDone: true });
  assert.equal(guide.body.guideStep, 3);
  const after = await call("GET", "/onboarding", NEW_ADMIN);
  assert.ok(after.body.guideDoneAt);
  assert.equal(after.body.communityId !== null, true);

  const reopened = await call("PATCH", "/onboarding", NEW_ADMIN, { guideDone: false });
  assert.equal((await call("GET", "/onboarding", NEW_ADMIN)).body.guideDoneAt, null);
  assert.equal(reopened.status, 200);

  const recap = await call("PATCH", "/onboarding", NEW_ADMIN, { step: 5 });
  assert.ok(recap.body.completedAt);

  const outOfRange = await call("PATCH", "/onboarding", NEW_ADMIN, { step: 9 });
  assert.equal(outOfRange.status, 400);
  const empty = await call("PATCH", "/onboarding", NEW_ADMIN, {});
  assert.equal(empty.status, 400);
});

/* ------------------------------------------------ WhatsApp sur la communauté (owner) */

test("PATCH communauté : champs WhatsApp validés, normalisés, effaçables", async () => {
  const set = await call("PATCH", `/communities/${COM_A}`, OWNER, {
    whatsappGroupUrl: "https://chat.whatsapp.com/XyZ12345abcd",
    contactWhatsapp: "+237 698 765 432",
  });
  assert.equal(set.status, 200, set.text);
  assert.equal(set.body.whatsappGroupUrl, "https://chat.whatsapp.com/XyZ12345abcd");
  assert.equal(set.body.contactWhatsapp, "698765432");

  const badUrl = await call("PATCH", `/communities/${COM_A}`, OWNER, { whatsappGroupUrl: "http://chat.whatsapp.com/abc" });
  assert.equal(badUrl.status, 400);
  const badNumber = await call("PATCH", `/communities/${COM_A}`, OWNER, { contactWhatsapp: "+33 6 12" });
  assert.equal(badNumber.status, 400);

  const cleared = await call("PATCH", `/communities/${COM_A}`, OWNER, { contactWhatsapp: null });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.contactWhatsapp, null);
  assert.equal(cleared.body.whatsappGroupUrl, "https://chat.whatsapp.com/XyZ12345abcd");
});

/* ------------------------------------------------ création d'admin (owner) */

test("POST /admins : mot de passe généré côté serveur, lien wa.me, email facultatif", async () => {
  const created = await call("POST", "/admins", OWNER, {
    name: "Staff WhatsApp",
    whatsappNumber: "+237 655 443 322",
    platformRole: "none",
  });
  assert.equal(created.status, 201, created.text);
  const { adminId, temporaryPassword, whatsappLink, email, mustChangePassword, whatsappNumber } = created.body;
  assert.equal(email, null);
  assert.equal(whatsappNumber, "655443322");
  assert.equal(mustChangePassword, true);
  assert.equal(temporaryPassword.length, 16);
  assert.match(whatsappLink, /^https:\/\/wa\.me\/237655443322\?text=/);
  assert.ok(String(whatsappLink).includes(encodeURIComponent(temporaryPassword)));

  const stored = await db.one<{ password_hash: string; must_change_password: boolean }>(
    `SELECT password_hash, must_change_password FROM admin_users WHERE id = $1`,
    [adminId],
  );
  assert.notEqual(stored?.password_hash, temporaryPassword);
  assert.equal(verifyPassword(temporaryPassword, stored?.password_hash ?? ""), true);
  assert.equal(stored?.must_change_password, true);

  const dup = await call("POST", "/admins", OWNER, { name: "Doublon", whatsappNumber: "655443322" });
  assert.equal(dup.status, 409);
  assert.match(dup.text, /WhatsApp/);
});

test("POST /admins : email ou numéro requis, mot de passe fourni refusé, owner seul", async () => {
  const neither = await call("POST", "/admins", OWNER, { name: "Sans contact" });
  assert.equal(neither.status, 400);

  const withPassword = await call("POST", "/admins", OWNER, {
    email: "pw@example.com",
    name: "Avec mot de passe",
    password: "mot-de-passe-impose-2026",
  });
  assert.equal(withPassword.status, 400);

  const notOwner = await call("POST", "/admins", CA_A, { name: "Pas owner", whatsappNumber: "699000111" });
  assert.equal(notOwner.status, 403);

  const withEmail = await call("POST", "/admins", OWNER, { email: "avec-email@example.com", name: "Avec email" });
  assert.equal(withEmail.status, 201);
  assert.equal(withEmail.body.whatsappLink, null);
});

test("une seule communauté et une seule application : contraintes de bout en bout", async () => {
  const communities = await db.scalar<number>(`SELECT count(*)::int FROM communities WHERE created_by = $1`, [NEW_ADMIN]);
  assert.equal(Number(communities), 1);
  const apps = await db.scalar<number>(
    `SELECT count(*)::int FROM apps WHERE community_id = (SELECT id FROM communities WHERE created_by = $1)`,
    [NEW_ADMIN],
  );
  assert.equal(Number(apps), 1);
});
