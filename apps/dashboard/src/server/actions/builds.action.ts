"use server";

import { z } from "zod";
import { id } from "@/server/api/schema-kit";
import { getServices } from "@/server/services";
import { rejectBuildBody } from "@/server/services/builds/builds.service";
import { runAction, type ActionResult } from "./action-result";

const versionNameSchema = z
  .string()
  .trim()
  .max(40, "40 caractères max.")
  .optional()
  .transform((value) => value || undefined);

/** Demander un build (community_admin ou owner) : passe en `requested`, alerte Telegram. */
export async function requestBuildAction(
  appId: string,
  versionName?: unknown,
): Promise<ActionResult<{ buildId: string; status: string }>> {
  return runAction(async () => {
    const name = versionNameSchema.parse(typeof versionName === "string" && versionName.trim() === "" ? undefined : versionName);
    return getServices().builds.requestBuild({ appId: id.parse(appId), versionName: name });
  });
}

/** Lancer directement le build d'APK d'une marque (owner). */
export async function triggerBuildAction(
  appId: string,
  versionName?: unknown,
): Promise<ActionResult<{ buildId: string; status: string }>> {
  return runAction(async () => {
    const name = versionNameSchema.parse(typeof versionName === "string" && versionName.trim() === "" ? undefined : versionName);
    const queued = await getServices().builds.triggerBuild({ appId: id.parse(appId), versionName: name });
    return { buildId: queued.buildId, status: queued.status };
  });
}

/** Valider une demande de build (owner) : lance le workflow GitHub Actions. */
export async function approveBuildAction(buildId: string): Promise<ActionResult<{ buildId: string; status: string }>> {
  return runAction(async () => {
    return getServices().builds.approveBuild(id.parse(buildId));
  });
}

/** Refuser une demande de build avec un motif (owner). */
export async function rejectBuildAction(
  buildId: string,
  reason: unknown,
): Promise<ActionResult<{ buildId: string; status: string }>> {
  return runAction(async () => {
    const parsed = rejectBuildBody.parse({ reason });
    return getServices().builds.rejectBuild(id.parse(buildId), parsed.reason);
  });
}
