/**
 * Fiches de détail, recherche et résumé d'accueil (lot R3).
 *
 * Vrai `buildApp`, vraie base PGlite, jetons admin issus de sessions R1
 * (`openAdminSession`), rôles relus en base. Ce que ces tests pincent :
 * - chaque fiche suit le périmètre (403 hors communauté, jamais 404) ;
 * - les montants disparaissent pour `support` (compteurs seulement) ;
 * - `finance` lit commandes et commissions de sa communauté, pas d'ailleurs ;
 * - aucune clé d'appareil ni hachage de jeton ne sort d'une fiche ;
 * - la recherche ne sort jamais de la communauté de l'admin et échappe LIKE.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";

import { call, closeAll, db } from "./support.js";
import { openAdminSession } from "../src/lib/auth.js";
import { up as migrateR3Indexes } from "../src/migrations/030_admin_detail_indexes.js";

after(async () => {
  await closeAll();
});

/* ------------------------------------------------------------------ graine */

const COM_A = "rd_com_a";
const COM_B = "rd_com_b";
const OWNER = "rd_owner";
const ADMIN_A = "rd_admin_a";
const SUPPORT_A = "rd_support_a";
const FINANCE_A = "rd_finance_a";
const ADMIN_B = "rd_admin_b";

await db.query("INSERT INTO communities (id, name, slug, commission_bps) VALUES ($1, 'Communauté A', 'rd-a', 2000)", [COM_A]);
await db.query("INSERT INTO communities (id, name, slug, commission_bps) VALUES ($1, 'Communauté B', 'rd-b', 1500)", [COM_B]);

for (const [id, platformRole] of [
  [OWNER, "owner"],
  [ADMIN_A, "none"],
  [SUPPORT_A, "none"],
  [FINANCE_A, "none"],
  [ADMIN_B, "none"],
] as const) {
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active, must_change_password)
     VALUES ($1, $2, 'scrypt$16384$8$1$x$y', $3, 'partner', $4, true, false)`,
    [id, `${id}@example.com`, id.replace("rd_", "Compte "), platformRole],
  );
}
for (const [id, admin, community, role] of [
  ["rd_mem_a_admin", ADMIN_A, COM_A, "community_admin"],
  ["rd_mem_a_support", SUPPORT_A, COM_A, "support"],
  ["rd_mem_a_finance", FINANCE_A, COM_A, "finance"],
  ["rd_mem_b_admin", ADMIN_B, COM_B, "community_admin"],
] as const) {
  await db.query(
    "INSERT INTO community_memberships (id, admin_user_id, community_id, role, status) VALUES ($1, $2, $3, $4, 'active')",
    [id, admin, community, role],
  );
}

await db.query("INSERT INTO apps (id, community_id, slug, name, package_name) VALUES ('rd_app_a', $1, 'rd-app-a', 'App A', 'com.rd.a')", [COM_A]);
await db.query("INSERT INTO apps (id, community_id, slug, name, package_name) VALUES ('rd_app_b', $1, 'rd-app-b', 'App B', 'com.rd.b')", [COM_B]);
await db.query(
  "INSERT INTO plans (id, app_id, code, name, description, price_xaf, duration_days) VALUES ('rd_plan_a', 'rd_app_a', 'mensuel', 'Mensuel', '', 2000, 30)",
);
await db.query(
  "INSERT INTO plans (id, app_id, code, name, description, price_xaf, duration_days) VALUES ('rd_plan_b', 'rd_app_b', 'mensuel', 'Mensuel', '', 1500, 30)",
);

// Abonnés : Awa et Brice dans A, Clara dans B. Téléphones avec et sans indicatif.
await db.query(
  `INSERT INTO users (id, app_id, community_id, email, password_hash, name, phone, email_verified_at)
   VALUES ('rd_usr_a', 'rd_app_a', $1, 'awa@example.com', 'x', 'Awa Mbarga', '+237 690 00 11 22', now())`,
  [COM_A],
);
await db.query(
  `INSERT INTO users (id, app_id, community_id, email, password_hash, name, phone)
   VALUES ('rd_usr_a2', 'rd_app_a', $1, 'brice@example.com', 'x', 'Brice Tchouam', '677 11 22 33')`,
  [COM_A],
);
await db.query(
  `INSERT INTO users (id, app_id, community_id, email, password_hash, name, phone)
   VALUES ('rd_usr_b', 'rd_app_b', $1, 'clara@example.com', 'x', 'Clara Nkono', '699 88 77 66')`,
  [COM_B],
);

// Appareils : les colonnes secrètes sont posées pour prouver qu'elles ne sortent pas.
const SECRET_SIGNING = "SIGNKEY-SECRET-DO-NOT-LEAK";
const SECRET_TOKEN_HASH = "TOKHASH-SECRET-DO-NOT-LEAK";
for (const [device, user, install] of [
  ["rd_dev_a1", "rd_usr_a", "rd-inst-a1"],
  ["rd_dev_a2", "rd_usr_a", "rd-inst-a2"],
  ["rd_dev_b1", "rd_usr_b", "rd-inst-b1"],
] as const) {
  await db.query(
    `INSERT INTO devices (id, user_id, installation_id, name, signing_key, agreement_key,
                          device_token_hash, status, integrity_ok, app_version, android_version)
     VALUES ($1, $2, $3, $4, $5, $5, $6, 'active', true, '1.4.2', 34)`,
    [device, user, install, `Téléphone ${device}`, SECRET_SIGNING, SECRET_TOKEN_HASH],
  );
}

// Commandes : ord_a1 payée (abonnement Awa), ord_a2 en attente (Brice), ord_a3 payée (Brice).
await db.query(
  `INSERT INTO orders (id, user_id, app_id, plan_id, community_id, amount_xaf, status, provider,
                       commission_bps, commission_xaf, paid_at, activated_at, provider_ref)
   VALUES ('rd_ord_a1', 'rd_usr_a', 'rd_app_a', 'rd_plan_a', $1, 2000, 'paid', 'mock', 2000, 400, now(), now(), 'REF-A1')`,
  [COM_A],
);
await db.query(
  `INSERT INTO orders (id, user_id, app_id, plan_id, community_id, amount_xaf, status, provider,
                       commission_bps, commission_xaf)
   VALUES ('rd_ord_a2', 'rd_usr_a2', 'rd_app_a', 'rd_plan_a', $1, 1000, 'pending', 'mock', 2000, 200)`,
  [COM_A],
);
await db.query(
  `INSERT INTO orders (id, user_id, app_id, plan_id, community_id, amount_xaf, status, provider,
                       commission_bps, commission_xaf, paid_at, activated_at)
   VALUES ('rd_ord_a3', 'rd_usr_a2', 'rd_app_a', 'rd_plan_a', $1, 3000, 'paid', 'mock', 2000, 600, now(), now())`,
  [COM_A],
);
await db.query(
  `INSERT INTO orders (id, user_id, app_id, plan_id, community_id, amount_xaf, status, provider,
                       commission_bps, commission_xaf, paid_at, activated_at)
   VALUES ('rd_ord_recovery', 'rd_usr_a2', 'rd_app_a', 'rd_plan_a', $1, 2000, 'paid', 'mock', 2000, 400, now(), NULL)`,
  [COM_A],
);
await db.query(
  `INSERT INTO orders (id, user_id, app_id, plan_id, community_id, amount_xaf, status, provider,
                       commission_bps, commission_xaf, paid_at, activated_at)
   VALUES ('rd_ord_b1', 'rd_usr_b', 'rd_app_b', 'rd_plan_b', $1, 1500, 'paid', 'mock', 1500, 225, now(), now())`,
  [COM_B],
);

// Versement de COM_A : en attente d'approbation, il porte la commission de ord_a3.
await db.query(
  `INSERT INTO payouts (id, community_id, amount_xaf, status, created_by, note)
   VALUES ('rd_pay_a1', $1, 600, 'pending', $2, 'lot de juin')`,
  [COM_A, FINANCE_A],
);
await db.query(
  `INSERT INTO commissions (id, community_id, order_id, bps, amount_xaf, status, payout_id, available_at)
   VALUES ('rd_cm_a1', $1, 'rd_ord_a1', 2000, 400, 'available', NULL, now() - interval '1 hour')`,
  [COM_A],
);
await db.query(
  `INSERT INTO commissions (id, community_id, order_id, bps, amount_xaf, status, payout_id, available_at)
   VALUES ('rd_cm_a2', $1, 'rd_ord_a3', 2000, 600, 'paid', 'rd_pay_a1', now() - interval '1 hour')`,
  [COM_A],
);

// Abonnements : Awa (actif), Brice (actif, pour compter les abonnés distincts).
await db.query(
  `INSERT INTO subscriptions (id, user_id, plan_id, order_id, status, starts_at, ends_at)
   VALUES ('rd_sub_a1', 'rd_usr_a', 'rd_plan_a', 'rd_ord_a1', 'active', now() - interval '2 days', now() + interval '28 days')`,
);
await db.query(
  `INSERT INTO subscriptions (id, user_id, plan_id, order_id, status, starts_at, ends_at)
   VALUES ('rd_sub_a3', 'rd_usr_a2', 'rd_plan_a', 'rd_ord_a3', 'active', now() - interval '1 day', now() + interval '29 days')`,
);

// Consommation : aujourd'hui (compte) et il y a 40 jours (hors période de l'abonnement).
await db.query(
  `INSERT INTO usage_daily (device_id, day, source, bytes_up, bytes_down, seconds)
   VALUES ('rd_dev_a1', (now() AT TIME ZONE 'Africa/Douala')::date, 'device', 100, 900, 60)`,
);
await db.query(
  `INSERT INTO usage_daily (device_id, day, source, bytes_up, bytes_down, seconds)
   VALUES ('rd_dev_a1', ((now() - interval '40 days') AT TIME ZONE 'Africa/Douala')::date, 'device', 5000, 5000, 999)`,
);

// Rapports client : un succès et un échec, dans les 24 h, sur rd_dev_a1.
await db.query(
  `INSERT INTO config_reports (id, device_id, config_id, ok, latency_ms, reported_at)
   VALUES ('rd_rep_1', 'rd_dev_a1', 'cfg-1', true, 120, now() - interval '1 hour')`,
);
await db.query(
  `INSERT INTO config_reports (id, device_id, config_id, ok, latency_ms, reported_at)
   VALUES ('rd_rep_2', 'rd_dev_a1', 'cfg-2', false, NULL, now() - interval '2 hours')`,
);

await db.query(
  `INSERT INTO offline_bundles (id, device_id, user_id, created_by, not_after)
   VALUES ('rd_ob_1', 'rd_dev_a1', 'rd_usr_a', $1, now() + interval '1 hour')`,
  [ADMIN_A],
);

/* ------------------------------------------------------------------ jetons */

const tokens: Record<string, string> = {};
for (const id of [OWNER, ADMIN_A, SUPPORT_A, FINANCE_A, ADMIN_B]) {
  // R1 : un jeton admin ouvre une session révocable ; le drapeau « mot de
  // passe à changer » est posé à false dans la graine.
  const { token } = await openAdminSession(db, { adminId: id });
  tokens[id] = token;
}

async function adminCall(method: "GET" | "POST", url: string, as: string) {
  return call(method, `/v1/admin${url}`, { headers: { authorization: `Bearer ${tokens[as]}` } });
}

/* ------------------------------------------------------------- abonné */

test("fiche abonné : abonnement, consommation de la période, appareils, commandes", async () => {
  const fiche = await adminCall("GET", "/users/rd_usr_a", ADMIN_A);
  assert.equal(fiche.status, 200, fiche.text);
  const body = fiche.body as Record<string, any>;

  assert.equal(body.name, "Awa Mbarga");
  assert.equal(body.communityId, COM_A);
  assert.equal(body.subscription.planCode, "mensuel");
  assert.equal(body.subscription.status, "active");
  assert.ok(body.subscription.endsAt, "l'échéance est donnée");

  // Seul le relevé d'aujourd'hui est dans la période ; celui d'il y a 40 jours non.
  assert.equal(body.usage.bytesUp, 100);
  assert.equal(body.usage.bytesDown, 900);
  assert.equal(body.usage.seconds, 60);

  assert.equal(body.devices.length, 2);
  assert.equal(body.recentOrders.length, 1, "Awa n'a qu'une commande");
  assert.equal(body.recentOrders[0].amountXaf, 2000, "admin de communauté : montant visible");
  assert.equal(body.offlineBundles.length, 1);

  const raw = fiche.text;
  assert.ok(!raw.includes(SECRET_SIGNING), "aucune clé de signature");
  assert.ok(!raw.includes(SECRET_TOKEN_HASH), "aucun hachage de jeton");
});

test("fiche abonné : support voit la fiche sans montant ; finance ne la voit pas", async () => {
  const support = await adminCall("GET", "/users/rd_usr_a", SUPPORT_A);
  assert.equal(support.status, 200, support.text);
  const orders = (support.body as Record<string, any>).recentOrders as Array<Record<string, unknown>>;
  for (const order of orders) {
    assert.ok(!("amountXaf" in order), "support ne voit pas les montants");
    assert.ok(!("commissionXaf" in order));
  }

  const finance = await adminCall("GET", "/users/rd_usr_a", FINANCE_A);
  assert.equal(finance.status, 403, "finance ne lit pas les abonnés (member.read)");
});

test("fiche abonné : hors communauté 403, inconnu 404", async () => {
  assert.equal((await adminCall("GET", "/users/rd_usr_a", ADMIN_B)).status, 403);
  assert.equal((await adminCall("GET", "/users/rd_usr_b", ADMIN_A)).status, 403);
  assert.equal((await adminCall("GET", "/users/rd_nope", OWNER)).status, 404);
  assert.equal((await adminCall("GET", "/users/rd_usr_b", OWNER)).status, 200, "owner lit toute communauté");
});

/* ------------------------------------------------------------ commande */

test("fiche commande : commissions et montants pour admin et finance de la communauté", async () => {
  const admin = await adminCall("GET", "/orders/rd_ord_a1", ADMIN_A);
  assert.equal(admin.status, 200, admin.text);
  const body = admin.body as Record<string, any>;
  assert.equal(body.amountXaf, 2000);
  assert.equal(body.providerRef, "REF-A1");
  assert.equal(body.commissions.length, 1);
  assert.equal(body.commissions[0].id, "rd_cm_a1");
  assert.equal(body.subscription.status, "active");

  const finance = await adminCall("GET", "/orders/rd_ord_a1", FINANCE_A);
  assert.equal(finance.status, 200, "finance lit les commandes de sa communauté");
  assert.equal((finance.body as Record<string, any>).amountXaf, 2000);
});

test("fiche commande : support sans montant ni commission ; autre communauté refusée", async () => {
  const support = await adminCall("GET", "/orders/rd_ord_a1", SUPPORT_A);
  assert.equal(support.status, 200, support.text);
  assert.ok(!("amountXaf" in (support.body as object)));
  assert.ok(!("commissions" in (support.body as object)));
  assert.ok(!("providerRef" in (support.body as object)));

  assert.equal((await adminCall("GET", "/orders/rd_ord_b1", FINANCE_A)).status, 403, "finance d'une autre communauté : 403");
  assert.equal((await adminCall("GET", "/orders/rd_ord_b1", ADMIN_A)).status, 403);
  assert.equal((await adminCall("GET", "/orders/rd_nope", OWNER)).status, 404);
});

test("commande payée non activée : l'admin reprend l'activation, le support ne peut pas", async () => {
  const forbidden = await adminCall("POST", "/orders/rd_ord_recovery/reconcile", SUPPORT_A);
  assert.equal(forbidden.status, 403);

  const recovered = await adminCall("POST", "/orders/rd_ord_recovery/reconcile", ADMIN_A);
  assert.equal(recovered.status, 200, recovered.text);
  assert.equal((recovered.body as Record<string, unknown>).status, "paid");
  assert.equal((recovered.body as Record<string, unknown>).activated, true);

  const detail = await adminCall("GET", "/orders/rd_ord_recovery", ADMIN_A);
  assert.equal(detail.status, 200, detail.text);
  assert.ok((detail.body as Record<string, any>).activatedAt);
  assert.equal((detail.body as Record<string, any>).subscription.status, "active");
});

/* ------------------------------------------------------------- appareil */

test("fiche appareil : rapports 24 h et consommation, aucune donnée de clé", async () => {
  const res = await adminCall("GET", "/devices/rd_dev_a1", ADMIN_A);
  assert.equal(res.status, 200, res.text);
  const body = res.body as Record<string, any>;
  assert.equal(body.userName, "Awa Mbarga");
  assert.equal(body.appVersion, "1.4.2");
  assert.equal(body.androidVersion, 34);
  assert.equal(body.integrityOk, true);
  assert.deepEqual(body.reports24h, { ok: 1, failed: 1 });
  assert.ok(Array.isArray(body.usage) && body.usage.length === 2);
  assert.ok(!res.text.includes(SECRET_SIGNING));
  assert.ok(!res.text.includes(SECRET_TOKEN_HASH));
  assert.ok(!("signing_key" in body) && !("signingKey" in body));
});

test("fiche appareil : support lit ; finance et autre communauté refusés", async () => {
  assert.equal((await adminCall("GET", "/devices/rd_dev_a1", SUPPORT_A)).status, 200);
  assert.equal((await adminCall("GET", "/devices/rd_dev_a1", FINANCE_A)).status, 403);
  assert.equal((await adminCall("GET", "/devices/rd_dev_b1", ADMIN_A)).status, 403);
  assert.equal((await adminCall("GET", "/devices/rd_nope", OWNER)).status, 404);
});

/* ------------------------------------------------------------ versement */

test("fiche versement : ses commissions ; finance et admin de communauté oui, support non", async () => {
  const finance = await adminCall("GET", "/payouts/rd_pay_a1", FINANCE_A);
  assert.equal(finance.status, 200, finance.text);
  const body = finance.body as Record<string, any>;
  assert.equal(body.amountXaf, 600);
  assert.equal(body.status, "pending");
  assert.equal(body.note, "lot de juin");
  assert.equal(body.commissions.length, 1);
  assert.equal(body.commissions[0].id, "rd_cm_a2");

  assert.equal((await adminCall("GET", "/payouts/rd_pay_a1", ADMIN_A)).status, 200, "admin de communauté lit les versements");
  assert.equal((await adminCall("GET", "/payouts/rd_pay_a1", SUPPORT_A)).status, 403);
  assert.equal((await adminCall("GET", "/payouts/rd_pay_a1", ADMIN_B)).status, 403);
  assert.equal((await adminCall("GET", "/payouts/rd_nope", OWNER)).status, 404);
});

/* ------------------------------------------------------------ résumé */

test("résumé de communauté : ventes, abonnés, données du jour, à traiter", async () => {
  const res = await adminCall("GET", `/communities/${COM_A}/summary`, ADMIN_A);
  assert.equal(res.status, 200, res.text);
  const body = res.body as Record<string, any>;

  assert.equal(body.sales.today.count, 3, "trois commandes payées aujourd'hui, dont la reprise d'activation");
  assert.equal(body.sales.today.amountXaf, 7000);
  assert.equal(body.sales.month.count, 3);
  assert.equal(body.activeSubscribers, 2, "abonnés distincts");
  assert.equal(body.usageTodayBytes, 1000);
  assert.deepEqual(body.commissionsAvailable, { count: 2, amountXaf: 800 });

  const todo = Object.fromEntries((body.todo as Array<{ kind: string; count: number; ids: string[] }>).map((t) => [t.kind, t]));
  assert.equal(todo.orders_pending.count, 1);
  assert.deepEqual(todo.orders_pending.ids, ["rd_ord_a2"]);
  assert.equal(todo.payouts_to_approve.count, 1);
  assert.deepEqual(todo.payouts_to_approve.ids, ["rd_pay_a1"]);
  assert.equal(todo.devices_failing.count, 1);
  assert.deepEqual(todo.devices_failing.ids, ["rd_dev_a1"]);
});

test("résumé de communauté : support sans montant ni versement à traiter", async () => {
  const res = await adminCall("GET", `/communities/${COM_A}/summary`, SUPPORT_A);
  assert.equal(res.status, 200, res.text);
  const body = res.body as Record<string, any>;
  assert.equal(body.sales.today.count, 3);
  assert.ok(!("amountXaf" in body.sales.today));
  assert.ok(!("commissionsAvailable" in body));
  const kinds = (body.todo as Array<{ kind: string }>).map((t) => t.kind);
  assert.ok(kinds.includes("orders_pending") && kinds.includes("devices_failing"));
  assert.ok(!kinds.includes("payouts_to_approve"), "support ne voit pas les versements");
});

test("résumé de communauté : hors périmètre 403, inconnue 404 pour l'owner", async () => {
  assert.equal((await adminCall("GET", `/communities/${COM_A}/summary`, ADMIN_B)).status, 403);
  assert.equal((await adminCall("GET", "/communities/rd_nope/summary", OWNER)).status, 404);
  assert.equal((await adminCall("GET", "/communities/rd_nope/summary", ADMIN_A)).status, 403);
});

/* ------------------------------------------------------------ recherche */

test("recherche : nom, téléphone, identifiant d'appareil et de commande, dans le périmètre", async () => {
  const byName = await adminCall("GET", "/search?q=awa", ADMIN_A);
  assert.equal(byName.status, 200, byName.text);
  const names = (byName.body as Record<string, any>).subscribers.map((s: { id: string }) => s.id);
  assert.deepEqual(names, ["rd_usr_a"]);

  const byPhone = await adminCall("GET", "/search?q=690%2000", ADMIN_A);
  assert.deepEqual((byPhone.body as Record<string, any>).subscribers.map((s: { id: string }) => s.id), ["rd_usr_a"]);

  const device = await adminCall("GET", "/search?q=rd_dev_a1", ADMIN_A);
  assert.deepEqual((device.body as Record<string, any>).devices.map((d: { deviceId: string }) => d.deviceId), ["rd_dev_a1"]);

  const orders = await adminCall("GET", "/search?q=rd_ord_a", ADMIN_A);
  const orderIds = (orders.body as Record<string, any>).orders.map((o: { id: string }) => o.id).sort();
  assert.deepEqual(orderIds, ["rd_ord_a1", "rd_ord_a2", "rd_ord_a3"]);
});

test("recherche : rien hors de la communauté de l'admin, sauf pour l'owner", async () => {
  const other = await adminCall("GET", "/search?q=clara", ADMIN_A);
  assert.deepEqual((other.body as Record<string, any>).subscribers, []);
  assert.deepEqual((await adminCall("GET", "/search?q=rd_dev_b1", ADMIN_A) as { body: Record<string, any> }).body.devices, []);
  assert.deepEqual((await adminCall("GET", "/search?q=rd_ord_b", ADMIN_A) as { body: Record<string, any> }).body.orders, []);

  const owner = await adminCall("GET", "/search?q=clara", OWNER);
  assert.equal((owner.body as Record<string, any>).subscribers.length, 1);
});

test("recherche : finance cherche des commandes, jamais des abonnés", async () => {
  const res = await adminCall("GET", "/search?q=rd_ord_a1", FINANCE_A);
  assert.equal(res.status, 200, res.text);
  const body = res.body as Record<string, any>;
  assert.deepEqual(body.subscribers, []);
  assert.deepEqual(body.orders.map((o: { id: string }) => o.id), ["rd_ord_a1"]);
  assert.ok(!("amountXaf" in body.orders[0]), "la recherche ne donne jamais de montant");
});

test("recherche : jokers LIKE échappés, requête trop courte refusée", async () => {
  const wildcard = await adminCall("GET", "/search?q=%25%25", OWNER);
  assert.equal(wildcard.status, 200);
  assert.deepEqual((wildcard.body as Record<string, any>).subscribers, [], "% n'est pas un joker");

  const short = await adminCall("GET", "/search?q=a", ADMIN_A);
  assert.equal(short.status, 400, "deux caractères minimum");
});

/* ------------------------------------------------------------ migration */

test("migration 030 : index créés, rejouable sans effet", async () => {
  await migrateR3Indexes(db);
  await migrateR3Indexes(db);
  const rows = await db.query<{ indexname: string }>(
    "SELECT indexname FROM pg_indexes WHERE indexname IN ('users_community_created_idx', 'payouts_community_status_idx', 'offline_bundles_user_created_idx')",
  );
  assert.equal(rows.length, 3);
});
