/**
 * Accès manuels et versements à la plateforme (105, décisions owner du
 * 2026-10-30).
 *
 * 1. **Accord.** L'abonné a payé l'administrateur de sa communauté en direct
 *    (Orange Money, MTN ou autre, sur le numéro de l'administrateur). Rien ne
 *    passe par l'application. L'administrateur accorde le forfait : une
 *    commande à prix plein déjà payée (`provider = 'manual'`) porte
 *    l'abonnement, par `insertSubscriptionPeriod` — la même règle de dates
 *    qu'un achat. La ligne `manual_grants` naît `owed` : c'est une dette de
 *    l'administrateur envers la plateforme, au prix plein figé. **Aucune
 *    commission à ce moment-là.**
 * 2. **Versement.** Pour une communauté, le total des accès `owed` devient un
 *    versement (`settlements`) payé par un lien Fapshi. Flux distinct des
 *    commandes (aucune ligne `orders`) et des retraits (`payouts`).
 * 3. **Réconciliation.** Quand Fapshi confirme le paiement (webhook, retour de
 *    paiement ou vérification demandée par un administrateur — le statut vient
 *    toujours de `provider.fetchStatus`), les accès inclus passent `settled`
 *    et la commission de la communauté est créée, dans une seule transaction,
 *    avec la formule de `activateOrder` (taux figé sur la commande).
 *
 * Idempotence : `settlements` passe `pending|failed -> paid` par un UPDATE
 * conditionnel ; un accès passe `owed -> settled` par un UPDATE conditionnel ;
 * un accès réglé est figé par un déclencheur (105) ; `commissions.order_id`
 * est UNIQUE. Un second webhook ne double rien.
 */
import type { Database, Queryable, Row } from "../db.js";
import { env } from "../config.js";
import { newId } from "../lib/crypto.js";
import { ApiFailure, fail } from "../lib/errors.js";
import { payments as defaultProvider, type PaymentProvider, type ProviderPaymentStatus } from "../lib/fapshi.js";
import { COUPON_PLAN_CODE } from "./coupons.js";
import { commissionFor, insertSubscriptionPeriod } from "./payments.js";
import { activeNightOptions, planDurationMinutes, planTermsSql } from "./planTerms.js";
import { commissionCapBps, loadPricingSettings, type NightWindow } from "./pricing.js";

/** Moyens de paiement direct. « Peu importe l'opérateur » : seul l'historique s'en sert. */
export const PAYMENT_METHODS = ["orange_money", "mtn_momo", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** `orders.provider` des commandes qui portent un accès manuel. */
export const MANUAL_ORDER_PROVIDER = "manual";

/** Préfixe des versements : l'`externalId` envoyé à Fapshi dit ce qu'il désigne. */
export const SETTLEMENT_ID_PREFIX = "stl_";

/** Même adresse de reçu que `createOrder` (services/payments.ts). */
const PAYMENT_EMAIL = "support@numzer0.online";

/** Liste des impayés renvoyée d'un coup ; les totaux restent exacts au-delà. */
const OWED_LIST_LIMIT = 500;

export type GrantStatus = "owed" | "settled";
export type SettlementStatus = "pending" | "paid" | "failed" | "needs_review";

/* ------------------------------------------------------------------ DTO */

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

export const GRANT_SELECT = /* sql */ `
  SELECT g.id, g.community_id, g.user_id, g.plan_id, g.payment_method, g.note, g.amount_xaf,
         g.status, g.granted_at, g.settled_at, g.settlement_id, g.subscription_id,
         p.name AS plan_name, u.name AS user_name, a.name AS granted_by_name,
         s.ends_at AS subscription_ends_at, c.name AS community_name
    FROM manual_grants g
    JOIN plans p ON p.id = g.plan_id
    JOIN users u ON u.id = g.user_id
    JOIN communities c ON c.id = g.community_id
    LEFT JOIN admin_users a ON a.id = g.granted_by
    LEFT JOIN subscriptions s ON s.id = g.subscription_id`;

/** Ni commande, ni abonnement en clair : ce qui a été accordé, à qui, et ce qui reste dû. */
export function grantDto(row: Row) {
  return {
    id: String(row.id),
    communityId: String(row.community_id),
    communityName: (row.community_name as string | null | undefined) ?? null,
    userId: String(row.user_id),
    userName: (row.user_name as string | null | undefined) ?? null,
    planId: String(row.plan_id),
    planName: String(row.plan_name ?? ""),
    paymentMethod: row.payment_method as PaymentMethod,
    note: (row.note as string | null | undefined) ?? null,
    amountXaf: Number(row.amount_xaf),
    status: row.status as GrantStatus,
    grantedAt: iso(row.granted_at),
    settledAt: iso(row.settled_at),
    settlementId: (row.settlement_id as string | null | undefined) ?? null,
    grantedByName: (row.granted_by_name as string | null | undefined) ?? null,
    accessEndsAt: iso(row.subscription_ends_at),
  };
}

export const SETTLEMENT_SELECT = /* sql */ `
  SELECT st.id, st.community_id, st.amount_xaf, st.status, st.provider, st.provider_ref, st.payment_url,
         st.failure_reason, st.created_by, st.created_at, st.paid_at,
         a.name AS created_by_name, c.name AS community_name,
         (SELECT count(*)::int FROM settlement_items i WHERE i.settlement_id = st.id) AS grant_count
    FROM settlements st
    JOIN communities c ON c.id = st.community_id
    LEFT JOIN admin_users a ON a.id = st.created_by`;

export function settlementDto(row: Row) {
  const status = row.status as SettlementStatus;
  return {
    id: String(row.id),
    communityId: String(row.community_id),
    communityName: (row.community_name as string | null | undefined) ?? null,
    amountXaf: Number(row.amount_xaf),
    status,
    grantCount: Number(row.grant_count ?? 0),
    createdAt: iso(row.created_at),
    paidAt: iso(row.paid_at),
    createdByName: (row.created_by_name as string | null | undefined) ?? null,
    // Le lien n'a de sens que tant que l'argent n'est pas reçu.
    paymentUrl: status === "pending" ? ((row.payment_url as string | null | undefined) ?? null) : null,
    failureReason: (row.failure_reason as string | null | undefined) ?? null,
  };
}

export type GrantDto = ReturnType<typeof grantDto>;
export type SettlementDto = ReturnType<typeof settlementDto>;

/* ------------------------------------------------------------ forfaits */

/**
 * Forfaits qu'un administrateur peut accorder à la main : ceux de l'app de
 * l'abonné, actifs, payants, à prix fixe. Exclus : le forfait caché des
 * coupons et l'offre sur mesure (pas de prix plein unique).
 */
export async function grantablePlans(q: Queryable, appId: string): Promise<Row[]> {
  return q.query<Row>(
    `SELECT p.id, p.code, p.name, p.price_xaf, p.duration_days, p.duration_minutes, p.device_limit,
            ${planTermsSql("p")}
       FROM plans p
      WHERE p.app_id = $1 AND p.active = true AND p.price_xaf > 0 AND p.code <> $2
        AND COALESCE(p.family, 'limited') <> 'custom'
      ORDER BY p.sort_order ASC, p.price_xaf ASC, p.id ASC`,
    [appId, COUPON_PLAN_CODE],
  );
}

export function grantablePlanDto(row: Row) {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    priceXaf: Number(row.price_xaf),
    durationDays: Number(row.duration_days),
    durationMinutes: planDurationMinutes(row),
    family: String(row.family ?? "limited"),
    nightOptions: activeNightOptions(row.night_options),
  };
}

/* --------------------------------------------------------------- accord */

export interface GrantInput {
  userId: string;
  planId: string;
  paymentMethod: PaymentMethod;
  note: string | null;
  nightWindow: NightWindow | null;
  adminId: string;
  /** En-tête `Idempotency-Key` du dashboard : un même envoi ne crée qu'une dette. */
  requestKey: string | null;
}

export interface GrantResult {
  grantId: string;
  communityId: string;
  orderId: string;
  subscriptionId: string;
  amountXaf: number;
  planName: string;
  startsAt: Date | null;
  endsAt: Date | null;
  /** true : envoi déjà traité (même `requestKey`), rien n'a été recréé. */
  replayed: boolean;
}

/**
 * Accorde un forfait, dans la transaction de l'appelant (qui y écrit aussi
 * l'audit). Le compte est verrouillé : deux accords simultanés s'empilent au
 * lieu de lire la même date de fin.
 */
export async function grantManualAccess(q: Queryable, input: GrantInput): Promise<GrantResult> {
  const user = await q.one<Row>(
    "SELECT id, app_id, community_id, deleted_at FROM users WHERE id = $1 FOR UPDATE",
    [input.userId],
  );
  if (!user) throw fail.notFound("Abonné introuvable.");
  if (user.deleted_at) throw fail.conflict("Ce compte est supprimé : aucun forfait ne peut lui être accordé.");

  if (input.requestKey) {
    const existing = await q.one<Row>(
      `SELECT g.id, g.community_id, g.order_id, g.subscription_id, g.amount_xaf, p.name AS plan_name
         FROM manual_grants g JOIN plans p ON p.id = g.plan_id
        WHERE g.granted_by = $1 AND g.request_key = $2`,
      [input.adminId, input.requestKey],
    );
    if (existing) {
      return {
        grantId: String(existing.id),
        communityId: String(existing.community_id),
        orderId: String(existing.order_id),
        subscriptionId: String(existing.subscription_id),
        amountXaf: Number(existing.amount_xaf),
        planName: String(existing.plan_name),
        startsAt: null,
        endsAt: null,
        replayed: true,
      };
    }
  }

  const plan = await q.one<Row>(
    `SELECT p.id, p.app_id, p.code, p.name, p.price_xaf, p.duration_days, p.duration_minutes, p.active,
            c.commission_bps, ${planTermsSql("p")}
       FROM plans p
       JOIN apps a ON a.id = p.app_id
       JOIN communities c ON c.id = a.community_id
      WHERE p.id = $1`,
    [input.planId],
  );
  // Un forfait d'une autre marque est indistinguable d'un forfait inexistant.
  if (!plan || plan.app_id !== user.app_id || plan.code === COUPON_PLAN_CODE || plan.active !== true) {
    throw fail.notFound("Forfait introuvable pour l'application de cet abonné.");
  }
  if (plan.family === "custom") throw fail.conflict("L'offre sur mesure ne peut pas être accordée à la main.");
  const price = Number(plan.price_xaf);
  if (!Number.isInteger(price) || price <= 0) throw fail.conflict("Ce forfait n'a pas de prix : il ne peut pas être accordé.");

  // Plage de nuit : mêmes règles que `createOrder` ; le prix vient du forfait.
  const options = activeNightOptions(plan.night_options);
  const nightWindow = input.nightWindow;
  if (plan.family === "limited_night" && nightWindow === null) {
    throw fail.validation({ nightWindow: "Choisissez une plage de nuit pour ce forfait." });
  }
  if (plan.family !== "limited_night" && nightWindow !== null) {
    throw fail.validation({ nightWindow: "Ce forfait ne propose pas de plage de nuit." });
  }
  const option = nightWindow === null ? null : options.find((candidate) => candidate.window === nightWindow) ?? null;
  if (nightWindow !== null && option === null) {
    throw fail.validation({ nightWindow: "Plage de nuit non proposée pour ce forfait." });
  }

  // Prix plein figé : forfait + plage, comme un achat dans l'application.
  const amount = price + (option?.priceXaf ?? 0);
  const quotaBytes = plan.quota_bytes === null || plan.quota_bytes === undefined ? null : Number(plan.quota_bytes);
  const durationMinutes = plan.duration_minutes === null || plan.duration_minutes === undefined ? null : Number(plan.duration_minutes);
  // Taux figé sur la commande, plafonné comme à l'achat (D35, D125).
  const capBps = commissionCapBps(await loadPricingSettings(q));
  const bps = Math.max(0, Math.min(Number(plan.commission_bps) || 0, capBps));

  const orderId = newId();
  await q.query(
    `INSERT INTO orders (id, user_id, app_id, plan_id, community_id, amount_xaf, currency, status, provider,
                         commission_bps, commission_xaf, created_at, paid_at, activated_at,
                         night_window, quota_bytes, duration_minutes)
     VALUES ($1, $2, $3, $4, $5, $6, 'XAF', 'paid', $7, $8, $9, now(), now(), now(), $10, $11, $12)`,
    [
      orderId,
      user.id,
      user.app_id,
      plan.id,
      user.community_id,
      amount,
      MANUAL_ORDER_PROVIDER,
      bps,
      commissionFor(amount, bps, capBps),
      nightWindow,
      quotaBytes,
      durationMinutes,
    ],
  );
  const period = await insertSubscriptionPeriod(q, {
    userId: String(user.id),
    planId: String(plan.id),
    orderId,
    minutes: planDurationMinutes(plan),
    quotaBytes,
    nightWindow,
  });

  const grantId = newId();
  await q.query(
    `INSERT INTO manual_grants (id, community_id, user_id, plan_id, granted_by, payment_method, note, amount_xaf,
                                status, granted_at, subscription_id, order_id, request_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'owed', now(), $9, $10, $11)`,
    [
      grantId,
      user.community_id,
      user.id,
      plan.id,
      input.adminId,
      input.paymentMethod,
      input.note,
      amount,
      period.subscriptionId,
      orderId,
      input.requestKey,
    ],
  );

  return {
    grantId,
    communityId: String(user.community_id),
    orderId,
    subscriptionId: period.subscriptionId,
    amountXaf: amount,
    planName: String(plan.name),
    startsAt: period.startsAt,
    endsAt: period.endsAt,
    replayed: false,
  };
}

/* -------------------------------------------------------------- impayés */

export interface OwedSummary {
  communityId: string;
  communityName: string | null;
  count: number;
  totalXaf: number;
}

/** Impayés par communauté. `communityIds = null` : toutes (owner). */
export async function owedByCommunity(q: Queryable, communityIds: readonly string[] | null): Promise<OwedSummary[]> {
  const rows = await q.query<Row>(
    `SELECT g.community_id, c.name AS community_name, count(*)::int AS count, COALESCE(sum(g.amount_xaf), 0)::bigint AS total
       FROM manual_grants g
       JOIN communities c ON c.id = g.community_id
      WHERE g.status = 'owed' AND ($1::text[] IS NULL OR g.community_id = ANY($1::text[]))
      GROUP BY g.community_id, c.name
      ORDER BY total DESC, g.community_id ASC`,
    [communityIds === null ? null : [...communityIds]],
  );
  return rows.map((row) => ({
    communityId: String(row.community_id),
    communityName: (row.community_name as string | null) ?? null,
    count: Number(row.count),
    totalXaf: Number(row.total),
  }));
}

export async function listGrants(
  q: Queryable,
  filter: { communityIds: readonly string[] | null; status: GrantStatus; userId?: string; limit?: number },
): Promise<{ items: GrantDto[]; truncated: boolean }> {
  const limit = filter.limit ?? OWED_LIST_LIMIT;
  const rows = await q.query<Row>(
    `${GRANT_SELECT}
      WHERE g.status = $1
        AND ($2::text[] IS NULL OR g.community_id = ANY($2::text[]))
        AND ($3::text IS NULL OR g.user_id = $3)
      ORDER BY g.granted_at DESC, g.id DESC
      LIMIT $4`,
    [filter.status, filter.communityIds === null ? null : [...filter.communityIds], filter.userId ?? null, limit + 1],
  );
  return { items: rows.slice(0, limit).map(grantDto), truncated: rows.length > limit };
}

/* ------------------------------------------------------------- versement */

export interface PreparedSettlement {
  settlementId: string;
  communityId: string;
  communityName: string;
  amountXaf: number;
  grantIds: string[];
}

/**
 * Crée le versement de la communauté pour **tous** ses accès `owed`, figés
 * dans `settlement_items`. Dans la transaction de l'appelant (qui écrit
 * l'audit). L'appel au fournisseur se fait après, hors transaction
 * (`initiateSettlementPayment`). Refuse un total nul.
 */
export async function prepareSettlement(
  q: Queryable,
  input: { communityId: string; adminId: string; providerName: string },
): Promise<PreparedSettlement> {
  const community = await q.one<Row>("SELECT id, name FROM communities WHERE id = $1", [input.communityId]);
  if (!community) throw fail.notFound("Communauté introuvable.");

  const grants = await q.query<Row>(
    "SELECT id, amount_xaf FROM manual_grants WHERE community_id = $1 AND status = 'owed' ORDER BY granted_at ASC, id ASC FOR UPDATE",
    [input.communityId],
  );
  const total = grants.reduce((sum, row) => sum + Number(row.amount_xaf), 0);
  if (grants.length === 0 || total <= 0) {
    throw new ApiFailure(409, "CONFLICT", "Aucun accès manuel à régulariser pour cette communauté.", { reason: "NOTHING_OWED" });
  }

  const settlementId = `${SETTLEMENT_ID_PREFIX}${newId()}`;
  await q.query(
    `INSERT INTO settlements (id, community_id, amount_xaf, status, provider, created_by, created_at)
     VALUES ($1, $2, $3, 'pending', $4, $5, now())`,
    [settlementId, input.communityId, total, input.providerName, input.adminId],
  );
  for (const grant of grants) {
    await q.query("INSERT INTO settlement_items (settlement_id, grant_id, amount_xaf) VALUES ($1, $2, $3)", [
      settlementId,
      grant.id,
      Number(grant.amount_xaf),
    ]);
  }
  return {
    settlementId,
    communityId: input.communityId,
    communityName: String(community.name),
    amountXaf: total,
    grantIds: grants.map((row) => String(row.id)),
  };
}

/**
 * Lien de paiement Fapshi pour un versement préparé. Un échec du fournisseur
 * passe le versement `failed` (les accès restent `owed`, un nouveau versement
 * est possible) et remonte l'erreur.
 */
export async function initiateSettlementPayment(
  db: Database,
  settlement: PreparedSettlement,
  input: { adminId: string },
  provider: PaymentProvider = defaultProvider,
): Promise<{ providerRef: string; paymentUrl: string }> {
  let created;
  try {
    created = await provider.createPayment({
      orderId: settlement.settlementId,
      amountXaf: settlement.amountXaf,
      email: PAYMENT_EMAIL,
      userId: input.adminId,
      appName: settlement.communityName,
      message: `${settlement.communityName} — régularisation des accès manuels`.slice(0, 120),
      redirectUrl: `${env.publicBaseUrl}/pay/settlement/${settlement.settlementId}/return`,
    });
  } catch (error) {
    await db.query(
      "UPDATE settlements SET status = 'failed', failure_reason = 'provider_unavailable' WHERE id = $1 AND status = 'pending'",
      [settlement.settlementId],
    );
    throw error;
  }
  await db.query("UPDATE settlements SET provider_ref = $2, payment_url = $3 WHERE id = $1", [
    settlement.settlementId,
    created.providerRef,
    created.paymentUrl,
  ]);
  return created;
}

export async function loadSettlement(q: Queryable, settlementId: string): Promise<Row | null> {
  return q.one<Row>(`${SETTLEMENT_SELECT} WHERE st.id = $1`, [settlementId]);
}

/**
 * Le webhook désigne-t-il un versement ? Par `externalId` (id `stl_…`) ou par
 * référence de transaction. `null` : ce n'est pas un versement, le flux des
 * commandes s'applique sans changement.
 */
export async function findSettlementForWebhook(
  q: Queryable,
  input: { providerRef?: string | undefined; externalId?: string | undefined },
): Promise<string | null> {
  const externalId = input.externalId?.startsWith(SETTLEMENT_ID_PREFIX) ? input.externalId : null;
  const providerRef = input.providerRef ?? null;
  if (!externalId && !providerRef) return null;
  const row = await q.one<Row>(
    "SELECT id FROM settlements WHERE ($1::text IS NOT NULL AND id = $1) OR ($2::text IS NOT NULL AND provider_ref = $2) LIMIT 1",
    [externalId, providerRef],
  );
  return row ? String(row.id) : null;
}

/* -------------------------------------------------------- réconciliation */

/** Trace d'une réconciliation, écrite dans sa transaction. */
export type SettlementAudit = (
  q: Queryable,
  entry: { action: string; settlementId: string; communityId: string; before: unknown; after: unknown },
) => Promise<void>;

/** Sans administrateur (webhook, page de retour) : ligne `system`, comme `activateOrder`. */
const systemAudit: SettlementAudit = async (q, entry) => {
  await q.query(
    `INSERT INTO audit_log (id, actor_id, actor_type, action, target, target_type, target_id, community_id,
                            meta, before_state, after_state)
     VALUES ($1, NULL, 'system', $2, $3, 'settlement', $4, $5, '{}'::jsonb, $6::jsonb, $7::jsonb)`,
    [
      newId(),
      entry.action,
      `settlement:${entry.settlementId}`,
      entry.settlementId,
      entry.communityId,
      JSON.stringify(entry.before),
      JSON.stringify(entry.after),
    ],
  );
};

export interface ReconcileSettlementInput {
  settlementId?: string;
  providerRef?: string;
  /** Contrôle négatif seulement, comme pour les commandes : la référence est `settlements.amount_xaf`. */
  reportedAmountXaf?: number;
  provider?: PaymentProvider;
  audit?: SettlementAudit;
}

export interface ReconcileSettlementResult {
  settlement: SettlementDto;
  providerStatus: ProviderPaymentStatus | null;
  /** true si cet appel a fait avancer l'état. */
  changed: boolean;
  settledGrants: number;
  commissionXaf: number;
}

/**
 * Applique l'état réel du fournisseur à un versement. Le statut vient
 * **toujours** de `provider.fetchStatus`, jamais d'un corps de webhook.
 */
export async function reconcileSettlement(db: Database, input: ReconcileSettlementInput): Promise<ReconcileSettlementResult> {
  const provider = input.provider ?? defaultProvider;
  const audit = input.audit ?? systemAudit;
  const row = input.settlementId
    ? await loadSettlement(db, input.settlementId)
    : input.providerRef
      ? await db.one<Row>(`${SETTLEMENT_SELECT} WHERE st.provider_ref = $1`, [input.providerRef])
      : null;
  if (!row) throw fail.notFound("Versement introuvable.");
  const settlementId = String(row.id);
  const communityId = String(row.community_id);

  if (input.reportedAmountXaf !== undefined && input.reportedAmountXaf !== Number(row.amount_xaf)) {
    throw new ApiFailure(409, "CONFLICT", "Le montant annoncé ne correspond pas au versement.", { reason: "AMOUNT_MISMATCH" });
  }

  const unchanged = (providerStatus: ProviderPaymentStatus | null, current: Row = row): ReconcileSettlementResult => ({
    settlement: settlementDto(current),
    providerStatus,
    changed: false,
    settledGrants: 0,
    commissionXaf: 0,
  });

  // Déjà réconcilié : rien à redemander au fournisseur, rien à refaire.
  if (row.status === "paid" || row.status === "needs_review") return unchanged(null);
  const providerRef = row.provider_ref as string | null;
  if (!providerRef) return unchanged(null);

  const providerStatus = await provider.fetchStatus(providerRef);
  if (providerStatus === "pending") return unchanged(providerStatus);

  if (providerStatus === "failed") {
    const changed = await db.tx(async (q) => {
      const rows = await q.query(
        "UPDATE settlements SET status = 'failed', failure_reason = 'provider_reported_failed' WHERE id = $1 AND status = 'pending' RETURNING id",
        [settlementId],
      );
      if (rows.length === 0) return false;
      await audit(q, {
        action: "settlement.failed",
        settlementId,
        communityId,
        before: { status: "pending" },
        after: { status: "failed", reason: "provider_reported_failed" },
      });
      return true;
    });
    const fresh = (await loadSettlement(db, settlementId)) ?? row;
    return { ...unchanged(providerStatus, fresh), changed };
  }

  /* providerStatus === "paid" : argent reçu, réconciliation en une transaction. */
  const outcome = await db.tx(async (q) => {
    const moved = await q.query<Row>(
      `UPDATE settlements SET status = 'paid', paid_at = now(), failure_reason = NULL
        WHERE id = $1 AND status IN ('pending', 'failed')
        RETURNING status`,
      [settlementId],
    );
    // Un autre passage (webhook rejoué, retour de paiement) a déjà tout fait.
    if (moved.length === 0) return null;

    const items = await q.query<Row>("SELECT grant_id FROM settlement_items WHERE settlement_id = $1", [settlementId]);
    const grantIds = items.map((item) => String(item.grant_id));
    const settled = grantIds.length
      ? await q.query<Row>(
          `UPDATE manual_grants SET status = 'settled', settled_at = now(), settlement_id = $1
            WHERE id = ANY($2::text[]) AND status = 'owed'
            RETURNING id, order_id, amount_xaf`,
          [settlementId, grantIds],
        )
      : [];

    let commissionXaf = 0;
    for (const grant of settled) {
      const order = await q.one<Row>("SELECT id, community_id, amount_xaf, commission_bps FROM orders WHERE id = $1", [grant.order_id]);
      if (!order) throw new Error(`versement ${settlementId} : commande de l'accès ${String(grant.id)} introuvable`);
      // Même formule que `activateOrder` : taux figé sur la commande, déjà plafonné.
      const amount = commissionFor(Number(order.amount_xaf), Number(order.commission_bps), 10_000);
      if (amount <= 0) continue;
      const inserted = await q.query(
        `INSERT INTO commissions (id, community_id, order_id, bps, amount_xaf, status, available_at)
         VALUES ($1, $2, $3, $4, $5, 'available', now())
         ON CONFLICT (order_id) DO NOTHING
         RETURNING id`,
        [newId(), order.community_id, order.id, order.commission_bps, amount],
      );
      if (inserted.length === 1) commissionXaf += amount;
    }

    // Accès déjà réglés par un autre versement (deux liens payés) : l'argent
    // en trop n'est pas perdu de vue, le versement passe « à vérifier ».
    const alreadySettled = grantIds.length - settled.length;
    if (alreadySettled > 0) {
      await q.query("UPDATE settlements SET status = 'needs_review', failure_reason = $2 WHERE id = $1", [
        settlementId,
        `already_settled_grants:${alreadySettled}`,
      ]);
    }

    await audit(q, {
      action: "settlement.reconciled",
      settlementId,
      communityId,
      before: { status: row.status },
      after: {
        status: alreadySettled > 0 ? "needs_review" : "paid",
        amountXaf: Number(row.amount_xaf),
        settledGrants: settled.length,
        alreadySettledGrants: alreadySettled,
        commissionXaf,
      },
    });
    return { settledGrants: settled.length, commissionXaf };
  });

  const fresh = (await loadSettlement(db, settlementId)) ?? row;
  if (!outcome) return unchanged(providerStatus, fresh);
  return {
    settlement: settlementDto(fresh),
    providerStatus,
    changed: true,
    settledGrants: outcome.settledGrants,
    commissionXaf: outcome.commissionXaf,
  };
}
