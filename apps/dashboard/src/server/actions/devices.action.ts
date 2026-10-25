"use server";

import { getServices } from "@/server/services";
import { runAction, type ActionResult } from "./action-result";

/**
 * Modèle d'une action de mutation : l'argument vient du client (non fiable), le
 * schéma du service le valide avant tout appel ; la relecture des données
 * (`refreshAfter`) est déclarée sur l'endpoint ; Fastify revérifie rôle et périmètre.
 */
export async function revokeDeviceAction(deviceId: string): Promise<ActionResult<{ sessionsRevoked: number }>> {
  return runAction(async () => {
    const revoked = await getServices().devices.revokeDevice({ deviceId: String(deviceId) });
    return { sessionsRevoked: revoked.sessionsRevoked };
  });
}

export interface IssuedOfflineFile {
  bundleId: string;
  notAfter: string;
  endpointCount: number;
  /** Conteneur scellé pour l'appareil (D29) : le dashboard ne le lit pas, il le remet tel quel. */
  file: unknown;
}

/** Émet un fichier de secours `.bvpn` (D94) à usage unique ; Fastify revérifie `offline_bundle.issue`. */
export async function issueOfflineBundleAction(deviceId: string, ttlHours: number): Promise<ActionResult<IssuedOfflineFile>> {
  return runAction(async () => {
    const issued = await getServices().devices.issueOfflineBundle({ deviceId: String(deviceId), ttlHours: Number(ttlHours) });
    return { bundleId: issued.bundleId, notAfter: issued.notAfter, endpointCount: issued.endpointCount, file: issued.file };
  });
}
