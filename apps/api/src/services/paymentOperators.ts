/**
 * Opérateurs de paiement (106) : Orange Money et MTN MoMo, tels que Fapshi les
 * propose sur sa page.
 *
 * Réglage **manuel** de l'owner : rien ici ne détecte une panne chez Fapshi.
 * L'état sert uniquement à choisir ce que l'abonné voit avant de payer :
 *
 * | Orange | MTN   | mode         | effet                                                  |
 * |--------|-------|--------------|--------------------------------------------------------|
 * | oui    | oui   | `direct`     | URL Fapshi directe, aucun avis (comportement d'avant)  |
 * | non    | oui   | `orange_down`| page d'avis, bouton vers Fapshi                        |
 * | oui    | non   | `momo_down`  | page d'avis, bouton vers Fapshi                        |
 * | non    | non   | `both_down`  | page d'avis **sans** bouton : payer l'administrateur   |
 *
 * Une ligne absente vaut « disponible » : sans réglage, aucun changement.
 */
import type { Queryable, Row } from "../db.js";
import { hasPlatformRole, type AdminContext } from "../lib/auth.js";
import { fail } from "../lib/errors.js";

export const PAYMENT_OPERATORS = ["orange", "momo"] as const;
export type PaymentOperator = (typeof PAYMENT_OPERATORS)[number];

export type NoticeMode = "direct" | "orange_down" | "momo_down" | "both_down";

export const OPERATOR_LABEL: Record<PaymentOperator, string> = {
  orange: "Orange Money",
  momo: "MTN MoMo",
};

export interface OperatorStatus {
  operator: PaymentOperator;
  available: boolean;
  updatedAt: string | null;
  /** `admin_users.id` de l'auteur du dernier changement, `null` sans changement. */
  updatedBy: string | null;
  /** Nom de l'auteur (lecture owner seulement côté route). */
  updatedByName: string | null;
}

export type PaymentOperatorsState = Record<PaymentOperator, OperatorStatus>;

export function isPaymentOperator(value: unknown): value is PaymentOperator {
  return typeof value === "string" && (PAYMENT_OPERATORS as readonly string[]).includes(value);
}

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function defaultStatus(operator: PaymentOperator): OperatorStatus {
  return { operator, available: true, updatedAt: null, updatedBy: null, updatedByName: null };
}

/** État courant, relu en base à chaque appel (jamais mis en cache). */
export async function loadPaymentOperators(db: Queryable): Promise<PaymentOperatorsState> {
  const rows = await db.query<Row>(
    `SELECT po.operator, po.available, po.updated_at, po.updated_by, au.name AS updated_by_name
       FROM payment_operators po
       LEFT JOIN admin_users au ON au.id = po.updated_by`,
  );
  const state: PaymentOperatorsState = { orange: defaultStatus("orange"), momo: defaultStatus("momo") };
  for (const row of rows) {
    if (!isPaymentOperator(row.operator)) continue;
    state[row.operator] = {
      operator: row.operator,
      available: row.available !== false,
      // Sans auteur, la ligne est celle insérée par la migration : pas un changement.
      updatedAt: row.updated_by ? iso(row.updated_at) : null,
      updatedBy: (row.updated_by as string | null) ?? null,
      updatedByName: (row.updated_by_name as string | null) ?? null,
    };
  }
  return state;
}

/** Mode d'avis pour un état donné. Fonction pure. */
export function noticeFor(state: Record<PaymentOperator, { available: boolean }>): NoticeMode {
  const orange = state.orange.available;
  const momo = state.momo.available;
  if (orange && momo) return "direct";
  if (!orange && !momo) return "both_down";
  return orange ? "momo_down" : "orange_down";
}

/** Mode courant, relu en base. */
export async function currentNoticeMode(db: Queryable): Promise<NoticeMode> {
  return noticeFor(await loadPaymentOperators(db));
}

/**
 * Texte de la page d'avis. Français, neutre, sans nom de personne.
 * `withCheckout` : vrai quand la page propose de continuer vers Fapshi.
 */
export function noticeContent(mode: Exclude<NoticeMode, "direct">): { title: string; message: string; withCheckout: boolean } {
  switch (mode) {
    case "orange_down":
      return {
        title: "Orange Money indisponible",
        message:
          "Orange Money est indisponible pour le moment. Choisissez MTN MoMo sur la page suivante, ou payez l'administrateur de votre communauté.",
        withCheckout: true,
      };
    case "momo_down":
      return {
        title: "MTN MoMo indisponible",
        message:
          "MTN MoMo est indisponible pour le moment. Choisissez Orange Money sur la page suivante, ou payez l'administrateur de votre communauté.",
        withCheckout: true,
      };
    case "both_down":
      return {
        title: "Paiement en ligne indisponible",
        message: "Les paiements en ligne sont indisponibles pour le moment. Payez l'administrateur de votre communauté.",
        withCheckout: false,
      };
  }
}

export interface OperatorChange {
  operator: PaymentOperator;
  changed: boolean;
  before: OperatorStatus;
  after: OperatorStatus;
  state: PaymentOperatorsState;
}

/**
 * Change la disponibilité d'un opérateur. **Owner seul** : la route le vérifie
 * déjà (`payment_operator.manage`), ce contrôle-ci est la seconde barrière.
 *
 * À appeler dans une transaction : la ligne est verrouillée avant lecture, et
 * l'appelant écrit l'audit dans la même transaction. Une valeur identique ne
 * réécrit rien (`changed: false`) : pas de faux changement dans le journal.
 */
export async function setOperatorAvailability(
  q: Queryable,
  admin: AdminContext,
  input: { operator: PaymentOperator; available: boolean },
): Promise<OperatorChange> {
  if (!hasPlatformRole(admin, "owner")) throw fail.forbidden("Réservé au propriétaire de la plateforme.");

  await q.query("SELECT operator FROM payment_operators WHERE operator = $1 FOR UPDATE", [input.operator]);
  const beforeState = await loadPaymentOperators(q);
  const before = beforeState[input.operator];
  if (before.available === input.available) {
    return { operator: input.operator, changed: false, before, after: before, state: beforeState };
  }

  await q.query(
    `INSERT INTO payment_operators (operator, available, updated_by, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (operator) DO UPDATE SET
       available  = EXCLUDED.available,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()`,
    [input.operator, input.available, admin.adminId],
  );
  const state = await loadPaymentOperators(q);
  return { operator: input.operator, changed: true, before, after: state[input.operator], state };
}
