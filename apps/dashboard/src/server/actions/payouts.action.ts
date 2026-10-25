"use server";

import { z } from "zod";
import { id } from "@/server/api/schema-kit";
import { getServices } from "@/server/services";
import { payoutResolveBody } from "@/server/services/payouts/payouts.schema";
import { runAction, type ActionResult } from "./action-result";

type Step = ActionResult<{ status: string }>;

/** Approuver un versement. Fastify revérifie le rôle et refuse l'auto-approbation (409). */
export async function approvePayoutAction(payoutId: string): Promise<Step> {
  return runAction(async () => ({ status: (await getServices().payouts.approvePayout({ payoutId: id.parse(payoutId) })).status }));
}

/** Préparer : regroupe les commissions dues de la communauté dans un versement « pending ». */
export async function preparePayoutAction(communityId: string, note: unknown): Promise<ActionResult<{ amountXaf: number; commissionCount: number }>> {
  return runAction(async () => {
    const text = z.string().trim().max(280).optional().parse(note || undefined);
    const prepared = await getServices().payouts.preparePayout({ communityId: id.parse(communityId), note: text });
    return { amountXaf: prepared.amountXaf, commissionCount: prepared.commissionCount };
  });
}

/** Payer : appelle le fournisseur de virement (finance). */
export async function payPayoutAction(payoutId: string): Promise<Step> {
  return runAction(async () => ({ status: (await getServices().payouts.payPayout({ payoutId: id.parse(payoutId) })).status }));
}

/** Confirmer : atteste que l'argent est arrivé (finance). */
export async function confirmPayoutAction(payoutId: string): Promise<Step> {
  return runAction(async () => ({ status: (await getServices().payouts.confirmPayout({ payoutId: id.parse(payoutId) })).status }));
}

/** Trancher un versement « à vérifier » : payé (avec référence) ou échoué (avec motif). */
export async function resolvePayoutAction(payoutId: string, input: unknown): Promise<Step> {
  return runAction(async () => {
    const body = payoutResolveBody.parse(input);
    return { status: (await getServices().payouts.resolvePayout({ payoutId: id.parse(payoutId), ...body })).status };
  });
}
