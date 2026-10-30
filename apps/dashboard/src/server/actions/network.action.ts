"use server";

import { getServices } from "@/server/services";
import {
  type DeployKeyResult,
  manualEndpointFormSchema,
  manualEndpointFormToBody,
  manualVlessBody,
  type NightSlotView,
  type TelegramTestResult,
} from "@/server/services/network/network.schema";
import { xuiServerFormSchema, xuiServerFormToBody } from "@/server/services/network/xui.schema";
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

/**
 * Ajout par lot : un ou plusieurs liens VLESS collés. L'API déduit le pays de
 * l'hôte Cloud Run et nomme chaque nœud d'après un fleuve camerounais.
 * Le lien n'est ni renvoyé ni journalisé.
 */
export async function addManualVlessAction(
  input: unknown,
): Promise<ActionResult<{ count: number; expiresAt: string; nodes: Array<{ label: string; region: string }> }>> {
  return runAction(async () => {
    const body = manualVlessBody.parse(input);
    const created = await getServices().network.addManualVless(body);
    return {
      count: created.count,
      expiresAt: created.expiresAt,
      nodes: created.nodes.map((node) => ({ label: node.label, region: node.region })),
    };
  });
}

/** Ajout d'un serveur 3x-ui (owner) : le jeton part vers l'API, qui le scelle ; il n'est jamais relu. */
export async function createXuiServerAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const created = await getServices().network.createXuiServer(xuiServerFormToBody(xuiServerFormSchema.parse(input)));
    return { id: created.id };
  });
}

/** Test de connexion au panneau : l'API répond par un message sans jeton ni chemin secret. */
export async function testXuiServerAction(serverId: string): Promise<ActionResult<{ ok: boolean; message: string }>> {
  return runAction(async () => {
    const result = await getServices().network.testXuiServer(String(serverId));
    return { ok: result.ok, message: result.message };
  });
}

/** Prise en charge d'un créneau de nuit (« Je m'en occupe »). */
export async function claimNightSlotAction(slotId: string): Promise<ActionResult<NightSlotView>> {
  return runAction(async () => {
    return getServices().network.claimNightSlot(String(slotId));
  });
}

/** Émission d'une clé de déploiement à usage unique (`ENDPOINT_INGEST_SECRET`). */
export async function issueDeployKeyAction(slotId: string): Promise<ActionResult<DeployKeyResult>> {
  return runAction(async () => {
    return getServices().network.issueDeployKey(String(slotId));
  });
}

/** Envoi d'un message de test Telegram (owner / réseau). */
export async function testTelegramAction(): Promise<ActionResult<TelegramTestResult>> {
  return runAction(async () => {
    return getServices().network.testTelegram();
  });
}

/** Purge de tous les serveurs expirés du pool. */
export async function purgeExpiredEndpointsAction(): Promise<ActionResult<{ purgedCount: number }>> {
  return runAction(async () => {
    const res = await getServices().network.purgeExpiredEndpoints();
    return { purgedCount: res.purgedCount };
  });
}

/** Changement de statut d'un endpoint (active, draining, expired). */
export async function setEndpointStatusAction(
  endpointId: string,
  status: "active" | "draining" | "expired",
): Promise<ActionResult<{ status: string }>> {
  return runAction(async () => {
    const res = await getServices().network.setEndpointStatus({ endpointId: String(endpointId), status });
    return { status: res.endpoint.status };
  });
}

/** Suppression manuelle d'un endpoint par l'administrateur. */
export async function deleteEndpointAction(endpointId: string): Promise<ActionResult<{ ok: boolean; endpointId: string }>> {
  return runAction(async () => {
    const res = await getServices().network.deleteEndpoint(String(endpointId));
    return { ok: res.ok, endpointId: res.endpointId };
  });
}

/** Test réel d'un nœud : sonde TCP côté API + verdict combiné (D147). */
export async function testEndpointAction(
  endpointId: string,
): Promise<ActionResult<{ ok: boolean; latencyMs: number | null; error: string | null; health: string; reason: string | null }>> {
  return runAction(async () => {
    const res = await getServices().network.testEndpoint(String(endpointId));
    return { ok: res.ok, latencyMs: res.latencyMs, error: res.error, health: res.health, reason: res.reason };
  });
}

/** Suppression d'un serveur 3x-ui (vérifie qu'aucun client actif n'est présent). */
export async function deleteXuiServerAction(serverId: string): Promise<ActionResult<{ ok: boolean; serverId: string }>> {
  return runAction(async () => {
    const res = await getServices().network.deleteXuiServer(String(serverId));
    return { ok: res.ok, serverId: res.serverId };
  });
}
