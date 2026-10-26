/**
 * D127 : forfait sur mesure (Go et jours choisis par l'abonné).
 *
 * Vrais `buildApp`, base PGlite en mémoire, fournisseur `mock`. On vérifie la
 * formule, les bornes, le plancher, le devis public, la commande (montant
 * serveur, quota et durée figés) et l'activation (échéance = jours choisis).
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "memory://";
process.env.MASTER_KEY = Buffer.alloc(32, 9).toString("base64");
process.env.JWT_SECRET = "test-secret-test-secret-test-secret";
process.env.PAYMENT_PROVIDER = "mock";
process.env.PUBLIC_BASE_URL = "http://localhost:8080";

const { createDb } = await import("../src/db.js");
const { buildApp } = await import("../src/app.js");
const { openAdminSession } = await import("../src/lib/auth.js");
const { activateOrder, createOrder } = await import("../src/services/payments.js");
const { customPriceXaf, pricePerGbAt } = await import("../src/services/customOffer.js");

const db = await createDb();
const app = await buildApp({ db });

after(async () => {
  await app.close();
  await db.close();
});

const COMMUNITY = "com_cu";
const APP = "app_cu";
const OTHER_APP = "app_cu_other";
const OWNER = "adm_cu_owner";
const CA = "adm_cu_ca";
const SUPPORT = "adm_cu_sup";
const HASH = "scrypt$16384$8$1$x$y";

await db.query("INSERT INTO communities (id, name, slug, commission_bps) VALUES ($1, 'Cu', 'cu', 2000)", [COMMUNITY]);
await db.query("INSERT INTO communities (id, name, slug, commission_bps) VALUES ('com_cu2', 'Cu2', 'cu2', 0)");
await db.query(
  "INSERT INTO apps (id, community_id, slug, name, package_name) VALUES ($1, $2, 'app-cu', 'App Cu', 'com.example.cu')",
  [APP, COMMUNITY],
);
await db.query(
  "INSERT INTO apps (id, community_id, slug, name, package_name) VALUES ($1, 'com_cu2', 'app-cu2', 'App Cu2', 'com.example.cu2')",
  [OTHER_APP],
);
for (const [id, role] of [
  [OWNER, "owner"],
  [CA, "none"],
  [SUPPORT, "none"],
] as const) {
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active, must_change_password)
     VALUES ($1, $2, $3, $1, 'partner', $4, true, false)`,
    [id, `${id}@cu.test`, HASH, role],
  );
}
await db.query(
  `INSERT INTO community_memberships (id, admin_user_id, community_id, role, status)
   VALUES ('mem_cu_ca', $1, $2, 'community_admin', 'active'), ('mem_cu_sup', $3, $2, 'support', 'active')`,
  [CA, COMMUNITY, SUPPORT],
);
const ownerToken = (await openAdminSession(db, { adminId: OWNER })).token;
const caToken = (await openAdminSession(db, { adminId: CA })).token;
const supportToken = (await openAdminSession(db, { adminId: SUPPORT })).token;

await db.query(
  `INSERT INTO users (id, app_id, community_id, email, password_hash, name, email_verified_at)
   VALUES ('usr_cu', $1, $2, 'buyer@cu.test', $3, 'Acheteur', now())`,
  [APP, COMMUNITY, HASH],
);

async function call(method: string, url: string, token: string | null, payload?: unknown) {
  const res = await app.inject({
    method: method as never,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    ...(payload === undefined ? {} : { payload: payload as never }),
  });
  let body: Record<string, any> = {};
  try {
    body = res.json() as Record<string, any>;
  } catch {
    body = {};
  }
  return { status: res.statusCode, body };
}

const TERMS = {
  pricePerGb1dXaf: 200,
  pricePerGb30dXaf: 490,
  minGb: 1,
  maxGb: 50,
  stepGb: 1,
  minDays: 1,
  maxDays: 30,
};

const OFFER = {
  active: true,
  deviceLimit: 2,
  terms: TERMS,
  nightOptions: [{ window: "20-24", priceXaf: 300 }],
};

test("formule : droite entre 1 et 30 jours, arrondi au multiple de 50 supérieur", () => {
  assert.equal(pricePerGbAt(TERMS, 1), 200);
  assert.equal(pricePerGbAt(TERMS, 30), 490);
  assert.equal(pricePerGbAt(TERMS, 15.5), 345);
  // 1 Go, 1 jour : 200 ; 3 Go à 30 jours : 1470 → 1500.
  assert.equal(customPriceXaf(TERMS, { gb: 1, days: 1 }), 200);
  assert.equal(customPriceXaf(TERMS, { gb: 3, days: 30 }), 1500);
  // 10 Go à 7 jours : prix/Go = 200 + 290 × 6/29 = 260 → 2600 exactement, sans arrondi parasite.
  assert.equal(customPriceXaf(TERMS, { gb: 10, days: 7 }), 2600);
});

test("admin : support ne peut pas régler l'offre, l'admin de communauté oui", async () => {
  const denied = await call("PUT", `/v1/admin/apps/${APP}/custom-offer`, supportToken, OFFER);
  assert.equal(denied.status, 403);

  const empty = await call("GET", `/v1/admin/apps/${APP}/custom-offer`, caToken);
  assert.equal(empty.status, 200);
  assert.equal(empty.body.offer, null);

  const saved = await call("PUT", `/v1/admin/apps/${APP}/custom-offer`, caToken, OFFER);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(saved.body.offer.terms, TERMS);
  assert.equal(saved.body.offer.fromXaf, 200);
  assert.equal(saved.body.offer.deviceLimit, 2);

  // Une seconde écriture remplace, ne duplique pas.
  const again = await call("PUT", `/v1/admin/apps/${APP}/custom-offer`, caToken, { ...OFFER, deviceLimit: 3 });
  assert.equal(again.status, 200);
  assert.equal(again.body.offer.planId, saved.body.offer.planId);
  const count = await db.scalar("SELECT count(*)::int FROM plans WHERE app_id = $1 AND family = 'custom'", [APP]);
  assert.equal(Number(count), 1);
});

test("admin : bornes incohérentes refusées", async () => {
  const bad = await call("PUT", `/v1/admin/apps/${APP}/custom-offer`, caToken, {
    ...OFFER,
    terms: { ...TERMS, minGb: 10, maxGb: 5 },
  });
  assert.equal(bad.status, 400);
  const step = await call("PUT", `/v1/admin/apps/${APP}/custom-offer`, caToken, {
    ...OFFER,
    terms: { ...TERMS, minGb: 1, maxGb: 10, stepGb: 4 },
  });
  assert.equal(step.status, 400);
});

test("admin : plancher owner appliqué au Go le moins cher", async () => {
  const put = await call("PUT", "/v1/admin/pricing", ownerToken, {
    costPerGbXaf: 250,
    nightWindowCostXaf: { "20-24": null, "24-04": null, "20-04": null },
    platformMarginBps: 0,
    maxCommissionBps: null,
  });
  assert.equal(put.status, 200);
  const below = await call("PUT", `/v1/admin/apps/${APP}/custom-offer`, caToken, OFFER);
  assert.equal(below.status, 409);
  assert.equal(below.body.error?.details?.reason ?? below.body.details?.reason, "BELOW_FLOOR");
  // On remet le plancher sous l'offre pour la suite.
  await call("PUT", "/v1/admin/pricing", ownerToken, {
    costPerGbXaf: 100,
    nightWindowCostXaf: { "20-24": null, "24-04": null, "20-04": null },
    platformMarginBps: 0,
    maxCommissionBps: null,
  });
});

test("catalogue et devis publics", async () => {
  const catalog = await call("GET", `/v1/apps/${APP}/plans`, null);
  assert.equal(catalog.status, 200);
  const item = (catalog.body.items as Record<string, any>[]).find((p) => p.family === "custom");
  assert.ok(item, "offre sur mesure absente du catalogue");
  assert.equal(item.custom.pricePerGb1dXaf, 200);
  assert.deepEqual(item.custom.formula, { shortDays: 1, longDays: 30, roundXaf: 50 });
  assert.deepEqual(item.nightOptions, [{ window: "20-24", priceXaf: 300 }]);

  const quote = await call("GET", `/v1/apps/${APP}/plans/${item.id}/quote?gb=10&days=7&nightWindow=20-24`, null);
  assert.equal(quote.status, 200, JSON.stringify(quote.body));
  assert.deepEqual(
    { base: quote.body.baseXaf, night: quote.body.nightXaf, total: quote.body.totalXaf },
    { base: 2600, night: 300, total: 2900 },
  );

  const outOfRange = await call("GET", `/v1/apps/${APP}/plans/${item.id}/quote?gb=51&days=7`, null);
  assert.equal(outOfRange.status, 400);
  const otherApp = await call("GET", `/v1/apps/${OTHER_APP}/plans/${item.id}/quote?gb=1&days=1`, null);
  assert.equal(otherApp.status, 404);
});

test("commande : montant serveur, quota et durée figés, activation sur les jours choisis", async () => {
  const catalog = await call("GET", `/v1/apps/${APP}/plans`, null);
  const item = (catalog.body.items as Record<string, any>[]).find((p) => p.family === "custom")!;

  await assert.rejects(
    createOrder(db, { userId: "usr_cu", planId: item.id, planRevision: item.revision }),
    (err: any) => err.status === 400,
    "choix manquant",
  );
  await assert.rejects(
    createOrder(db, { userId: "usr_cu", planId: item.id, planRevision: item.revision, custom: { gb: 0, days: 1 } }),
    (err: any) => err.status === 400,
  );

  const created = await createOrder(db, {
    userId: "usr_cu",
    planId: item.id,
    planRevision: item.revision,
    nightWindow: "20-24",
    custom: { gb: 10, days: 7 },
  });
  assert.equal(created.order.price.amount, 2900);
  assert.deepEqual(created.order.custom, { gb: 10, days: 7 });
  const row = await db.one<Record<string, any>>("SELECT quota_bytes, duration_days, commission_xaf FROM orders WHERE id = $1", [
    created.raw.orderId,
  ]);
  assert.equal(Number(row!.quota_bytes), 10_000_000_000);
  assert.equal(Number(row!.duration_days), 7);
  assert.equal(Number(row!.commission_xaf), 580);

  await db.query("UPDATE orders SET status = 'paid', paid_at = now() WHERE id = $1", [created.raw.orderId]);
  assert.equal(await activateOrder(db, created.raw.orderId), true);
  const sub = await db.one<Record<string, any>>(
    "SELECT quota_bytes, night_window, starts_at, ends_at FROM subscriptions WHERE order_id = $1",
    [created.raw.orderId],
  );
  assert.equal(Number(sub!.quota_bytes), 10_000_000_000);
  assert.equal(sub!.night_window, "20-24");
  const days = (new Date(sub!.ends_at).getTime() - new Date(sub!.starts_at).getTime()) / 86_400_000;
  assert.equal(Math.round(days), 7);
});

test("un forfait classique refuse un choix sur mesure ; PATCH ne touche pas aux prix de l'offre", async () => {
  await db.query(
    `INSERT INTO plans (id, app_id, code, name, description, price_xaf, duration_days, device_limit, active, family)
     VALUES ('plan_cu_classic', $1, 'classique', 'Classique', '', 1000, 30, 1, true, 'limited')`,
    [APP],
  );
  const catalog = await call("GET", `/v1/apps/${APP}/plans`, null);
  const classic = (catalog.body.items as Record<string, any>[]).find((p) => p.id === "plan_cu_classic")!;
  assert.equal(classic.custom, null);
  await assert.rejects(
    createOrder(db, { userId: "usr_cu", planId: classic.id, planRevision: classic.revision, custom: { gb: 1, days: 1 } }),
    (err: any) => err.status === 400,
  );

  const custom = (catalog.body.items as Record<string, any>[]).find((p) => p.family === "custom")!;
  const priceChange = await call("PATCH", `/v1/admin/plans/${custom.id}`, caToken, { priceXaf: 5000 });
  assert.equal(priceChange.status, 409);
  const rename = await call("PATCH", `/v1/admin/plans/${custom.id}`, caToken, { name: "Mon forfait" });
  assert.equal(rename.status, 200, JSON.stringify(rename.body));
  assert.equal(rename.body.family, "custom");
  const family = await db.scalar("SELECT family FROM plans WHERE id = $1", [custom.id]);
  assert.equal(family, "custom");
});
