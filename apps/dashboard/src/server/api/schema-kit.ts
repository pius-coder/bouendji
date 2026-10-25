import { z } from "zod";

/**
 * Briques communes aux `*.schema.ts`. Les bornes des schémas d'ENTRÉE recopient
 * celles de l'API (`apps/api/src/routes/admin.ts`) pour refuser tôt, côté Node ;
 * l'API reste l'autorité et revérifie tout.
 */
export const id = z.string().trim().min(1).max(190);
export const isoDate = z.string().nullable();

/** Page à curseur : `{ items, nextCursor? }`. */
export function pageOf<S extends z.ZodTypeAny>(item: S) {
  return z.object({ items: z.array(item), nextCursor: z.string().optional() });
}

/** Liste simple : `{ items }`, déroulée par le service. */
export function listOf<S extends z.ZodTypeAny>(item: S) {
  return z.object({ items: z.array(item) });
}
