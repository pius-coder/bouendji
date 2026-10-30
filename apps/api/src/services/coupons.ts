/**
 * Coupons de réduction (104, décisions owner du 2026-10-30).
 *
 * - Un **type** (libellé + durée en minutes) est défini par l'owner, par app.
 * - Un **coupon** est émis par un administrateur pour un abonné précis : usage
 *   unique, lié au compte, code affiché une seule fois (seul son hachage est
 *   stocké).
 * - L'**utilisation** (app, utilisateur authentifié) donne un accès illimité
 *   pour la durée du type, par le mécanisme d'abonnement existant : une
 *   commande à 0 XAF (`provider = 'coupon'`, déjà `paid`) sur le forfait caché
 *   de l'app, puis `insertSubscriptionPeriod` — la même règle de dates que
 *   `activateOrder`. Aucune commission (montant nul).
 *
 * Refus, dans cet ordre (le compte d'abord : un code d'un autre compte est
 * indistinguable d'un code inexistant) :
 *   COUPON_INVALID      code inconnu, mal formé ou d'un autre compte (404)
 *   COUPON_USED         déjà utilisé (409)
 *   COUPON_REVOKED      annulé par un administrateur (409)
 *   COUPON_EXPIRED      date limite passée (409)
 *   COUPON_DEVICE_USED  cet appareil a déjà utilisé un coupon (409)
 *   COUPON_ACTIVE       un abonnement issu d'un coupon est encore actif ou à venir (409)
 *   PAID_PLAN_ACTIVE    un autre abonnement (payé, accordé à la main) est actif ou à venir (409)
 */
import { randomInt } from "node:crypto";
import { isUniqueViolation, type Database, type Queryable, type Row } from "../db.js";
import { addMinutes, hashToken, newId } from "../lib/crypto.js";
import { ApiFailure, fail } from "../lib/errors.js";
import { insertSubscriptionPeriod } from "./payments.js";
import { MINUTES_PER_DAY } from "./planTerms.js";

/**
 * Code du forfait caché qui porte les abonnements issus d'un coupon. Le `_`
 * est refusé par la validation des codes de forfait (`[a-z0-9-]`) : aucun
 * forfait créé par un administrateur ne peut le porter.
 */
export const COUPON_PLAN_CODE = "_coupon";

/** Sans 0/O ni 1/I/L : lisible et saisissable sur un téléphone. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 12;
const CODE_PATTERN = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`);

/** Validité d'un code émis, en jours (bornes de la saisie admin). */
export const COUPON_VALID_DAYS_DEFAULT = 7;
export const COUPON_VALID_DAYS_MAX = 90;

export type CouponRefusal =
  | "COUPON_INVALID"
  | "COUPON_USED"
  | "COUPON_REVOKED"
  | "COUPON_EXPIRED"
  | "COUPON_DEVICE_USED"
  | "COUPON_ACTIVE"
  | "PAID_PLAN_ACTIVE";

const REFUSALS: Record<CouponRefusal, { status: number; code: "NOT_FOUND" | "CONFLICT"; message: string }> = {
  COUPON_INVALID: { status: 404, code: "NOT_FOUND", message: "Code invalide." },
  COUPON_USED: { status: 409, code: "CONFLICT", message: "Ce coupon a déjà été utilisé." },
  COUPON_REVOKED: { status: 409, code: "CONFLICT", message: "Ce coupon a été annulé." },
  COUPON_EXPIRED: { status: 409, code: "CONFLICT", message: "Ce coupon a expiré." },
  COUPON_DEVICE_USED: { status: 409, code: "CONFLICT", message: "Cet appareil a déjà utilisé un coupon." },
  COUPON_ACTIVE: { status: 409, code: "CONFLICT", message: "Un coupon est déjà actif sur ce compte." },
  PAID_PLAN_ACTIVE: {
    status: 409,
    code: "CONFLICT",
    message: "Un forfait est déjà actif ou prévu sur ce compte : le coupon ne peut pas s'y ajouter.",
  },
};

export function couponRefusal(reason: CouponRefusal): ApiFailure {
  const refusal = REFUSALS[reason];
  return new ApiFailure(refusal.status, refusal.code, refusal.message, { reason });
}

/* ------------------------------------------------------------------ code */

/** Code lisible `XXXX-XXXX-XXXX` (31 symboles, 12 tirages : ~59 bits). */
export function generateCouponCode(): string {
  let raw = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) raw += ALPHABET[randomInt(ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

/** Majuscules, sans espaces ni tirets ; `null` si la forme ne peut pas être un code. */
export function normalizeCouponCode(input: string): string | null {
  const compact = input.toUpperCase().replace(/[\s-]/g, "");
  return CODE_PATTERN.test(compact) ? compact : null;
}

/** Seule forme stockée du code. Préfixe de domaine : jamais égal à un autre hachage du schéma. */
export function couponCodeHash(normalized: string): string {
  return hashToken(`coupon:${normalized}`);
}

/* ------------------------------------------------------------------ DTO */

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

export function couponTypeDto(row: Row) {
  return {
    id: row.id as string,
    appId: row.app_id as string,
    label: row.label as string,
    durationMinutes: Number(row.duration_minutes),
    createdAt: iso(row.created_at),
  };
}

/** Ni code, ni hachage, ni identifiant d'appareil : ce qui a été émis et son état. */
export function couponDto(row: Row) {
  const expiresAt = iso(row.expires_at);
  return {
    id: row.id as string,
    typeId: row.type_id as string,
    label: row.label as string,
    durationMinutes: Number(row.duration_minutes),
    status: row.status as "issued" | "redeemed" | "revoked",
    expired: row.status === "issued" && expiresAt !== null && new Date(expiresAt).getTime() <= Date.now(),
    issuedAt: iso(row.issued_at),
    expiresAt,
    redeemedAt: iso(row.redeemed_at),
    issuedByName: (row.issued_by_name as string | null | undefined) ?? null,
  };
}

export const COUPON_SELECT = /* sql */ `
  SELECT c.id, c.type_id, c.user_id, c.status, c.issued_at, c.expires_at, c.redeemed_at,
         t.label, t.duration_minutes, t.app_id, a.name AS issued_by_name
    FROM coupons c
    JOIN coupon_types t ON t.id = c.type_id
    LEFT JOIN admin_users a ON a.id = c.issued_by`;

/* ------------------------------------------------------------- émission */

/**
 * Émet un coupon pour `userId`. Le code en clair n'existe que dans la valeur
 * de retour : l'appelant le renvoie une fois et ne l'écrit nulle part.
 */
export async function issueCoupon(
  q: Queryable,
  input: { typeId: string; userId: string; adminId: string; validDays: number },
): Promise<{ couponId: string; code: string }> {
  const couponId = newId();
  const expiresAt = addMinutes(new Date(), input.validDays * MINUTES_PER_DAY);
  // ~59 bits : une collision est improbable ; vérifiée quand même, avant
  // l'insertion (une violation d'unicité annulerait la transaction entière).
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCouponCode();
    const hash = couponCodeHash(normalizeCouponCode(code) as string);
    const taken = await q.one("SELECT id FROM coupons WHERE code_hash = $1", [hash]);
    if (taken) continue;
    await q.query(
      `INSERT INTO coupons (id, code_hash, type_id, user_id, status, issued_by, issued_at, expires_at)
       VALUES ($1, $2, $3, $4, 'issued', $5, now(), $6)`,
      [couponId, hash, input.typeId, input.userId, input.adminId, expiresAt],
    );
    return { couponId, code };
  }
  throw new Error("coupons : génération de code impossible après 5 tentatives");
}

/* ---------------------------------------------------------- utilisation */

/** Forfait caché de l'app : illimité, pool `free-labs` (D132), jamais vendu (inactif, 0 XAF). */
async function ensureCouponPlan(q: Queryable, appId: string): Promise<string> {
  await q.query(
    `INSERT INTO plans (id, app_id, code, name, description, price_xaf, duration_days, device_limit,
                        badge, featured, active, sort_order, endpoint_tier, family, quota_bytes)
     VALUES ($1, $2, $3, 'Coupon de réduction', '', 0, 1, 1, NULL, false, false, 0, 'free-labs', 'unlimited', NULL)
     ON CONFLICT (app_id, code) DO NOTHING`,
    [newId(), appId, COUPON_PLAN_CODE],
  );
  const row = await q.one<Row>("SELECT id FROM plans WHERE app_id = $1 AND code = $2", [appId, COUPON_PLAN_CODE]);
  if (!row) throw new Error("coupons : forfait caché introuvable après insertion");
  return String(row.id);
}

export interface RedeemedCoupon {
  couponId: string;
  label: string;
  durationMinutes: number;
  startsAt: Date;
  endsAt: Date;
}

/**
 * Valide un code pour le compte et l'appareil de la session, puis accorde
 * l'accès. Tout se passe dans une transaction, sous verrou du compte : deux
 * validations simultanées du même compte se suivent (pas de cumul), et
 * l'index unique `coupons_device_uidx` tranche entre deux comptes sur un même
 * appareil.
 */
export async function redeemCoupon(
  db: Database,
  input: { userId: string; deviceId: string; code: string },
): Promise<RedeemedCoupon> {
  const normalized = normalizeCouponCode(input.code);
  if (!normalized) throw couponRefusal("COUPON_INVALID");
  const hash = couponCodeHash(normalized);

  try {
    return await db.tx(async (q) => {
      const user = await q.one<Row>(
        "SELECT id, app_id, community_id FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
        [input.userId],
      );
      if (!user) throw fail.unauthenticated("Compte indisponible.");

      const coupon = await q.one<Row>(
        `SELECT c.id, c.status, c.expires_at, t.label, t.duration_minutes, t.app_id
           FROM coupons c
           JOIN coupon_types t ON t.id = c.type_id
          WHERE c.code_hash = $1 AND c.user_id = $2
          FOR UPDATE OF c`,
        [hash, input.userId],
      );
      if (!coupon || coupon.app_id !== user.app_id) throw couponRefusal("COUPON_INVALID");
      if (coupon.status === "redeemed") throw couponRefusal("COUPON_USED");
      if (coupon.status === "revoked") throw couponRefusal("COUPON_REVOKED");
      if (new Date(coupon.expires_at as string | Date).getTime() <= Date.now()) throw couponRefusal("COUPON_EXPIRED");

      const deviceUsed = await q.one("SELECT id FROM coupons WHERE device_id = $1 LIMIT 1", [input.deviceId]);
      if (deviceUsed) throw couponRefusal("COUPON_DEVICE_USED");

      // Décisions owner 5 et 2026-10-30 : aucun coupon tant que le compte a un
      // abonnement actif ou une période à venir, quelle qu'en soit l'origine
      // (commande payée, accès accordé à la main, coupon). `ends_at > now()`
      // couvre les deux cas ; `starts_at` n'est volontairement pas regardé.
      // Un coupon ne s'empile donc jamais : sa période commence maintenant.
      const current = await q.one<Row>(
        `SELECT s.id, (c.id IS NOT NULL) AS from_coupon
           FROM subscriptions s
           LEFT JOIN coupons c ON c.order_id = s.order_id AND c.status = 'redeemed'
          WHERE s.user_id = $1 AND s.status = 'active' AND s.ends_at > now()
          ORDER BY (c.id IS NOT NULL) DESC
          LIMIT 1`,
        [input.userId],
      );
      if (current) throw couponRefusal(current.from_coupon === true ? "COUPON_ACTIVE" : "PAID_PLAN_ACTIVE");

      const planId = await ensureCouponPlan(q, String(user.app_id));
      const minutes = Number(coupon.duration_minutes);
      const orderId = newId();
      // Commande à 0 XAF déjà payée : `subscriptions.order_id` est obligatoire,
      // et la durée est figée sur la commande comme pour un achat (103).
      await q.query(
        `INSERT INTO orders (id, user_id, app_id, plan_id, community_id, amount_xaf, currency, status, provider,
                             commission_bps, commission_xaf, created_at, paid_at, activated_at, duration_minutes)
         VALUES ($1, $2, $3, $4, $5, 0, 'XAF', 'paid', 'coupon', 0, 0, now(), now(), now(), $6)`,
        [orderId, input.userId, user.app_id, planId, user.community_id, minutes],
      );
      const period = await insertSubscriptionPeriod(q, {
        userId: input.userId,
        planId,
        orderId,
        minutes,
        quotaBytes: null,
        nightWindow: null,
      });

      const marked = await q.query(
        `UPDATE coupons SET status = 'redeemed', redeemed_at = now(), device_id = $2, order_id = $3
          WHERE id = $1 AND status = 'issued'
          RETURNING id`,
        [coupon.id, input.deviceId, orderId],
      );
      if (marked.length !== 1) throw couponRefusal("COUPON_USED");

      await q.query(
        `INSERT INTO audit_log (id, actor_id, actor_type, action, target, target_type, target_id, community_id, meta)
         VALUES ($1, $2, 'user', 'coupon.redeem', $3, 'coupon', $4, $5, $6::jsonb)`,
        [
          newId(),
          input.userId,
          `coupon:${String(coupon.id)}`,
          coupon.id,
          user.community_id,
          JSON.stringify({ orderId, durationMinutes: minutes, endsAt: period.endsAt.toISOString() }),
        ],
      );

      return {
        couponId: String(coupon.id),
        label: String(coupon.label),
        durationMinutes: minutes,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
      };
    });
  } catch (err) {
    // Deux comptes, un même appareil, au même instant : l'index unique tranche.
    if (isUniqueViolation(err)) throw couponRefusal("COUPON_DEVICE_USED");
    throw err;
  }
}
