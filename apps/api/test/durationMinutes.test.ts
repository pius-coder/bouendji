/**
 * 103 : forfaits à la minute (1 h = 60). Création admin, expiration de
 * l'abonnement, et non-régression des forfaits en jours.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "memory://";
process.env.MASTER_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.JWT_SECRET = "test-secret-test-secret-test-secret";
process.env.PAYMENT_PROVIDER = "mock";
process.env.PUBLIC_BASE_URL = "http://localhost:8080";

const { createDb } = await import("../src/db.js");
const { buildApp } = await import("../src/app.js");
const { openAdminSession } = await import("../src/lib/auth.js");
const { activateOrder, createOrder, planRevision } = await import("../src/services/payments.js");

const db = await createDb();
const app = await buildApp({ db });

after(async () => {
  await app.close();
  await db.close();
});

const COMMUNITY = "com_dm";
const APP = "app_dm";
const OWNER = "adm_dm_owner";
const DAYS_PLAN = "plan_dm_days";

await db.query("INSERT INTO communities (id, name, slug, commission_bps) VALUES ($1, $2, $3, $4)", [
  COMMUNITY,
  "Communauté minutes",
  "com-dm",
  2000,
]);
await db.query("INSERT INTO apps (id, community_id, slug, name, package_name) VALUES ($1, $2, $3, $4, $5)", [
  APP,
  COMMUNITY,
  "app-dm",
  "App minutes",
  "com.example.dm",
]);
await db.query(
  `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active, must_change_password)
   VALUES ($1, 'owner@dm.test', 'scrypt$16384$8$1$x$y', 'owner', 'partner', 'owner', true, false)`,
  [OWNER],
);
const ownerToken = (await openAdminSession(db, { adminId: OWNER })).token;

// Forfait en jours semé comme les forfaits existants : `duration_minutes` absent (NULL).
await db.query(
  `INSERT INTO plans (id, app_id, code, name, description, price_xaf, duration_days, device_limit, active, family)
   VALUES ($1, $2, 'jours-7', '7 jours', '', 1000, 7, 1, true, 'unlimited')`,
  [DAYS_PLAN, APP],
);

let seq = 0;
async function seedUser(): Promise<string> {
  seq += 1;
  const userId = `usr_dm_${seq}`;
  await db.query(
    `INSERT INTO users (id, app_id, community_id, email, password_hash, name, email_verified_at)
     VALUES ($1, $2, $3, $4, 'scrypt$16384$8$1$x$y', 'Acheteur', now())`,
    [userId, APP, COMMUNITY, `buyer${seq}@dm.test`],
  );
  return userId;
}

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

async function catalogItem(planId: string): Promise<Record<string, any>> {
  const catalog = await call("GET", `/v1/apps/${APP}/plans`, null);
  const item = (catalog.body.items as Record<string, any>[]).find((plan) => plan.id === planId);
  assert.ok(item, "offre absente du catalogue");
  return item;
}

/** Achète, marque payé, active ; renvoie la durée de l'abonnement en ms. */
async function buyAndActivate(planId: string): Promise<number> {
  const userId = await seedUser();
  const created = await createOrder(db, {
    userId,
    planId,
    planRevision: Number((await catalogItem(planId)).revision),
  });
  await db.query("UPDATE orders SET status = 'paid', paid_at = now() WHERE id = $1", [created.raw.orderId]);
  assert.equal(await activateOrder(db, created.raw.orderId), true);
  const sub = await db.one<{ starts_at: Date | string; ends_at: Date | string }>(
    "SELECT starts_at, ends_at FROM subscriptions WHERE order_id = $1",
    [created.raw.orderId],
  );
  assert.ok(sub);
  return new Date(sub.ends_at).getTime() - new Date(sub.starts_at).getTime();
}

let hourPlanId = "";

test("création admin d'un forfait de 60 minutes", async () => {
  const res = await call("POST", `/v1/admin/apps/${APP}/plans`, ownerToken, {
    code: "une-heure",
    name: "1 heure",
    priceXaf: 100,
    durationMinutes: 60,
    family: "unlimited",
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.durationMinutes, 60);
  assert.equal(res.body.durationDays, 1, "jours arrondis au supérieur pour les anciens lecteurs");
  hourPlanId = res.body.id as string;
  const row = await db.one<{ duration_minutes: number; duration_days: number }>(
    "SELECT duration_minutes, duration_days FROM plans WHERE id = $1",
    [hourPlanId],
  );
  assert.equal(Number(row?.duration_minutes), 60);
  assert.equal(Number(row?.duration_days), 1);

  const item = await catalogItem(hourPlanId);
  assert.equal(item.durationMinutes, 60);
});

test("durationDays et durationMinutes ensemble, ou aucun des deux : refusé", async () => {
  const both = await call("POST", `/v1/admin/apps/${APP}/plans`, ownerToken, {
    code: "les-deux",
    name: "Les deux",
    priceXaf: 100,
    durationDays: 1,
    durationMinutes: 60,
    family: "unlimited",
  });
  assert.equal(both.status, 400, JSON.stringify(both.body));
  const none = await call("POST", `/v1/admin/apps/${APP}/plans`, ownerToken, {
    code: "aucune",
    name: "Aucune",
    priceXaf: 100,
    family: "unlimited",
  });
  assert.equal(none.status, 400, JSON.stringify(none.body));
  const tooLong = await call("POST", `/v1/admin/apps/${APP}/plans`, ownerToken, {
    code: "trop-long",
    name: "Trop long",
    priceXaf: 100,
    durationMinutes: 525_601,
    family: "unlimited",
  });
  assert.equal(tooLong.status, 400, JSON.stringify(tooLong.body));
});

test("expiration : un forfait de 60 minutes donne un abonnement d'une heure", async () => {
  assert.ok(hourPlanId);
  assert.equal(await buyAndActivate(hourPlanId), 60 * 60_000);
});

test("modification : passer à 120 minutes puis revenir en jours", async () => {
  const toTwoHours = await call("PATCH", `/v1/admin/plans/${hourPlanId}`, ownerToken, { durationMinutes: 120 });
  assert.equal(toTwoHours.status, 200, JSON.stringify(toTwoHours.body));
  assert.equal(toTwoHours.body.durationMinutes, 120);
  assert.equal(await buyAndActivate(hourPlanId), 120 * 60_000);

  const toDays = await call("PATCH", `/v1/admin/plans/${hourPlanId}`, ownerToken, { durationDays: 2 });
  assert.equal(toDays.status, 200, JSON.stringify(toDays.body));
  assert.equal(toDays.body.durationDays, 2);
  assert.equal(toDays.body.durationMinutes, 2 * 1440);
  const row = await db.one<{ duration_minutes: number | null }>("SELECT duration_minutes FROM plans WHERE id = $1", [hourPlanId]);
  assert.equal(row?.duration_minutes, null, "retour en jours : minutes remises à NULL");
});

test("non-régression : un forfait en jours garde sa durée et sa révision", async () => {
  const item = await catalogItem(DAYS_PLAN);
  assert.equal(item.durationDays, 7);
  assert.equal(item.durationMinutes, 7 * 1440);
  // Révision identique à celle calculée sans connaître la colonne 103.
  assert.equal(
    item.revision,
    planRevision({ code: "jours-7", price_xaf: 1000, duration_days: 7, device_limit: 1, active: true, family: "unlimited", quota_bytes: null, endpoint_tier: "free-labs", night_options: [] }),
  );
  assert.equal(await buyAndActivate(DAYS_PLAN), 7 * 86_400_000);
});
