"use server";

import { z } from "zod";
import { id } from "@/server/api/schema-kit";
import { getServices } from "@/server/services";
import { runAction, type ActionResult } from "./action-result";

/**
 * Nom de version saisi : facultatif, 40 caractères au plus. Un champ vide devient
 * `undefined` (l'API prend alors « 1.0.0 »).
 */
const versionNameSchema = z
  .string()
  .trim()
  .max(40, "40 caractères max.")
  .optional()
  .transform((value) => value || undefined);

/**
 * Lancer le build d'APK d'une marque. Le corps est rejoué ici (zod), puis envoyé
 * par le service. Le numéro de version (`versionCode`) est calculé par l'API ; le
 * dashboard ne transmet que le nom. L'API répond 202 « en file ».
 */
export async function triggerBuildAction(appId: string, versionName?: unknown): Promise<ActionResult<{ buildId: string; status: string }>> {
  return runAction(async () => {
    const name = versionNameSchema.parse(typeof versionName === "string" && versionName.trim() === "" ? undefined : versionName);
    const queued = await getServices().builds.triggerBuild({ appId: id.parse(appId), versionName: name });
    return { buildId: queued.buildId, status: queued.status };
  });
}
