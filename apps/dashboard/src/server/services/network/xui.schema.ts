import { z } from "zod";

/** Source : `serverDto` et `serverCreateSchema` de `apps/api/src/routes/adminXui.ts`. Le jeton ne revient jamais. */
export const xuiServer = z.object({
  id: z.string(),
  label: z.string(),
  panelUrl: z.string(),
  inboundId: z.number().int(),
  capacity: z.number().int(),
  active: z.boolean(),
  publicHost: z.string(),
  publicPort: z.number().int(),
  security: z.enum(["tls", "none"]),
  sni: z.string().nullable(),
  wsPath: z.string(),
  wsHost: z.string().nullable(),
  tokenSet: z.boolean(),
  assigned: z.number().int(),
  createdAt: z.string(),
});
export type XuiServer = z.infer<typeof xuiServer>;

export const xuiServerList = z.object({ servers: z.array(xuiServer) });
export const xuiServerOne = z.object({ server: xuiServer });
export const xuiTestResult = z.object({ ok: z.boolean(), message: z.string(), inboundRemark: z.string().nullable() });
export const xuiServerIdParams = z.object({ serverId: z.string().min(1) });

export const xuiServerBody = z.object({
  label: z.string().trim().min(2).max(80),
  panelUrl: z.string().trim().url().max(300),
  apiToken: z.string().trim().min(16).max(300),
  inboundId: z.number().int().min(1).max(1_000_000),
  capacity: z.number().int().min(1).max(5_000).optional(),
  publicHost: z.string().trim().min(3).max(253),
  publicPort: z.number().int().min(1).max(65_535).optional(),
  security: z.enum(["tls", "none"]).optional(),
  sni: z.string().trim().min(1).max(253).nullable().optional(),
  wsPath: z.string().trim().startsWith("/").max(200),
  wsHost: z.string().trim().min(1).max(253).nullable().optional(),
});
export type XuiServerBody = z.input<typeof xuiServerBody>;

const whole = (label: string, min: number, max: number, optional = false) =>
  z
    .string()
    .trim()
    .refine((v) => (optional && v === "") || (/^\d+$/.test(v) && Number(v) >= min && Number(v) <= max), `${label} : entre ${min} et ${max}.`);

/** Saisie du formulaire (chaînes) ; `xuiServerFormToBody` convertit. */
export const xuiServerFormSchema = z.object({
  label: z.string().trim().min(2, "2 caractères min.").max(80),
  panelUrl: z
    .string()
    .trim()
    .max(300)
    .refine((v) => /^https?:\/\/[^\s]+$/.test(v), "Adresse du panneau en http(s)://, chemin de base compris."),
  apiToken: z.string().trim().min(16, "16 caractères min.").max(300),
  inboundId: whole("Inbound", 1, 1_000_000),
  capacity: whole("Capacité", 1, 5_000, true),
  publicHost: z.string().trim().min(3, "Hôte public requis.").max(253),
  publicPort: whole("Port", 1, 65_535, true),
  security: z.enum(["tls", "none"]),
  sni: z.string().trim().max(253),
  wsPath: z.string().trim().startsWith("/", "Commence par /.").max(200),
  wsHost: z.string().trim().max(253),
});
export type XuiServerFormValues = z.input<typeof xuiServerFormSchema>;

export function xuiServerFormToBody(v: z.output<typeof xuiServerFormSchema>): XuiServerBody {
  return {
    label: v.label,
    panelUrl: v.panelUrl,
    apiToken: v.apiToken,
    inboundId: Number(v.inboundId),
    ...(v.capacity ? { capacity: Number(v.capacity) } : {}),
    publicHost: v.publicHost,
    ...(v.publicPort ? { publicPort: Number(v.publicPort) } : {}),
    security: v.security,
    sni: v.sni || null,
    wsPath: v.wsPath,
    wsHost: v.wsHost || null,
  };
}
