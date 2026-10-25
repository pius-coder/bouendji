import { z } from "zod";
import { id } from "@/server/api/schema-kit";

/** Source : handlers appareils / hors-ligne de `routes/admin.ts`, `bundleState` de `services/offlineBundles.ts`. */
export const device = z.object({
  deviceId: z.string(),
  userId: z.string(),
  name: z.string(),
  platform: z.string(),
  status: z.string(),
  lastSeenAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string().nullable(),
});
export type Device = z.infer<typeof device>;

export const deviceIdParams = z.object({ deviceId: id });

export const deviceRevoked = z.object({ deviceId: z.string(), status: z.string(), sessionsRevoked: z.number() });

export const offlineBundleState = z.object({
  id: z.string(),
  deviceId: z.string(),
  userId: z.string(),
  notAfter: z.string(),
  consumedAt: z.string().nullable(),
  expired: z.boolean(),
});
export type OfflineBundleState = z.infer<typeof offlineBundleState>;

/** 1 à 72 h (`offlineBundleSchema`) ; 1 h par défaut côté API. */
export const offlineIssueBody = z.object({ ttlHours: z.number().int().min(1).max(72).optional() });
export type OfflineIssue = z.input<typeof offlineIssueBody>;

/** `file` est scellé pour l'appareil : opaque pour le dashboard. */
export const offlineBundleIssued = z.object({
  bundleId: z.string(),
  deviceId: z.string(),
  notAfter: z.string(),
  singleUse: z.boolean(),
  endpointCount: z.number(),
  file: z.unknown(),
});

export const offlineListQuery = z.object({ deviceId: id.optional() });
export const offlineList = z.object({ bundles: z.array(offlineBundleState) });
