/**
 * 105 : accès manuels (paiement direct à l'administrateur) et versements.
 *
 * Ce que ces tests prouvent :
 * - l'owner, ou le `community_admin` de la communauté de l'abonné, accorde un
 *   forfait : abonnement immédiat (durée du forfait, en jours ou en minutes),
 *   dette `owed` au prix plein figé, **aucune commission** ;
 * - hors communauté, ou avec un autre rôle : 403, rien n'est écrit ;
 * - les impayés : l'owner voit tout, un `community_admin` sa communauté ;
 * - le versement porte le total exact des accès `owed` de la communauté, et
 *   un total nul est refusé ;
 * - la réconciliation (webhook revérifié chez le fournisseur) règle les accès
 *   et crée la commission une seule fois ; un second webhook ne fait rien ;
 * - un accès réglé ne peut pas être réglé deux fois (deux liens payés, ou
 *   SQL écrit à la main) ;
 * - le journal d'audit trace accord, versement et réconciliation.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

const { db, app, call, closeAll, seedApp } = await import("./support.js");
const { openAdminSession } = await import("../src/lib/auth.js");
const { setMockPaymentStatus } = await import("../src/services/mockPayments.js");
const { commissionFor } = await import("../src/services/payments.js");

after(closeAll);

const seed = await seedApp({ priceXaf: 3500 });
const other = await seedApp({ priceXaf: 1500 });

/* ----------------------------------------------------------- administrateurs */

async function seedAdmin(id: string, options: { owner?: boolean; communityId?: string; role?: string } = {}): Promise<string> {
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active, must_change_password)
     VALUES ($1, $2, 'scrypt$16384$8$1$x$y', $3, 'partner', $4, true, false)`,
    [id, `${id}@grants.test`, `Admin ${id}`, options.owner ? "owner" : "none"],
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

const ownerToken = await seedAdmin("mg_owner", { owner: true });
const adminToken = await seedAdmin("mg_admin", { communityId: seed.communityId });
const supportToken = await seedAdmin("mg_support", { communityId: seed.communityId, role: "support" });
const financeToken = await seedAdmin("mg_finance", { communityId: seed.communityId, role: "finance" });
const otherAdminToken = await seedAdmin("mg_other", { communityId: other.communityId });

function as(token: string) {
  return (method: string, url: string, payload?: unknown, headers: Record<string, string> = {}) =>
    call(method, url, { ...(payload === undefined ? {} : { payload }), headers: { authorization: `Bearer ${token}`, ...headers } });
}
const asOwner = as(ownerToken);
const asAdmin = as(adminToken);
const asSupport = as(supportToken);
const asFinance = as(financeToken);
const asOtherAdmin = as(otherAdminToken);

/* ----------------------------------------------------------------- abonnés */

async function createUser(target = seed): Promise<string> {
  const id = `usr_${randomUUID().slice(0, 8)}`;
  await db.query(
    `INSERT INTO users (id, app_id, community_id, email, password_hash, name, email_verified_at)
     VALUES ($1, $2, $3, $4, 'scrypt$16384$8$1$x$y', $5, now())`,
    [id, target.appId, target.communityId, `${id}@grants.test`, `Abonné ${id}`],
  );
  return id;
}

async function planPrice(planId: string): Promise<number> {
  return Number(await db.scalar("SELECT price_xaf FROM plans WHERE id = $1", [planId]));
}

async function grant(userId: string, token = adminToken, body: Record<string, unknown> = {}) {
  const res = await as(token)("POST", `/v1/admin/users/${userId}/manual-grants`, {
    planId: seed.planId,
    paymentMethod: "orange_money",
    ...body,
  });
  assert.equal(res.status, 201, res.text);
  return res.body;
}

async function commissionsOfGrant(grantId: string): Promise<number> {
  return Number(
    await db.scalar(
      "SELECT count(*)::int FROM commissions c JOIN manual_grants g ON g.order_id = c.order_id WHERE g.id = $1",
      [grantId],
    ),
  );
}

async function webhook(payload: Record<string, unknown>) {
  const res = await app.inject({ method: "POST", url: "/v1/payments/webhook/mock", payload });
  return { status: res.statusCode, body: res.json() as Record<string, any>, text: res.body };
}

async function settlementRef(settlementId: string): Promise<string> {
  return String(await db.scalar("SELECT provider_ref FROM settlements WHERE id = $1", [settlementId]));
}

/** Règle tous les impayés encore ouverts de la communauté de test. */
async function settleEverything(): Promise<void> {
  const owed = Number(await db.scalar("SELECT count(*)::int FROM manual_grants WHERE community_id = $1 AND status = 'owed'", [seed.communityId]));
  if (owed === 0) return;
  const res = await asAdmin("POST", "/v1/admin/settlements", { communityId: seed.communityId });
  assert.equal(res.status, 201, res.text);
  const ref = await settlementRef(String(res.body.settlement.id));
  setMockPaymentStatus(ref, "paid");
  const hook = await webhook({ transId: ref });
  assert.equal(hook.status, 200, hook.text);
}

/* ------------------------------------------------------------------ accord */

test("accord par l'owner : accès immédiat, dette au prix plein, aucune commission", async () => {
  const userId = await createUser();
  const before = Date.now();
  const body = await grant(userId, ownerToken, { note: "Payé au téléphone" });

  const price = await planPrice(seed.planId);
  assert.equal(body.grant.status, "owed");
  assert.equal(body.grant.amountXaf, price, "dette figée au prix plein du forfait");
  assert.equal(body.grant.paymentMethod, "orange_money");
  assert.equal(body.grant.note, "Payé au téléphone");
  assert.equal(body.grant.settlementId, null);
  assert.ok(body.subscription, "abonnement renvoyé");

  // Accès immédiat : abonnement actif, de la durée du forfait (30 jours dans la graine).
  const sub = await db.one<Record<string, any>>(
    "SELECT status, starts_at, ends_at FROM subscriptions WHERE user_id = $1 AND status = 'active'",
    [userId],
  );
  assert.ok(sub, "abonnement actif");
  const days = Number(await db.scalar("SELECT duration_days FROM plans WHERE id = $1", [seed.planId]));
  const length = new Date(sub.ends_at).getTime() - new Date(sub.starts_at).getTime();
  assert.equal(length, days * 86_400_000);
  assert.ok(new Date(sub.starts_at).getTime() >= before - 1000, "commence maintenant");

  // Commande à prix plein déjà payée, mais aucune commission avant le versement.
  const order = await db.one<Record<string, any>>(
    "SELECT o.provider, o.status, o.amount_xaf FROM orders o JOIN manual_grants g ON g.order_id = o.id WHERE g.id = $1",
    [body.grant.id],
  );
  assert.equal(order?.provider, "manual");
  assert.equal(order?.status, "paid");
  assert.equal(Number(order?.amount_xaf), price);
  assert.equal(await commissionsOfGrant(String(body.grant.id)), 0, "aucune commission à l'accord");

  const audit = await db.one<Record<string, any>>(
    "SELECT actor_id, actor_role, community_id, after_state FROM audit_log WHERE action = 'manual_grant.create' AND target_id = $1",
    [body.grant.id],
  );
  assert.equal(audit?.actor_id, "mg_owner");
  assert.equal(audit?.actor_role, "owner");
  assert.equal(audit?.community_id, seed.communityId);
  assert.equal(audit?.after_state.amountXaf, price);
});

test("accord par le community_admin de sa communauté, forfait en minutes", async () => {
  const minutesPlan = `plan_${randomUUID().slice(0, 8)}`;
  await db.query(
    `INSERT INTO plans (id, app_id, code, name, description, price_xaf, duration_days, duration_minutes, device_limit, active)
     VALUES ($1, $2, $3, '2 heures', '', 300, 1, 120, 1, true)`,
    [minutesPlan, seed.appId, `deux-heures-${minutesPlan.slice(5)}`],
  );
  const userId = await createUser();
  const body = await grant(userId, adminToken, { planId: minutesPlan, paymentMethod: "mtn_momo" });
  assert.equal(body.grant.amountXaf, await planPrice(minutesPlan));
  assert.equal(body.grant.paymentMethod, "mtn_momo");

  const sub = await db.one<Record<string, any>>("SELECT starts_at, ends_at FROM subscriptions WHERE user_id = $1", [userId]);
  const length = new Date(sub?.ends_at).getTime() - new Date(sub?.starts_at).getTime();
  assert.equal(length, 120 * 60_000, "durée du forfait en minutes");

  const options = await asAdmin("GET", `/v1/admin/users/${userId}/manual-grants/options`);
  assert.equal(options.status, 200, options.text);
  assert.ok(options.body.plans.some((p: { id: string; durationMinutes: number }) => p.id === minutesPlan && p.durationMinutes === 120));
  // Avertissement possible : les impayés de la communauté sont renvoyés avec les options.
  assert.ok(options.body.owed.count >= 1);
  assert.ok(options.body.owed.totalXaf > 0);
});

test("refus hors communauté et pour les autres rôles : 403, rien n'est écrit", async () => {
  const userId = await createUser();
  for (const caller of [asOtherAdmin, asSupport, asFinance]) {
    const res = await caller("POST", `/v1/admin/users/${userId}/manual-grants`, { planId: seed.planId, paymentMethod: "other" });
    assert.equal(res.status, 403, res.text);
    const options = await caller("GET", `/v1/admin/users/${userId}/manual-grants/options`);
    assert.equal(options.status, 403, options.text);
  }
  assert.equal(Number(await db.scalar("SELECT count(*)::int FROM manual_grants WHERE user_id = $1", [userId])), 0);
  assert.equal(Number(await db.scalar("SELECT count(*)::int FROM subscriptions WHERE user_id = $1", [userId])), 0);
});

test("accord : forfait d'une autre app, compte supprimé, moyen inconnu refusés", async () => {
  const userId = await createUser();
  const foreignPlan = await asAdmin("POST", `/v1/admin/users/${userId}/manual-grants`, { planId: other.planId, paymentMethod: "other" });
  assert.equal(foreignPlan.status, 404, foreignPlan.text);
  const badMethod = await asAdmin("POST", `/v1/admin/users/${userId}/manual-grants`, { planId: seed.planId, paymentMethod: "cash" });
  assert.equal(badMethod.status, 400, badMethod.text);
  const deleted = await createUser();
  await db.query("UPDATE users SET deleted_at = now() WHERE id = $1", [deleted]);
  const onDeleted = await asAdmin("POST", `/v1/admin/users/${deleted}/manual-grants`, { planId: seed.planId, paymentMethod: "other" });
  assert.equal(onDeleted.status, 409, onDeleted.text);
});

test("un même envoi (Idempotency-Key) ne crée qu'une dette", async () => {
  const userId = await createUser();
  const key = randomUUID();
  const first = await asAdmin("POST", `/v1/admin/users/${userId}/manual-grants`, { planId: seed.planId, paymentMethod: "other" }, { "idempotency-key": key });
  assert.equal(first.status, 201, first.text);
  const again = await asAdmin("POST", `/v1/admin/users/${userId}/manual-grants`, { planId: seed.planId, paymentMethod: "other" }, { "idempotency-key": key });
  assert.equal(again.status, 200, again.text);
  assert.equal(again.body.replayed, true);
  assert.equal(again.body.grant.id, first.body.grant.id);
  assert.equal(Number(await db.scalar("SELECT count(*)::int FROM manual_grants WHERE user_id = $1", [userId])), 1);
  assert.equal(Number(await db.scalar("SELECT count(*)::int FROM subscriptions WHERE user_id = $1", [userId])), 1);
});

/* ---------------------------------------------------------------- impayés */

test("impayés : l'owner voit tout, le community_admin seulement sa communauté", async () => {
  const otherUser = await createUser(other);
  const otherGrant = await as(otherAdminToken)("POST", `/v1/admin/users/${otherUser}/manual-grants`, {
    planId: other.planId,
    paymentMethod: "other",
  });
  assert.equal(otherGrant.status, 201, otherGrant.text);

  const mine = await asAdmin("GET", "/v1/admin/manual-grants");
  assert.equal(mine.status, 200, mine.text);
  assert.ok(mine.body.items.length > 0);
  assert.ok(mine.body.items.every((g: { communityId: string }) => g.communityId === seed.communityId));
  const expected = Number(
    await db.scalar("SELECT COALESCE(sum(amount_xaf), 0)::int FROM manual_grants WHERE community_id = $1 AND status = 'owed'", [
      seed.communityId,
    ]),
  );
  assert.equal(mine.body.owed.totalXaf, expected, "total dû exact");
  assert.equal(mine.body.communities.length, 1);

  const foreign = await asAdmin("GET", `/v1/admin/manual-grants?communityId=${other.communityId}`);
  assert.equal(foreign.status, 403, foreign.text);
  const bySupport = await asSupport("GET", "/v1/admin/manual-grants");
  assert.equal(bySupport.status, 403, bySupport.text);

  const all = await asOwner("GET", "/v1/admin/manual-grants");
  assert.equal(all.status, 200, all.text);
  const ids = new Set(all.body.communities.map((c: { communityId: string }) => c.communityId));
  assert.ok(ids.has(seed.communityId) && ids.has(other.communityId), "owner : toutes les communautés");
});

/* ------------------------------------------------------------- versement */

test("versement : total exact des accès owed de la communauté ; total nul refusé", async () => {
  await settleEverything();
  const empty = await asAdmin("POST", "/v1/admin/settlements", { communityId: seed.communityId });
  assert.equal(empty.status, 409, empty.text);
  assert.equal(empty.body.error.details.reason, "NOTHING_OWED");

  const a = await grant(await createUser());
  const b = await grant(await createUser(), ownerToken);
  const foreign = await asOtherAdmin("POST", "/v1/admin/settlements", { communityId: seed.communityId });
  assert.equal(foreign.status, 403, foreign.text);

  const res = await asAdmin("POST", "/v1/admin/settlements", { communityId: seed.communityId });
  assert.equal(res.status, 201, res.text);
  assert.equal(res.body.settlement.amountXaf, a.grant.amountXaf + b.grant.amountXaf);
  assert.equal(res.body.settlement.grantCount, 2);
  assert.equal(res.body.settlement.status, "pending");
  assert.match(String(res.body.paymentUrl), /^http:\/\/localhost:8080\/pay\/mock\/mock_/);
  assert.match(String(res.body.settlement.id), /^stl_/);

  // Un versement ne crée ni commande ni retrait : flux distincts.
  assert.equal(Number(await db.scalar("SELECT count(*)::int FROM orders WHERE id = $1", [res.body.settlement.id])), 0);
  assert.equal(Number(await db.scalar("SELECT count(*)::int FROM payouts WHERE community_id = $1", [seed.communityId])), 0);

  const audit = await db.one<Record<string, any>>(
    "SELECT actor_id, after_state FROM audit_log WHERE action = 'settlement.create' AND target_id = $1",
    [res.body.settlement.id],
  );
  assert.equal(audit?.actor_id, "mg_admin");
  assert.equal(audit?.after_state.amountXaf, res.body.settlement.amountXaf);

  // Tant que le paiement n'est pas confirmé, les accès restent dus.
  const still = await asAdmin("GET", `/v1/admin/manual-grants?communityId=${seed.communityId}`);
  assert.ok(still.body.items.some((g: { id: string }) => g.id === a.grant.id));
});

test("réconciliation : commission créée une seule fois, second webhook sans effet", async () => {
  await settleEverything();
  const a = await grant(await createUser());
  const b = await grant(await createUser());
  const created = await asAdmin("POST", "/v1/admin/settlements", { communityId: seed.communityId });
  assert.equal(created.status, 201, created.text);
  const settlementId = String(created.body.settlement.id);
  const ref = await settlementRef(settlementId);

  // Le corps ne fait pas foi : tant que le fournisseur dit « pending », rien ne bouge.
  const early = await webhook({ transId: ref, status: "SUCCESSFUL" });
  assert.equal(early.status, 200, early.text);
  assert.equal(early.body.status, "pending");
  assert.equal(await commissionsOfGrant(String(a.grant.id)), 0);

  // Montant annoncé différent : rejet, aucune transition.
  setMockPaymentStatus(ref, "paid");
  const mismatch = await webhook({ transId: ref, amount: created.body.settlement.amountXaf + 1 });
  assert.equal(mismatch.status, 409, mismatch.text);
  assert.equal(String(await db.scalar("SELECT status FROM settlements WHERE id = $1", [settlementId])), "pending");

  const hook = await webhook({ transId: ref, externalId: settlementId, amount: created.body.settlement.amountXaf });
  assert.equal(hook.status, 200, hook.text);
  assert.equal(hook.body.status, "paid");
  assert.equal(hook.body.settledGrants, 2);
  assert.equal(hook.body.duplicate, false);

  const settled = await db.query<Record<string, any>>(
    "SELECT id, status, settlement_id, settled_at FROM manual_grants WHERE id = ANY($1::text[])",
    [[a.grant.id, b.grant.id]],
  );
  assert.ok(settled.every((g) => g.status === "settled" && g.settlement_id === settlementId && g.settled_at));

  // Même formule que l'activation d'une commande : taux figé sur la commande.
  for (const g of [a, b]) {
    const row = await db.one<Record<string, any>>(
      `SELECT c.amount_xaf, c.bps, c.status, o.amount_xaf AS order_amount, o.commission_bps
         FROM commissions c JOIN manual_grants mg ON mg.order_id = c.order_id JOIN orders o ON o.id = c.order_id
        WHERE mg.id = $1`,
      [g.grant.id],
    );
    assert.ok(row, "commission créée au règlement");
    assert.equal(Number(row.amount_xaf), commissionFor(Number(row.order_amount), Number(row.commission_bps), 10_000));
    assert.equal(row.status, "available");
  }

  const snapshot = await db.query<Record<string, any>>(
    "SELECT id, settled_at FROM manual_grants WHERE settlement_id = $1 ORDER BY id",
    [settlementId],
  );
  const commissionCount = Number(await db.scalar("SELECT count(*)::int FROM commissions WHERE community_id = $1", [seed.communityId]));

  // Second webhook (rejeu fournisseur, même corps ou autre) : rien ne double.
  const replay = await webhook({ transId: ref, externalId: settlementId });
  assert.equal(replay.status, 200, replay.text);
  assert.equal(replay.body.duplicate, true);
  assert.equal(replay.body.settledGrants, 0);
  const byExternal = await webhook({ externalId: settlementId });
  assert.equal(byExternal.status, 200, byExternal.text);
  assert.equal(byExternal.body.duplicate, true);
  assert.equal(Number(await db.scalar("SELECT count(*)::int FROM commissions WHERE community_id = $1", [seed.communityId])), commissionCount);
  const after = await db.query<Record<string, any>>("SELECT id, settled_at FROM manual_grants WHERE settlement_id = $1 ORDER BY id", [
    settlementId,
  ]);
  assert.deepEqual(after, snapshot);

  const audit = await db.one<Record<string, any>>(
    "SELECT actor_type, after_state FROM audit_log WHERE action = 'settlement.reconciled' AND target_id = $1",
    [settlementId],
  );
  assert.equal(audit?.actor_type, "system");
  assert.equal(audit?.after_state.settledGrants, 2);
  assert.equal(
    Number(await db.scalar("SELECT count(*)::int FROM audit_log WHERE action = 'settlement.reconciled' AND target_id = $1", [settlementId])),
    1,
  );

  const list = await asAdmin("GET", `/v1/admin/manual-grants?communityId=${seed.communityId}`);
  assert.ok(!list.body.items.some((g: { id: string }) => g.id === a.grant.id), "réglé : sort des impayés");
});

test("un accès réglé ne peut pas être réglé deux fois (deux liens payés, SQL à la main)", async () => {
  await settleEverything();
  const a = await grant(await createUser());
  const first = await asAdmin("POST", "/v1/admin/settlements", { communityId: seed.communityId });
  const second = await asAdmin("POST", "/v1/admin/settlements", { communityId: seed.communityId });
  assert.equal(first.status, 201, first.text);
  assert.equal(second.status, 201, second.text);
  const firstId = String(first.body.settlement.id);
  const secondId = String(second.body.settlement.id);

  setMockPaymentStatus(await settlementRef(firstId), "paid");
  assert.equal((await webhook({ externalId: firstId })).body.status, "paid");
  const commissions = await commissionsOfGrant(String(a.grant.id));
  assert.equal(commissions, 1);

  // Le second lien est payé aussi : l'accès reste réglé par le premier, sans
  // seconde commission ; le versement en trop passe « à vérifier ».
  setMockPaymentStatus(await settlementRef(secondId), "paid");
  const late = await webhook({ externalId: secondId });
  assert.equal(late.status, 200, late.text);
  assert.equal(late.body.status, "needs_review");
  assert.equal(late.body.settledGrants, 0);
  assert.equal(String(await db.scalar("SELECT settlement_id FROM manual_grants WHERE id = $1", [a.grant.id])), firstId);
  assert.equal(await commissionsOfGrant(String(a.grant.id)), 1);

  // Même une requête écrite à la main ne peut pas rouvrir ni réattribuer un accès réglé.
  await assert.rejects(
    db.query("UPDATE manual_grants SET settlement_id = $2 WHERE id = $1", [a.grant.id, secondId]),
    /déjà réglé/,
  );
  await assert.rejects(db.query("UPDATE manual_grants SET status = 'owed', settlement_id = NULL, settled_at = NULL WHERE id = $1", [a.grant.id]));
  await assert.rejects(db.query("DELETE FROM manual_grants WHERE id = $1", [a.grant.id]));
});

test("échec chez le fournisseur : versement échoué, accès toujours dus ; vérification par un admin", async () => {
  await settleEverything();
  const a = await grant(await createUser());
  const res = await asAdmin("POST", "/v1/admin/settlements", { communityId: seed.communityId });
  const settlementId = String(res.body.settlement.id);
  const ref = await settlementRef(settlementId);

  setMockPaymentStatus(ref, "failed");
  const failed = await webhook({ transId: ref });
  assert.equal(failed.body.status, "failed");
  assert.equal(String(await db.scalar("SELECT status FROM manual_grants WHERE id = $1", [a.grant.id])), "owed");

  // Un nouveau versement reprend la dette.
  const retry = await asAdmin("POST", "/v1/admin/settlements", { communityId: seed.communityId });
  assert.equal(retry.status, 201, retry.text);
  const retryId = String(retry.body.settlement.id);
  setMockPaymentStatus(await settlementRef(retryId), "paid");

  // Confirmation demandée par un admin : refusée hors périmètre, revérifiée chez le fournisseur sinon.
  const foreign = await asOtherAdmin("POST", `/v1/admin/settlements/${retryId}/refresh`);
  assert.equal(foreign.status, 403, foreign.text);
  const refreshed = await asAdmin("POST", `/v1/admin/settlements/${retryId}/refresh`);
  assert.equal(refreshed.status, 200, refreshed.text);
  assert.equal(refreshed.body.settlement.status, "paid");
  assert.equal(refreshed.body.settledGrants, 1);
  assert.equal(refreshed.body.settlement.paymentUrl, null, "plus de lien une fois payé");
  const audit = await db.one<Record<string, any>>(
    "SELECT actor_id, actor_type FROM audit_log WHERE action = 'settlement.reconciled' AND target_id = $1",
    [retryId],
  );
  assert.equal(audit?.actor_id, "mg_admin");
  assert.equal(audit?.actor_type, "admin");

  const again = await asAdmin("POST", `/v1/admin/settlements/${retryId}/refresh`);
  assert.equal(again.body.changed, false);
  assert.equal(await commissionsOfGrant(String(a.grant.id)), 1);

  const listed = await asAdmin("GET", `/v1/admin/settlements?communityId=${seed.communityId}`);
  assert.equal(listed.status, 200, listed.text);
  assert.ok(listed.body.items.some((s: { id: string; status: string }) => s.id === retryId && s.status === "paid"));

  // Page de retour Fapshi : publique, affiche l'état sans rien exposer d'autre.
  const page = await call("GET", `/pay/settlement/${retryId}/return`);
  assert.equal(page.status, 200);
  assert.match(page.text, /Versement reçu/);
});

test("le flux des commandes ignore les versements : un webhook de commande inconnue reste 404", async () => {
  const res = await webhook({ transId: "mock_inconnu" });
  assert.equal(res.status, 404, res.text);
});
