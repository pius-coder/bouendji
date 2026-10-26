/**
 * R5 — demandes de build, validation par l'owner, refus, garde de transition
 * du callback, contrat de marque (contact, groupe WhatsApp, logo).
 *
 * Vrais `buildApp`, vraie base PGlite, vrais jetons. GitHub est remplacé par un
 * `fetch` explicite, sans réseau : chaque test qui touche au dispatch dit ce
 * qu'il attend de GitHub. La migration 050 est appliquée par ce fichier (la
 * base de test est créée depuis `schema.ts`, sans l'exécuteur de migrations).
 *
 * Les variables d'environnement sont posées avant les imports dynamiques parce
 * que `config.ts` lit `process.env` à l'évaluation du module.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "memory://";
process.env.MASTER_KEY = Buffer.alloc(32, 11).toString("base64");
process.env.JWT_SECRET = "test-secret-r5-builds-test-secret";
process.env.PUBLIC_BASE_URL = "https://api.example.test";
process.env.BUILD_CALLBACK_SECRET = "test-callback-secret-r5";
process.env.MOCK_BUILDS = "true";

const { createDb } = await import("../src/db.js");
const { buildApp } = await import("../src/app.js");
const { env } = await import("../src/config.js");
const { issueAdminToken } = await import("../src/lib/auth.js");
const { buildBrandSpec, validateBrandSpec } = await import("../src/lib/brand.js");
const { ApiFailure } = await import("../src/lib/errors.js");
const migration = await import("../src/migrations/050_build_requests.js");

type Json = Record<string, any>;

const db = await createDb();
const app = await buildApp({ db });

after(async () => {
  await app.close();
  await db.close();
});

/* ------------------------------------------------------------------ graine */

const COM_A = "com_r5_a";
const COM_B = "com_r5_b";
const APP_A = "app_r5_a";
const APP_B = "app_r5_b";
const CB = "Bearer test-callback-secret-r5";

// La migration 050 est appliquée ici, comme le fera l'exécuteur. Deux passages :
// elle doit être idempotente.
await migration.up(db);
await migration.up(db);

// Colonnes ajoutées par R4 : absentes du schéma de base, présentes ici.
await db.query("ALTER TABLE communities ADD COLUMN IF NOT EXISTS whatsapp_group_url text");
await db.query("ALTER TABLE communities ADD COLUMN IF NOT EXISTS contact_whatsapp text");

await db.query("INSERT INTO communities (id, name, slug, commission_bps) VALUES ($1, $2, $3, $4)", [
  COM_A,
  "Communauté R5 A",
  "communaute-r5-a",
  2000,
]);
await db.query("INSERT INTO communities (id, name, slug, commission_bps) VALUES ($1, $2, $3, $4)", [
  COM_B,
  "Communauté R5 B",
  "communaute-r5-b",
  2000,
]);
await db.query(
  "UPDATE communities SET whatsapp_group_url = $2, contact_whatsapp = $3 WHERE id = $1",
  [COM_A, "https://chat.whatsapp.com/R5GROUP", "+237 6 50 00 00 00"],
);

await db.query(
  `INSERT INTO apps (id, community_id, slug, name, package_name, theme, accent, support_url, brand)
   VALUES ($1, $2, $3, $4, $5, 'halo', NULL, $6, $7::jsonb)`,
  [APP_A, COM_A, "app-r5-a", "Marque R5 A", "cm.r5a.vpn", "https://aide.r5a.example", JSON.stringify({ defaultLocale: "fr", offlineBundleSigningKeyB64: "" })],
);
await db.query(
  `INSERT INTO apps (id, community_id, slug, name, package_name, theme, accent, support_url, brand)
   VALUES ($1, $2, $3, $4, $5, 'mono', NULL, $6, '{}'::jsonb)`,
  [APP_B, COM_B, "app-r5-b", "Marque R5 B", "cm.r5b.vpn", "https://aide.r5b.example"],
);

const ADMINS: Array<[string, string, string]> = [
  ["adm_r5_owner", "r5-owner@example.com", "owner"],
  ["adm_r5_a", "r5-a@example.com", "none"],
  ["adm_r5_b", "r5-b@example.com", "none"],
  ["adm_r5_support", "r5-support@example.com", "none"],
];
for (const [id, email, platformRole] of ADMINS) {
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active)
     VALUES ($1, $2, 'scrypt$16384$8$1$x$y', $3, $4, $5, true)`,
    [id, email, id, platformRole === "owner" ? "platform" : "partner", platformRole],
  );
}
for (const [id, communityId, role] of [
  ["mem_r5_a", COM_A, "community_admin"],
  ["mem_r5_b", COM_B, "community_admin"],
  ["mem_r5_support", COM_A, "support"],
] as const) {
  await db.query(
    `INSERT INTO community_memberships (id, admin_user_id, community_id, role, status)
     VALUES ($1, $2, $3, $4, 'active')`,
    [id, id.replace("mem_r5_", "adm_r5_"), communityId, role],
  );
}

const tokens: Record<string, string> = {};
for (const [id, , platformRole] of ADMINS) {
  const { token } = await issueAdminToken({
    adminId: id,
    role: platformRole === "owner" ? "platform" : "partner",
    communityId: null,
  });
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

function callback(buildId: string, payload: unknown): Promise<Reply> {
  return api("POST", `/v1/internal/builds/${buildId}/callback`, {
    payload,
    headers: { authorization: CB },
  });
}

async function row(id: string): Promise<Json | null> {
  return db.one<Json>("SELECT * FROM builds WHERE id = $1", [id]);
}

async function insertBuild(id: string, status: string, versionCode: number): Promise<void> {
  await db.query(
    `INSERT INTO builds (id, app_id, version_code, version_name, theme, status, updated_at)
     VALUES ($1, $2, $3, '1.0.0', 'halo', $4, now())`,
    [id, APP_A, versionCode, status],
  );
}

interface GitHubCall {
  url: string;
  body: Json;
}

/**
 * Exécute `run` avec GitHub simulé : chaque appel de dispatch est noté et
 * reçoit `status`. Restaure `fetch` et la configuration, même en cas d'échec.
 */
async function withGitHub<T>(status: number, run: (calls: GitHubCall[]) => Promise<T>): Promise<T> {
  const realFetch = globalThis.fetch;
  const saved = { ...env.builds };
  const calls: GitHubCall[] = [];
  try {
    env.builds.mock = false;
    env.builds.githubToken = "gh-test-token";
    env.builds.repo = "bouendji/vpn-platform";
    env.builds.workflow = "android-brand.yml";
    env.builds.ref = "master";
    globalThis.fetch = (async (url: unknown, init: unknown) => {
      calls.push({ url: String(url), body: JSON.parse(String((init as { body?: string }).body)) as Json });
      return new Response(status === 204 ? null : "refus", { status });
    }) as typeof fetch;
    return await run(calls);
  } finally {
    globalThis.fetch = realFetch;
    Object.assign(env.builds, saved);
  }
}

/* -------------------------------------------------------------- migration */

test("migration 050 — statuts draft/requested/rejected, colonnes, contrainte de statut", async () => {
  // Une valeur hors liste est refusée par la base.
  await assert.rejects(
    db.query(
      `INSERT INTO builds (id, app_id, version_code, version_name, theme, status)
       VALUES ('bld_bogus', $1, 9001, '1.0.0', 'halo', 'inconnu')`,
      [APP_A],
    ),
  );
  // Le motif de refus est borné à 280 caractères.
  await assert.rejects(
    db.query(
      `INSERT INTO builds (id, app_id, version_code, version_name, theme, status, reject_reason)
       VALUES ('bld_long', $1, 9002, '1.0.0', 'halo', 'rejected', $2)`,
      [APP_A, "x".repeat(281)],
    ),
  );
  // Les trois statuts ajoutés sont acceptés, avec les nouvelles colonnes.
  for (const status of ["draft", "requested", "rejected"]) {
    await db.query(
      `INSERT INTO builds (id, app_id, version_code, version_name, theme, status, requested_by, approved_by, reject_reason)
       VALUES ($1, $2, $3, '1.0.0', 'halo', $4, 'adm_r5_a', 'adm_r5_owner', 'motif')`,
      [`bld_status_${status}`, APP_A, 9100 + status.length, status],
    );
  }
  const stored = await row("bld_status_rejected");
  assert.equal(stored?.reject_reason, "motif");
  assert.equal(stored?.requested_by, "adm_r5_a");
  assert.equal(stored?.approved_by, "adm_r5_owner");
});

/* ---------------------------------------------------------- demande de build */

test("demande — community_admin : requested, aucun appel GitHub, marque et contact transmis", async () => {
  await withGitHub(204, async (calls) => {
    const reply = await api("POST", `/v1/admin/apps/${APP_A}/build-requests`, {
      as: "adm_r5_a",
      payload: { versionName: "1.2.0" },
    });
    assert.equal(reply.status, 202, reply.text);
    assert.equal(reply.body.status, "requested");
    assert.equal(calls.length, 0, "une demande ne doit jamais appeler GitHub");

    const stored = await row(String(reply.body.buildId));
    assert.equal(stored?.status, "requested");
    assert.equal(stored?.requested_by, "adm_r5_a");
    assert.equal(stored?.version_name, "1.2.0");
    assert.equal(stored?.spec, null, "le manifeste est refait à l'approbation, pas à la demande");
    assert.equal(reply.text.includes("spec"), false);
  });
});

test("demande — permissions : autre communauté, support et anonyme refusés ; owner accepté", async () => {
  assert.equal((await api("POST", `/v1/admin/apps/${APP_A}/build-requests`, { as: "adm_r5_b" })).status, 403);
  assert.equal((await api("POST", `/v1/admin/apps/${APP_A}/build-requests`, { as: "adm_r5_support" })).status, 403);
  assert.equal((await api("POST", `/v1/admin/apps/${APP_A}/build-requests`)).status, 401);
  assert.equal((await api("POST", "/v1/admin/apps/app_inexistante/build-requests", { as: "adm_r5_owner" })).status, 404);
  assert.equal((await api("POST", `/v1/admin/apps/${APP_A}/build-requests`, { as: "adm_r5_owner" })).status, 202);
});

test("demande — une marque non constructible est un 422 nommé et n'écrit rien", async () => {
  await db.query("UPDATE apps SET support_url = NULL WHERE id = $1", [APP_B]);
  const before = Number(await db.scalar<number>("SELECT count(*)::int FROM builds WHERE app_id = $1", [APP_B]));
  const refused = await api("POST", `/v1/admin/apps/${APP_B}/build-requests`, { as: "adm_r5_b" });
  assert.equal(refused.status, 422, refused.text);
  assert.deepEqual(Object.keys((refused.body.error as Json).details as Json), ["supportUrl"]);
  const after = Number(await db.scalar<number>("SELECT count(*)::int FROM builds WHERE app_id = $1", [APP_B]));
  assert.equal(after, before);
  await db.query("UPDATE apps SET support_url = $2 WHERE id = $1", [APP_B, "https://aide.r5b.example"]);
});

test("déclenchement direct — réservé à l'owner, community_admin refusé", async () => {
  const refused = await api("POST", `/v1/admin/apps/${APP_A}/builds`, { as: "adm_r5_a" });
  assert.equal(refused.status, 403, refused.text);
  const accepted = await api("POST", `/v1/admin/apps/${APP_A}/builds`, { as: "adm_r5_owner" });
  assert.equal(accepted.status, 202, accepted.text);
  assert.equal(accepted.body.status, "queued");
});

/* ------------------------------------------------------ validation par l'owner */

test("approbation — owner seul : requested -> queued, dispatch une fois, version recalculée", async () => {
  const requested = await api("POST", `/v1/admin/apps/${APP_A}/build-requests`, {
    as: "adm_r5_a",
    payload: { versionName: "3.0.0" },
  });
  const buildId = String(requested.body.buildId);

  assert.equal((await api("POST", `/v1/admin/builds/${buildId}/approve`, { as: "adm_r5_a" })).status, 403);
  assert.equal((await api("POST", `/v1/admin/builds/${buildId}/approve`, { as: "adm_r5_support" })).status, 403);

  await withGitHub(204, async (calls) => {
    const approved = await api("POST", `/v1/admin/builds/${buildId}/approve`, { as: "adm_r5_owner" });
    assert.equal(approved.status, 202, approved.text);
    assert.equal(approved.body.status, "queued");

    assert.equal(calls.length, 1, "une seule approbation déclenche un seul workflow_dispatch");
    assert.equal(calls[0]?.url, "https://api.github.com/repos/bouendji/vpn-platform/actions/workflows/android-brand.yml/dispatches");
    assert.equal(calls[0]?.body.ref, "master");
    assert.equal(
      calls[0]?.body.inputs.build_callback_url,
      `https://api.example.test/v1/internal/builds/${buildId}/callback`,
    );
    const sent = JSON.parse(String(calls[0]?.body.inputs.spec)) as Json;
    assert.equal(sent.appId, APP_A);
    assert.equal(sent.versionName, "3.0.0");
    // Le lien du groupe et le contact de la communauté (colonnes R4) arrivent
    // jusqu'au manifeste ; le logo n'a pas de référence ici, donc null.
    assert.equal(sent.communityWhatsappUrl, "https://chat.whatsapp.com/R5GROUP");
    assert.equal(sent.contactWhatsapp, "+237650000000");
    assert.equal(sent.logoRef, null);

    const stored = await row(buildId);
    assert.equal(stored?.status, "queued");
    assert.equal(stored?.approved_by, "adm_r5_owner");
    assert.equal(stored?.version_code, sent.versionCode, "le numéro du manifeste est celui de la ligne");
    assert.ok(Number(stored?.version_code) >= 1);

    // Une seconde approbation ne redéclenche rien.
    const again = await api("POST", `/v1/admin/builds/${buildId}/approve`, { as: "adm_r5_owner" });
    assert.equal(again.status, 409, again.text);
    assert.equal(calls.length, 1);
  });
});

test("approbation — GitHub refuse : le build passe en failed et répond 502", async () => {
  const requested = await api("POST", `/v1/admin/apps/${APP_A}/build-requests`, { as: "adm_r5_a" });
  const buildId = String(requested.body.buildId);
  await withGitHub(500, async () => {
    const refused = await api("POST", `/v1/admin/builds/${buildId}/approve`, { as: "adm_r5_owner" });
    assert.equal(refused.status, 502, refused.text);
  });
  assert.equal((await row(buildId))?.status, "failed");
});

test("approbation — un build inconnu est 404, un build non demandé est 409", async () => {
  assert.equal((await api("POST", "/v1/admin/builds/bld_inconnu/approve", { as: "adm_r5_owner" })).status, 404);
  await insertBuild("bld_r5_queued", "queued", 9200);
  assert.equal((await api("POST", "/v1/admin/builds/bld_r5_queued/approve", { as: "adm_r5_owner" })).status, 409);
});

/* ------------------------------------------------------------------- refus */

test("refus — owner seul, motif obligatoire, requested -> rejected, jamais de dispatch", async () => {
  const requested = await api("POST", `/v1/admin/apps/${APP_A}/build-requests`, { as: "adm_r5_a" });
  const buildId = String(requested.body.buildId);

  await withGitHub(204, async (calls) => {
    assert.equal(
      (await api("POST", `/v1/admin/builds/${buildId}/reject`, { as: "adm_r5_a", payload: { reason: "non" } })).status,
      403,
    );

    const noReason = await api("POST", `/v1/admin/builds/${buildId}/reject`, { as: "adm_r5_owner", payload: {} });
    assert.equal(noReason.status, 400, noReason.text);
    assert.ok(((noReason.body.error as Json).details as Json).reason, "le champ reason doit être nommé");

    const blank = await api("POST", `/v1/admin/builds/${buildId}/reject`, {
      as: "adm_r5_owner",
      payload: { reason: "  " },
    });
    assert.equal(blank.status, 400, blank.text);

    const rejected = await api("POST", `/v1/admin/builds/${buildId}/reject`, {
      as: "adm_r5_owner",
      payload: { reason: "Nom de marque non autorisé" },
    });
    assert.equal(rejected.status, 200, rejected.text);
    assert.deepEqual(rejected.body, { buildId, status: "rejected" });
    assert.equal(calls.length, 0, "un refus ne déclenche rien");

    const stored = await row(buildId);
    assert.equal(stored?.status, "rejected");
    assert.equal(stored?.reject_reason, "Nom de marque non autorisé");
    assert.equal(stored?.approved_by, "adm_r5_owner");

    // Un build refusé ne peut plus être approuvé ni refusé à nouveau.
    assert.equal((await api("POST", `/v1/admin/builds/${buildId}/approve`, { as: "adm_r5_owner" })).status, 409);
    assert.equal(
      (await api("POST", `/v1/admin/builds/${buildId}/reject`, { as: "adm_r5_owner", payload: { reason: "encore" } })).status,
      409,
    );
  });

  // Le motif et l'état apparaissent dans la liste de la marque, sans spec.
  const list = await api("GET", `/v1/admin/apps/${APP_A}/builds`, { as: "adm_r5_a" });
  const item = (list.body.items as Json[]).find((entry) => entry.id === buildId);
  assert.equal(item?.status, "rejected");
  assert.equal(item?.rejectReason, "Nom de marque non autorisé");
  assert.equal("spec" in (item ?? {}), false);
});

/* ------------------------------------------------- garde de transition (CI) */

test("callback — un rapport tardif n'écrase jamais succeeded", async () => {
  await insertBuild("bld_r5_ok", "queued", 9300);

  assert.equal((await callback("bld_r5_ok", { status: "running", runId: "111" })).body.status, "running");

  const done = await callback("bld_r5_ok", {
    status: "succeeded",
    sha256: "b".repeat(64),
    apkUrl: "https://apps.example.test/brands/cm.r5a.vpn/app.apk",
    runId: "111",
  });
  assert.equal(done.status, 200, done.text);
  assert.equal(done.body.status, "succeeded");
  const finished = await row("bld_r5_ok");
  const completedAt = String(finished?.completed_at);
  assert.ok(completedAt);

  // Rapports en retard : 200, état inchangé, date de fin inchangée.
  for (const late of [
    { status: "running", runId: "111" },
    { status: "failed", runId: "111" },
    { status: "cancelled", runId: "111" },
  ]) {
    const reply = await callback("bld_r5_ok", late);
    assert.equal(reply.status, 200, reply.text);
    assert.equal(reply.body.status, "succeeded", `un ${late.status} tardif ne doit pas écraser succeeded`);
  }
  const kept = await row("bld_r5_ok");
  assert.equal(kept?.status, "succeeded");
  assert.equal(kept?.sha256, "b".repeat(64));
  assert.equal(String(kept?.completed_at), completedAt);
});

test("callback — l'échec est accepté depuis running, et reste collant", async () => {
  await insertBuild("bld_r5_ko", "queued", 9301);
  assert.equal((await callback("bld_r5_ko", { status: "running", runId: "222" })).body.status, "running");

  const failed = await callback("bld_r5_ko", { status: "failed", runId: "222" });
  assert.equal(failed.status, 200, failed.text);
  assert.equal(failed.body.status, "failed");
  const stored = await row("bld_r5_ko");
  assert.equal(stored?.status, "failed");
  assert.ok(stored?.completed_at, "un échec clôt le build");

  const late = await callback("bld_r5_ko", { status: "succeeded", sha256: "c".repeat(64), runId: "222" });
  assert.equal(late.body.status, "failed");
  assert.equal((await row("bld_r5_ko"))?.sha256, null, "un succès tardif n'écrit pas d'empreinte");
});

test("callback — un build demandé (requested) ou refusé n'est jamais touché par la CI", async () => {
  const requested = await api("POST", `/v1/admin/apps/${APP_A}/build-requests`, { as: "adm_r5_a" });
  const buildId = String(requested.body.buildId);
  const reply = await callback(buildId, {
    status: "succeeded",
    sha256: "d".repeat(64),
    apkUrl: "https://apps.example.test/x.apk",
  });
  assert.equal(reply.status, 200, reply.text);
  assert.equal(reply.body.status, "requested");
  const stored = await row(buildId);
  assert.equal(stored?.status, "requested");
  assert.equal(stored?.sha256, null);
  assert.equal(stored?.apk_url, null);
});

/* ----------------------------------------------------------- contrat de marque */

test("marque — contact, groupe WhatsApp et logo : validés et normalisés", () => {
  const base = {
    appName: "Marque R5",
    packageName: "cm.r5.vpn",
    theme: "halo",
    supportUrl: "https://aide.r5.example",
    versionName: "1.0.0",
    defaultLocale: "fr",
  };

  const complete = validateBrandSpec({
    ...base,
    communityWhatsappUrl: "https://chat.whatsapp.com/ABC",
    contactWhatsapp: "+237 6 50-00 00 00",
    logoRef: "brands/cm.r5.vpn/logo.png",
  });
  assert.equal(complete.communityWhatsappUrl, "https://chat.whatsapp.com/ABC");
  assert.equal(complete.contactWhatsapp, "+237650000000");
  assert.equal(complete.logoRef, "brands/cm.r5.vpn/logo.png");

  const absent = validateBrandSpec(base);
  assert.equal(absent.communityWhatsappUrl, null);
  assert.equal(absent.contactWhatsapp, null);
  assert.equal(absent.logoRef, null);

  const logoUrl = validateBrandSpec({ ...base, logoRef: "https://apps.example.test/logo.png" });
  assert.equal(logoUrl.logoRef, "https://apps.example.test/logo.png");

  const cases: Array<[Record<string, unknown>, string]> = [
    [{ communityWhatsappUrl: "http://chat.whatsapp.com/ABC" }, "communityWhatsappUrl"],
    [{ communityWhatsappUrl: "pas une url" }, "communityWhatsappUrl"],
    [{ contactWhatsapp: "abc" }, "contactWhatsapp"],
    [{ contactWhatsapp: "123" }, "contactWhatsapp"],
    [{ logoRef: "/abs/logo.png" }, "logoRef"],
    [{ logoRef: "brands/../secret.png" }, "logoRef"],
    [{ logoRef: "http://apps.example.test/logo.png" }, "logoRef"],
  ];
  for (const [extra, field] of cases) {
    let caught: unknown;
    try {
      validateBrandSpec({ ...base, ...extra });
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof ApiFailure, `422 attendu sur ${field}`);
    assert.deepEqual(Object.keys((caught as ApiFailure).details ?? {}), [field]);
  }
});

test("marque — buildBrandSpec prend le groupe et le contact dans la communauté, le logo dans l'app", () => {
  const spec = buildBrandSpec(
    {
      id: APP_A,
      name: "Marque R5",
      package_name: "cm.r5.vpn",
      theme: "halo",
      accent: null,
      support_url: "https://aide.r5.example",
      logo_key: "brands/cm.r5.vpn/logo.png",
      logo_url: "https://ancien.example/logo.png",
      brand: {},
    },
    4,
    "1.0.0",
    { whatsapp_group_url: "https://chat.whatsapp.com/XYZ", contact_whatsapp: "+237650000001" },
  );
  assert.equal(spec.communityWhatsappUrl, "https://chat.whatsapp.com/XYZ");
  assert.equal(spec.contactWhatsapp, "+237650000001");
  assert.equal(spec.logoRef, "brands/cm.r5.vpn/logo.png", "la clé R2 prime sur l'URL héritée");

  // Colonnes absentes (base non migrée par R4) : « non renseigné », pas une erreur.
  const bare = buildBrandSpec(
    { id: APP_A, name: "Marque nue", package_name: "cm.m.vpn", theme: "halo", accent: null, support_url: "https://a.example", brand: {} },
    1,
    "1.0.0",
  );
  assert.equal(bare.communityWhatsappUrl, null);
  assert.equal(bare.contactWhatsapp, null);
  assert.equal(bare.logoRef, null);
});
