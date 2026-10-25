import { z } from "zod";
import { id } from "@/server/api/schema-kit";

/** Source : `endpointDto` et handler `POST /endpoints/:id/health` (admin.ts). */
export const poolEndpoint = z.object({
  endpointId: z.string(),
  label: z.string(),
  host: z.string(),
  port: z.number(),
  protocol: z.string(),
  transport: z.string(),
  security: z.string(),
  region: z.string(),
  tier: z.string(),
  capacity: z.number(),
  inUse: z.number(),
  status: z.string(),
  health: z.string(),
  downSince: z.string().nullable(),
  downReason: z.string().nullable(),
  latencyMs: z.number().nullable(),
  lastSeenAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
});
export type PoolEndpoint = z.infer<typeof poolEndpoint>;

export const pool = z.object({ poolRevision: z.number(), count: z.number(), endpoints: z.array(poolEndpoint) });
export type Pool = z.infer<typeof pool>;

export const endpointIdParams = z.object({ endpointId: id });
export const endpointHealthBody = z.object({
  state: z.enum(["down", "healthy"]),
  reason: z.string().trim().max(200).optional(),
});
export type EndpointHealth = z.input<typeof endpointHealthBody>;

export const endpointHealthChange = z.object({
  endpointId: z.string(),
  label: z.string(),
  tier: z.string(),
  health: z.string(),
  previousHealth: z.string(),
  downSince: z.string().nullable(),
  downReason: z.string().nullable(),
  changed: z.boolean(),
  poolRevision: z.number(),
});

/** Recopiés de `apps/api/src/routes/admin.ts` (l. 142-143). */
const HOSTNAME_RE = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hostname = (message: string) =>
  z
    .string()
    .trim()
    .refine((v) => HOSTNAME_RE.test(v), message);

/** Source : `manualEndpointSchema` (POST /endpoints/manual). Un SNI = une ligne du pool. */
export const manualEndpointBody = z.object({
  group: z.string().trim().regex(/^[a-z0-9-]{2,40}$/, "Minuscules, chiffres et tirets (2 à 40)."),
  label: z.string().trim().min(2, "2 caractères min.").max(40),
  region: z.string().trim().min(2, "2 caractères min.").max(24),
  address: hostname("Adresse invalide."),
  port: z.number().int().min(1).max(65_535).default(443),
  snis: z.array(hostname("SNI invalide.")).min(1, "Au moins un SNI.").max(12, "12 SNI au plus."),
  hostHeader: hostname("Host invalide.").nullish(),
  wsPath: z.string().trim().regex(/^\/[^\s?#]{0,200}$/, "Commence par / , sans espace ni query."),
  uuid: z.string().trim().regex(UUID_RE, "UUID invalide."),
  ttlHours: z.number().int().min(1).max(720),
  tier: z.enum(["free-labs", "paid-gcp"]).default("free-labs"),
});
export type ManualEndpoint = z.input<typeof manualEndpointBody>;

export const manualEndpointCreated = z.object({
  group: z.string(),
  count: z.number(),
  ids: z.array(z.string()),
  expiresAt: z.string(),
  poolRevision: z.number(),
});

/** Saisie du formulaire : nombres en texte, SNI un par ligne (ou séparés par des virgules). */
const wholeNumber = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .refine((v) => /^\d+$/.test(v) && Number(v) >= min && Number(v) <= max, `${label} : entre ${min} et ${max}.`);

export function splitSnis(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export const manualEndpointFormSchema = z.object({
  group: manualEndpointBody.shape.group,
  label: manualEndpointBody.shape.label,
  region: manualEndpointBody.shape.region,
  address: manualEndpointBody.shape.address,
  port: wholeNumber("Port", 1, 65_535),
  snis: z
    .string()
    .refine((v) => splitSnis(v).length >= 1, "Au moins un SNI.")
    .refine((v) => splitSnis(v).length <= 12, "12 SNI au plus.")
    .refine((v) => splitSnis(v).every((s) => HOSTNAME_RE.test(s)), "SNI invalide."),
  hostHeader: z
    .string()
    .trim()
    .refine((v) => v === "" || HOSTNAME_RE.test(v), "Host invalide."),
  wsPath: manualEndpointBody.shape.wsPath,
  uuid: manualEndpointBody.shape.uuid,
  ttlHours: wholeNumber("Durée", 1, 720),
  tier: z.enum(["free-labs", "paid-gcp"]),
});
export type ManualEndpointFormValues = z.input<typeof manualEndpointFormSchema>;

export function manualEndpointFormToBody(values: z.output<typeof manualEndpointFormSchema>): ManualEndpoint {
  return {
    ...values,
    port: Number(values.port),
    ttlHours: Number(values.ttlHours),
    snis: splitSnis(values.snis),
    hostHeader: values.hostHeader || null,
  };
}
