/**
 * Orchestration argent : commande -> paiement -> confirmation -> activation ->
 * commission.
 *
 * Trois invariants portent tout le fichier :
 *
 * 1. **Le montant et le taux viennent de la base.** Le client envoie
 *    `planId` + `planRevision`, jamais un prix ; le taux de commission est figé
 *    sur la commande au moment de l'achat (`orders.commission_bps`).
 * 2. **Le webhook n'est jamais cru.** `reconcilePayment` réinterroge le
 *    fournisseur (`PaymentProvider.fetchStatus`) avant toute transition. Un
 *    corps qui annonce `paid` sur une transaction encore `pending` n'active
 *    rien.
 * 3. **Paiement confirmé != accès actif.** Marquer `paid` est une transaction
 *    courte et définitive ; l'activation est une seconde transaction qui peut
 *    échouer sans jamais faire reculer le paiement. Une commande `paid` sans
 *    abonnement s'affiche `activationStatus: "pending"` — et n'expose plus
 *    d'URL de paiement, donc l'app ne peut pas proposer de repayer.
 *
 * Idempotence : la transition `pending -> paid` est un UPDATE conditionnel
 * (`WHERE status IN ('created','pending')`) ; seul le premier passage obtient
 * une ligne. L'activation et la commission sont ensuite gardées par
 * `subscriptions.order_id` (lecture) et `commissions.order_id` (UNIQUE).
 */
import type { Database, Queryable, Row } from "../db.js";
import { env } from "../config.js";
import { addDays, addMinutes, newId, sha256Hex } from "../lib/crypto.js";
import { ApiFailure, fail } from "../lib/errors.js";
import { payments as defaultProvider, type PaymentProvider, type ProviderPaymentStatus } from "../lib/fapshi.js";
import { commissionCapBps, loadPricingSettings, type NightWindow } from "./pricing.js";
import { activeNightOptions, planTermsSql } from "./planTerms.js";
import {
  assertChoiceAllowed,
  customPriceXaf,
  customRevisionMaterial,
  customTermsFromJson,
  type CustomChoice,
} from "./customOffer.js";
import { BYTES_PER_GB } from "./pricing.js";

/** Fenêtre de paiement d'une commande. Même valeur que l'exemple du contrat. */
export const ORDER_TTL_MINUTES = 24 * 60;
/** Cadence de polling conseillée à l'app (minimum contractuel : 10 s). */
export const POLL_AFTER_SECONDS = 15;
/** Nombre d'événements webhook conservés avant purge des plus anciens. */
const WEBHOOK_RETENTION_DAYS = 30;

/* ------------------------------------------------------------------- types */

export type OrderStatus = "created" | "pending" | "paid" | "failed" | "expired" | "refunded";
export type ActivationStatus = "not_started" | "pending" | "active" | "failed" | "revoked";

export interface PlanRow {
  id: string;
  app_id: string;
  code: string;
  name: string;
  description: string;
  price_xaf: number;
  duration_days: number;
  device_limit: number;
  active: boolean;
  community_id: string;
  commission_bps: number;
  family: string;
  quota_bytes: number | string | null;
  endpoint_tier: string | null;
  night_options: unknown;
  custom_terms: unknown;
}

export interface OrderRow {
  id: string;
  user_id: string;
  app_id: string;
  plan_id: string;
  community_id: string;
  amount_xaf: number;
  currency: string;
  status: OrderStatus;
  provider: string;
  provider_ref: string | null;
  payment_url: string | null;
  commission_bps: number;
  commission_xaf: number;
  utm: unknown;
  failure_reason: string | null;
  created_at: Date | string;
  paid_at: Date | string | null;
  activated_at: Date | string | null;
  expires_at: Date | string | null;
  /* jointure plans */
  plan_code: string;
  plan_name: string;
  duration_days: number;
  device_limit: number;
  plan_price: number;
  plan_active: boolean;
  plan_family: string;
  plan_quota_bytes: number | string | null;
  plan_endpoint_tier: string | null;
  plan_night_options: unknown;
  plan_custom_terms: unknown;
  /* R6 : plage choisie et quota figé à l'achat */
  night_window: string | null;
  quota_bytes: number | string | null;
  /* D127 : durée choisie (offre sur mesure), NULL ailleurs */
  order_duration_days: number | null;
}

export interface OrderDto {
  orderId: string;
  planId: string;
  planRevision: number;
  price: { amount: number; currency: "XAF" };
  status: OrderStatus;
  activationStatus: ActivationStatus;
  createdAt: string;
  expiresAt?: string;
  paidAt?: string;
  checkout?: { url: string; expiresAt: string };
  failureCode?: string;
  nightWindow?: NightWindow;
  /** D127 : choix de l'offre sur mesure. */
  custom?: { gb: number; days: number };
  pollAfterSeconds: number;
}

export interface CreateOrderInput {
  userId: string;
  planId: string;
  planRevision: number;
  /** Requise pour la famille limité + nuit, interdite sinon. */
  nightWindow?: NightWindow | null;
  /** D127 : requis pour l'offre sur mesure, interdit ailleurs. */
  custom?: CustomChoice | null;
  utm?: Record<string, string> | null;
}

export interface CreateOrderResult {
  order: OrderDto;
  /** Champs utiles aux tests et au support, jamais renvoyés au mobile. */
  raw: { orderId: string; providerRef: string; paymentUrl: string };
}

export interface ReconcileInput {
  orderId?: string;
  providerRef?: string;
  /**
   * Montant annoncé par le corps du webhook. Sert uniquement de **contrôle
   * négatif** : la référence reste `orders.amount_xaf`. Absent -> pas de
   * contrôle, la vérification fournisseur fait foi.
   */
  reportedAmountXaf?: number;
  provider?: PaymentProvider;
}

export interface ReconcileResult {
  order: OrderDto;
  providerStatus: ProviderPaymentStatus;
  /** true si cette requête a fait avancer l'état (paiement ou activation). */
  changed: boolean;
  activated: boolean;
}

export interface WebhookInput {
  eventId: string;
  providerRef?: string;
  orderId?: string;
  reportedAmountXaf?: number;
  payloadHash: string;
  provider?: PaymentProvider;
}

export interface WebhookResult {
  status: "processed" | "pending" | "duplicate" | "ignored_paid" | "failed";
  orderId: string | null;
  orderStatus: OrderStatus | null;
  activationStatus: ActivationStatus | null;
  activated: boolean;
}

/* ---------------------------------------------------------------- montants */

/**
 * Termes d'une offre tels que lus en base (plans + options de nuit).
 * Les champs R6 sont optionnels : une ligne sans eux garde les valeurs par
 * défaut du schéma (famille limitée, sans quota, nœud illimité).
 */
export interface PlanTermsRow {
  code: string;
  price_xaf: number | string;
  duration_days: number | string;
  device_limit: number | string;
  active: boolean;
  family?: string | null;
  quota_bytes?: number | string | null;
  endpoint_tier?: string | null;
  night_options?: unknown;
  /** D127 : termes sur mesure (JSON de `customTermsSql`), absents ailleurs. */
  custom_terms?: unknown;
}

/**
 * Révision de prix dérivée de l'offre. `plans` n'a pas de colonne `revision` :
 * on dérive donc un entier stable depuis les termes commerciaux. Changer un
 * prix, une durée, une limite d'appareils, l'activation, la famille, le quota,
 * la nature de nœud ou une option de nuit active change la révision, ce qui
 * produit le `409` attendu par le contrat au lieu d'un achat à l'ancien prix.
 */
export function planRevision(plan: PlanTermsRow): number {
  const nightOptions = activeNightOptions(plan.night_options)
    .map((option) => `${option.window}:${option.priceXaf}`)
    .join(",");
  const material = [
    plan.code,
    String(Number(plan.price_xaf)),
    String(Number(plan.duration_days)),
    String(Number(plan.device_limit)),
    plan.active ? "1" : "0",
    plan.family ?? "limited",
    plan.quota_bytes === null || plan.quota_bytes === undefined ? "-" : String(Number(plan.quota_bytes)),
    plan.endpoint_tier ?? "free-labs",
    nightOptions,
  ];
  // Ajouté seulement pour l'offre sur mesure : la révision des forfaits
  // existants ne change pas (les apps déjà installées la comparent).
  const custom = customRevisionMaterial(customTermsFromJson(plan.custom_terms));
  if (custom) material.push(custom);
  const joined = material.join("|");
  let hash = 0x811c9dc5;
  for (let i = 0; i < joined.length; i += 1) {
    hash ^= joined.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return Math.max(1, hash & 0x7fffffff);
}

/**
 * Commission en XAF entiers. Arrondi vers le bas : on ne promet jamais à une
 * communauté plus que ce qui a été encaissé, et la somme des commissions ne
 * peut pas dépasser le montant de la commande.
 *
 * D35 : l'enveloppe est plafonnée à 30 % du montant encaissé. Le taux est
 * toujours lu sur la communauté, jamais fourni par le client.
 */
export const MAX_COMMISSION_BPS = 3000;

/**
 * `capBps` vient des réglages tarifaires (`commissionCapBps`, D125) ; sans
 * réglage, le repli est le 30 % de D35. L'activation passe 10 000 : le taux
 * figé sur la commande est déjà plafonné à la création, le relire ne doit pas
 * le rabaisser si le plafond a changé entre-temps.
 */
export function commissionFor(amountXaf: number, bps: number, capBps: number = MAX_COMMISSION_BPS): number {
  if (amountXaf <= 0 || bps <= 0) return 0;
  return Math.floor((amountXaf * Math.min(bps, capBps)) / 10_000);
}

const iso = (value: Date | string | null): string | undefined =>
  value === null ? undefined : value instanceof Date ? value.toISOString() : new Date(value).toISOString();

/**
 * `activationStatus` est dérivé, jamais stocké :
 * - `paid` + `activated_at` -> l'abonnement existe, l'accès est prêt ;
 * - `paid` sans `activated_at` -> activation en cours ou à reprendre. L'app
 *   affiche « Paiement reçu, activation en cours », pas « Repayez » ;
 * - `refunded` -> accès révoqué.
 */
export function activationStatusOf(order: Pick<OrderRow, "status" | "activated_at">): ActivationStatus {
  if (order.status === "paid") return order.activated_at ? "active" : "pending";
  if (order.status === "refunded") return "revoked";
  return "not_started";
}

export function toOrderDto(order: OrderRow): OrderDto {
  const activationStatus = activationStatusOf(order);
  const status = order.status;
  const dto: OrderDto = {
    orderId: order.id,
    planId: order.plan_id,
    planRevision: planRevision({
      code: order.plan_code,
      price_xaf: order.plan_price,
      duration_days: order.duration_days,
      device_limit: order.device_limit,
      active: order.plan_active,
      family: order.plan_family,
      quota_bytes: order.plan_quota_bytes,
      endpoint_tier: order.plan_endpoint_tier,
      night_options: order.plan_night_options,
      custom_terms: order.plan_custom_terms,
    }),
    price: { amount: order.amount_xaf, currency: "XAF" },
    status,
    activationStatus,
    createdAt: iso(order.created_at) as string,
    pollAfterSeconds: POLL_AFTER_SECONDS,
  };

  const expiresAt = iso(order.expires_at);
  if (expiresAt) dto.expiresAt = expiresAt;
  const paidAt = iso(order.paid_at);
  if (paidAt) dto.paidAt = paidAt;
  if (order.night_window) dto.nightWindow = order.night_window as NightWindow;
  if (order.plan_family === "custom" && order.quota_bytes !== null && order.order_duration_days !== null) {
    dto.custom = { gb: Math.round(Number(order.quota_bytes) / BYTES_PER_GB), days: Number(order.order_duration_days) };
  }

  // Une URL de paiement n'existe que tant que l'argent n'est pas encaissé.
  // Après `paid`, l'absence de `checkout` est ce qui empêche l'app de
  // réafficher un bouton « Repayer ».
  if ((status === "created" || status === "pending") && order.payment_url && expiresAt) {
    dto.checkout = { url: order.payment_url, expiresAt };
  }
  if (order.failure_reason && status !== "paid") {
    dto.failureCode = failureCodeOf(order.failure_reason);
  }
  return dto;
}

/** Ne jamais laisser fuir un message interne dans `failureCode`. */
function failureCodeOf(reason: string): string {
  if (reason.startsWith("activation_")) return "ACTIVATION_FAILED";
  if (reason.startsWith("late_payment")) return "RECONCILIATION_REQUIRED";
  if (reason.startsWith("provider_")) return "PAYMENT_PROVIDER_ERROR";
  if (reason === "amount_mismatch") return "AMOUNT_MISMATCH";
  if (reason === "expired") return "ORDER_EXPIRED";
  return "PAYMENT_FAILED";
}

/* ------------------------------------------------------------------ lecture */

/** Projection commune des commandes (liste, détail, verrou d'activation). */
export const ORDER_SELECT = /* sql */ `
  SELECT o.id, o.user_id, o.app_id, o.plan_id, o.community_id, o.amount_xaf, o.currency,
         o.status, o.provider, o.provider_ref, o.payment_url, o.commission_bps, o.commission_xaf,
         o.utm, o.failure_reason, o.created_at, o.paid_at, o.activated_at, o.expires_at,
         o.night_window, o.quota_bytes, o.duration_days AS order_duration_days,
         p.code AS plan_code, p.name AS plan_name, p.duration_days, p.device_limit,
         p.price_xaf AS plan_price, p.active AS plan_active,
         ${planTermsSql("p", "plan_")}
    FROM orders o
    JOIN plans p ON p.id = o.plan_id`;

export async function loadOrder(db: Queryable, orderId: string): Promise<OrderRow | null> {
  return db.one<OrderRow>(`${ORDER_SELECT} WHERE o.id = $1`, [orderId]);
}

export async function loadOrderByProviderRef(db: Queryable, providerRef: string): Promise<OrderRow | null> {
  return db.one<OrderRow>(`${ORDER_SELECT} WHERE o.provider_ref = $1`, [providerRef]);
}

/* -------------------------------------------------------------- création */

/**
 * Crée la commande puis initialise le paiement chez le fournisseur.
 *
 * Aucun champ monétaire n'est accepté du client. La révision est comparée à
 * celle dérivée de l'offre lue en base : une révision périmée renvoie 409 et
 * l'app doit recharger l'offre (`PLAN_CHANGED` dans le contrat).
 */
export async function createOrder(
  db: Database,
  input: CreateOrderInput,
  provider: PaymentProvider = defaultProvider,
): Promise<CreateOrderResult> {
  const user = await db.one<Row>(
    "SELECT id, app_id, community_id, email, name, deleted_at FROM users WHERE id = $1",
    [input.userId],
  );
  if (!user || user.deleted_at) throw fail.unauthenticated("Compte indisponible.");

  const plan = await db.one<PlanRow>(
    `SELECT p.id, p.app_id, p.code, p.name, p.description, p.price_xaf, p.duration_days,
            p.device_limit, p.active, a.community_id, c.commission_bps,
            ${planTermsSql("p")}
       FROM plans p
       JOIN apps a ON a.id = p.app_id
       JOIN communities c ON c.id = a.community_id
      WHERE p.id = $1`,
    [input.planId],
  );
  // Une offre d'une autre marque est indistinguable d'une offre inexistante.
  if (!plan || plan.app_id !== user.app_id || !plan.active) throw fail.notFound("Offre introuvable.");

  const revision = planRevision(plan);
  if (revision !== input.planRevision) {
    throw new ApiFailure(409, "CONFLICT", "Le prix de l'offre a changé. Rechargez-la avant de confirmer.", {
      reason: "PLAN_CHANGED",
      planRevision: String(revision),
    });
  }

  if (!Number.isInteger(plan.price_xaf) || plan.price_xaf <= 0) {
    throw fail.conflict("Cette offre n'est pas payable.");
  }

  /*
   * Plage de nuit (R6) : requise pour la famille limité + nuit, interdite
   * ailleurs. Le prix de la plage vient de `plan_night_options`, jamais du
   * client. Une option inactive ou absente est refusée comme inexistante.
   */
  const activeOptions = activeNightOptions(plan.night_options);
  const nightWindow = input.nightWindow ?? null;
  if (plan.family === "limited_night" && nightWindow === null) {
    throw fail.validation({ nightWindow: "Choisissez une plage de nuit pour ce forfait." });
  }
  // Offre sur mesure : la plage de nuit est une option facultative.
  if (plan.family !== "limited_night" && plan.family !== "custom" && nightWindow !== null) {
    throw fail.validation({ nightWindow: "Ce forfait ne propose pas de plage de nuit." });
  }
  const option = nightWindow === null ? null : activeOptions.find((candidate) => candidate.window === nightWindow) ?? null;
  if (nightWindow !== null && option === null) {
    throw fail.validation({ nightWindow: "Plage de nuit non proposée pour ce forfait." });
  }
  /*
   * Offre sur mesure (D127) : le choix (Go, jours) est requis et borné par
   * l'offre ; le prix vient de la formule serveur, jamais du client.
   */
  const customTerms = plan.family === "custom" ? customTermsFromJson(plan.custom_terms) : null;
  const choice = input.custom ?? null;
  if (plan.family === "custom") {
    if (!customTerms) throw fail.conflict("Cette offre n'est pas payable.");
    if (!choice) throw fail.validation({ custom: "Choisissez la data et la durée." });
    assertChoiceAllowed(customTerms, choice);
  } else if (choice) {
    throw fail.validation({ custom: "Ce forfait n'est pas sur mesure." });
  }
  const basePrice = customTerms && choice ? customPriceXaf(customTerms, choice) : plan.price_xaf;
  const quotaBytes =
    customTerms && choice
      ? choice.gb * BYTES_PER_GB
      : plan.quota_bytes === null || plan.quota_bytes === undefined
        ? null
        : Number(plan.quota_bytes);
  const durationDays = customTerms && choice ? choice.days : null;
  // Total calculé côté serveur : prix du forfait + prix de la plage.
  const amount = basePrice + (option?.priceXaf ?? 0);

  const orderId = newId();
  const now = new Date();
  const expiresAt = addMinutes(now, ORDER_TTL_MINUTES);
  // D125 : le plafond de commission est un réglage owner ; sans réglage, 30 % (D35).
  const settings = await loadPricingSettings(db);
  const capBps = commissionCapBps(settings);
  const bps = Math.max(0, Math.min(Number(plan.commission_bps) || 0, capBps));

  await db.query(
    `INSERT INTO orders (id, user_id, app_id, plan_id, community_id, amount_xaf, currency, status,
                         provider, commission_bps, commission_xaf, utm, created_at, expires_at,
                         night_window, quota_bytes, duration_days)
     VALUES ($1, $2, $3, $4, $5, $6, 'XAF', 'pending', $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15)`,
    [
      orderId,
      user.id,
      plan.app_id,
      plan.id,
      plan.community_id,
      amount,
      provider.name,
      bps,
      // Figé ici : un changement de taux ultérieur ne réécrit pas l'historique.
      commissionFor(amount, bps, capBps),
      input.utm ? JSON.stringify(input.utm) : null,
      now,
      expiresAt,
      // Figés comme le taux : l'abonnement copie ces valeurs, pas celles du forfait.
      nightWindow,
      quotaBytes,
      durationDays,
    ],
  );

  let created;
  try {
    created = await provider.createPayment({
      orderId,
      amountXaf: amount,
      email: "support@numzer0.online",
      userId: String(user.id),
      appName: String(user.name ?? ""),
      redirectUrl: `${env.publicBaseUrl}/pay/return/${orderId}`,
    });
  } catch (error) {
    // La commande reste une trace d'échec ; une nouvelle tentative crée une
    // nouvelle intention, conformément au contrat.
    await db.query(
      "UPDATE orders SET status = 'failed', failure_reason = 'provider_unavailable' WHERE id = $1",
      [orderId],
    );
    throw error;
  }

  await db.query("UPDATE orders SET provider_ref = $2, payment_url = $3 WHERE id = $1", [
    orderId,
    created.providerRef,
    created.paymentUrl,
  ]);

  const order = await loadOrder(db, orderId);
  if (!order) throw fail.notFound("Commande introuvable.");
  return {
    order: toOrderDto(order),
    raw: { orderId, providerRef: created.providerRef, paymentUrl: created.paymentUrl },
  };
}

/* --------------------------------------------------------- confirmation */

/**
 * Transition `pending -> paid`, atomique et non réversible par un webhook
 * tardif. Renvoie true seulement pour l'appel qui a effectivement basculé la
 * ligne : c'est le verrou d'idempotence de tout ce qui suit.
 */
async function markPaid(db: Queryable, orderId: string): Promise<boolean> {
  const rows = await db.query(
    `UPDATE orders
        SET status = 'paid', paid_at = now()
      WHERE id = $1 AND status IN ('created', 'pending')
      RETURNING id`,
    [orderId],
  );
  return rows.length === 1;
}

async function markFailed(db: Queryable, orderId: string, reason: string): Promise<boolean> {
  const rows = await db.query(
    `UPDATE orders
        SET status = 'failed', failure_reason = $2
      WHERE id = $1 AND status IN ('created', 'pending')
      RETURNING id`,
    [orderId, reason],
  );
  return rows.length === 1;
}

/**
 * Active une commande payée : abonnement + horodatage + commission.
 *
 * Transaction séparée de `markPaid`. Si elle échoue, la commande reste `paid`
 * et l'app affiche une activation en attente ; un webhook rejoué ou un
 * `GET /orders/{id}?refresh=1` reprend le travail. Idempotent : un abonnement
 * existant pour la commande interdit une seconde activation, et
 * `commissions.order_id` est UNIQUE.
 */
export async function activateOrder(db: Database, orderId: string): Promise<boolean> {
  return db.tx(async (q) => {
    // Verrou de ligne sur la commande (R6 / B3) : deux activations simultanées
    // (webhook et `?refresh=1`) se suivent au lieu de lire « pas d'abonnement »
    // en même temps. `OF o` : le verrou ne porte pas sur `plans`.
    const order = await q.one<OrderRow>(`${ORDER_SELECT} WHERE o.id = $1 FOR UPDATE OF o`, [orderId]);
    if (!order) throw fail.notFound("Commande introuvable.");
    if (order.status !== "paid") return false;

    const existing = await q.one<Row>("SELECT id FROM subscriptions WHERE order_id = $1 LIMIT 1", [orderId]);
    if (existing) {
      if (!order.activated_at) {
        await q.query("UPDATE orders SET activated_at = now() WHERE id = $1 AND activated_at IS NULL", [orderId]);
      }
      return false;
    }

    // Renouvellement : la nouvelle période s'empile après l'abonnement actif
    // plutôt que d'écraser les jours déjà payés.
    const current = await q.one<Row>(
      `SELECT ends_at FROM subscriptions
        WHERE user_id = $1 AND status = 'active' AND ends_at > now()
        ORDER BY ends_at DESC LIMIT 1`,
      [order.user_id],
    );

    const now = new Date();
    const startsAt = current?.ends_at ? new Date(current.ends_at as string | Date) : now;
    const from = startsAt.getTime() > now.getTime() ? startsAt : now;
    const endsAt = addDays(from, Number(order.order_duration_days ?? order.duration_days));

    // Quota et plage copiés depuis la commande (figés à l'achat, R6).
    await q.query(
      `INSERT INTO subscriptions (id, user_id, plan_id, order_id, status, starts_at, ends_at, quota_bytes, night_window)
       VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8)`,
      [
        newId(),
        order.user_id,
        order.plan_id,
        orderId,
        from,
        endsAt,
        order.quota_bytes === null || order.quota_bytes === undefined ? null : Number(order.quota_bytes),
        order.night_window,
      ],
    );
    await q.query("UPDATE orders SET activated_at = now() WHERE id = $1 AND activated_at IS NULL", [orderId]);

    // Commission calculée depuis la commande (taux figé à l'achat et déjà
    // plafonné), jamais depuis une valeur transmise.
    const amount = commissionFor(Number(order.amount_xaf), Number(order.commission_bps), 10_000);
    if (amount > 0) {
      await q.query(
        `INSERT INTO commissions (id, community_id, order_id, bps, amount_xaf, status, available_at)
         VALUES ($1, $2, $3, $4, $5, 'available', now())
         ON CONFLICT (order_id) DO NOTHING`,
        [newId(), order.community_id, orderId, order.commission_bps, amount],
      );
      await q.query(
        `INSERT INTO audit_log (id, actor_id, actor_type, action, target, meta)
         VALUES ($1, NULL, 'system', 'commission.created', $2, $3::jsonb)`,
        [newId(), orderId, JSON.stringify({ bps: order.commission_bps, amountXaf: amount, communityId: order.community_id })],
      );
    }
    return true;
  });
}

/**
 * Applique l'état réel du fournisseur à une commande.
 *
 * Le statut vient **toujours** de `provider.fetchStatus` ; un `reportedAmountXaf`
 * différent du montant de la commande fait échouer la réconciliation sans
 * toucher à l'état (aucune activation, aucun refus de payer non plus : la
 * commande reste `pending` pour un rapprochement humain).
 */
export async function reconcilePayment(db: Database, input: ReconcileInput): Promise<ReconcileResult> {
  const provider = input.provider ?? defaultProvider;
  const order = input.orderId
    ? await loadOrder(db, input.orderId)
    : input.providerRef
      ? await loadOrderByProviderRef(db, input.providerRef)
      : null;
  if (!order) throw fail.notFound("Commande introuvable.");

  if (input.reportedAmountXaf !== undefined && input.reportedAmountXaf !== Number(order.amount_xaf)) {
    throw new ApiFailure(409, "CONFLICT", "Le montant annoncé ne correspond pas à la commande.", {
      reason: "AMOUNT_MISMATCH",
    });
  }

  const providerRef = order.provider_ref;
  if (!providerRef) {
    // Paiement jamais initialisé : rien à interroger, rien à activer.
    return { order: toOrderDto(order), providerStatus: "pending", changed: false, activated: false };
  }

  const providerStatus = await provider.fetchStatus(providerRef);

  if (providerStatus === "pending") {
    return { order: toOrderDto(order), providerStatus, changed: false, activated: false };
  }

  if (providerStatus === "failed") {
    // Ne jamais dégrader un paiement déjà encaissé sur la foi d'un webhook :
    // un `failed` après `paid` est un rapprochement, pas un remboursement.
    if (order.status === "paid" || order.status === "refunded") {
      return { order: toOrderDto(order), providerStatus, changed: false, activated: false };
    }
    const changed = await markFailed(db, order.id, "provider_reported_failed");
    const fresh = (await loadOrder(db, order.id)) ?? order;
    return { order: toOrderDto(fresh), providerStatus, changed, activated: false };
  }

  /* providerStatus === "paid" */
  const changed = await markPaid(db, order.id);
  let activated = false;
  if (changed || order.status === "paid") {
    try {
      activated = await activateOrder(db, order.id);
    } catch (error) {
      // Le paiement reste acquis. On note la reprise, on ne rembourse pas et
      // on ne redemande pas de payer.
      const message = error instanceof Error ? error.message : "unknown";
      await db.query(
        "UPDATE orders SET failure_reason = $2 WHERE id = $1 AND activated_at IS NULL",
        [order.id, `activation_failed: ${message.slice(0, 180)}`],
      );
      console.error("[payments] activation failed", order.id, message);
    }
  } else if (order.status === "failed") {
    // Argent annoncé sur une commande déjà marquée échouée : on ne réactive
    // pas tout seul (l'utilisateur a peut-être racheté), mais on refuse de
    // perdre l'information. Rapprochement humain obligatoire.
    await db.query(
      "UPDATE orders SET failure_reason = 'late_payment_requires_reconciliation' WHERE id = $1 AND status = 'failed'",
      [order.id],
    );
  }

  const fresh = (await loadOrder(db, order.id)) ?? order;
  return { order: toOrderDto(fresh), providerStatus, changed: changed || activated, activated };
}

/* --------------------------------------------------------------- webhook */

/**
 * Traite un webhook : déduplication par `event_id` (clé du fournisseur ou
 * empreinte du corps), puis réconciliation fournisseur.
 *
 * La ligne `webhook_events` n'est conservée que pour un résultat terminal. Un
 * échec la supprime, sinon un simple retry du fournisseur serait avalé comme
 * doublon et la commande resterait bloquée.
 */
export async function handleWebhookEvent(db: Database, input: WebhookInput): Promise<WebhookResult> {
  const provider = input.provider ?? defaultProvider;

  await db.query("DELETE FROM webhook_events WHERE received_at < now() - ($1::int * interval '1 day')", [
    WEBHOOK_RETENTION_DAYS,
  ]);

  // R6 / B1 : `pending` n'est pas un état final. Une ligne restée `pending` est
  // reprise par le renvoi suivant ; seuls les états terminaux bloquent un rejeu.
  const inserted = await db.query(
    `INSERT INTO webhook_events (id, provider, event_id, payload_hash, status)
     VALUES ($1, $2, $3, $4, 'received')
     ON CONFLICT (provider, event_id) DO UPDATE
        SET status = 'received', processed_at = NULL
      WHERE webhook_events.status = 'pending'
     RETURNING id`,
    [newId(), provider.name, input.eventId, input.payloadHash],
  );

  if (inserted.length === 0) {
    const order = input.orderId
      ? await loadOrder(db, input.orderId)
      : input.providerRef
        ? await loadOrderByProviderRef(db, input.providerRef)
        : null;
    return {
      status: "duplicate",
      orderId: order?.id ?? null,
      orderStatus: order?.status ?? null,
      activationStatus: order ? activationStatusOf(order) : null,
      activated: false,
    };
  }

  const eventRowId = String(inserted[0]?.id);

  try {
    const result = await reconcilePayment(db, {
      orderId: input.orderId,
      providerRef: input.providerRef,
      reportedAmountXaf: input.reportedAmountXaf,
      provider,
    });

    const terminal: WebhookResult["status"] =
      result.providerStatus === "pending"
        ? "pending"
        : result.providerStatus === "failed"
          ? result.order.status === "paid" || result.order.status === "refunded"
            ? "ignored_paid"
            : "failed"
          : "processed";

    await db.query(
      "UPDATE webhook_events SET status = $2, processed_at = now() WHERE id = $1",
      [eventRowId, terminal],
    );

    return {
      status: terminal,
      orderId: result.order.orderId,
      orderStatus: result.order.status,
      activationStatus: result.order.activationStatus,
      activated: result.activated,
    };
  } catch (error) {
    // Rejouable : on retire la déduplication pour laisser le fournisseur
    // réessayer, puis on propage.
    await db.query("DELETE FROM webhook_events WHERE id = $1", [eventRowId]);
    throw error;
  }
}

/* ------------------------------------------------------------ remboursement */

export interface RefundResult {
  orderId: string;
  status: OrderStatus;
  changed: boolean;
  commissionReversedXaf: number;
  subscriptionCanceled: boolean;
}

/**
 * Rembourse une commande payée.
 *
 * - la commission passe `reversed` et **garde son montant positif** : le solde
 *   de la communauté est la somme des commissions non annulées, il ne devient
 *   jamais négatif en silence ;
 * - l'abonnement lié est annulé (`canceled`), donc l'accès n'est plus actif ;
 * - rejouer un remboursement est un no-op.
 *
 * Non exposé par une route ici : le déclenchement est une décision
 * d'administration (rôle owner), traitée par les routes admin.
 */
export async function refundOrder(
  db: Database,
  orderId: string,
  options: { reason?: string; actorId?: string } = {},
): Promise<RefundResult> {
  return db.tx(async (q) => {
    const order = await q.one<OrderRow>(`${ORDER_SELECT} WHERE o.id = $1`, [orderId]);
    if (!order) throw fail.notFound("Commande introuvable.");

    if (order.status === "refunded") {
      return { orderId, status: "refunded", changed: false, commissionReversedXaf: 0, subscriptionCanceled: false };
    }
    if (order.status !== "paid") {
      throw fail.conflict("Seule une commande payée peut être remboursée.");
    }

    const transitioned = await q.query(
      `UPDATE orders SET status = 'refunded', failure_reason = COALESCE($2, failure_reason)
        WHERE id = $1 AND status = 'paid' RETURNING id`,
      [orderId, options.reason ?? "refunded"],
    );
    if (transitioned.length === 0) {
      return { orderId, status: "refunded", changed: false, commissionReversedXaf: 0, subscriptionCanceled: false };
    }

    const subs = await q.query(
      `UPDATE subscriptions SET status = 'canceled'
        WHERE order_id = $1 AND status = 'active' RETURNING id`,
      [orderId],
    );

    const reversed = await q.query<{ amount_xaf: number }>(
      `UPDATE commissions SET status = 'reversed'
        WHERE order_id = $1 AND status <> 'reversed' RETURNING amount_xaf`,
      [orderId],
    );
    const reversedXaf = reversed.reduce((sum, row) => sum + Number(row.amount_xaf), 0);

    await q.query(
      `INSERT INTO audit_log (id, actor_id, actor_type, action, target, meta)
       VALUES ($1, $2, $3, 'order.refunded', $4, $5::jsonb)`,
      [
        newId(),
        options.actorId ?? null,
        options.actorId ? "admin" : "system",
        orderId,
        JSON.stringify({ commissionReversedXaf: reversedXaf, subscriptionCanceled: subs.length > 0 }),
      ],
    );

    return {
      orderId,
      status: "refunded",
      changed: true,
      commissionReversedXaf: reversedXaf,
      subscriptionCanceled: subs.length > 0,
    };
  });
}

/** Empreinte stable d'un corps de webhook, sans jamais journaliser le corps. */
export function payloadHash(raw: string): string {
  return sha256Hex(raw);
}
