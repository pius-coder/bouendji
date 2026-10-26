/**
 * D66 — manifeste de marque et builds.
 *
 * Deux contrats sont vérifiés ici, sans mock de la base : le validateur (chaque
 * règle d'`inject-brand.mjs` doit produire un 422 qui nomme le champ) et le
 * callback de la CI (secret vide → 503, mauvais secret → 401, bon secret → 200
 * et ligne mise à jour).
 *
 * `app.ts` n'est pas modifié (hors périmètre de cet agent) : `registerBuildRoutes`
 * est câblé ici, exactement comme le fera l'orchestrateur. Le mode build est
 * `mock` par défaut en test ; les deux tests de dispatch remplacent `fetch`
 * explicitement, sans réseau.
 *
 * Les variables d'environnement sont posées avant les imports dynamiques parce
 * que `config.ts` lit `process.env` à l'évaluation du module.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "memory://";
process.env.MASTER_KEY = Buffer.alloc(32, 11).toString("base64");
process.env.JWT_SECRET = "test-secret-builds-test-secret";
process.env.PUBLIC_BASE_URL = "https://api.example.test";
process.env.BUILD_CALLBACK_SECRET = "test-callback-secret";
process.env.MOCK_BUILDS = "true";

const { createDb } = await import("../src/db.js");
const { buildApp } = await import("../src/app.js");
const { buildBrandSpec, validateBrandSpec } = await import("../src/lib/brand.js");
const { openAdminSession } = await import("../src/lib/auth.js");
const { applyAdminMigrations } = await import("./adminMigrations.js");
const { ApiFailure } = await import("../src/lib/errors.js");
const { env } = await import("../src/config.js");

type Json = Record<string, any>;

const db = await createDb();
await applyAdminMigrations(db);
const app = await buildApp({ db });

after(async () => {
  await app.close();
  await db.close();
});

/* ------------------------------------------------------------------ graine */

const COM_A = "com_builds_a";
const COM_B = "com_builds_b";
const APP_A = "app_builds_a";
const APP_B = "app_builds_b";

await db.query("INSERT INTO communities (id, name, slug, commission_bps) VALUES ($1, $2, $3, $4)", [
  COM_A,
  "Communauté builds A",
  "communaute-builds-a",
  2000,
]);
await db.query("INSERT INTO communities (id, name, slug, commission_bps) VALUES ($1, $2, $3, $4)", [
  COM_B,
  "Communauté builds B",
  "communaute-builds-b",
  2000,
]);

const BRAND_A = {
  defaultLocale: "en",
  offlineBundleSigningKeyB64: "",
  // Champs que le serveur ne doit jamais relire : la colonne `apps` fait foi.
  appId: "app_from_body",
  apiBaseUrl: "https://evil.example",
};
await db.query(
  `INSERT INTO apps (id, community_id, slug, name, package_name, theme, accent, support_url, brand)
   VALUES ($1, $2, $3, $4, $5, 'halo', '#1a2b3c', $6, $7::jsonb)`,
  [APP_A, COM_A, "app-builds-a", "Marque A", "cm.marquea.vpn", "https://aide.marquea.example", JSON.stringify(BRAND_A)],
);
await db.query(
  `INSERT INTO apps (id, community_id, slug, name, package_name, theme, accent, support_url, brand)
   VALUES ($1, $2, $3, $4, $5, 'mono', NULL, $6, '{}'::jsonb)`,
  [APP_B, COM_B, "app-builds-b", "Marque B", "cm.marqueb.vpn", "https://aide.marqueb.example"],
);

const ADMINS: Array<[string, string, string]> = [
  ["adm_builds_owner", "builds-owner@example.com", "owner"],
  ["adm_builds_a", "builds-a@example.com", "none"],
  ["adm_builds_b", "builds-b@example.com", "none"],
  ["adm_builds_support", "builds-support@example.com", "none"],
  ["adm_builds_finance", "builds-finance@example.com", "none"],
];
for (const [id, email, platformRole] of ADMINS) {
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active, must_change_password)
     VALUES ($1, $2, 'scrypt$16384$8$1$x$y', $3, $4, $5, true, false)`,
    [id, email, id, platformRole === "owner" ? "platform" : "partner", platformRole],
  );
}
for (const [id, communityId, role] of [
  ["mem_builds_a", COM_A, "community_admin"],
  ["mem_builds_b", COM_B, "community_admin"],
  ["mem_builds_support", COM_A, "support"],
  ["mem_builds_finance", COM_A, "finance"],
] as const) {
  await db.query(
    `INSERT INTO community_memberships (id, admin_user_id, community_id, role, status)
     VALUES ($1, $2, $3, $4, 'active')`,
    [id, id.replace("mem_builds_", "adm_builds_"), communityId, role],
  );
}

const tokens: Record<string, string> = {};
for (const [id, , platformRole] of ADMINS) {
  const { token } = await openAdminSession(db, { adminId: id });
  tokens[id] = token;
}

/* ------------------------------------------------------------------ appels */

interface Reply {
  status: number;
  body: Json;
  text: string;
}

async function api(
  method: "GET" | "POST",
  url: string,
  options: { as?: string; payload?: unknown; headers?: Record<string, string> } = {},
): Promise<Reply> {
  const res = await app.inject({
    method,
    url,
    headers: {
      ...(options.as ? { authorization: `Bearer ${tokens[options.as]}` } : {}),
      ...(options.headers ?? {}),
    },
    ...(options.payload === undefined ? {} : { payload: options.payload as never }),
  });
  let body: Json = {};
  try {
    body = res.json() as Json;
  } catch {
    body = {};
  }
  return { status: res.statusCode, body, text: res.body };
}

/* --------------------------------------------------------- validateur (unitaire) */

/** Exécute `run` et vérifie un 422 `VALIDATION_FAILED` dont le seul champ est `field`. */
function expectFailure(run: () => unknown, field: string): InstanceType<typeof ApiFailure> {
  let caught: unknown;
  try {
    run();
  } catch (err) {
    caught = err;
  }
  assert.ok(caught instanceof ApiFailure, `ApiFailure attendu sur « ${field} », reçu ${String(caught)}`);
  const failure = caught as InstanceType<typeof ApiFailure>;
  assert.equal(failure.status, 422, `statut 422 attendu sur « ${field} »`);
  assert.equal(failure.code, "VALIDATION_FAILED");
  assert.deepEqual(Object.keys(failure.details ?? {}), [field], `le champ fautif doit être « ${field} »`);
  assert.ok((failure.details?.[field] ?? "").length > 0, "le détail doit nommer la règle");
  return failure;
}

function expectInvalid(input: unknown, field: string): void {
  expectFailure(() => validateBrandSpec(input), field);
}

const VALID = {
  appName: "Bouendji VPN",
  packageName: "cm.bouendji.client",
  theme: "halo",
  supportUrl: "https://support.example.com/aide",
  accent: "#1a2b3c",
  versionName: "1.4.2",
  versionCode: 42,
  defaultLocale: "fr",
  offlineBundleSigningKeyB64: "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE",
};

test("validateBrandSpec — un manifeste minimal prend les défauts de §3.5", () => {
  const spec = validateBrandSpec({
    appName: "  Ma marque  ",
    packageName: " com.example.app ",
    theme: "HALO",
    supportUrl: "mailto:aide@example.com",
  });

  assert.equal(spec.appName, "Ma marque");
  assert.equal(spec.packageName, "com.example.app");
  assert.equal(spec.theme, "halo");
  assert.equal(spec.supportUrl, "mailto:aide@example.com");
  assert.equal(spec.accent, null);
  assert.equal(spec.versionName, "1.0.0");
  assert.equal(spec.versionCode, 1);
  assert.equal(spec.defaultLocale, "fr");
  assert.equal(spec.offlineBundleSigningKeyB64, "");
  // Ni appId ni apiBaseUrl ne sortent du validateur : ils ne sont pas saisis.
  assert.equal("appId" in spec, false);
  assert.equal("apiBaseUrl" in spec, false);
});

test("validateBrandSpec — un manifeste complet est normalisé", () => {
  const spec = validateBrandSpec({
    ...VALID,
    theme: "Otaku",
    accent: "#abcdef",
    supportUrl: "tel:+237650000000",
    versionName: "2.0.0-beta.1",
    defaultLocale: "EN",
  });

  assert.equal(spec.theme, "otaku");
  assert.equal(spec.accent, "#ABCDEF");
  assert.equal(spec.supportUrl, "tel:+237650000000");
  assert.equal(spec.versionName, "2.0.0-beta.1");
  assert.equal(spec.defaultLocale, "en");
});

test("validateBrandSpec — appName : 2 à 40 caractères, pas de caractère de contrôle", () => {
  expectInvalid({ ...VALID, appName: "A" }, "appName");
  expectInvalid({ ...VALID, appName: "   " }, "appName");
  expectInvalid({ ...VALID, appName: "A".repeat(41) }, "appName");
  expectInvalid({ ...VALID, appName: "Ma\nmarque" }, "appName");
  expectInvalid({ ...VALID, appName: 42 }, "appName");
});

test("validateBrandSpec — packageName : segments, mots réservés, marque de référence", () => {
  expectInvalid({ ...VALID, packageName: "bouendji" }, "packageName");
  expectInvalid({ ...VALID, packageName: "cm..vpn" }, "packageName");
  expectInvalid({ ...VALID, packageName: "Cm.Exemple" }, "packageName");
  expectInvalid({ ...VALID, packageName: "cm.example.1vpn" }, "packageName");
  expectInvalid({ ...VALID, packageName: "cm.example.new" }, "packageName");
  expectInvalid({ ...VALID, packageName: "cm.bouendji.vpn" }, "packageName");
});

test("validateBrandSpec — theme : la liste fermée de D2", () => {
  expectInvalid({ ...VALID, theme: undefined }, "theme");
  expectInvalid({ ...VALID, theme: "neon" }, "theme");
  expectInvalid({ ...VALID, theme: ["halo"] }, "theme");
});

test("validateBrandSpec — supportUrl : requis, absolu, https/mailto/tel, jamais .invalid", () => {
  expectInvalid({ ...VALID, supportUrl: undefined }, "supportUrl");
  expectInvalid({ ...VALID, supportUrl: "" }, "supportUrl");
  expectInvalid({ ...VALID, supportUrl: "aide.example.com" }, "supportUrl");
  expectInvalid({ ...VALID, supportUrl: "http://aide.example.com" }, "supportUrl");
  expectInvalid({ ...VALID, supportUrl: "javascript:alert(1)" }, "supportUrl");
  expectInvalid({ ...VALID, supportUrl: "https://aide.invalid" }, "supportUrl");
  expectInvalid({ ...VALID, supportUrl: "mailto:aide@example.invalid" }, "supportUrl");
  // Une adresse relative à la racine n'est pas une URL absolue.
  expectInvalid({ ...VALID, supportUrl: "/aide" }, "supportUrl");
});

test("validateBrandSpec — accent : #RRGGBB ou null", () => {
  expectInvalid({ ...VALID, accent: "1a2b3c" }, "accent");
  expectInvalid({ ...VALID, accent: "#1a2b3" }, "accent");
  expectInvalid({ ...VALID, accent: "#GGGGGG" }, "accent");
  expectInvalid({ ...VALID, accent: 12 }, "accent");
  assert.equal(validateBrandSpec({ ...VALID, accent: null }).accent, null);
  assert.equal(validateBrandSpec({ ...VALID, accent: undefined }).accent, null);
});

test("validateBrandSpec — versionName : ^\\d+(\\.\\d+){0,3}([-+][0-9A-Za-z.-]+)?$", () => {
  expectInvalid({ ...VALID, versionName: "v1.0.0" }, "versionName");
  expectInvalid({ ...VALID, versionName: "1.0.0.0.0" }, "versionName");
  expectInvalid({ ...VALID, versionName: "1.0.0 1.0.0" }, "versionName");
  expectInvalid({ ...VALID, versionName: 3 }, "versionName");
  assert.equal(validateBrandSpec({ ...VALID, versionName: "1" }).versionName, "1");
  assert.equal(validateBrandSpec({ ...VALID, versionName: "1.2.3.4+build.7" }).versionName, "1.2.3.4+build.7");
});

test("validateBrandSpec — versionCode : entier 1..2 100 000 000", () => {
  expectInvalid({ ...VALID, versionCode: 0 }, "versionCode");
  expectInvalid({ ...VALID, versionCode: -1 }, "versionCode");
  expectInvalid({ ...VALID, versionCode: 1.5 }, "versionCode");
  expectInvalid({ ...VALID, versionCode: 2_100_000_001 }, "versionCode");
  expectInvalid({ ...VALID, versionCode: "42" }, "versionCode");
  assert.equal(validateBrandSpec({ ...VALID, versionCode: 2_100_000_000 }).versionCode, 2_100_000_000);
});

test("validateBrandSpec — defaultLocale : deux lettres minuscules", () => {
  expectInvalid({ ...VALID, defaultLocale: "fra" }, "defaultLocale");
  expectInvalid({ ...VALID, defaultLocale: "fr-FR" }, "defaultLocale");
  expectInvalid({ ...VALID, defaultLocale: "f" }, "defaultLocale");
  assert.equal(validateBrandSpec({ ...VALID, defaultLocale: "FR" }).defaultLocale, "fr");
});

test("validateBrandSpec — offlineBundleSigningKeyB64 : base64 ou \"\"", () => {
  expectInvalid({ ...VALID, offlineBundleSigningKeyB64: "pas du base64 !" }, "offlineBundleSigningKeyB64");
  expectInvalid({ ...VALID, offlineBundleSigningKeyB64: "abc===" }, "offlineBundleSigningKeyB64");
  expectInvalid({ ...VALID, offlineBundleSigningKeyB64: 7 }, "offlineBundleSigningKeyB64");
  assert.equal(validateBrandSpec({ ...VALID, offlineBundleSigningKeyB64: "" }).offlineBundleSigningKeyB64, "");
  assert.equal(validateBrandSpec({ ...VALID, offlineBundleSigningKeyB64: undefined }).offlineBundleSigningKeyB64, "");
});

test("validateBrandSpec — un corps qui n'est pas un objet est refusé", () => {
  expectInvalid(null, "_");
  expectInvalid([], "_");
  expectInvalid("manifeste", "_");
});

/* ------------------------------------------------------ manifeste (unitaire) */

test("buildBrandSpec — appId et apiBaseUrl viennent du serveur, pas de la ligne brand", () => {
  const spec = buildBrandSpec(
    {
      id: APP_A,
      name: "Marque A",
      package_name: "cm.marquea.vpn",
      theme: "halo",
      accent: "#1a2b3c",
      support_url: "https://aide.marquea.example",
      brand: { ...BRAND_A, defaultLocale: "en" },
    },
    7,
    "3.2.1",
  );

  assert.equal(spec.appId, APP_A);
  assert.equal(spec.apiBaseUrl, "https://api.example.test");
  assert.equal(spec.appName, "Marque A");
  assert.equal(spec.packageName, "cm.marquea.vpn");
  assert.equal(spec.accent, "#1A2B3C");
  assert.equal(spec.defaultLocale, "en");
  assert.equal(spec.versionCode, 7);
  assert.equal(spec.versionName, "3.2.1");
});

test("buildBrandSpec — une ligne héritée sans supportUrl est un 422, pas un build à 78", () => {
  expectFailure(
    () =>
      buildBrandSpec(
        {
          id: "app_legacy",
          name: "Vieille marque",
          package_name: "cm.legacy.vpn",
          theme: "mono",
          support_url: null,
          accent: null,
          brand: {},
        },
        1,
        "1.0.0",
      ),
    "supportUrl",
  );
});

test("buildBrandSpec — apps.brand relu même s'il arrive sous forme de chaîne", () => {
  const spec = buildBrandSpec(
    {
      id: APP_A,
      name: "Marque A",
      package_name: "cm.marquea.vpn",
      theme: "halo",
      accent: null,
      support_url: "https://aide.marquea.example",
      brand: JSON.stringify({ defaultLocale: "en", offlineBundleSigningKeyB64: "" }),
    },
    2,
    "1.1.0",
  );
  assert.equal(spec.defaultLocale, "en");
});

/* ------------------------------------------------------------ routes builds */

test("POST builds — 202, versionCode par marque, corps appId/apiBaseUrl ignoré", async () => {
  const first = await api("POST", `/v1/admin/apps/${APP_A}/builds`, {
    as: "adm_builds_a",
    payload: {
      versionName: "2.0.0",
      // Ces trois champs ne doivent jamais être lus :
      appId: APP_B,
      apiBaseUrl: "https://evil.example",
      theme: "mono",
      versionCode: 999,
    },
  });
  assert.equal(first.status, 202, first.text);
  assert.equal(first.body.status, "queued");
  const buildId = String(first.body.buildId);
  assert.ok(buildId.length > 0);
  // Aucun manifeste dans la réponse.
  assert.equal(first.text.includes("spec"), false);
  assert.equal(first.text.includes("apiBaseUrl"), false);

  const row = await db.one<Json>("SELECT * FROM builds WHERE id = $1", [buildId]);
  assert.ok(row);
  assert.equal(row?.status, "queued");
  assert.equal(row?.version_code, 1);
  assert.equal(row?.version_name, "2.0.0");
  assert.equal(row?.requested_by, "adm_builds_a");
  const spec = row?.spec as Json;
  assert.equal(spec.appId, APP_A);
  assert.equal(spec.apiBaseUrl, "https://api.example.test");
  assert.equal(spec.appName, "Marque A");
  assert.equal(spec.packageName, "cm.marquea.vpn");
  assert.equal(spec.theme, "halo");
  assert.equal(spec.versionCode, 1);
  assert.equal(spec.versionName, "2.0.0");
  assert.equal(spec.defaultLocale, "en");
  assert.equal(spec.offlineBundleSigningKeyB64, "");

  // Le propriétaire peut construire ; le numéro suit celui de la marque.
  const second = await api("POST", `/v1/admin/apps/${APP_A}/builds`, { as: "adm_builds_owner", payload: {} });
  assert.equal(second.status, 202, second.text);
  const secondRow = await db.one<Json>("SELECT version_code, version_name FROM builds WHERE id = $1", [
    String(second.body.buildId),
  ]);
  assert.equal(secondRow?.version_code, 2);
  assert.equal(secondRow?.version_name, "1.0.0");

  // Une autre marque part de son propre compteur, pas du maximum global.
  const other = await api("POST", `/v1/admin/apps/${APP_B}/builds`, { as: "adm_builds_b" });
  assert.equal(other.status, 202, other.text);
  const otherRow = await db.one<Json>("SELECT version_code FROM builds WHERE id = $1", [String(other.body.buildId)]);
  assert.equal(otherRow?.version_code, 1);
});

test("POST builds — le rôle est relu en base, pas dans le jeton", async () => {
  const foreign = await api("POST", `/v1/admin/apps/${APP_A}/builds`, { as: "adm_builds_b" });
  assert.equal(foreign.status, 403, foreign.text);

  const support = await api("POST", `/v1/admin/apps/${APP_A}/builds`, { as: "adm_builds_support" });
  assert.equal(support.status, 403, support.text);

  const finance = await api("POST", `/v1/admin/apps/${APP_A}/builds`, { as: "adm_builds_finance" });
  assert.equal(finance.status, 403, finance.text);

  const anonymous = await api("POST", `/v1/admin/apps/${APP_A}/builds`);
  assert.equal(anonymous.status, 401, anonymous.text);

  const unknownApp = await api("POST", "/v1/admin/apps/app_inexistante/builds", { as: "adm_builds_owner" });
  assert.equal(unknownApp.status, 404, unknownApp.text);
});

test("POST builds — une marque non constructible est un 422 nommé et n'écrit rien", async () => {
  await db.query("UPDATE apps SET support_url = NULL WHERE id = $1", [APP_B]);
  const before = Number(await db.scalar<number>("SELECT count(*)::int FROM builds WHERE app_id = $1", [APP_B]));

  const refused = await api("POST", `/v1/admin/apps/${APP_B}/builds`, { as: "adm_builds_b" });
  assert.equal(refused.status, 422, refused.text);
  assert.deepEqual(Object.keys((refused.body.error as Json).details as Json), ["supportUrl"]);

  const after = Number(await db.scalar<number>("SELECT count(*)::int FROM builds WHERE app_id = $1", [APP_B]));
  assert.equal(after, before, "aucune ligne builds ne doit exister après un 422");

  // Une version fournie mais invalide est aussi un 422 nommé, pas un retour
  // silencieux à 1.0.0.
  const badVersion = await api("POST", `/v1/admin/apps/${APP_A}/builds`, {
    as: "adm_builds_a",
    payload: { versionName: "v1" },
  });
  assert.equal(badVersion.status, 422, badVersion.text);
  assert.deepEqual(Object.keys((badVersion.body.error as Json).details as Json), ["versionName"]);

  await db.query("UPDATE apps SET support_url = $2 WHERE id = $1", [
    APP_B,
    "https://aide.marqueb.example",
  ]);
});

test("GET builds — liste de la marque, jamais de spec", async () => {
  const list = await api("GET", `/v1/admin/apps/${APP_A}/builds`, { as: "adm_builds_a" });
  assert.equal(list.status, 200, list.text);
  const items = list.body.items as Json[];
  assert.ok(items.length >= 2);
  const codes = items.map((item) => Number(item.versionCode));
  assert.ok(codes.includes(1) && codes.includes(2));

  for (const item of items) {
    assert.equal("spec" in item, false);
    assert.deepEqual(Object.keys(item).sort(), [
      "apkUrl",
      "createdAt",
      "id",
      "sha256",
      "status",
      "updatedAt",
      "versionCode",
      "versionName",
    ]);
  }
  assert.equal(list.text.includes("apiBaseUrl"), false);
  assert.equal(list.text.includes("offlineBundleSigningKeyB64"), false);
  // Ordre : le plus récent d'abord.
  const dates = items.map((item) => Date.parse(String(item.createdAt)));
  assert.deepEqual(dates, [...dates].sort((a, b) => b - a));

  const foreign = await api("GET", `/v1/admin/apps/${APP_A}/builds`, { as: "adm_builds_b" });
  assert.equal(foreign.status, 403, foreign.text);
  const support = await api("GET", `/v1/admin/apps/${APP_A}/builds`, { as: "adm_builds_support" });
  assert.equal(support.status, 403, support.text);
});

test("POST builds — dispatch GitHub : 204 attendu, refus = 502 + build failed", async () => {
  const realFetch = globalThis.fetch;
  const saved = { ...env.builds };
  try {
    env.builds.mock = false;
    env.builds.githubToken = "gh-test-token";
    env.builds.repo = "bouendji/vpn-platform";
    env.builds.workflow = "android-brand.yml";
    env.builds.ref = "main";

    let capturedUrl = "";
    let capturedBody: Json = {};
    globalThis.fetch = (async (url: unknown, init: unknown) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(String((init as { body?: string }).body)) as Json;
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    const ok = await api("POST", `/v1/admin/apps/${APP_A}/builds`, { as: "adm_builds_a" });
    assert.equal(ok.status, 202, ok.text);
    assert.equal(
      capturedUrl,
      "https://api.github.com/repos/bouendji/vpn-platform/actions/workflows/android-brand.yml/dispatches",
    );
    assert.equal(capturedBody.ref, "main");
    const sent = JSON.parse(String((capturedBody.inputs as Json).spec)) as Json;
    assert.equal(sent.appId, APP_A);
    assert.equal(sent.apiBaseUrl, "https://api.example.test");
    assert.equal(
      (capturedBody.inputs as Json).build_callback_url,
      `https://api.example.test/v1/internal/builds/${String(ok.body.buildId)}/callback`,
    );

    // GitHub refuse : le build ne reste pas « queued » pour toujours.
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
    const refused = await api("POST", `/v1/admin/apps/${APP_A}/builds`, { as: "adm_builds_a" });
    assert.equal(refused.status, 502, refused.text);
    const failed = Number(
      await db.scalar<number>("SELECT count(*)::int FROM builds WHERE app_id = $1 AND status = 'failed'", [APP_A]),
    );
    assert.equal(failed, 1, "le build refusé doit être marqué failed");
  } finally {
    globalThis.fetch = realFetch;
    Object.assign(env.builds, saved);
  }
});

/* ------------------------------------------------------------------ callback */

async function buildRow(id: string): Promise<Json | null> {
  return db.one<Json>("SELECT * FROM builds WHERE id = $1", [id]);
}

test("callback — secret vide = 503, mauvais secret = 401, bon secret = 200 idempotent", async () => {
  const buildId = "bld_callback";
  await db.query(
    `INSERT INTO builds (id, app_id, version_code, version_name, theme, status)
     VALUES ($1, $2, 50, '1.0.0', 'halo', 'queued')`,
    [buildId, APP_A],
  );
  const url = `/v1/internal/builds/${buildId}/callback`;
  const payload = {
    status: "succeeded",
    sha256: "A".repeat(64),
    apkUrl: "https://blob.example/app-release.apk",
    versionCode: 51,
    runId: "1234567890",
  };

  const savedSecret = env.builds.callbackSecret;
  try {
    // 1. Secret non configuré : le callback est fermé, même avec un jeton.
    env.builds.callbackSecret = "";
    const off = await api("POST", url, { payload, headers: { authorization: "Bearer test-callback-secret" } });
    assert.equal(off.status, 503, off.text);

    // 2. Secret configuré, mauvais jeton (ou absent) : 401.
    env.builds.callbackSecret = "test-callback-secret";
    const wrong = await api("POST", url, { payload, headers: { authorization: "Bearer mauvais-secret" } });
    assert.equal(wrong.status, 401, wrong.text);
    const missing = await api("POST", url, { payload });
    assert.equal(missing.status, 401, missing.text);
    // Le corps n'est pas lu avant l'authentification : un build inconnu reste 401.
    const unknownUnauth = await api("POST", "/v1/internal/builds/inconnu/callback", { payload });
    assert.equal(unknownUnauth.status, 401, unknownUnauth.text);

    // 3. Bon secret mais corps invalide : 400 nommé.
    const invalid = await api("POST", url, {
      payload: { status: "pwned" },
      headers: { authorization: "Bearer test-callback-secret" },
    });
    assert.equal(invalid.status, 400, invalid.text);
    assert.equal(((invalid.body.error as Json).details as Json).status !== undefined, true);

    // 4. Bon secret, build inconnu : 404.
    const unknown = await api("POST", "/v1/internal/builds/inconnu/callback", {
      payload,
      headers: { authorization: "Bearer test-callback-secret" },
    });
    assert.equal(unknown.status, 404, unknown.text);

    // 5. Bon secret, corps valide : 200 et ligne mise à jour.
    const ok = await api("POST", url, { payload, headers: { authorization: "Bearer test-callback-secret" } });
    assert.equal(ok.status, 200, ok.text);
    assert.deepEqual(ok.body, { buildId, status: "succeeded" });
    assert.equal(ok.text.includes("spec"), false);

    const row = await buildRow(buildId);
    assert.equal(row?.status, "succeeded");
    assert.equal(row?.sha256, "a".repeat(64));
    assert.equal(row?.apk_url, "https://blob.example/app-release.apk");
    assert.equal(row?.version_code, 51);
    assert.equal(row?.run_id, "1234567890");
    assert.ok(row?.completed_at);
    assert.ok(row?.updated_at);

    // 6. Rejeu du même corps : 200, rien ne change.
    const replay = await api("POST", url, { payload, headers: { authorization: "Bearer test-callback-secret" } });
    assert.equal(replay.status, 200, replay.text);
    const replayed = await buildRow(buildId);
    assert.equal(replayed?.status, "succeeded");
    assert.equal(replayed?.sha256, "a".repeat(64));

    // 7. Un callback qui ne porte que le statut ne perd pas les champs déjà reçus.
    const partial = await api("POST", url, {
      payload: { status: "succeeded" },
      headers: { authorization: "Bearer test-callback-secret" },
    });
    assert.equal(partial.status, 200, partial.text);
    const kept = await buildRow(buildId);
    assert.equal(kept?.status, "succeeded");
    assert.equal(kept?.sha256, "a".repeat(64));
    assert.equal(kept?.apk_url, "https://blob.example/app-release.apk");
    assert.equal(kept?.version_code, 51);
    assert.equal(kept?.run_id, "1234567890");
  } finally {
    env.builds.callbackSecret = savedSecret;
  }
});
