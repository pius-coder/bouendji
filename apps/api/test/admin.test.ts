/**
 * Contrat d'administration.
 *
 * Rien n'est mocké : vrai `buildApp`, vraie base PGlite, vrais jetons signés par
 * `issueAdminToken`. `app.ts` n'est pas modifié (hors périmètre de cet agent) :
 * le câblage est fait ici, comme le fera l'orchestrateur.
 *
 * Les variables d'environnement sont posées avant les imports dynamiques parce
 * que `config.ts` lit `process.env` à l'évaluation du module.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "memory://";
process.env.MASTER_KEY = Buffer.alloc(32, 11).toString("base64");
process.env.JWT_SECRET = "test-secret-admin-test-secret";
// Le fichier hors-ligne exige une clé de signature : sans elle, la route
// refuserait d'émettre (409), et le test de permission ne testerait plus rien.
{
  const { generateKeyPairSync } = await import("node:crypto");
  const ed = generateKeyPairSync("ed25519");
  process.env.OFFLINE_BUNDLE_SIGNING_KEY = ed.privateKey
    .export({ format: "der", type: "pkcs8" })
    .toString("base64");
}

const { createDb } = await import("../src/db.js");
const { buildApp } = await import("../src/app.js");
const { issueAdminToken } = await import("../src/lib/auth.js");
const { encryptSecret } = await import("../src/lib/crypto.js");

const db = await createDb();
// app.ts est maintenant câblé par l'orchestrateur (registerAdminRoutes y figure) :
// le test passe par la vraie application, sans greffe locale.
const app = await buildApp({ db });

after(async () => {
  await app.close();
  await db.close();
});

/* ------------------------------------------------------------------ graine */

const COM_A = "com_a";
const COM_B = "com_b";

const OWNER = "adm_owner";
const ADMIN_A = "adm_a";
const SUPPORT_A = "adm_support";
const FINANCE_A = "adm_finance";
const ADMIN_B = "adm_b";
const TARGET = "adm_target";
const AUDIT_TARGET = "adm_audit";
const BODY_TARGET = "adm_body";
const NEWCOM_ADMIN = "adm_newcom";

await db.query("INSERT INTO communities (id, name, slug, commission_bps) VALUES ($1, $2, $3, $4)", [
  COM_A,
  "Communauté A",
  "communaute-a",
  2000,
]);
await db.query("INSERT INTO communities (id, name, slug, commission_bps) VALUES ($1, $2, $3, $4)", [
  COM_B,
  "Communauté B",
  "communaute-b",
  1500,
]);

for (const [id, email, platformRole, legacyRole] of [
  [OWNER, "owner@example.com", "owner", "platform"],
  [ADMIN_A, "admin-a@example.com", "none", "partner"],
  [SUPPORT_A, "support-a@example.com", "none", "partner"],
  [FINANCE_A, "finance-a@example.com", "none", "partner"],
  [ADMIN_B, "admin-b@example.com", "none", "partner"],
  [TARGET, "target@example.com", "none", "partner"],
  [AUDIT_TARGET, "audit-target@example.com", "none", "partner"],
  [BODY_TARGET, "body-target@example.com", "none", "partner"],
  [NEWCOM_ADMIN, "newcom-admin@example.com", "none", "partner"],
] as const) {
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active)
     VALUES ($1, $2, 'scrypt$16384$8$1$x$y', $3, $4, $5, true)`,
    [id, email, id.replace("adm_", "Compte "), legacyRole, platformRole],
  );
}

await db.query(
  `INSERT INTO community_memberships (id, admin_user_id, community_id, role, status)
   VALUES ('mem_a_admin', $1, $2, 'community_admin', 'active')`,
  [ADMIN_A, COM_A],
);
await db.query(
  `INSERT INTO community_memberships (id, admin_user_id, community_id, role, status)
   VALUES ('mem_a_support', $1, $2, 'support', 'active')`,
  [SUPPORT_A, COM_A],
);
await db.query(
  `INSERT INTO community_memberships (id, admin_user_id, community_id, role, status)
   VALUES ('mem_a_finance', $1, $2, 'finance', 'active')`,
  [FINANCE_A, COM_A],
);
await db.query(
  `INSERT INTO community_memberships (id, admin_user_id, community_id, role, status)
   VALUES ('mem_b_admin', $1, $2, 'community_admin', 'active')`,
  [ADMIN_B, COM_B],
);

await db.query("INSERT INTO apps (id, community_id, slug, name, package_name) VALUES ($1, $2, $3, $4, $5)", [
  "app_a",
  COM_A,
  "app-a",
  "App A",
  "com.example.a",
]);
await db.query("INSERT INTO apps (id, community_id, slug, name, package_name) VALUES ($1, $2, $3, $4, $5)", [
  "app_b",
  COM_B,
  "app-b",
  "App B",
  "com.example.b",
]);

await db.query(
  `INSERT INTO users (id, app_id, community_id, email, password_hash, name, email_verified_at)
   VALUES ('usr_a', 'app_a', $1, 'client-a@example.com', 'scrypt$16384$8$1$x$y', 'Client A', now())`,
  [COM_A],
);
await db.query(
  `INSERT INTO users (id, app_id, community_id, email, password_hash, name, email_verified_at)
   VALUES ('usr_b', 'app_b', $1, 'client-b@example.com', 'scrypt$16384$8$1$x$y', 'Client B', now())`,
  [COM_B],
);

// Clés réelles : le fichier hors-ligne scelle pour la clé ACORD de l'appareil,
// une chaîne bidon ferait échouer le chiffrement (et masquerait le vrai chemin).
const { generateKeyPairSync } = await import("node:crypto");
const ecKeys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const EC_SPKI = ecKeys.publicKey.export({ format: "der", type: "spki" }).toString("base64");

for (const [device, user, install] of [
  ["dev_a1", "usr_a", "install-a1"],
  ["dev_a2", "usr_a", "install-a2"],
  ["dev_b1", "usr_b", "install-b1"],
] as const) {
  await db.query(
    `INSERT INTO devices (id, user_id, installation_id, name, signing_key, agreement_key,
                          device_token_hash, status)
     VALUES ($1, $2, $3, $4, $5, $5, $6, 'active')`,
    [device, user, install, `Téléphone ${device}`, EC_SPKI, `token-hash-${device}`],
  );
}

await db.query(
  `INSERT INTO auth_sessions (id, user_id, device_id, refresh_hash, expires_at)
   VALUES ('ses_a1', 'usr_a', 'dev_a1', 'refresh-a1', now() + interval '1 day')`,
);

await db.query(
  `INSERT INTO plans (id, app_id, code, name, description, price_xaf, duration_days, device_limit)
   VALUES ('plan_a', 'app_a', 'mensuel', 'Mensuel', '', 2000, 30, 1)`,
);
await db.query(
  `INSERT INTO plans (id, app_id, code, name, description, price_xaf, duration_days, device_limit)
   VALUES ('plan_b', 'app_b', 'mensuel', 'Mensuel', '', 1500, 30, 1)`,
);

await db.query(
  `INSERT INTO orders (id, user_id, app_id, plan_id, community_id, amount_xaf, status, provider,
                       commission_bps, commission_xaf, paid_at, activated_at)
   VALUES ('ord_a1', 'usr_a', 'app_a', 'plan_a', $1, 2000, 'paid', 'mock', 2000, 400, now(), now())`,
  [COM_A],
);
await db.query(
  `INSERT INTO orders (id, user_id, app_id, plan_id, community_id, amount_xaf, status, provider,
                       commission_bps, commission_xaf, paid_at, activated_at)
   VALUES ('ord_a2', 'usr_a', 'app_a', 'plan_a', $1, 1000, 'paid', 'mock', 2000, 200, now(), now())`,
  [COM_A],
);
await db.query(
  `INSERT INTO orders (id, user_id, app_id, plan_id, community_id, amount_xaf, status, provider,
                       commission_bps, commission_xaf, paid_at, activated_at)
   VALUES ('ord_b1', 'usr_b', 'app_b', 'plan_b', $1, 1500, 'pending', 'mock', 1500, 225, null, null)`,
  [COM_B],
);

await db.query(
  `INSERT INTO commissions (id, community_id, order_id, bps, amount_xaf, status, available_at)
   VALUES ('cm_a1', $1, 'ord_a1', 2000, 400, 'available', now() - interval '1 hour')`,
  [COM_A],
);
await db.query(
  `INSERT INTO commissions (id, community_id, order_id, bps, amount_xaf, status, available_at)
   VALUES ('cm_a2', $1, 'ord_a2', 2000, 200, 'available', now() - interval '1 hour')`,
  [COM_A],
);

const POOL_WS_PATH = "/ws/secret-path-abc123";
const POOL_CREDENTIAL = encryptSecret("11111111-2222-3333-4444-555555555555");
const POOL_DEPLOYMENT_KEY = "deploy-key-1";
await db.query(
  `INSERT INTO endpoints (id, deployment_key, label, host, port, sni, ws_path, credential,
                          identity_mode, region, capacity, status, health, expires_at)
   VALUES ('ep_a', $1, 'Nœud 1', 'node1.example.net', 443, 'node1.example.net', $2, $3,
           'shared', 'eu', 80, 'active', 'healthy', now() + interval '1 hour')`,
  [POOL_DEPLOYMENT_KEY, POOL_WS_PATH, POOL_CREDENTIAL],
);

/* ------------------------------------------------------------------ jetons */

async function tokenFor(adminId: string): Promise<string> {
  // Le jeton ne porte que l'identité (`sub` + `typ`). Le claim `role` hérité est
  // conservé pour ne pas changer le format, mais `requireAdmin` ne le lit pas :
  // les rôles viennent de la base.
  const legacyRole = adminId === OWNER ? "platform" : "partner";
  const { token } = await issueAdminToken({ adminId, role: legacyRole, communityId: null });
  return token;
}

const tokens: Record<string, string> = {};
for (const id of [OWNER, ADMIN_A, SUPPORT_A, FINANCE_A, ADMIN_B, TARGET, AUDIT_TARGET, BODY_TARGET]) {
  tokens[id] = await tokenFor(id);
}

async function call(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  as: string | null,
  payload?: unknown,
) {
  const res = await app.inject({
    method,
    url: `/v1/admin${url}`,
    headers: as ? { authorization: `Bearer ${tokens[as]}` } : {},
    ...(payload === undefined ? {} : { payload: payload as never }),
  });
  const text = res.body;
  let json: Record<string, never> = {} as Record<string, never>;
  try {
    json = res.json() as Record<string, never>;
  } catch {
    json = {} as Record<string, never>;
  }
  return { status: res.statusCode, body: json, text };
}

async function auditTotal(): Promise<number> {
  return Number(await db.scalar<number>("SELECT count(*)::int FROM audit_log"));
}

async function auditRows(action: string): Promise<number> {
  return Number(await db.scalar<number>("SELECT count(*)::int FROM audit_log WHERE action = $1", [action]));
}

/* ------------------------------------------------------------------- tests */

test("le jeton ne porte pas les droits : ils sont relus en base", async () => {
  const me = await call("GET", "/me", OWNER);
  assert.equal(me.status, 200);
  assert.equal((me.body as { platformRole: string }).platformRole, "owner");

  const staff = await call("GET", "/me", ADMIN_A);
  assert.equal(staff.status, 200);
  const staffBody = staff.body as { platformRole: string; memberships: Array<{ communityId: string; role: string }> };
  assert.equal(staffBody.platformRole, "none");
  assert.deepEqual(staffBody.memberships, [{ communityId: COM_A, role: "community_admin" }]);

  const anonymous = await call("GET", "/me", null);
  assert.equal(anonymous.status, 401);
});

test("cross-community : 403, jamais 404", async () => {
  const read = await call("GET", `/communities/${COM_B}`, ADMIN_A);
  assert.equal(read.status, 403);
  assert.equal((read.body as { error: { code: string } }).error.code, "FORBIDDEN");

  const write = await call("POST", `/communities/${COM_B}/memberships`, ADMIN_A, {
    adminUserId: TARGET,
    role: "support",
  });
  assert.equal(write.status, 403);

  const rows = await db.query("SELECT id FROM community_memberships WHERE community_id = $1 AND admin_user_id = $2", [
    COM_B,
    TARGET,
  ]);
  assert.equal(rows.length, 0, "aucune écriture inter-communauté ne doit passer");

  const devices = await call("GET", `/communities/${COM_B}/devices`, SUPPORT_A);
  assert.equal(devices.status, 403);

  const orders = await call("GET", `/communities/${COM_A}/orders`, ADMIN_B);
  assert.equal(orders.status, 403);
});

test("support : lecture et révocation d'appareil, jamais un changement de rôle", async () => {
  const before = await db.one<{ role: string }>("SELECT role FROM community_memberships WHERE id = 'mem_a_support'");

  const promotion = await call("PATCH", "/memberships/mem_a_support", SUPPORT_A, { role: "community_admin" });
  assert.equal(promotion.status, 403);

  const removal = await call("DELETE", "/memberships/mem_a_admin", SUPPORT_A);
  assert.equal(removal.status, 403);

  const after = await db.one<{ role: string }>("SELECT role FROM community_memberships WHERE id = 'mem_a_support'");
  assert.equal(after?.role, before?.role, "le rôle doit rester inchangé");

  const creation = await call("POST", `/communities/${COM_A}/memberships`, SUPPORT_A, {
    adminUserId: TARGET,
    role: "support",
  });
  assert.equal(creation.status, 403);

  // La lecture des abonnés lui est ouverte (sa communauté).
  const users = await call("GET", `/communities/${COM_A}/users`, SUPPORT_A);
  assert.equal(users.status, 200);
});

test("finance : commandes, commissions, versement — mais aucun membre", async () => {
  const before = await db.scalar<number>("SELECT count(*)::int FROM community_memberships WHERE community_id = $1", [COM_A]);

  const creation = await call("POST", `/communities/${COM_A}/memberships`, FINANCE_A, {
    adminUserId: TARGET,
    role: "support",
  });
  assert.equal(creation.status, 403);

  const users = await call("GET", `/communities/${COM_A}/users`, FINANCE_A);
  assert.equal(users.status, 403);

  const devices = await call("GET", `/communities/${COM_A}/devices`, FINANCE_A);
  assert.equal(devices.status, 403);

  const after = await db.scalar<number>("SELECT count(*)::int FROM community_memberships WHERE community_id = $1", [COM_A]);
  assert.equal(after, before);

  const orders = await call("GET", `/communities/${COM_A}/orders`, FINANCE_A);
  assert.equal(orders.status, 200);
  const commissions = await call("GET", `/communities/${COM_A}/commissions`, FINANCE_A);
  assert.equal(commissions.status, 200);
});

test("owner : création, rôle, suspension, révocation, pool, audit", async () => {
  const community = await call("POST", "/communities", OWNER, {
    name: "Communauté C",
    slug: "communaute-c",
    commissionBps: 1800,
  });
  assert.equal(community.status, 201);
  const communityId = (community.body as { id: string }).id;

  const admin = await call("POST", "/admins", OWNER, {
    email: "nouveau@example.com",
    name: "Nouveau Staff",
    password: "mot-de-passe-solide-2026",
    platformRole: "none",
  });
  assert.equal(admin.status, 201);
  const newAdminId = (admin.body as { adminId: string }).adminId;

  const membership = await call("POST", `/communities/${communityId}/memberships`, OWNER, {
    adminUserId: newAdminId,
    role: "support",
  });
  assert.equal(membership.status, 201);
  const membershipId = (membership.body as { id: string }).id;

  const promotion = await call("PATCH", `/memberships/${membershipId}`, OWNER, { role: "finance" });
  assert.equal(promotion.status, 200);
  assert.equal((promotion.body as { role: string }).role, "finance");

  const suspend = await call("PATCH", `/communities/${communityId}`, OWNER, { status: "suspended" });
  assert.equal(suspend.status, 200);
  assert.equal((suspend.body as { status: string }).status, "suspended");

  const resume = await call("PATCH", `/communities/${communityId}`, OWNER, { status: "active" });
  assert.equal(resume.status, 200);
  assert.equal((resume.body as { status: string }).status, "active");

  const revoke = await call("POST", "/devices/dev_a1/revoke", OWNER, {});
  assert.equal(revoke.status, 200);
  assert.equal((revoke.body as { sessionsRevoked: number }).sessionsRevoked, 1, "les sessions de l'appareil tombent");
  const device = await db.one<{ status: string }>("SELECT status FROM devices WHERE id = 'dev_a1'");
  assert.equal(device?.status, "revoked");

  const pool = await call("GET", "/pool", OWNER);
  assert.equal(pool.status, 200);

  const audit = await call("GET", "/audit-log", OWNER);
  assert.equal(audit.status, 200);
});

test("une ligne d'audit par action privilégiée, ni plus ni moins", async () => {
  const before = await auditTotal();
  // Compteurs par action, pas des totaux absolus : les tests précédents ont déjà
  // écrit des lignes (owner crée une appartenance dans la communauté C). Ce qui
  // est contrôlé ici est le **delta** : une action -> une ligne.
  const beforeCreate = await auditRows("membership.create");
  const beforeUpdate = await auditRows("membership.update");
  const beforeDisable = await auditRows("membership.disable");

  const created = await call("POST", `/communities/${COM_A}/memberships`, ADMIN_A, {
    adminUserId: AUDIT_TARGET,
    role: "support",
  });
  assert.equal(created.status, 201);
  const membershipId = (created.body as { id: string }).id;

  const patched = await call("PATCH", `/memberships/${membershipId}`, ADMIN_A, { role: "finance" });
  assert.equal(patched.status, 200);

  const removed = await call("DELETE", `/memberships/${membershipId}`, ADMIN_A);
  assert.equal(removed.status, 200);

  const after = await auditTotal();
  assert.equal(after - before, 3, "trois actions, trois lignes, aucune écriture de lecture");

  assert.equal(await auditRows("membership.create"), beforeCreate + 1);
  assert.equal(await auditRows("membership.update"), beforeUpdate + 1);
  assert.equal(await auditRows("membership.disable"), beforeDisable + 1);

  const row = await db.one<{ actor_id: string; actor_role: string; community_id: string; target_id: string }>(
    `SELECT actor_id, actor_role, community_id, target_id FROM audit_log
      WHERE action = 'membership.create' ORDER BY created_at DESC LIMIT 1`,
  );
  assert.equal(row?.actor_id, ADMIN_A);
  assert.equal(row?.actor_role, "community_admin");
  assert.equal(row?.community_id, COM_A, "l'audit situe l'action dans la communauté de la session");
  assert.equal(row?.target_id, membershipId);
});

test("un community_id du corps est ignoré : le chemin fait foi", async () => {
  const created = await call("POST", `/communities/${COM_A}/memberships`, ADMIN_A, {
    adminUserId: BODY_TARGET,
    role: "support",
    communityId: COM_B,
    community_id: COM_B,
  });
  assert.equal(created.status, 201);
  const membershipId = (created.body as { id: string }).id;

  const stored = await db.one<{ community_id: string }>(
    "SELECT community_id FROM community_memberships WHERE id = $1",
    [membershipId],
  );
  assert.equal(stored?.community_id, COM_A, "la communauté vient de la session, pas du corps");

  const leaked = await db.query("SELECT id FROM community_memberships WHERE community_id = $1 AND admin_user_id = $2", [
    COM_B,
    BODY_TARGET,
  ]);
  assert.equal(leaked.length, 0, "aucune appartenance n'a été créée dans la communauté du corps");
});

test("le pool ne contient ni UUID, ni chemin WS, ni credential", async () => {
  const res = await call("GET", "/pool", ADMIN_A);
  assert.equal(res.status, 200);

  const body = res.body as { count: number; endpoints: Array<Record<string, unknown>> };
  assert.ok(body.count >= 1);
  for (const endpoint of body.endpoints) {
    assert.ok(!("uuid" in endpoint), "jamais d'UUID");
    assert.ok(!("ws_path" in endpoint), "jamais de chemin WebSocket");
    assert.ok(!("wsPath" in endpoint));
    assert.ok(!("credential" in endpoint), "jamais de credential");
    assert.ok(!("deployment_key" in endpoint), "la clé de déploiement reste interne");
    assert.ok(endpoint.endpointId);
  }

  assert.ok(!res.text.includes(POOL_WS_PATH), "le chemin WS ne doit pas sortir");
  assert.ok(!res.text.includes(POOL_CREDENTIAL), "le secret scellé ne doit pas sortir");
  assert.ok(!res.text.includes(POOL_DEPLOYMENT_KEY));
  assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(res.text), "aucun UUID");

  const finance = await call("GET", "/pool", FINANCE_A);
  assert.equal(finance.status, 403);
});

test("versement : finance prépare, owner approuve, personne d'autre", async () => {
  const prepared = await call("POST", `/communities/${COM_A}/payouts`, FINANCE_A, { note: "Semaine 42" });
  assert.equal(prepared.status, 201);
  const payout = prepared.body as { id: string; amountXaf: number; status: string; commissionCount: number };
  assert.equal(payout.amountXaf, 600, "400 + 200 de commissions disponibles, calculées côté serveur");
  assert.equal(payout.commissionCount, 2);
  assert.equal(payout.status, "pending");

  const attached = await db.query("SELECT id FROM commissions WHERE payout_id = $1", [payout.id]);
  assert.equal(attached.length, 2);

  // D57 : celui qui prépare ne peut pas approuver sa propre demande.
  const selfApprove = await call("POST", `/payouts/${payout.id}/approve`, FINANCE_A, {});
  assert.equal(selfApprove.status, 409, "finance ne peut pas approuver sa propre demande");

  // Un autre administrateur de la communauté approuve.
  const communityApprove = await call("POST", `/payouts/${payout.id}/approve`, ADMIN_A, {});
  assert.equal(communityApprove.status, 200, communityApprove.text);
  assert.equal((communityApprove.body as { status: string }).status, "approved");

  // Une deuxième approbation ne passe pas, même par l'owner.
  const twice = await call("POST", `/payouts/${payout.id}/approve`, OWNER, {});
  assert.equal(twice.status, 409);

  const empty = await call("POST", `/communities/${COM_A}/payouts`, FINANCE_A, {});
  assert.equal(empty.status, 409, "pas de seconde paye sur les mêmes commissions");
});

test("bundle hors-ligne : support de sa communauté, jamais de configuration", async () => {
  const issued = await call("POST", "/devices/dev_a2/offline-bundles", SUPPORT_A, { ttlHours: 6 });
  assert.equal(issued.status, 201);
  const body = issued.body as { bundleId: string; notAfter: string; singleUse: boolean };
  assert.ok(body.bundleId);
  assert.equal(body.singleUse, true);
  assert.ok(body.notAfter);
  assert.ok(!issued.text.includes("vless"), "aucune configuration dans la réponse");
  assert.ok(!issued.text.includes(POOL_WS_PATH));

  const stored = await db.one<{ consumed_at: Date | null; created_by: string }>(
    "SELECT consumed_at, created_by FROM offline_bundles WHERE id = $1",
    [body.bundleId],
  );
  assert.equal(stored?.consumed_at, null);
  assert.equal(stored?.created_by, SUPPORT_A);

  const forbidden = await call("POST", "/devices/dev_a2/offline-bundles", FINANCE_A, {});
  assert.equal(forbidden.status, 403);

  const crossCommunity = await call("POST", "/devices/dev_b1/offline-bundles", SUPPORT_A, {});
  assert.equal(crossCommunity.status, 403);
});

test("audit_log est append-only, même en SQL direct", async () => {
  const before = await auditTotal();
  await db.query("UPDATE audit_log SET action = 'falsifie' WHERE action = 'community.create'");
  await db.query("DELETE FROM audit_log");
  assert.equal(await auditTotal(), before, "ni UPDATE ni DELETE ne modifient la piste");
  assert.equal(await auditRows("falsifie"), 0);
});

test("audit-log : owner voit tout, community_admin sa communauté, support rien", async () => {
  const mine = await call("GET", "/audit-log", ADMIN_A);
  assert.equal(mine.status, 200);
  const items = (mine.body as { items: Array<{ communityId: string | null }> }).items;
  assert.ok(items.length > 0);
  assert.ok(
    items.every((item) => item.communityId === COM_A),
    "un community_admin ne lit que les lignes de sa communauté",
  );

  const crossRead = await call("GET", `/audit-log?community_id=${COM_B}`, ADMIN_A);
  assert.equal(crossRead.status, 403);

  const support = await call("GET", "/audit-log", SUPPORT_A);
  assert.equal(support.status, 403);

  const owner = await call("GET", "/audit-log", OWNER);
  assert.equal(owner.status, 200);
  const all = (owner.body as { items: Array<{ communityId: string | null }> }).items;
  assert.ok(new Set(all.map((item) => item.communityId)).size >= 1);
});

test("support lit les commandes de sa communauté sans les montants", async () => {
  const support = await call("GET", `/communities/${COM_A}/orders`, SUPPORT_A);
  assert.equal(support.status, 200);
  const supportItems = (support.body as { items: Array<Record<string, unknown>> }).items;
  assert.ok(supportItems.length >= 1);
  for (const item of supportItems) {
    assert.ok(!("amountXaf" in item), "support ne voit pas les montants");
    assert.ok(!("commissionXaf" in item));
  }

  const admin = await call("GET", `/communities/${COM_A}/orders`, ADMIN_A);
  assert.equal(admin.status, 200);
  const adminItems = (admin.body as { items: Array<Record<string, unknown>> }).items;
  assert.ok(adminItems.some((item) => typeof item.amountXaf === "number"));
});

test("les forfaits sont propres à une marque et modifiables par son administrateur", async () => {
  // Lecture : l'admin de A voit les offres de A, jamais celles de B.
  const mine = await call("GET", "/apps/app_a/plans", ADMIN_A);
  assert.equal(mine.status, 200);
  const mineItems = (mine.body as { items: Array<Record<string, unknown>> }).items;
  assert.ok(mineItems.some((plan) => plan.id === "plan_a"));
  assert.ok(mineItems.every((plan) => typeof plan.revision === "number"));

  const cross = await call("GET", "/apps/app_b/plans", ADMIN_A);
  assert.equal(cross.status, 403);

  // Création : le prix est la décision de la marque, pas de la plateforme.
  const created = await call("POST", "/apps/app_a/plans", ADMIN_A, {
    code: "annuel",
    name: "Annuel",
    description: "12 mois",
    priceXaf: 20_000,
    durationDays: 365,
    deviceLimit: 2,
    featured: true,
    sortOrder: 2,
  });
  assert.equal(created.status, 201, created.text);
  const plan = created.body as { id: string; priceXaf: number; revision: number; deviceLimit: number };
  assert.equal(plan.priceXaf, 20_000);
  assert.equal(plan.deviceLimit, 2);
  assert.equal(typeof plan.revision, "number");

  // Modification du prix : la révision change, donc une app qui affiche
  // l'ancien prix reçoit le 409 attendu au lieu d'acheter à l'ancien tarif.
  const patched = await call("PATCH", `/plans/${plan.id}`, ADMIN_A, { priceXaf: 25_000 });
  assert.equal(patched.status, 200, patched.text);
  const patchedBody = patched.body as { priceXaf: number; revision: number };
  assert.equal(patchedBody.priceXaf, 25_000);
  assert.notEqual(patchedBody.revision, plan.revision);

  assert.equal(await auditRows("plan.create"), 1);
  assert.equal(await auditRows("plan.update"), 1);

  // Frontières : une offre d'une autre marque n'est pas modifiable, un rôle
  // non commercial ne touche pas aux prix, et un code déjà pris est un conflit.
  const crossPatch = await call("PATCH", "/plans/plan_b", ADMIN_A, { priceXaf: 1000 });
  assert.equal(crossPatch.status, 403);

  const supportPatch = await call("PATCH", `/plans/${plan.id}`, SUPPORT_A, { priceXaf: 1000 });
  assert.equal(supportPatch.status, 403);

  const duplicate = await call("POST", "/apps/app_a/plans", ADMIN_A, {
    code: "mensuel",
    name: "Doublon",
    priceXaf: 1000,
    durationDays: 30,
  });
  assert.equal(duplicate.status, 409);

  const free = await call("PATCH", `/plans/${plan.id}`, ADMIN_A, { priceXaf: 0 });
  assert.equal(free.status, 400, "une offre à 0 XAF n'est pas payable");
});

test("le catalogue public ne sert que les offres actives de l'app demandée", async () => {
  const publicList = await app.inject({ method: "GET", url: "/v1/apps/app_a/plans" });
  assert.equal(publicList.statusCode, 200);
  const body = publicList.json() as { app: { id: string; name: string }; items: Array<Record<string, unknown>> };
  assert.equal(body.app.id, "app_a");
  assert.equal(body.app.name, "App A");
  assert.ok(body.items.length >= 1);
  assert.ok(body.items.every((plan) => typeof plan.priceXaf === "number"));
  assert.ok(body.items.every((plan) => (plan as { id: string }).id !== "plan_b"), "jamais les offres de B");

  const hidden = await call("PATCH", "/plans/plan_a", ADMIN_A, { active: false });
  assert.equal(hidden.status, 200);
  const afterHide = await app.inject({ method: "GET", url: "/v1/apps/app_a/plans" });
  const afterBody = afterHide.json() as { items: Array<{ id: string }> };
  assert.ok(afterBody.items.every((plan) => plan.id !== "plan_a"));
  await call("PATCH", "/plans/plan_a", ADMIN_A, { active: true });

  const unknown = await app.inject({ method: "GET", url: "/v1/apps/app_inconnue/plans" });
  assert.equal(unknown.statusCode, 404);
});

test("désactiver un compte coupe l'accès au prochain appel, pas dans 8 h", async () => {
  await db.query("UPDATE admin_users SET active = false WHERE id = $1", [ADMIN_B]);
  const denied = await call("GET", "/me", ADMIN_B);
  assert.equal(denied.status, 403);
  assert.equal((denied.body as { error: { message: string } }).error.message, "Compte administrateur désactivé.");
});

test("validation : corps strict, valeurs bornées", async () => {
  const badSlug = await call("POST", "/communities", OWNER, { name: "X", slug: "Pas Un Slug" });
  assert.equal(badSlug.status, 400);

  const emptyPatch = await call("PATCH", `/communities/${COM_A}`, OWNER, {});
  assert.equal(emptyPatch.status, 400);

  const bpsOutOfRange = await call("PATCH", `/communities/${COM_A}`, OWNER, { commissionBps: 20_000 });
  assert.equal(bpsOutOfRange.status, 400);

  const unknownField = await call("PATCH", "/memberships/mem_a_support", OWNER, { role: "support", amountXaf: 10 });
  assert.equal(unknownField.status, 400, "un corps strict refuse les champs inventés");
});
