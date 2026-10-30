/**
 * 106 : opérateurs de paiement (Orange Money, MTN MoMo) réglés par l'owner.
 *
 * Ce que ces tests prouvent :
 * - par défaut les deux sont disponibles : `checkout.url` est l'URL Fapshi
 *   directe et la page d'avis redirige (aucun avis) ;
 * - Orange coupé : page d'avis avec bouton vers Fapshi ; MTN coupé : message
 *   symétrique ; les deux coupés : page **sans** bouton ;
 * - seul l'owner modifie (community_admin -> 403, rien n'est écrit) ; un
 *   community_admin lit l'état ; support n'y a pas accès ;
 * - chaque changement écrit une ligne d'audit, une valeur identique n'en écrit pas ;
 * - l'état est relu à l'ouverture de la page, pas figé à la création de la commande ;
 * - tout le texte de la page est échappé.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

const { db, app, call, closeAll, seedApp } = await import("./support.js");
const { issueAccessToken, openAdminSession } = await import("../src/lib/auth.js");
const { planRevision } = await import("../src/services/payments.js");
const { noticeFor } = await import("../src/services/paymentOperators.js");

after(closeAll);

const seed = await seedApp({ priceXaf: 2500 });
const REVISION = planRevision({ code: "mensuel", price_xaf: 2500, duration_days: 30, device_limit: 1, active: true });

const ORANGE_MSG =
  "Orange Money est indisponible pour le moment. Choisissez MTN MoMo sur la page suivante, ou payez l&#39;administrateur de votre communauté.";
const MOMO_MSG =
  "MTN MoMo est indisponible pour le moment. Choisissez Orange Money sur la page suivante, ou payez l&#39;administrateur de votre communauté.";
const BOTH_MSG = "Les paiements en ligne sont indisponibles pour le moment. Payez l&#39;administrateur de votre communauté.";

/* ----------------------------------------------------------- administrateurs */

async function seedAdmin(id: string, options: { owner?: boolean; communityId?: string; role?: string } = {}): Promise<string> {
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active, must_change_password)
     VALUES ($1, $2, 'scrypt$16384$8$1$x$y', $3, 'partner', $4, true, false)`,
    [id, `${id}@operators.test`, `Admin ${id}`, options.owner ? "owner" : "none"],
  );
  if (options.communityId) {
    await db.query(
      `INSERT INTO community_memberships (id, admin_user_id, community_id, role, status)
       VALUES ($1, $2, $3, $4, 'active')`,
      [`mem_${id}`, id, options.communityId, options.role ?? "community_admin"],
    );
  }
  return (await openAdminSession(db, { adminId: id })).token;
}

const ownerToken = await seedAdmin("po_owner", { owner: true });
const adminToken = await seedAdmin("po_admin", { communityId: seed.communityId });
const supportToken = await seedAdmin("po_support", { communityId: seed.communityId, role: "support" });

function as(token: string) {
  return (method: string, url: string, payload?: unknown) =>
    call(method, url, { ...(payload === undefined ? {} : { payload }), headers: { authorization: `Bearer ${token}` } });
}
const asOwner = as(ownerToken);
const asAdmin = as(adminToken);
const asSupport = as(supportToken);

async function setOperator(operator: "orange" | "momo", available: boolean) {
  const res = await asOwner("PUT", `/v1/admin/payment-operators/${operator}`, { available });
  assert.equal(res.status, 200, res.text);
  return res.body;
}

/* ----------------------------------------------------------------- acheteur */

async function seedBuyer(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const userId = `usr_po_${suffix}`;
  const deviceId = `dev_po_${suffix}`;
  const sessionId = `ses_po_${suffix}`;
  await db.query(
    `INSERT INTO users (id, app_id, community_id, email, password_hash, name, email_verified_at)
     VALUES ($1, $2, $3, $4, 'scrypt$16384$8$1$x$y', 'Acheteur', now())`,
    [userId, seed.appId, seed.communityId, `${userId}@operators.test`],
  );
  await db.query(
    `INSERT INTO devices (id, user_id, installation_id, name, signing_key, agreement_key, device_token_hash, status)
     VALUES ($1, $2, $3, 'Pixel', 'sign', 'agree', $4, 'active')`,
    [deviceId, userId, `inst-${suffix}`, `hash-${suffix}`],
  );
  await db.query(
    `INSERT INTO auth_sessions (id, user_id, device_id, refresh_hash, expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '1 day')`,
    [sessionId, userId, deviceId, `refresh-${suffix}`],
  );
  return (await issueAccessToken({ userId, deviceId, communityId: seed.communityId, sessionId })).token;
}

const buyer = as(await seedBuyer());

async function newOrder(): Promise<{ orderId: string; checkoutUrl: string; paymentUrl: string }> {
  const res = await buyer("POST", "/v1/orders", { planId: seed.planId, planRevision: REVISION });
  assert.equal(res.status, 201, res.text);
  const orderId = String(res.body.orderId);
  return {
    orderId,
    checkoutUrl: String(res.body.checkout?.url),
    paymentUrl: String(await db.scalar("SELECT payment_url FROM orders WHERE id = $1", [orderId])),
  };
}

async function openNotice(orderId: string) {
  return app.inject({ method: "GET", url: `/pay/notice/${orderId}`, headers: { accept: "text/html" } });
}

async function auditCount(): Promise<number> {
  return Number(await db.scalar("SELECT count(*)::int FROM audit_log WHERE action = 'payment_operator.update'"));
}

const noticeUrlOf = (orderId: string) => `http://localhost:8080/pay/notice/${orderId}`;

/* -------------------------------------------------------------------- tests */

test("migration 106 : deux lignes disponibles, opérateur hors liste refusé", async () => {
  const applied = await db.scalar<number>("SELECT count(*)::int FROM schema_migrations WHERE id = '106_payment_operators'");
  assert.equal(Number(applied), 1);
  const rows = await db.query<Record<string, any>>("SELECT operator, available FROM payment_operators ORDER BY operator");
  assert.deepEqual(
    rows.map((r) => [r.operator, r.available]),
    [
      ["momo", true],
      ["orange", true],
    ],
  );
  await assert.rejects(db.query("INSERT INTO payment_operators (operator) VALUES ('wave')"), /payment_operators_operator_check|check constraint/i);
});

test("mode d'avis : fonction pure, quatre cas", () => {
  assert.equal(noticeFor({ orange: { available: true }, momo: { available: true } }), "direct");
  assert.equal(noticeFor({ orange: { available: false }, momo: { available: true } }), "orange_down");
  assert.equal(noticeFor({ orange: { available: true }, momo: { available: false } }), "momo_down");
  assert.equal(noticeFor({ orange: { available: false }, momo: { available: false } }), "both_down");
});

test("par défaut : checkout Fapshi direct, la page d'avis redirige sans avis", async () => {
  const state = await asOwner("GET", "/v1/admin/payment-operators");
  assert.equal(state.status, 200, state.text);
  assert.equal(state.body.mode, "direct");
  assert.equal(state.body.automaticDetection, false);
  assert.deepEqual(
    state.body.items.map((i: Record<string, unknown>) => [i.operator, i.available]),
    [
      ["orange", true],
      ["momo", true],
    ],
  );

  const order = await newOrder();
  assert.match(order.checkoutUrl, /^http:\/\/localhost:8080\/pay\/mock\/mock_/, "URL fournisseur directe");
  assert.equal(order.checkoutUrl, order.paymentUrl);

  const detail = await buyer("GET", `/v1/orders/${order.orderId}`);
  assert.equal(detail.body.checkout.url, order.paymentUrl);

  const page = await openNotice(order.orderId);
  assert.equal(page.statusCode, 302);
  assert.equal(page.headers.location, order.paymentUrl);
});

test("Orange coupé : page d'avis avec bouton vers Fapshi", async () => {
  await setOperator("orange", false);
  try {
    const order = await newOrder();
    assert.equal(order.checkoutUrl, noticeUrlOf(order.orderId), "l'app ouvre d'abord la page d'avis");

    const page = await openNotice(order.orderId);
    assert.equal(page.statusCode, 200, page.body);
    assert.match(String(page.headers["content-type"]), /text\/html/);
    assert.equal(page.headers["cache-control"], "no-store");
    assert.ok(page.body.includes(ORANGE_MSG), page.body);
    assert.ok(page.body.includes(`class="btn" href="${order.paymentUrl}"`), "bouton vers le lien de la commande");
    assert.equal(page.body.includes("MTN MoMo est indisponible"), false);
  } finally {
    await setOperator("orange", true);
  }
});

test("MTN coupé : message symétrique, bouton vers Fapshi", async () => {
  await setOperator("momo", false);
  try {
    const order = await newOrder();
    assert.equal(order.checkoutUrl, noticeUrlOf(order.orderId));
    const page = await openNotice(order.orderId);
    assert.equal(page.statusCode, 200, page.body);
    assert.ok(page.body.includes(MOMO_MSG), page.body);
    assert.ok(page.body.includes(`href="${order.paymentUrl}"`));
    assert.equal(page.body.includes("Orange Money est indisponible"), false);
  } finally {
    await setOperator("momo", true);
  }
});

test("les deux coupés : page d'avis sans bouton ni lien Fapshi", async () => {
  await setOperator("orange", false);
  await setOperator("momo", false);
  try {
    const state = await asOwner("GET", "/v1/admin/payment-operators");
    assert.equal(state.body.mode, "both_down");

    const order = await newOrder();
    assert.equal(order.checkoutUrl, noticeUrlOf(order.orderId));
    const page = await openNotice(order.orderId);
    assert.equal(page.statusCode, 200, page.body);
    assert.ok(page.body.includes(BOTH_MSG), page.body);
    assert.equal(page.body.includes('class="btn"'), false, "aucun bouton");
    assert.equal(page.body.includes(order.paymentUrl), false, "aucun lien vers le fournisseur");
    assert.equal(page.body.includes("/pay/mock/"), false);
  } finally {
    await setOperator("orange", true);
    await setOperator("momo", true);
  }
});

test("état relu à l'ouverture, pas figé à la création de la commande", async () => {
  await setOperator("orange", false);
  const order = await newOrder();
  assert.equal(order.checkoutUrl, noticeUrlOf(order.orderId));
  assert.ok((await openNotice(order.orderId)).body.includes(ORANGE_MSG));

  // Orange rétabli : la même page redirige directement, sans avis.
  await setOperator("orange", true);
  const direct = await openNotice(order.orderId);
  assert.equal(direct.statusCode, 302);
  assert.equal(direct.headers.location, order.paymentUrl);
  // La commande relue donne de nouveau l'URL directe.
  assert.equal((await buyer("GET", `/v1/orders/${order.orderId}`)).body.checkout.url, order.paymentUrl);

  // MTN coupé après coup : la même commande affiche le message MTN.
  await setOperator("momo", false);
  try {
    const page = await openNotice(order.orderId);
    assert.equal(page.statusCode, 200);
    assert.ok(page.body.includes(MOMO_MSG));
    assert.equal((await buyer("GET", `/v1/orders/${order.orderId}`)).body.checkout.url, noticeUrlOf(order.orderId));
    const list = await buyer("GET", "/v1/orders?limit=100");
    const listed = (list.body.items as Array<Record<string, any>>).find((i) => i.orderId === order.orderId);
    assert.equal(listed?.checkout?.url, noticeUrlOf(order.orderId), "la liste suit aussi le réglage");
  } finally {
    await setOperator("momo", true);
  }
});

test("seul l'owner modifie : community_admin lit mais reçoit 403 en écriture, support n'a pas accès", async () => {
  const before = await auditCount();

  const read = await asAdmin("GET", "/v1/admin/payment-operators");
  assert.equal(read.status, 200, read.text);
  assert.equal(read.body.canManage, false);
  assert.ok(read.body.items.every((i: Record<string, unknown>) => i.updatedByName === null), "l'auteur n'est montré qu'à l'owner");

  const denied = await asAdmin("PUT", "/v1/admin/payment-operators/orange", { available: false });
  assert.equal(denied.status, 403, denied.text);
  assert.equal(await db.scalar("SELECT available FROM payment_operators WHERE operator = 'orange'"), true, "rien n'est écrit");
  assert.equal(await auditCount(), before, "aucun audit sur un refus");

  assert.equal((await asSupport("GET", "/v1/admin/payment-operators")).status, 403);
  assert.equal((await asSupport("PUT", "/v1/admin/payment-operators/momo", { available: false })).status, 403);

  const owner = await asOwner("GET", "/v1/admin/payment-operators");
  assert.equal(owner.body.canManage, true);
});

test("validation : opérateur inconnu 404, corps invalide 400", async () => {
  assert.equal((await asOwner("PUT", "/v1/admin/payment-operators/wave", { available: false })).status, 404);
  assert.equal((await asOwner("PUT", "/v1/admin/payment-operators/orange", { available: "non" })).status, 400);
  assert.equal((await asOwner("PUT", "/v1/admin/payment-operators/orange", { available: false, extra: 1 })).status, 400);
});

test("audit : une ligne par changement, aucune pour une valeur identique", async () => {
  const before = await auditCount();

  const off = await setOperator("orange", false);
  assert.equal(off.changed, true);
  assert.equal(off.mode, "orange_down");
  const orange = (off.items as Array<Record<string, any>>).find((i) => i.operator === "orange");
  assert.equal(orange?.available, false);
  assert.equal(orange?.updatedByName, "Admin po_owner");
  assert.ok(orange?.updatedAt);

  const again = await setOperator("orange", false);
  assert.equal(again.changed, false, "même valeur : pas de changement");
  assert.equal(await auditCount(), before + 1);

  const row = await db.one<Record<string, any>>(
    `SELECT actor_id, actor_role, target, target_type, target_id, before_state, after_state
       FROM audit_log WHERE action = 'payment_operator.update' AND target_id = 'orange'
      ORDER BY created_at DESC LIMIT 1`,
  );
  assert.equal(row?.actor_id, "po_owner");
  assert.equal(row?.actor_role, "owner");
  assert.equal(row?.target, "payment_operator:orange");
  assert.deepEqual(row?.before_state, { available: true });
  assert.deepEqual(row?.after_state, { available: false, mode: "orange_down" });
  assert.equal(await db.scalar("SELECT updated_by FROM payment_operators WHERE operator = 'orange'"), "po_owner");

  await setOperator("orange", true);
  assert.equal(await auditCount(), before + 2);
});

test("page d'avis : texte échappé, commande payée sans bouton, commande inconnue 404", async () => {
  await setOperator("orange", false);
  try {
    const order = await newOrder();
    const hostile = `https://pay.example/x?a=1&b="><script>alert(1)</script>`;
    await db.query("UPDATE orders SET payment_url = $2 WHERE id = $1", [order.orderId, hostile]);
    const page = await openNotice(order.orderId);
    assert.equal(page.statusCode, 200);
    assert.equal(page.body.includes("<script>"), false, "aucune balise injectée");
    assert.ok(page.body.includes("a=1&amp;b=&quot;&gt;&lt;script&gt;"), page.body);

    const paid = await newOrder();
    await db.query("UPDATE orders SET status = 'paid', paid_at = now() WHERE id = $1", [paid.orderId]);
    const done = await openNotice(paid.orderId);
    assert.equal(done.statusCode, 200);
    assert.equal(done.body.includes('class="btn"'), false, "plus rien à payer");
    assert.equal(done.body.includes(paid.paymentUrl), false);

    assert.equal((await openNotice("ord_inconnue")).statusCode, 404);
  } finally {
    await setOperator("orange", true);
  }
});
