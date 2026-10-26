/**
 * Commandes, paiements, commissions.
 *
 * Rien n'est mocké au niveau HTTP : on utilise le vrai `buildApp`, la vraie
 * base PGlite en mémoire et le vrai fournisseur `mock`. Le seul état simulé est
 * celui de `services/mockPayments`, qui joue le rôle de Fapshi : c'est lui qui
 * décide du statut *côté fournisseur*, exactement comme le fera l'API réelle.
 *
 * Les variables d'environnement sont posées avant les imports dynamiques :
 * `config.ts` lit `process.env` à l'évaluation du module.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "memory://";
process.env.MASTER_KEY = Buffer.alloc(32, 5).toString("base64");
process.env.PAYMENT_PROVIDER = "mock";
process.env.PUBLIC_BASE_URL = "http://localhost:8080";

const { createDb } = await import("../src/db.js");
const { buildApp } = await import("../src/app.js");
const { issueAccessToken } = await import("../src/lib/auth.js");
const { env } = await import("../src/config.js");
const { setMockPaymentStatus, getMockPaymentStatus } = await import("../src/services/mockPayments.js");
const { planRevision, refundOrder, commissionFor, toOrderDto } = await import("../src/services/payments.js");

const db = await createDb();
const app = await buildApp({ db });

after(async () => {
  await app.close();
  await db.close();
});

/* ------------------------------------------------------------------ graine */

const COMMUNITY = "com_test";
const APP = "app_test";
const USER = "usr_test";
const DEVICE = "dev_test";
const SESSION = "ses_test";
const PLAN = "plan_mensuel";

await db.query("INSERT INTO communities (id, name, slug, commission_bps) VALUES ($1, $2, $3, $4)", [
  COMMUNITY,
  "Communauté test",
  "com-test",
  2000,
]);
await db.query(
  "INSERT INTO apps (id, community_id, slug, name, package_name) VALUES ($1, $2, $3, $4, $5)",
  [APP, COMMUNITY, "app-test", "App test", "com.example.test"],
);
await db.query(
  `INSERT INTO users (id, app_id, community_id, email, password_hash, name, email_verified_at)
   VALUES ($1, $2, $3, $4, $5, $6, now())`,
  [USER, APP, COMMUNITY, "acheteur@example.com", "scrypt$16384$8$1$x$y", "Acheteur Test"],
);
await db.query(
  `INSERT INTO devices (id, user_id, installation_id, name, signing_key, agreement_key, device_token_hash, status)
   VALUES ($1, $2, $3, $4, $5, $6, $7, 'active')`,
  [DEVICE, USER, "install-test", "Pixel test", "sign", "agree", "device-token-hash"],
);
await db.query(
  `INSERT INTO auth_sessions (id, user_id, device_id, refresh_hash, expires_at)
   VALUES ($1, $2, $3, $4, now() + interval '1 day')`,
  [SESSION, USER, DEVICE, "refresh-hash-test"],
);
await db.query(
  `INSERT INTO plans (id, app_id, code, name, description, price_xaf, duration_days, device_limit, active)
   VALUES ($1, $2, $3, $4, '', $5, $6, $7, true)`,
  [PLAN, APP, "mensuel", "Mensuel", 2000, 30, 1],
);

const { token } = await issueAccessToken({
  userId: USER,
  deviceId: DEVICE,
  communityId: COMMUNITY,
  sessionId: SESSION,
});

const planRow = {
  code: "mensuel",
  price_xaf: 2000,
  duration_days: 30,
  device_limit: 1,
  active: true,
};
const REVISION = planRevision(planRow);

/* ------------------------------------------------------------------ helpers */

interface Reply {
  status: number;
  body: Record<string, any>;
  text: string;
}

async function api(method: string, url: string, payload?: unknown): Promise<Reply> {
  const res = await app.inject({
    method: method as never,
    url,
    headers: { authorization: `Bearer ${token}` },
    ...(payload === undefined ? {} : { payload: payload as never }),
  });
  let body: Record<string, unknown> = {};
  try {
    body = res.json() as Record<string, unknown>;
  } catch {
    body = {};
  }
  return { status: res.statusCode, body, text: res.body };
}

/** Le webhook utilise son secret fournisseur, distinct des sessions utilisateur. */
async function webhook(payload: Record<string, unknown>): Promise<Reply> {
  const res = await app.inject({ method: "POST", url: "/v1/payments/webhook/mock", payload });
  let body: Record<string, unknown> = {};
  try {
    body = res.json() as Record<string, unknown>;
  } catch {
    body = {};
  }
  return { status: res.statusCode, body, text: res.body };
}

test("webhook : secret fournisseur exigé dès qu'il est configuré", async () => {
  const previous = env.fapshi.webhookSecret;
  env.fapshi.webhookSecret = "mock-webhook-secret";
  try {
    const denied = await app.inject({
      method: "POST",
      url: "/v1/payments/webhook/mock",
      payload: { transId: "mock_unknown" },
    });
    assert.equal(denied.statusCode, 401);

    const wrong = await app.inject({
      method: "POST",
      url: "/v1/payments/webhook/mock",
      headers: { "x-webhook-secret": "wrong-secret" },
      payload: { transId: "mock_unknown" },
    });
    assert.equal(wrong.statusCode, 401);

    const authorized = await app.inject({
      method: "POST",
      url: "/v1/payments/webhook/mock",
      headers: { "x-webhook-secret": "mock-webhook-secret" },
      payload: { transId: "mock_unknown" },
    });
    assert.equal(authorized.statusCode, 404, authorized.body);

    // Fapshi n'envoie pas d'en-tête : le secret peut venir de l'URL déclarée.
    const byQuery = await app.inject({
      method: "POST",
      url: "/v1/payments/webhook/mock?key=mock-webhook-secret",
      payload: { transId: "mock_unknown" },
    });
    assert.equal(byQuery.statusCode, 404, byQuery.body);
    const wrongQuery = await app.inject({
      method: "POST",
      url: "/v1/payments/webhook/mock?key=wrong-secret",
      payload: { transId: "mock_unknown" },
    });
    assert.equal(wrongQuery.statusCode, 401);
  } finally {
    env.fapshi.webhookSecret = previous;
  }
});

async function newOrder(): Promise<{ orderId: string; providerRef: string; checkoutUrl: string; amount: number }> {
  const res = await api("POST", "/v1/orders", { planId: PLAN, planRevision: REVISION });
  assert.equal(res.status, 201, `création attendue en 201, reçu ${res.status} : ${res.text}`);
  return {
    orderId: String(res.body.orderId),
    providerRef: String(await db.scalar("SELECT provider_ref FROM orders WHERE id = $1", [res.body.orderId])),
    checkoutUrl: String(res.body.checkout.url),
    amount: Number(res.body.price.amount),
  };
}

/** Statut côté « Fapshi » : c'est la seule source de vérité pour l'API. */
async function providerSays(orderId: string, status: "pending" | "paid" | "failed"): Promise<string> {
  const ref = String(await db.scalar("SELECT provider_ref FROM orders WHERE id = $1", [orderId]));
  setMockPaymentStatus(ref, status);
  return ref;
}

async function orderRow(orderId: string): Promise<Record<string, any>> {
  const row = await db.one<Record<string, any>>("SELECT * FROM orders WHERE id = $1", [orderId]);
  assert.ok(row, "commande absente");
  return row;
}

async function count(table: string, orderId: string): Promise<number> {
  return Number(await db.scalar(`SELECT count(*)::int FROM ${table} WHERE order_id = $1`, [orderId]));
}

/* -------------------------------------------------------------------- tests */

test("la commande est créée avec le prix du serveur et une URL de paiement", async () => {
  const created = await newOrder();
  assert.equal(created.amount, 2000, "le prix vient de plans.price_xaf");
  assert.match(created.checkoutUrl, /^http:\/\/localhost:8080\/pay\/mock\/mock_/);

  const row = await orderRow(created.orderId);
  assert.equal(Number(row.amount_xaf), 2000);
  assert.equal(row.status, "pending");
  assert.equal(Number(row.commission_bps), 2000, "le taux est figé sur la commande");
  assert.equal(Number(row.commission_xaf), 400, "20 % de 2000");
  assert.equal(row.provider, "mock");
});

test("un montant envoyé par le client est refusé par le schéma strict", async () => {
  const res = await api("POST", "/v1/orders", { planId: PLAN, planRevision: REVISION, amount: 1 });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "VALIDATION_FAILED");
  // `strict()` produit une issue sans chemin (clé inconnue) : le détail est
  // rangé sous `_`, comme dans routes/internal.ts.
  assert.match(JSON.stringify(res.body.error.details), /amount|Unrecognized/i);
});

test("une révision de prix périmée renvoie 409 et ne crée rien", async () => {
  const before = Number(await db.scalar("SELECT count(*)::int FROM orders"));
  const res = await api("POST", "/v1/orders", { planId: PLAN, planRevision: REVISION + 1 });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.details.reason, "PLAN_CHANGED");
  assert.equal(Number(await db.scalar("SELECT count(*)::int FROM orders")), before);
});

test("page mock : le bouton change le statut fournisseur, puis la commande suit", async () => {
  const order = await newOrder();
  const path = new URL(order.checkoutUrl).pathname;

  const page = await app.inject({ method: "GET", url: path });
  assert.equal(page.statusCode, 200);
  assert.match(page.headers["content-type"] as string, /text\/html/);
  assert.match(page.body, /Paiement simulé/);

  const confirm = await app.inject({
    method: "POST",
    url: `${path}/confirm`,
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: "outcome=paid",
  });
  assert.equal(confirm.statusCode, 200);
  assert.equal(getMockPaymentStatus(order.providerRef), "paid");

  // Sans `refresh`, la route ne dérange pas le fournisseur.
  const plain = await api("GET", `/v1/orders/${order.orderId}`);
  assert.equal(plain.body.status, "pending");

  const refreshed = await api("GET", `/v1/orders/${order.orderId}?refresh=1`);
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.body.status, "paid");
  assert.equal(refreshed.body.activationStatus, "active");
  assert.equal(refreshed.body.checkout, undefined, "plus d'URL de paiement après encaissement");
});

test("un webhook qui annonce « paid » alors que le fournisseur dit « pending » n'active rien", async () => {
  const order = await newOrder();
  const res = await webhook({ transId: order.providerRef, status: "SUCCESSFUL", amount: 2000 });
  assert.equal(res.status, 200);
  assert.equal(res.body.activationStatus, "not_started", "le corps n'est pas une preuve");

  const row = await orderRow(order.orderId);
  assert.equal(row.status, "pending");
  assert.equal(await count("subscriptions", order.orderId), 0);
  assert.equal(await count("commissions", order.orderId), 0);
});

test("webhook rejoué deux fois : une seule activation, une seule commission", async () => {
  const order = await newOrder();
  await providerSays(order.orderId, "paid");
  const eventId = `evt_${order.orderId}`;

  const first = await webhook({ eventId, transId: order.providerRef, status: "SUCCESSFUL", amount: 2000 });
  assert.equal(first.status, 200);
  assert.equal(first.body.activated, true);
  assert.equal(first.body.activationStatus, "active");

  const second = await webhook({ eventId, transId: order.providerRef, status: "SUCCESSFUL", amount: 2000 });
  assert.equal(second.status, 200);
  assert.equal(second.body.duplicate, true);
  assert.equal(second.body.activated, false);

  // Même sans eventId identique, l'état est déjà terminal : rien ne double.
  const third = await webhook({ transId: order.providerRef, status: "SUCCESSFUL", amount: 2000 });
  assert.equal(third.status, 200);
  assert.equal(third.body.activated, false);

  assert.equal(await count("subscriptions", order.orderId), 1, "un seul abonnement");
  assert.equal(await count("commissions", order.orderId), 1, "une seule commission");

  const row = await orderRow(order.orderId);
  assert.equal(row.status, "paid");
  assert.ok(row.activated_at);
});

test("un montant falsifié est rejeté et laisse la commande intacte", async () => {
  const order = await newOrder();
  await providerSays(order.orderId, "paid");

  const res = await webhook({ transId: order.providerRef, status: "SUCCESSFUL", amount: 1 });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.details.reason, "AMOUNT_MISMATCH");

  const row = await orderRow(order.orderId);
  assert.equal(row.status, "pending");
  assert.equal(await count("subscriptions", order.orderId), 0);

  // La même transaction, montant correct : elle passe.
  const ok = await webhook({ transId: order.providerRef, status: "SUCCESSFUL", amount: 2000 });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.activationStatus, "active");
});

test("la commission utilise le taux figé à l'achat, pas le taux courant", async () => {
  const order = await newOrder();
  // Le community_admin change son taux APRÈS la commande : l'historique ne
  // doit pas bouger.
  await db.query("UPDATE communities SET commission_bps = 3000 WHERE id = $1", [COMMUNITY]);
  try {
    await providerSays(order.orderId, "paid");
    await webhook({ transId: order.providerRef, status: "SUCCESSFUL", amount: 2000 });

    const commission = await db.one<Record<string, any>>(
      "SELECT bps, amount_xaf, status FROM commissions WHERE order_id = $1",
      [order.orderId],
    );
    assert.ok(commission);
    assert.equal(Number(commission.bps), 2000, "taux de la commande");
    assert.equal(Number(commission.amount_xaf), 400);
    assert.equal(commission.status, "available");
    assert.equal(commissionFor(2000, 2000), 400);
  } finally {
    await db.query("UPDATE communities SET commission_bps = 2000 WHERE id = $1", [COMMUNITY]);
  }
});

test("la commission est plafonnée à 30 % et arrondie vers le bas", async () => {
  // D35 : même si un taux supérieur arrivait par une autre voie, le calcul
  // s'arrête à 3000 bps.
  assert.equal(commissionFor(10_000, 3000), 3000);
  assert.equal(commissionFor(10_000, 5000), 3000);
  assert.equal(commissionFor(1999, 3000), 599); // floor(599,7)

  // La base refuse un taux hors enveloppe, même en SQL direct.
  await assert.rejects(
    db.query("UPDATE communities SET commission_bps = 3001 WHERE id = $1", [COMMUNITY]),
    /communities_commission_bps_range|check constraint/i,
  );
});

test("le remboursement annule la commission sans solde négatif", async () => {
  const order = await newOrder();
  await providerSays(order.orderId, "paid");
  await webhook({ transId: order.providerRef, status: "SUCCESSFUL", amount: 2000 });

  const refund = await refundOrder(db, order.orderId, { reason: "demande_client" });
  assert.equal(refund.changed, true);
  assert.equal(refund.status, "refunded");
  assert.equal(refund.commissionReversedXaf, 400);
  assert.equal(refund.subscriptionCanceled, true);

  const row = await orderRow(order.orderId);
  assert.equal(row.status, "refunded");

  const commission = await db.one<Record<string, any>>(
    "SELECT amount_xaf, status FROM commissions WHERE order_id = $1",
    [order.orderId],
  );
  assert.equal(commission?.status, "reversed");
  assert.equal(Number(commission?.amount_xaf), 400, "le montant reste positif, seul le statut change");

  const sub = await db.one<Record<string, any>>("SELECT status FROM subscriptions WHERE order_id = $1", [order.orderId]);
  assert.equal(sub?.status, "canceled");

  const dto = toOrderDto((await db.one<Record<string, any>>(
    `SELECT o.*, p.code AS plan_code, p.name AS plan_name, p.duration_days, p.device_limit,
            p.price_xaf AS plan_price, p.active AS plan_active
       FROM orders o JOIN plans p ON p.id = o.plan_id WHERE o.id = $1`,
    [order.orderId],
  )) as never);
  assert.equal(dto.activationStatus, "revoked");
  assert.equal(dto.checkout, undefined);

  // Rejouer un remboursement ne crée pas un second mouvement d'argent.
  const again = await refundOrder(db, order.orderId);
  assert.equal(again.changed, false);
  assert.equal(again.commissionReversedXaf, 0);
});

test("payé mais non activé : activationStatus pending, jamais de nouveau paiement", async () => {
  const order = await newOrder();
  await providerSays(order.orderId, "paid");
  await webhook({ transId: order.providerRef, status: "SUCCESSFUL", amount: 2000 });

  // On simule une activation perdue entre les deux transactions.
  await db.query("DELETE FROM subscriptions WHERE order_id = $1", [order.orderId]);
  await db.query("UPDATE orders SET activated_at = NULL WHERE id = $1", [order.orderId]);

  const res = await api("GET", `/v1/orders/${order.orderId}`);
  assert.equal(res.body.status, "paid");
  assert.equal(res.body.activationStatus, "pending");
  assert.equal(res.body.checkout, undefined, "aucun chemin de retour vers un paiement");

  // La reprise réactive, une seule fois.
  const resumed = await api("GET", `/v1/orders/${order.orderId}?refresh=1`);
  assert.equal(resumed.body.activationStatus, "active");
  assert.equal(await count("subscriptions", order.orderId), 1);
});

test("historique : ordre décroissant, curseur opaque, commande d'autrui invisible", async () => {
  const first = await newOrder();
  const second = await newOrder();

  const page = await api("GET", "/v1/orders?limit=1");
  assert.equal(page.status, 200);
  assert.equal((page.body.items as unknown[]).length, 1);
  assert.equal(page.body.items[0].orderId, second.orderId);
  assert.ok(page.body.nextCursor, "une suite existe");

  const next = await api("GET", `/v1/orders?limit=1&cursor=${encodeURIComponent(page.body.nextCursor)}`);
  assert.equal(next.body.items[0].orderId, first.orderId);

  const badCursor = await api("GET", "/v1/orders?cursor=pas-un-curseur");
  assert.equal(badCursor.status, 400);

  // Commande appartenant à un autre compte.
  await db.query("INSERT INTO users (id, app_id, community_id, email, password_hash, name) VALUES ($1, $2, $3, $4, $5, $6)", [
    "usr_autre",
    APP,
    COMMUNITY,
    "autre@example.com",
    "scrypt$16384$8$1$x$y",
    "Autre",
  ]);
  await db.query(
    `INSERT INTO orders (id, user_id, app_id, plan_id, community_id, amount_xaf, status, provider)
     VALUES ('ord_autre', 'usr_autre', $1, $2, $3, 2000, 'pending', 'mock')`,
    [APP, PLAN, COMMUNITY],
  );
  const foreign = await api("GET", "/v1/orders/ord_autre");
  assert.equal(foreign.status, 404);
  assert.equal(foreign.body.error.code, "NOT_FOUND");
});

test("webhook pour une référence inconnue : 404, aucune ligne inventée", async () => {
  const before = Number(await db.scalar("SELECT count(*)::int FROM orders"));
  const res = await webhook({ transId: "mock_inconnu", status: "SUCCESSFUL", amount: 2000 });
  assert.equal(res.status, 404);
  assert.equal(Number(await db.scalar("SELECT count(*)::int FROM orders")), before);
});

test("un webhook « failed » ne dégrade pas une commande déjà payée", async () => {
  const order = await newOrder();
  await providerSays(order.orderId, "paid");
  await webhook({ transId: order.providerRef, status: "SUCCESSFUL", amount: 2000 });

  await providerSays(order.orderId, "failed");
  const res = await webhook({ transId: order.providerRef, status: "FAILED", amount: 2000 });
  assert.equal(res.status, 200);

  const row = await orderRow(order.orderId);
  assert.equal(row.status, "paid", "l'argent encaissé ne redevient pas « échoué »");
});

test("un paiement tardif sur une commande échouée est signalé, pas activé", async () => {
  const order = await newOrder();
  await providerSays(order.orderId, "failed");
  const failed = await webhook({ transId: order.providerRef, status: "FAILED", amount: 2000 });
  assert.equal(failed.status, 200);
  assert.equal((await orderRow(order.orderId)).status, "failed");

  // L'argent arrive après coup : on ne devine pas si l'utilisateur a racheté.
  await providerSays(order.orderId, "paid");
  const late = await webhook({ transId: order.providerRef, status: "SUCCESSFUL", amount: 2000 });
  assert.equal(late.status, 200);

  const row = await orderRow(order.orderId);
  assert.equal(row.status, "failed", "aucune activation automatique");
  assert.equal(row.failure_reason, "late_payment_requires_reconciliation");
  assert.equal(await count("subscriptions", order.orderId), 0);
});

test("les routes de paiement ne fuient ni secret ni HTML non échappé", async () => {
  const order = await newOrder();
  const path = new URL(order.checkoutUrl).pathname;

  const bad = await app.inject({ method: "GET", url: "/pay/mock/%3Cscript%3Ealert(1)%3C%2Fscript%3E" });
  assert.equal(bad.statusCode, 404, "une référence hors format n'est pas rendue");

  const ok = await app.inject({ method: "GET", url: path });
  assert.ok(!ok.body.includes(order.providerRef) || ok.body.includes(escapeForTest(order.providerRef)));
  assert.ok(!ok.body.includes("FAPSHI_API_KEY"));
  assert.ok(!ok.body.includes("apikey"));

  // La page n'existe que pour le fournisseur mock (config de ce test).
  const foreignProvider = await app.inject({
    method: "POST",
    url: "/v1/payments/webhook/fapshi",
    payload: { transId: "x" },
  });
  assert.equal(foreignProvider.statusCode, 404);
});

function escapeForTest(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
