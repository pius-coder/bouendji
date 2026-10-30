"use server";

import { getServices } from "@/server/services";
import {
  grantBody,
  type GrantCreated,
  type SettlementCreated,
  type SettlementRefreshed,
} from "@/server/services/manual-grants/manual-grants.schema";
import { runAction, type ActionResult } from "./action-result";

/**
 * Accorde un forfait payé en direct à l'administrateur (105). Fastify revérifie
 * `manual_grant.manage` sur la communauté de l'abonné ; le montant vient du
 * forfait, côté API, jamais d'ici.
 */
export async function grantPlanAction(userId: string, input: unknown, requestKey?: string): Promise<ActionResult<GrantCreated>> {
  const key = typeof requestKey === "string" && requestKey.length >= 8 && requestKey.length <= 190 ? requestKey : undefined;
  return runAction(async () => getServices().manualGrants.grant(String(userId), grantBody.parse(input), key));
}

/** Versement du total dû de la communauté : renvoie le lien de paiement Fapshi. */
export async function createSettlementAction(communityId: string): Promise<ActionResult<SettlementCreated>> {
  return runAction(async () => getServices().manualGrants.createSettlement(String(communityId)));
}

/** Revérifie un versement chez Fapshi ; le statut vient du fournisseur, pas de l'admin. */
export async function refreshSettlementAction(settlementId: string): Promise<ActionResult<SettlementRefreshed>> {
  return runAction(async () => getServices().manualGrants.refreshSettlement(String(settlementId)));
}
