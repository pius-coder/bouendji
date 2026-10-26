/**
 * Pagination par curseur des listes admin (lot R3) et périmètre `finance`.
 *
 * Les listes gardent leur forme (`items`) ; `nextCursor` n'apparaît que s'il
 * reste une page. Chaque page suivante part du curseur précédent : aucune ligne
 * n'est perdue ni lue deux fois, même quand plusieurs lignes partagent un
 * horodatage.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";

import { call, closeAll, db } from "./support.js";
import { openAdminSession } from "../src/lib/auth.js";

after(async () => {
  await closeAll();
});

const COM_A = "pg_com_a";
const COM_B = "pg_com_b";
const OWNER = "pg_owner";
const ADMIN_A = "pg_admin_a";
const FINANCE_A = "pg_finance_a";

await db.query("INSERT INTO communities (id, name, slug, commission_bps) VALUES ($1, 'A', 'pg-a', 2000)", [COM_A]);
await db.query("INSERT INTO communities (id, name, slug, commission_bps) VALUES ($1, 'B', 'pg-b', 1500)", [COM_B]);
for (const [id, platformRole] of [
  [OWNER, "owner"],
  [ADMIN_A, "none"],
  [FINANCE_A, "none"],
] as const) {
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active, must_change_password)
     VALUES ($1, $2, 'scrypt$16384$8$1$x$y', $1, 'partner', $3, true, false)`,
    [id, `${id}@example.com`, platformRole],
  );
}
await db.query(
  "INSERT INTO community_memberships (id, admin_user_id, community_id, role, status) VALUES ('pg_m_admin', $1, $2, 'community_admin', 'active')",
  [ADMIN_A, COM_A],
);
await db.query(
  "INSERT INTO community_memberships (id, admin_user_id, community_id, role, status) VALUES ('pg_m_fin', $1, $2, 'finance', 'active')",
  [FINANCE_A, COM_A],
);

await db.query("INSERT INTO apps (id, community_id, slug, name, package_name) VALUES ('pg_app_a', $1, 'pg-app-a', 'A', 'com.pg.a')", [COM_A]);
await db.query("INSERT INTO apps (id, community_id, slug, name, package_name) VALUES ('pg_app_b', $1, 'pg-app-b', 'B', 'com.pg.b')", [COM_B]);
await db.query(
  "INSERT INTO plans (id, app_id, code, name, description, price_xaf, duration_days) VALUES ('pg_plan_a', 'pg_app_a', 'mensuel', 'M', '', 2000, 30)",
);

// Cinq abonnés, horodatages distincts (du plus récent au plus ancien).
for (let i = 1; i <= 5; i++) {
  await db.query(
    `INSERT INTO users (id, app_id, community_id, email, password_hash, name, created_at)
     VALUES ($1, 'pg_app_a', $2, $3, 'x', $4, now() - ($5 || ' minutes')::interval)`,
    [`pg_usr_${i}`, COM_A, `u${i}@example.com`, `Abonné ${i}`, String(i)],
  );
}
// Un abonné de B, qui ne doit jamais apparaître dans les listes de A.
await db.query(
  `INSERT INTO users (id, app_id, community_id, email, password_hash, name)
   VALUES ('pg_usr_b', 'pg_app_b', $1, 'ub@example.com', 'x', 'Abonné B')`,
  [COM_B],
);

// Trois appareils, deux à un même abonné : la liste passe par la communauté.
for (let i = 1; i <= 3; i++) {
  await db.query(
    `INSERT INTO devices (id, user_id, installation_id, name, signing_key, agreement_key, device_token_hash, status, created_at)
     VALUES ($1, $2, $3, 'Tél', 'k', 'k', $4, 'active', now() - ($5 || ' minutes')::interval)`,
    [`pg_dev_${i}`, `pg_usr_${i}`, `pg-inst-${i}`, `h-${i}`, String(i)],
  );
}

// Cinq commandes et cinq commissions, une par commande.
for (let i = 1; i <= 5; i++) {
  await db.query(
    `INSERT INTO orders (id, user_id, app_id, plan_id, community_id, amount_xaf, status, provider,
                         commission_bps, commission_xaf, created_at)
     VALUES ($1, $2, 'pg_app_a', 'pg_plan_a', $3, 2000, 'paid', 'mock', 2000, 400, now() - ($4 || ' minutes')::interval)`,
    [`pg_ord_${i}`, `pg_usr_${i}`, COM_A, String(i)],
  );
  await db.query(
    `INSERT INTO commissions (id, community_id, order_id, bps, amount_xaf, status, created_at)
     VALUES ($1, $2, $3, 2000, 400, 'available', now() - ($4 || ' minutes')::interval)`,
    [`pg_cm_${i}`, COM_A, `pg_ord_${i}`, String(i)],
  );
}

// Quatre versements : l'ordre de la file place `needs_review` en tête, `paid` en queue.
const PAYOUTS: Array<[string, string]> = [
  ["pg_pay_paid", "paid"],
  ["pg_pay_pending", "pending"],
  ["pg_pay_review", "needs_review"],
  ["pg_pay_approved", "approved"],
];
for (const [id, status] of PAYOUTS) {
  await db.query(
    `INSERT INTO payouts (id, community_id, amount_xaf, status, created_at)
     VALUES ($1, $2, 400, $3, now() - interval '1 minute')`,
    [id, COM_A, status],
  );
}

// Cinq lignes d'audit, toutes au même instant : seul l'identifiant départage.
for (let i = 1; i <= 5; i++) {
  await db.query(
    `INSERT INTO audit_log (id, actor_type, action, target, target_type, target_id, community_id, created_at)
     VALUES ($1, 'admin', 'pg.test', 'x:y', 'x', 'y', $2, '2026-10-01T10:00:00Z')`,
    [`pg_audit_${String(i).padStart(2, "0")}`, COM_A],
  );
}

const tokens: Record<string, string> = {};
for (const id of [OWNER, ADMIN_A, FINANCE_A]) {
  // R1 : un jeton admin ouvre une session révocable.
  tokens[id] = (await openAdminSession(db, { adminId: id })).token;
}

async function adminCall(method: "GET", url: string, as: string) {
  return call(method, `/v1/admin${url}`, { headers: { authorization: `Bearer ${tokens[as]}` } });
}

/** Parcourt toutes les pages d'une liste ; échoue si une page dépasse la taille demandée. */
async function walk(path: string, as: string, limit: number, key: (item: Record<string, unknown>) => string) {
  const seen: string[] = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const sep = path.includes("?") ? "&" : "?";
    const url = `${path}${sep}limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
    const res = await adminCall("GET", url, as);
    assert.equal(res.status, 200, res.text);
    const body = res.body as { items: Array<Record<string, unknown>>; nextCursor?: string };
    assert.ok(body.items.length <= limit, "une page ne dépasse pas la taille demandée");
    seen.push(...body.items.map(key));
    cursor = body.nextCursor;
    pages += 1;
    assert.ok(pages < 20, "boucle de pagination");
  } while (cursor);
  return seen;
}

/* -------------------------------------------------------------- listes */

test("abonnés : pages de 2 sans doublon ni trou, nextCursor seulement s'il reste une page", async () => {
  const all = await adminCall("GET", `/communities/${COM_A}/users`, ADMIN_A);
  assert.equal(all.status, 200);
  assert.equal("nextCursor" in (all.body as object), false, "liste courte : réponse inchangée");
  assert.equal((all.body as { items: unknown[] }).items.length, 5);

  const ids = await walk(`/communities/${COM_A}/users`, ADMIN_A, 2, (item) => String(item.id));
  assert.equal(new Set(ids).size, 5);
  assert.ok(!ids.includes("pg_usr_b"), "jamais un abonné d'une autre communauté");
  // Tri created_at DESC : pg_usr_1 est le plus récent (1 minute).
  assert.deepEqual(ids, ["pg_usr_1", "pg_usr_2", "pg_usr_3", "pg_usr_4", "pg_usr_5"]);
});

test("appareils : parcours complet en pages de 1", async () => {
  const ids = await walk(`/communities/${COM_A}/devices`, ADMIN_A, 1, (item) => String(item.deviceId));
  assert.deepEqual([...ids].sort(), ["pg_dev_1", "pg_dev_2", "pg_dev_3"]);
});

test("commissions : parcours complet, page de 2, aucune ligne perdue", async () => {
  const ids = await walk(`/communities/${COM_A}/commissions`, FINANCE_A, 2, (item) => String(item.id));
  assert.equal(new Set(ids).size, 5);
  assert.equal(ids.length, 5);
});

test("journal d'audit : lignes au même horodatage, aucune perdue ni répétée", async () => {
  const ids = await walk("/audit-log?community_id=" + COM_A, OWNER, 2, (item) => String(item.id));
  const mine = ids.filter((id) => id.startsWith("pg_audit_"));
  assert.equal(new Set(mine).size, 5);
  assert.equal(mine.length, 5);
});

test("versements : la file suit l'ordre des statuts, sur plusieurs pages", async () => {
  const order = await walk(`/payouts?communityId=${COM_A}`, OWNER, 1, (item) => String(item.id));
  assert.deepEqual(
    order.filter((id) => id.startsWith("pg_pay_")),
    ["pg_pay_review", "pg_pay_pending", "pg_pay_approved", "pg_pay_paid"],
  );
});

test("curseur malformé : 400, pas de 500", async () => {
  const res = await adminCall("GET", `/communities/${COM_A}/commissions?cursor=%%%`, ADMIN_A);
  assert.equal(res.status, 400);
  const payouts = await adminCall("GET", `/payouts?communityId=${COM_A}&cursor=bm9pcGU`, OWNER);
  assert.equal(payouts.status, 400, "un curseur sans trois champs est refusé");
});

/* ------------------------------------------------------- finance (périmètre) */

test("finance : commandes et commissions de sa communauté, avec montants ; pas d'une autre", async () => {
  const orders = await adminCall("GET", `/communities/${COM_A}/orders`, FINANCE_A);
  assert.equal(orders.status, 200, orders.text);
  assert.ok((orders.body as { items: Array<Record<string, unknown>> }).items.every((o) => typeof o.amountXaf === "number"));

  const commissions = await adminCall("GET", `/communities/${COM_A}/commissions`, FINANCE_A);
  assert.equal(commissions.status, 200);

  // Contradiction relevée (permitted() accorde « toutes » aux finances, scopedCommunity
  // refuse une autre communauté) : le périmètre effectif est la communauté d'appartenance.
  const abroadOrders = await adminCall("GET", `/communities/${COM_B}/orders`, FINANCE_A);
  assert.equal(abroadOrders.status, 403);
  const abroadCommissions = await adminCall("GET", `/communities/${COM_B}/commissions`, FINANCE_A);
  assert.equal(abroadCommissions.status, 403);
});
