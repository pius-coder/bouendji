import { z } from "zod";

/** 106 : opérateurs proposés par Fapshi. Source : `PAYMENT_OPERATORS` de `apps/api/src/services/paymentOperators.ts`. */
export const PAYMENT_OPERATORS = ["orange", "momo"] as const;
export type PaymentOperator = (typeof PAYMENT_OPERATORS)[number];

export const NOTICE_MODES = ["direct", "orange_down", "momo_down", "both_down"] as const;
export type NoticeMode = (typeof NOTICE_MODES)[number];

export const operatorParams = z.object({ operator: z.enum(PAYMENT_OPERATORS) });

/** Source : `operatorDto` de `apps/api/src/routes/paymentOperators.ts`. */
export const paymentOperatorStatus = z.object({
  operator: z.enum(PAYMENT_OPERATORS),
  label: z.string(),
  available: z.boolean(),
  updatedAt: z.string().nullable(),
  updatedByName: z.string().nullable(),
});
export type PaymentOperatorStatus = z.infer<typeof paymentOperatorStatus>;

/** Source : `stateDto` (`GET /v1/admin/payment-operators`). */
export const paymentOperatorsState = z.object({
  items: z.array(paymentOperatorStatus),
  mode: z.enum(NOTICE_MODES),
  automaticDetection: z.literal(false),
  canManage: z.boolean(),
});
export type PaymentOperatorsState = z.infer<typeof paymentOperatorsState>;

/** Réponse du `PUT` : l'état complet, plus `changed` (faux si la valeur était déjà celle-là). */
export const paymentOperatorUpdated = paymentOperatorsState.extend({ changed: z.boolean() });

/** Source : `updateSchema` (`PUT /v1/admin/payment-operators/:operator`). Strict, comme l'API. */
export const paymentOperatorUpdateBody = z.object({ available: z.boolean() }).strict();
export type PaymentOperatorUpdate = z.input<typeof paymentOperatorUpdateBody>;

/**
 * Ce que l'abonné voit avant de payer, pour un mode donné. Même texte que
 * `noticeContent` côté API : le dashboard le montre tel quel à l'owner.
 */
export const NOTICE_PREVIEW: Record<NoticeMode, { title: string; message: string; withCheckout: boolean }> = {
  direct: {
    title: "Paiement direct",
    message: "Les deux opérateurs sont disponibles : l'abonné arrive directement sur la page de paiement, sans avis.",
    withCheckout: true,
  },
  orange_down: {
    title: "Orange Money indisponible",
    message:
      "Orange Money est indisponible pour le moment. Choisissez MTN MoMo sur la page suivante, ou payez l'administrateur de votre communauté.",
    withCheckout: true,
  },
  momo_down: {
    title: "MTN MoMo indisponible",
    message:
      "MTN MoMo est indisponible pour le moment. Choisissez Orange Money sur la page suivante, ou payez l'administrateur de votre communauté.",
    withCheckout: true,
  },
  both_down: {
    title: "Paiement en ligne indisponible",
    message: "Les paiements en ligne sont indisponibles pour le moment. Payez l'administrateur de votre communauté.",
    withCheckout: false,
  },
};

/** Mention permanente de la page : le réglage n'est jamais automatique. */
export const MANUAL_NOTICE = "Réglage manuel : aucune détection automatique.";

/** Avertissement affiché à l'owner quand un opérateur est coupé. */
export const CUT_WARNING: Record<Exclude<NoticeMode, "direct">, string> = {
  orange_down:
    "Orange Money est coupé : avant de payer, les abonnés voient un avis qui les oriente vers MTN MoMo ou vers l'administrateur de leur communauté.",
  momo_down:
    "MTN MoMo est coupé : avant de payer, les abonnés voient un avis qui les oriente vers Orange Money ou vers l'administrateur de leur communauté.",
  both_down:
    "Les deux opérateurs sont coupés : aucun paiement en ligne n'est proposé. Les abonnés sont invités à payer l'administrateur de leur communauté.",
};

/** Mode d'avis pour un état local (aperçu immédiat). Même règle que `noticeFor` côté API. */
export function noticeModeOf(items: readonly Pick<PaymentOperatorStatus, "operator" | "available">[]): NoticeMode {
  const available = (operator: PaymentOperator) => items.find((i) => i.operator === operator)?.available !== false;
  const orange = available("orange");
  const momo = available("momo");
  if (orange && momo) return "direct";
  if (!orange && !momo) return "both_down";
  return orange ? "momo_down" : "orange_down";
}
