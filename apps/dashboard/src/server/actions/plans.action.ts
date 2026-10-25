"use server";

import { z } from "zod";
import { getServices } from "@/server/services";
import { id } from "@/server/api/schema-kit";
import { planFormSchema, planFormToBody, planFormToUpdate } from "@/server/services/plans/plans.schema";
import { runAction, type ActionResult } from "./action-result";

/** Création : l'entrée client est rejouée contre le schéma du formulaire, puis contre celui du service. */
export async function createPlanAction(appId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const values = planFormSchema.parse(input);
    const created = await getServices().plans.createPlan({ appId: id.parse(appId), ...planFormToBody(values) });
    return { id: created.id };
  });
}

/** Modification : `code` est immuable, il n'est jamais envoyé. */
export async function updatePlanAction(planId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const values = planFormSchema.omit({ code: true }).parse(input);
    const updated = await getServices().plans.updatePlan({ planId: id.parse(planId), ...planFormToUpdate(values) });
    return { id: updated.id };
  });
}

/** Désactiver / réactiver un forfait (confirmation côté écran pour la désactivation). */
export async function setPlanActiveAction(planId: string, active: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const updated = await getServices().plans.updatePlan({ planId: id.parse(planId), active: z.boolean().parse(active) });
    return { id: updated.id };
  });
}
