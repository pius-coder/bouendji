/**
 * 104 : coupons de réduction.
 *
 * Ce que ces tests prouvent :
 * - seul l'owner crée et liste les types (libellé + minutes) ;
 * - un administrateur de la communauté émet un coupon pour un abonné précis,
 *   d'un type de l'app de l'abonné ; le code n'est renvoyé qu'à l'émission et
 *   n'est stocké que haché (ni la base, ni le journal ne le contiennent) ;
 * - validation réussie : abonnement illimité de la durée du type, coupon
 *   `redeemed`, appareil enregistré, aucune commission, pas une « vente » ;
 * - refus : déjà utilisé, code d'un autre compte, appareil déjà utilisé,
 *   coupon déjà actif sur le compte (pas de cumul), expiré, annulé ;
 * - le forfait caché n'apparaît ni au catalogue ni dans la liste admin.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

const { db, call, closeAll, deviceClient, enrollDevice, grantSubscription, seedApp, signProof } = await import("./support.js");
const { openAdminSession } = await import("../src/lib/auth.js");

after(closeAll);

const PASSWORD = "mot-de-passe-de-test";
const seed = await seedApp({ deviceLimit: 2 });
const other = await seedApp();

/* ----------------------------------------------------------- administrateurs */

async function seedAdmin(id: string, options: { owner?: boolean; communityId?: string; role?: string } = {}): Promise<string> {
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active, must_change_password)
     VALUES ($1, $2, 'scrypt$16384$8$1$x$y', $3, 'partner', $4, true, false)`,
    [id, `${id}@coupons.test`, `Admin ${id}`, options.owner ? "owner" : "none"],
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

const ownerToken = await seedAdmin("cpn_owner", { owner: true });
const adminToken = await seedAdmin("cpn_admin", { communityId: seed.communityId });
const supportToken = await seedAdmin("cpn_support", { communityId: seed.communityId, role: "support" });
const otherAdminToken = await seedAdmin("cpn_other", { communityId: other.communityId });

function admin(token: string) {
  return (method: string, url: string, payload?: unknown) =>
    call(method, url, { ...(payload === undefined ? {} : { payload }), headers: { authorization: `Bearer ${token}` } });
}
const asOwner = admin(ownerToken);
const asAdmin = admin(adminToken);
const asSupport = admin(supportToken);
const asOtherAdmin = admin(otherAdminToken);

/* ----------------------------------------------------------------- abonnés */

let phoneSeq = 0;
function nextPhone(): string {
  phoneSeq += 1;
  return `+2377${String(phoneSeq).padStart(8, "0")}`;
}

interface Account {
  userId: string;
  email: string;
  deviceId: string;
  client: ReturnType<typeof deviceClient>;
}

async function createAccount(label: string, appId = seed.appId): Promise<Account> {
  const device = await enrollDevice({ deviceName: `Pixel ${label}` });
  const email = `${label}-${randomUUID().slice(0, 8)}@coupons.test`;
  const body = { appId, email, password: PASSWORD, name: "Testeur Coupon", phone: nextPhone(), locale: "fr" };
  const registered = await call("POST", "/v1/auth/register", {
    payload: body,
    headers: {
      "x-device-token": device.deviceToken,
      ...signProof(device.keys.signing, "POST", "/v1/auth/register", JSON.stringify(body)),
    },
  });
  assert.equal(registered.status, 201, registered.text);
  return {
    userId: String(registered.body.user.id),
    email,
    deviceId: device.deviceId,
    client: deviceClient({ accessToken: String(registered.body.accessToken), signing: device.keys.signing }),
  };
}

/** Même compte, nouvel appareil enrôlé puis connecté. */
async function loginOnNewDevice(account: Account): Promise<Account> {
  const device = await enrollDevice({ deviceName: "Second téléphone" });
  const body = { appId: seed.appId, email: account.email, password: PASSWORD };
  const logged = await call("POST", "/v1/auth/login", {
    payload: body,
    headers: {
      "x-device-token": device.deviceToken,
      ...signProof(device.keys.signing, "POST", "/v1/auth/login", JSON.stringify(body)),
    },
  });
  assert.equal(logged.status, 200, logged.text);
  return {
    ...account,
    deviceId: device.deviceId,
    client: deviceClient({ accessToken: String(logged.body.accessToken), signing: device.keys.signing }),
  };
}

const redeem = (account: Account, code: string) => account.client("POST", "/v1/me/coupons/redeem", { code });

async function issue(userId: string, typeId: string, token = adminToken) {
  const res = await admin(token)("POST", `/v1/admin/users/${userId}/coupons`, { typeId });
  assert.equal(res.status, 201, res.text);
  return { code: String(res.body.code), couponId: String(res.body.coupon.id) };
}

/* ------------------------------------------------------------------ tests */

let hourTypeId = "";
let twoHoursTypeId = "";

test("types : l'owner seul les crée et les liste", async () => {
  const asAdminCreate = await asAdmin("POST", `/v1/admin/apps/${seed.appId}/coupon-types`, { label: "1 heure", durationMinutes: 60 });
  assert.equal(asAdminCreate.status, 403, asAdminCreate.text);
  const asSupportCreate = await asSupport("POST", `/v1/admin/apps/${seed.appId}/coupon-types`, { label: "1 heure", durationMinutes: 60 });
  assert.equal(asSupportCreate.status, 403, asSupportCreate.text);
  const asAdminList = await asAdmin("GET", `/v1/admin/apps/${seed.appId}/coupon-types`);
  assert.equal(asAdminList.status, 403, asAdminList.text);

  const created = await asOwner("POST", `/v1/admin/apps/${seed.appId}/coupon-types`, { label: "1 heure", durationMinutes: 60 });
  assert.equal(created.status, 201, created.text);
  assert.equal(created.body.durationMinutes, 60);
  hourTypeId = String(created.body.id);
  const second = await asOwner("POST", `/v1/admin/apps/${seed.appId}/coupon-types`, { label: "2 heures", durationMinutes: 120 });
  assert.equal(second.status, 201, second.text);
  twoHoursTypeId = String(second.body.id);

  const invalid = await asOwner("POST", `/v1/admin/apps/${seed.appId}/coupon-types`, { label: "Trop long", durationMinutes: 525_601 });
  assert.equal(invalid.status, 400, invalid.text);

  const list = await asOwner("GET", `/v1/admin/apps/${seed.appId}/coupon-types`);
  assert.equal(list.status, 200, list.text);
  assert.deepEqual(
    (list.body.items as Array<{ label: string; durationMinutes: number }>).map((t) => [t.label, t.durationMinutes]),
    [
      ["1 heure", 60],
      ["2 heures", 120],
    ],
  );
});

test("génération : par l'admin de la communauté, pour un abonné, code affiché une seule fois", async () => {
  const account = await createAccount("gen");

  // Types proposables : lisibles par l'admin depuis la fiche de l'abonné.
  const proposable = await asAdmin("GET", `/v1/admin/users/${account.userId}/coupon-types`);
  assert.equal(proposable.status, 200, proposable.text);
  assert.equal(proposable.body.items.length, 2);

  // Support et admin d'une autre communauté : refusés.
  const bySupport = await asSupport("POST", `/v1/admin/users/${account.userId}/coupons`, { typeId: hourTypeId });
  assert.equal(bySupport.status, 403, bySupport.text);
  const byOther = await asOtherAdmin("POST", `/v1/admin/users/${account.userId}/coupons`, { typeId: hourTypeId });
  assert.equal(byOther.status, 403, byOther.text);

  // Type d'une autre application : introuvable pour cet abonné.
  const foreignType = await asOwner("POST", `/v1/admin/apps/${other.appId}/coupon-types`, { label: "Autre", durationMinutes: 30 });
  assert.equal(foreignType.status, 201, foreignType.text);
  const wrongApp = await asAdmin("POST", `/v1/admin/users/${account.userId}/coupons`, { typeId: foreignType.body.id });
  assert.equal(wrongApp.status, 404, wrongApp.text);

  const res = await asAdmin("POST", `/v1/admin/users/${account.userId}/coupons`, { typeId: hourTypeId });
  assert.equal(res.status, 201, res.text);
  assert.equal(res.headers["cache-control"], "no-store");
  const code = String(res.body.code);
  assert.match(code, /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  assert.equal(res.body.coupon.status, "issued");
  assert.equal(res.body.coupon.durationMinutes, 60);

  // Le code n'existe nulle part en clair : ni dans la ligne, ni dans le journal.
  const compact = code.replace(/-/g, "");
  const row = await db.one<Record<string, unknown>>("SELECT * FROM coupons WHERE id = $1", [res.body.coupon.id]);
  assert.ok(row);
  assert.equal(JSON.stringify(row).includes(compact), false);
  assert.equal(String(row.code_hash).length, 64);
  const audit = await db.query<Record<string, unknown>>("SELECT * FROM audit_log WHERE target_id = $1", [res.body.coupon.id]);
  assert.equal(audit.length, 1);
  assert.equal(audit[0]?.action, "coupon.issue");
  assert.equal(JSON.stringify(audit).includes(compact), false);

  // La relecture ne rend jamais le code.
  const listed = await asAdmin("GET", `/v1/admin/users/${account.userId}/coupons`);
  assert.equal(listed.status, 200, listed.text);
  assert.equal(listed.body.items.length, 1);
  assert.equal(listed.text.includes(compact), false);
  assert.equal("code" in listed.body.items[0], false);
});

test("validation réussie : accès illimité pour la durée du coupon, coupon utilisé, appareil enregistré", async () => {
  const account = await createAccount("ok");
  const { code, couponId } = await issue(account.userId, hourTypeId);

  // Saisie tolérante : minuscules et espaces.
  const res = await redeem(account, ` ${code.toLowerCase().replace(/-/g, " ")} `);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.coupon.durationMinutes, 60);
  const span = new Date(res.body.subscription.endsAt).getTime() - new Date(res.body.subscription.startsAt).getTime();
  assert.equal(span, 60 * 60_000);

  const coupon = await db.one<Record<string, unknown>>("SELECT status, device_id, redeemed_at, order_id FROM coupons WHERE id = $1", [couponId]);
  assert.equal(coupon?.status, "redeemed");
  assert.equal(coupon?.device_id, account.deviceId);
  assert.ok(coupon?.redeemed_at);

  const sub = await db.one<Record<string, unknown>>(
    `SELECT s.status, s.quota_bytes, p.family, p.endpoint_tier, p.active, o.amount_xaf, o.provider
       FROM subscriptions s JOIN plans p ON p.id = s.plan_id JOIN orders o ON o.id = s.order_id
      WHERE s.order_id = $1`,
    [coupon?.order_id],
  );
  assert.equal(sub?.status, "active");
  assert.equal(sub?.family, "unlimited");
  assert.equal(sub?.endpoint_tier, "free-labs");
  assert.equal(sub?.quota_bytes, null);
  assert.equal(sub?.active, false, "forfait caché, jamais vendu");
  assert.equal(Number(sub?.amount_xaf), 0);
  assert.equal(sub?.provider, "coupon");
  const commissions = await db.scalar<number>("SELECT count(*)::int FROM commissions WHERE order_id = $1", [coupon?.order_id]);
  assert.equal(Number(commissions), 0);

  // L'abonné voit son accès par le mécanisme habituel.
  const entitlement = await account.client("GET", "/v1/me/subscription");
  assert.equal(entitlement.status, 200, entitlement.text);
  assert.equal(entitlement.body.entitlement?.active, true, entitlement.text);
  assert.equal(entitlement.body.entitlement?.planName, "Coupon de réduction", entitlement.text);

  // Le forfait caché n'est ni au catalogue, ni dans la liste admin des forfaits.
  const catalog = await call("GET", `/v1/apps/${seed.appId}/plans`);
  assert.equal(catalog.text.includes("_coupon"), false);
  const adminPlans = await asOwner("GET", `/v1/admin/apps/${seed.appId}/plans`);
  assert.equal(adminPlans.status, 200, adminPlans.text);
  assert.equal(adminPlans.text.includes("_coupon"), false);

  // Pas une vente dans le résumé de la communauté.
  const summary = await asOwner("GET", `/v1/admin/communities/${seed.communityId}/summary`);
  assert.equal(summary.status, 200, summary.text);
  assert.equal(summary.body.sales.today.count, 0, summary.text);
});

test("refus : code déjà utilisé", async () => {
  const account = await createAccount("used");
  const { code } = await issue(account.userId, hourTypeId);
  assert.equal((await redeem(account, code)).status, 200);
  const again = await redeem(account, code);
  assert.equal(again.status, 409, again.text);
  assert.equal(again.body.error.details.reason, "COUPON_USED");
});

test("refus : code d'un autre compte, ou code mal formé", async () => {
  const owner = await createAccount("owner-a");
  const intruder = await createAccount("intruder");
  const { code, couponId } = await issue(owner.userId, hourTypeId);

  const foreign = await redeem(intruder, code);
  assert.equal(foreign.status, 404, foreign.text);
  assert.equal(foreign.body.error.details.reason, "COUPON_INVALID");
  const untouched = await db.one<Record<string, unknown>>("SELECT status FROM coupons WHERE id = $1", [couponId]);
  assert.equal(untouched?.status, "issued");

  const malformed = await redeem(intruder, "pas-un-code");
  assert.equal(malformed.status, 404, malformed.text);
  assert.equal(malformed.body.error.details.reason, "COUPON_INVALID");
});

test("refus : appareil déjà utilisé, puis coupon déjà actif sur le compte (pas de cumul)", async () => {
  const account = await createAccount("device");
  const first = await issue(account.userId, hourTypeId);
  assert.equal((await redeem(account, first.code)).status, 200);

  const second = await issue(account.userId, twoHoursTypeId);
  // Même appareil : refusé, même pour un autre coupon du même compte.
  const sameDevice = await redeem(account, second.code);
  assert.equal(sameDevice.status, 409, sameDevice.text);
  assert.equal(sameDevice.body.error.details.reason, "COUPON_DEVICE_USED");

  // Autre appareil, même compte : le premier coupon court encore.
  const otherDevice = await loginOnNewDevice(account);
  const stacked = await redeem(otherDevice, second.code);
  assert.equal(stacked.status, 409, stacked.text);
  assert.equal(stacked.body.error.details.reason, "COUPON_ACTIVE");

  // Une fois l'abonnement du premier coupon terminé, le second passe sur le nouvel appareil.
  await db.query(
    `UPDATE subscriptions SET starts_at = now() - interval '2 hours', ends_at = now() - interval '1 minute'
      WHERE order_id = (SELECT order_id FROM coupons WHERE id = $1)`,
    [first.couponId],
  );
  const later = await redeem(otherDevice, second.code);
  assert.equal(later.status, 200, later.text);
  assert.equal(later.body.coupon.durationMinutes, 120);
  const row = await db.one<Record<string, unknown>>("SELECT device_id FROM coupons WHERE id = $1", [second.couponId]);
  assert.equal(row?.device_id, otherDevice.deviceId);
});

test("refus : forfait payé actif, période à venir ou accès manuel (décision owner du 2026-10-30)", async () => {
  // Abonnement payé en cours.
  const paid = await createAccount("paid");
  await grantSubscription(seed, paid.userId, { days: 30 });
  const paidCoupon = await issue(paid.userId, hourTypeId);
  const refusedPaid = await redeem(paid, paidCoupon.code);
  assert.equal(refusedPaid.status, 409, refusedPaid.text);
  assert.equal(refusedPaid.body.error.details.reason, "PAID_PLAN_ACTIVE");
  const stillIssued = await db.one<Record<string, unknown>>("SELECT status, device_id FROM coupons WHERE id = $1", [paidCoupon.couponId]);
  assert.equal(stillIssued?.status, "issued");
  assert.equal(stillIssued?.device_id, null, "un refus n'enregistre pas l'appareil");

  // Période seulement à venir (commence dans deux jours).
  const future = await createAccount("future");
  await grantSubscription(seed, future.userId, { days: 30, startsAt: new Date(Date.now() + 2 * 86_400_000) });
  const futureCoupon = await issue(future.userId, hourTypeId);
  const refusedFuture = await redeem(future, futureCoupon.code);
  assert.equal(refusedFuture.status, 409, refusedFuture.text);
  assert.equal(refusedFuture.body.error.details.reason, "PAID_PLAN_ACTIVE");

  // Accès accordé à la main (commande non payée par un fournisseur).
  const manual = await createAccount("manual");
  await db.query(
    `INSERT INTO orders (id, user_id, app_id, plan_id, community_id, amount_xaf, status, provider, paid_at, activated_at)
     VALUES ($1, $2, $3, $4, $5, 0, 'paid', 'manual', now(), now())`,
    [`ord_manual_${manual.userId}`, manual.userId, seed.appId, seed.planId, seed.communityId],
  );
  await db.query(
    `INSERT INTO subscriptions (id, user_id, plan_id, order_id, status, starts_at, ends_at)
     VALUES ($1, $2, $3, $4, 'active', now(), now() + interval '3 days')`,
    [`sub_manual_${manual.userId}`, manual.userId, seed.planId, `ord_manual_${manual.userId}`],
  );
  const manualCoupon = await issue(manual.userId, hourTypeId);
  const refusedManual = await redeem(manual, manualCoupon.code);
  assert.equal(refusedManual.status, 409, refusedManual.text);
  assert.equal(refusedManual.body.error.details.reason, "PAID_PLAN_ACTIVE");

  // Forfait payé terminé : le coupon passe et sa période commence maintenant.
  await db.query("UPDATE subscriptions SET starts_at = now() - interval '31 days', ends_at = now() - interval '1 minute' WHERE user_id = $1", [
    paid.userId,
  ]);
  const accepted = await redeem(paid, paidCoupon.code);
  assert.equal(accepted.status, 200, accepted.text);
  assert.ok(Math.abs(new Date(accepted.body.subscription.startsAt).getTime() - Date.now()) < 60_000, "aucun empilement");
});

test("refus : coupon expiré, coupon annulé", async () => {
  const account = await createAccount("expired");
  const expired = await issue(account.userId, hourTypeId);
  await db.query("UPDATE coupons SET expires_at = now() - interval '1 minute' WHERE id = $1", [expired.couponId]);
  const late = await redeem(account, expired.code);
  assert.equal(late.status, 409, late.text);
  assert.equal(late.body.error.details.reason, "COUPON_EXPIRED");

  const revoked = await issue(account.userId, hourTypeId);
  const bySupport = await asSupport("POST", `/v1/admin/coupons/${revoked.couponId}/revoke`);
  assert.equal(bySupport.status, 403, bySupport.text);
  const res = await asAdmin("POST", `/v1/admin/coupons/${revoked.couponId}/revoke`);
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.coupon.status, "revoked");
  const refused = await redeem(account, revoked.code);
  assert.equal(refused.status, 409, refused.text);
  assert.equal(refused.body.error.details.reason, "COUPON_REVOKED");

  // Un coupon déjà utilisé ne s'annule pas.
  const used = await issue(account.userId, hourTypeId);
  assert.equal((await redeem(account, used.code)).status, 200);
  const cannot = await asAdmin("POST", `/v1/admin/coupons/${used.couponId}/revoke`);
  assert.equal(cannot.status, 409, cannot.text);
});

test("non-régression : la migration 104 est appliquée et ses index existent", async () => {
  const applied = await db.scalar<number>("SELECT count(*)::int FROM schema_migrations WHERE id = '104_coupons'");
  assert.equal(Number(applied), 1);
  const indexes = await db.query<{ indexname: string }>(
    "SELECT indexname FROM pg_indexes WHERE tablename = 'coupons' ORDER BY indexname",
  );
  const names = indexes.map((i) => i.indexname);
  assert.ok(names.includes("coupons_code_hash_uidx"));
  assert.ok(names.includes("coupons_device_uidx"));
});
