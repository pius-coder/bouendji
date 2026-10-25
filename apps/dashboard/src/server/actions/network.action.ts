"use server";

import { getServices } from "@/server/services";
import { manualEndpointFormSchema, manualEndpointFormToBody } from "@/server/services/network/network.schema";
import { runAction, type ActionResult } from "./action-result";

export async function setEndpointHealthAction(
  endpointId: string,
  state: "down" | "healthy",
  reason?: string,
): Promise<ActionResult<{ changed: boolean }>> {
  return runAction(async () => {
    const change = await getServices().network.setEndpointHealth({ endpointId: String(endpointId), state, reason });
    return { changed: change.changed };
  });
}

/** Entrée client rejouée contre le schéma du formulaire, puis celui du service ; Fastify revérifie `endpoint.write`. */
export async function addManualEndpointsAction(input: unknown): Promise<ActionResult<{ count: number; expiresAt: string }>> {
  return runAction(async () => {
    const body = manualEndpointFormToBody(manualEndpointFormSchema.parse(input));
    const created = await getServices().network.addManualEndpoints(body);
    return { count: created.count, expiresAt: created.expiresAt };
  });
}
