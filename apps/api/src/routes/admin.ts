/**
 * Dashboard d'administration.
 *
 * Quatre invariants portent tout ce fichier :
 *
 * 1. **Le périmètre vient de la session.** Aucune route ne lit un
 *    `community_id` dans le corps : le corps est filtré par zod (les clés
 *    inconnues sont jetées), et la communauté vient du chemin ou d'une
 *    appartenance enregistrée. Un admin qui vise une autre communauté obtient
 *    `403`, jamais un `404` qui laisserait croire à une ressource absente.
 * 2. **Le rôle est relu en base à chaque requête** (`requireAdmin`), pas lu dans
 *    le jeton. Retirer une appartenance coupe l'accès à l'appel suivant, même
 *    si le jeton vit 8 heures.
 * 3. **Le pool ne fuit jamais une identité.** Ni UUID, ni chemin WebSocket, ni
 *    credential, ni clé de déploiement : un admin ne voit jamais de quoi se
 *    connecter (knowledge/40-money/roles-and-commissions.md).
 *
 * Chaque action privilégiée écrit **une** ligne dans `audit_log`, dans la même
 * transaction que la mutation. `audit_log` refuse UPDATE et DELETE au niveau
 * PostgreSQL (règles dans schema.ts).
 *
 * 4. **L'argent ne bouge que par une transition conditionnelle.** Les retraits
 *    suivent `pending -> approved -> processing -> paid` (ou `failed`, ou
 *    `needs_review`) : chaque étape est un `UPDATE ... WHERE <état de départ>`
 *    dont le nombre de lignes est la réponse. Un `SELECT` suivi d'un `UPDATE`
 *    laisserait deux trésoriers payer deux fois, et c'est exactement le défaut
 *    que D57/D65 corrigent. La réclamation (`processing`) précède l'appel réseau :
 *    un crash laisse une ligne à vérifier, jamais un versement invisible.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { isUniqueViolation, type Database, type Queryable, type Row } from "../db.js";
import { requireAdmin, roleInCommunity, scopedCommunity, type AdminContext, type StaffRole } from "../lib/auth.js";
import { hashPassword, newId } from "../lib/crypto.js";
import { fail } from "../lib/errors.js";
// `services/payments.ts` n'expose aucun décaissement (il orchestre
// commande -> paiement -> activation). Le fournisseur de versement est donc
// l'instance exportée par `lib/fapshi.ts`, déjà sélectionnée par
// `env.paymentProvider` (mock | fapshi) : aucun fichier hors périmètre modifié.
import { payments as payoutProvider } from "../lib/fapshi.js";
import { bumpPoolRevision, poolRevision } from "../services/endpoints.js";
import { issueOfflineBundle } from "../services/offlineBundles.js";
import { MAX_COMMISSION_BPS, planRevision } from "../services/payments.js";

const PREFIX = "/v1/admin";

/* ------------------------------------------------------------- validation */

export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;
  const details: Record<string, string> = {};
  for (const issue of result.error.issues) {
    details[issue.path.join(".") || "_"] = issue.message;
  }
  throw fail.validation(details);
}

function parseQuery<T extends z.ZodTypeAny>(schema: T, query: unknown): z.infer<T> {
  return parseBody(schema, query ?? {});
}

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Minuscules, chiffres et tirets uniquement.");

const communityCreateSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: slugSchema,
    /** 0..3000 (base points). Défaut 3000 = 30 % (D35). */
    commissionBps: z.number().int().min(0).max(3000).optional(),
  })
  .strict();

const communityPatchSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    commissionBps: z.number().int().min(0).max(3000).optional(),
    status: z.enum(["active", "suspended"]).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Aucun champ à modifier.");

/**
 * Volontairement **non strict** : un `communityId` / `community_id` envoyé par
 * erreur dans le corps est ignoré, pas promu. Le chemin fait foi.
 */
const membershipCreateSchema = z.object({
  adminUserId: z.string().trim().min(1).max(190),
  role: z.enum(["community_admin", "support", "finance"]),
});

const membershipPatchSchema = z
  .object({
    role: z.enum(["community_admin", "support", "finance"]).optional(),
    status: z.enum(["active", "disabled"]).optional(),
  })
  .strict()
  .refine((value) => value.role !== undefined || value.status !== undefined, "Aucun champ à modifier.");

const adminCreateSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(190),
    name: z.string().trim().min(2).max(120),
    password: z.string().min(12).max(256),
    platformRole: z.enum(["none", "owner"]).optional(),
  })
  .strict();

const payoutCreateSchema = z
  .object({
    /** Aucun montant : il est calculé depuis les commissions disponibles. */
    note: z.string().trim().max(280).optional(),
  })
  .strict();

/** File d'attente : la communauté vient de la requête, jamais d'un corps. */
const payoutQueueQuerySchema = z.object({
  communityId: z.string().trim().max(190).optional(),
  community_id: z.string().trim().max(190).optional(),
  status: z.enum(["pending", "approved", "processing", "paid", "failed", "needs_review"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/**
 * Clôture d'une ambiguïté : un humain qui a vérifié chez Fapshi dit ce qui s'est
 * réellement passé. `reason` est la trace écrite, jamais une décision implicite.
 */
const payoutResolveSchema = z
  .object({
    outcome: z.enum(["paid", "failed"]),
    providerRef: z.string().trim().min(1).max(190).optional(),
    reason: z.string().trim().max(280).optional(),
  })
  .strict();

/** Levier manuel de l'exigence 3 : forcer un nœud hors (ou de retour dans) la liste. */
const endpointHealthSchema = z
  .object({
    state: z.enum(["down", "healthy"]),
    reason: z.string().trim().max(200).optional(),
  })
  .strict();

const offlineBundleSchema = z
  .object({
    ttlHours: z.number().int().min(1).max(72).optional(),
  })
  .strict();

/* ------------------------------------------------------------- forfaits */

const planCodeSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Minuscules, chiffres et tirets uniquement.");

/**
 * L'offre appartient à une **app**, et une app appartient à une communauté
 * (white label, D35). L'administrateur ne fixe donc que ses propres prix : le
 * prix n'est jamais imposé par la plateforme.
 */
const planCreateSchema = z
  .object({
    code: planCodeSchema,
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().max(500).optional(),
    priceXaf: z.number().int().min(1).max(10_000_000),
    durationDays: z.number().int().min(1).max(3650),
    deviceLimit: z.number().int().min(1).max(10).optional(),
    badge: z.string().trim().max(40).nullable().optional(),
    featured: z.boolean().optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
  })
  .strict();

/** `code` est immuable : il fait partie de la révision que l'app compare. */
const planPatchSchema = planCreateSchema
  .omit({ code: true })
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Aucun champ à modifier.");

const listQuerySchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  status: z.string().trim().max(32).optional(),
});

const auditQuerySchema = z.object({
  community_id: z.string().trim().max(190).optional(),
  communityId: z.string().trim().max(190).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/* ----------------------------------------------------------- permissions */

type Capability =
  | "community.manage"
  | "community.read"
  | "membership.read"
  | "membership.write"
  | "member.read"
  | "order.read"
  | "commission.read"
  | "payout.create"
  | "payout.approve"
  | "payout.pay"
  | "payout.confirm"
  | "payout.resolve"
  | "plan.manage"
  | "endpoint.read"
  | "endpoint.write"
  | "device.revoke"
  | "offline_bundle.issue"
  | "audit.read";

/**
 * Matrice appliquée, rôle par rôle (knowledge/40-money/roles-and-commissions.md,
 * D57/D65).
 *
 * | Capacité              | owner | community_admin | support | finance |
 * |-----------------------|-------|-----------------|---------|---------|
 * | community.manage      | oui   | non             | non     | non     |
 * | community.read        | oui   | sa communauté   | sa comm.| sa comm.|
 * | membership.read/write | oui   | sa communauté   | non     | non     |
 * | member.read           | oui   | sa communauté   | sa comm.| non     |
 * | order.read            | oui   | sa communauté   | sa comm.| toutes  |
 * | commission.read       | oui   | sa communauté   | non     | toutes  |
 * | payout.create         | oui   | non             | non     | sa comm.|
 * | payout.approve        | oui   | sa communauté   | non     | toutes  |
 * | payout.pay            | oui   | non             | non     | toutes  |
 * | payout.confirm        | oui   | non             | non     | toutes  |
 * | payout.resolve        | oui   | non             | non     | toutes  |
 * | plan.manage           | oui   | sa communauté   | non     | non     |
 * | endpoint.read         | oui   | oui (lecture)   | oui     | non     |
 * | endpoint.write        | oui   | non             | non     | non     |
 * | device.revoke         | oui   | sa communauté   | sa comm.| non     |
 * | offline_bundle.issue  | oui   | sa communauté   | sa comm.| non     |
 * | audit.read            | oui   | sa communauté   | non     | non     |
 */
function permitted(admin: AdminContext, capability: Capability, communityId: string | null): boolean {
  if (admin.platformRole === "owner") return true;
  const local: StaffRole | null = communityId ? roleInCommunity(admin, communityId) : null;
  const anyRole = (roles: readonly StaffRole[]) => admin.memberships.some((m) => roles.includes(m.role));

  switch (capability) {
    case "community.read":
      // Une communauté précise exige une appartenance ; la liste, au moins une.
      return communityId ? local !== null : admin.memberships.length > 0;
    case "community.manage":
      return false;
    case "membership.read":
    case "membership.write":
      return local === "community_admin";
    case "member.read":
      return local === "community_admin" || local === "support";
    case "order.read":
      // `finance` voit toutes les communautés : elle encaisse pour la plateforme.
      return local !== null || anyRole(["finance"]);
    case "commission.read":
      return local === "community_admin" || local === "finance" || anyRole(["finance"]);
    case "payout.create":
      return local === "finance";
    case "payout.approve":
      /*
       * D57 : `owner`, `finance` (de la communauté ou d'une autre — elle
       * encaisse pour la plateforme) et `community_admin` de la communauté
       * approuvent. C'est la correction du défaut : la matrice réservait cette
       * capacité à `owner`, donc une communauté sans owner actif ne pouvait plus
       * payer ses commissions. L'auto-approbation est interdite plus bas, dans
       * la condition SQL — pas ici, pour qu'elle renvoie 409 et non 403.
       */
      return local === "community_admin" || local === "finance" || anyRole(["finance"]);
    case "payout.pay":
      // L'argent ne quitte la plateforme que par une main qui tient les comptes.
      return local === "finance" || anyRole(["finance"]);
    case "payout.confirm":
      // Confirmer un versement = attester qu'il est arrivé chez le bénéficiaire.
      return local === "finance" || anyRole(["finance"]);
    case "payout.resolve":
      return local === "finance" || anyRole(["finance"]);
    case "plan.manage":
      // Le prix est la décision commerciale de la marque, pas une opération de
      // caisse : `finance` et `support` n'y touchent pas.
      return local === "community_admin";
    case "endpoint.read":
      return anyRole(["community_admin", "support"]);
    case "endpoint.write":
      // Forcer un nœud `down` est un acte d'exploitation global (exigence 3).
      return false;
    case "device.revoke":
    case "offline_bundle.issue":
      return local === "community_admin" || local === "support";
    case "audit.read":
      return local === "community_admin";
    default:
      return false;
  }
}

function authorize(admin: AdminContext, capability: Capability, communityId: string | null): void {
  if (!permitted(admin, capability, communityId)) {
    throw fail.forbidden("Action non autorisée pour votre rôle.");
  }
}

/** Qui voit les montants : owner, community_admin (ses ventes), finance. */
function seesMoney(admin: AdminContext, communityId: string | null): boolean {
  if (admin.platformRole === "owner") return true;
  const local = communityId ? roleInCommunity(admin, communityId) : null;
  return local === "community_admin" || local === "finance";
}

/* -------------------------------------------------------------- utilitaires */

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

interface Cursor {
  createdAt: string;
  id: string;
}

function encodeCursor(row: Row): string {
  return Buffer.from(`${iso(row.created_at)}|${String(row.id)}`, "utf8").toString("base64url");
}

function decodeCursor(raw: string): Cursor {
  let decoded: string;
  try {
    decoded = Buffer.from(raw, "base64url").toString("utf8");
  } catch {
    throw fail.validation({ cursor: "Curseur invalide." });
  }
  const separator = decoded.indexOf("|");
  if (separator <= 0 || separator === decoded.length - 1) throw fail.validation({ cursor: "Curseur invalide." });
  const createdAt = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  if (Number.isNaN(Date.parse(createdAt)) || id.length === 0 || id.length > 190) {
    throw fail.validation({ cursor: "Curseur invalide." });
  }
  return { createdAt, id };
}

async function mustCommunity(db: Queryable, communityId: string): Promise<void> {
  const row = await db.one("SELECT id FROM communities WHERE id = $1", [communityId]);
  if (!row) throw fail.notFound("Communauté introuvable.");
}

/** Une app porte la marque ; sa communauté est la frontière d'autorisation. */
async function mustApp(db: Queryable, appId: string): Promise<Row> {
  const row = await db.one<Row>("SELECT id, community_id, name FROM apps WHERE id = $1", [appId]);
  if (!row) throw fail.notFound("Application introuvable.");
  return row;
}

/**
 * Un versement porte sa communauté : c'est elle qui autorise, jamais un
 * `community_id` de corps de requête (invariant 1 du fichier).
 */
async function mustPayout(db: Queryable, payoutId: string): Promise<Row> {
  const row = await db.one<Row>("SELECT * FROM payouts WHERE id = $1", [payoutId]);
  if (!row) throw fail.notFound("Versement introuvable.");
  return row;
}

/** Raison d'échec bornée : un message interne ne devient pas une colonne libre. */
function payoutFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `provider: ${message}`.slice(0, 280);
}

/** Dernier `community_admin` actif : le retirer verrouillerait la communauté. */
async function assertNotLastCommunityAdmin(db: Queryable, communityId: string, exceptId: string): Promise<void> {
  const remaining = await db.scalar<number>(
    `SELECT count(*) FROM community_memberships
      WHERE community_id = $1 AND role = 'community_admin' AND status = 'active' AND id <> $2`,
    [communityId, exceptId],
  );
  if (Number(remaining) === 0) {
    throw fail.conflict("Impossible de retirer le dernier administrateur de la communauté.");
  }
}

/* ------------------------------------------------------------------ audit */

export interface AuditInput {
  action: string;
  targetType: string;
  targetId: string;
  communityId?: string | null;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
}

/**
 * Une ligne par action, écrite dans la transaction de la mutation : si la
 * mutation échoue, l'audit disparaît avec elle ; si elle passe, la trace existe.
 * `actor_role` est le rôle *exercé*, pas le rôle global : une ligne dit qui a
 * fait quoi, dans quelle communauté, avec quel rôle.
 */
export async function appendAudit(q: Queryable, admin: AdminContext, req: FastifyRequest, input: AuditInput): Promise<void> {
  const communityId = input.communityId ?? null;
  const actorRole =
    admin.platformRole === "owner" ? "owner" : (communityId ? roleInCommunity(admin, communityId) : null) ?? "staff";
  const userAgent = req.headers["user-agent"];
  await q.query(
    `INSERT INTO audit_log
       (id, actor_id, actor_type, actor_role, action, target, target_type, target_id,
        community_id, ip, user_agent, meta, before_state, after_state)
     VALUES ($1, $2, 'admin', $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb)`,
    [
      newId(),
      admin.adminId,
      actorRole,
      input.action,
      `${input.targetType}:${input.targetId}`,
      input.targetType,
      input.targetId,
      communityId,
      req.ip ?? null,
      typeof userAgent === "string" ? userAgent.slice(0, 300) : null,
      JSON.stringify(input.meta ?? {}),
      input.before === undefined ? null : JSON.stringify(input.before),
      input.after === undefined ? null : JSON.stringify(input.after),
    ],
  );
}

/* ------------------------------------------------------------ projections */

function communityDto(row: Row) {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    status: row.status as string,
    commissionBps: Number(row.commission_bps),
    createdAt: iso(row.created_at),
    suspended: row.status !== "active",
  };
}

function planDto(row: Row) {
  const plan = {
    code: row.code as string,
    price_xaf: Number(row.price_xaf),
    duration_days: Number(row.duration_days),
    device_limit: Number(row.device_limit),
    active: row.active === true,
  };
  return {
    id: row.id as string,
    appId: row.app_id as string,
    code: plan.code,
    name: row.name as string,
    description: row.description as string,
    priceXaf: plan.price_xaf,
    durationDays: plan.duration_days,
    deviceLimit: plan.device_limit,
    badge: (row.badge as string | null) ?? null,
    featured: row.featured === true,
    active: plan.active,
    sortOrder: Number(row.sort_order),
    /** Même valeur que le `409 CONFLICT` renvoyé par la création de commande. */
    revision: planRevision(plan),
  };
}

function membershipDto(row: Row) {
  return {
    id: row.id as string,
    adminUserId: row.admin_user_id as string,
    email: row.email as string | null,
    name: row.name as string | null,
    role: row.role as StaffRole,
    status: row.status as string,
    communityId: row.community_id as string,
    createdAt: iso(row.created_at),
  };
}

const MEMBERSHIP_SELECT = /* sql */ `
  SELECT m.id, m.admin_user_id, m.community_id, m.role, m.status, m.created_at,
         a.email, a.name
    FROM community_memberships m
    JOIN admin_users a ON a.id = m.admin_user_id`;

function orderDto(row: Row, withMoney: boolean) {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    planId: row.plan_id as string,
    status: row.status as string,
    currency: row.currency as string,
    ...(withMoney
      ? {
          amountXaf: Number(row.amount_xaf),
          commissionBps: Number(row.commission_bps),
          commissionXaf: Number(row.commission_xaf),
        }
      : {}),
    createdAt: iso(row.created_at),
    paidAt: iso(row.paid_at),
    activatedAt: iso(row.activated_at),
  };
}

function commissionDto(row: Row) {
  return {
    id: row.id as string,
    orderId: row.order_id as string,
    bps: Number(row.bps),
    amountXaf: Number(row.amount_xaf),
    status: row.status as string,
    payoutId: (row.payout_id as string | null) ?? null,
    createdAt: iso(row.created_at),
    availableAt: iso(row.available_at),
  };
}

/**
 * Un versement, dans l'ordre de sa machine à états (D65) :
 * `pending -> approved -> processing -> paid`, ou `failed`, ou `needs_review`.
 * Chaque horodatage dit **qui** a fait avancer l'argent, et `attempts` dit
 * combien de fois le fournisseur a été sollicité. Aucun champ n'est dérivé.
 */
function payoutDto(row: Row) {
  return {
    id: row.id as string,
    communityId: row.community_id as string,
    ...(row.community_name === undefined ? {} : { communityName: (row.community_name as string | null) ?? null }),
    amountXaf: Number(row.amount_xaf),
    currency: "XAF",
    status: row.status as string,
    note: (row.note as string | null) ?? null,
    providerRef: (row.provider_ref as string | null) ?? null,
    createdBy: (row.created_by as string | null) ?? null,
    approvedBy: (row.approved_by as string | null) ?? null,
    approvedAt: iso(row.approved_at),
    claimedAt: iso(row.claimed_at),
    attempts: Number(row.attempts ?? 0),
    failedReason: (row.failed_reason as string | null) ?? null,
    confirmedAt: iso(row.confirmed_at),
    resolvedBy: (row.resolved_by as string | null) ?? null,
    createdAt: iso(row.created_at),
    paidAt: iso(row.paid_at),
  };
}

/** Thèmes qu'`inject-brand.mjs` sait rendre : un autre nom ne produit aucun APK. */
const BRAND_THEMES: readonly string[] = ["halo", "mono", "vector", "otaku"];
/** Le paquet de démonstration est refusé par l'injecteur : il ne construit pas. */
const RESERVED_PACKAGE = "cm.bouendji.vpn";

function brandManifest(row: Row): Record<string, unknown> {
  const raw = row.brand;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string" && raw.trim().length > 0) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // Manifeste illisible = manifeste absent : `brandReady` doit rester faux.
    }
  }
  return {};
}

/**
 * §3.5 — le manifeste de marque est un contrat d'API, pas un script de CI. Ce
 * qui manque est **nommé** : la console désactive « Construire » en affichant le
 * champ fautif, au lieu de laisser partir un build qui mourra 90 s plus tard.
 */
function brandReadiness(row: Row): { ready: boolean; missing: string[] } {
  const brand = brandManifest(row);
  const missing: string[] = [];

  const name = String(row.name ?? "").trim();
  if (name.length < 2 || name.length > 40) missing.push("appName");

  const packageName = String(row.package_name ?? "").trim();
  const packageOk = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(packageName);
  if (!packageOk || packageName === RESERVED_PACKAGE) missing.push("packageName");

  if (!BRAND_THEMES.includes(String(row.theme ?? ""))) missing.push("theme");

  const declared = typeof brand.supportUrl === "string" ? brand.supportUrl.trim() : "";
  const supportUrl = declared.length > 0 ? declared : String(row.support_url ?? "").trim();
  if (!/^(https:|mailto:|tel:)/i.test(supportUrl) || supportUrl.includes(".invalid")) missing.push("supportUrl");

  return { ready: missing.length === 0, missing };
}

function appDto(row: Row) {
  const brand = brandReadiness(row);
  return {
    id: row.id as string,
    communityId: row.community_id as string,
    name: row.name as string,
    packageName: row.package_name as string,
    theme: row.theme as string,
    brandReady: brand.ready,
    brandMissing: brand.missing,
  };
}

function adminDirectoryDto(row: Row) {
  return {
    id: row.id as string,
    email: row.email as string,
    name: row.name as string,
    platformRole: row.platform_role === "owner" ? "owner" : "none",
    active: row.active === true,
  };
}

/**
 * Le pool est une ressource **globale** : aucun `community_id` à filtrer. Ce qui
 * sort est un état de santé, jamais de quoi ouvrir un tunnel.
 */
function endpointDto(row: Row) {
  return {
    endpointId: row.id as string,
    label: row.label as string,
    host: row.host as string,
    port: Number(row.port),
    protocol: row.protocol as string,
    transport: row.transport as string,
    security: row.security as string,
    region: row.region as string,
    tier: (row.tier as string | null) ?? "free-labs",
    capacity: Number(row.capacity),
    inUse: Number(row.in_use),
    status: row.status as string,
    health: row.health as string,
    downSince: iso(row.down_since),
    downReason: (row.down_reason as string | null) ?? null,
    latencyMs: row.latency_ms === null || row.latency_ms === undefined ? null : Number(row.latency_ms),
    lastSeenAt: iso(row.last_seen_at),
    expiresAt: iso(row.expires_at),
  };
}

function auditDto(row: Row) {
  return {
    id: row.id as string,
    action: row.action as string,
    actorId: (row.actor_id as string | null) ?? null,
    actorRole: (row.actor_role as string | null) ?? null,
    targetType: (row.target_type as string | null) ?? null,
    targetId: (row.target_id as string | null) ?? null,
    communityId: (row.community_id as string | null) ?? null,
    ip: (row.ip as string | null) ?? null,
    before: row.before_state ?? null,
    after: row.after_state ?? null,
    createdAt: iso(row.created_at),
  };
}

/* ---------------------------------------------------------------- handlers */

export function registerAdminRoutes(app: FastifyInstance, db: Database): void {
  /* ------------------------------------------------------------------ moi */

  app.get(`${PREFIX}/me`, async (req) => {
    const admin = await requireAdmin(db, req);
    return {
      adminId: admin.adminId,
      email: admin.admin.email as string,
      name: admin.admin.name as string,
      platformRole: admin.platformRole,
      memberships: admin.memberships.map((m) => ({ communityId: m.communityId, role: m.role })),
    };
  });

  /* ---------------------------------------------------------- communautés */

  app.get(`${PREFIX}/communities`, async (req) => {
    const admin = await requireAdmin(db, req);
    const rows =
      admin.platformRole === "owner"
        ? await db.query<Row>("SELECT * FROM communities ORDER BY created_at DESC LIMIT 200")
        : await db.query<Row>(
            `SELECT c.* FROM communities c
               JOIN community_memberships m ON m.community_id = c.id
              WHERE m.admin_user_id = $1 AND m.status = 'active'
              ORDER BY c.created_at DESC LIMIT 200`,
            [admin.adminId],
          );
    return { items: rows.map(communityDto) };
  });

  app.post(`${PREFIX}/communities`, async (req, reply) => {
    const admin = await requireAdmin(db, req);
    authorize(admin, "community.manage", null);
    const input = parseBody(communityCreateSchema, req.body);
    const id = newId();
    try {
      await db.tx(async (q) => {
        await q.query(
          `INSERT INTO communities (id, name, slug, commission_bps) VALUES ($1, $2, $3, $4)`,
          [id, input.name, input.slug, input.commissionBps ?? 3000],
        );
        await appendAudit(q, admin, req, {
          action: "community.create",
          targetType: "community",
          targetId: id,
          communityId: id,
          after: { name: input.name, slug: input.slug, commissionBps: input.commissionBps ?? 3000 },
        });
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw fail.conflict("Ce slug de communauté est déjà utilisé.");
      throw err;
    }
    const created = await db.one<Row>("SELECT * FROM communities WHERE id = $1", [id]);
    return reply.code(201).send(communityDto(created as Row));
  });

  app.get<{ Params: { communityId: string } }>(`${PREFIX}/communities/:communityId`, async (req) => {
    const admin = await requireAdmin(db, req);
    const communityId = scopedCommunity(admin, req.params.communityId) as string;
    authorize(admin, "community.read", communityId);
    await mustCommunity(db, communityId);
    const row = await db.one<Row>("SELECT * FROM communities WHERE id = $1", [communityId]);
    return communityDto(row as Row);
  });

  app.patch<{ Params: { communityId: string } }>(`${PREFIX}/communities/:communityId`, async (req) => {
    const admin = await requireAdmin(db, req);
    const communityId = scopedCommunity(admin, req.params.communityId) as string;
    authorize(admin, "community.manage", communityId);
    await mustCommunity(db, communityId);
    const input = parseBody(communityPatchSchema, req.body);
    const before = await db.one<Row>("SELECT * FROM communities WHERE id = $1", [communityId]);
    if (!before) throw fail.notFound("Communauté introuvable.");

    const name = input.name ?? (before.name as string);
    const commissionBps = input.commissionBps ?? Number(before.commission_bps);
    const status = input.status ?? (before.status as string);
    const suspended = before.status !== "suspended" && status === "suspended";

    await db.tx(async (q) => {
      await q.query(`UPDATE communities SET name = $2, commission_bps = $3, status = $4 WHERE id = $1`, [
        communityId,
        name,
        commissionBps,
        status,
      ]);
      await appendAudit(q, admin, req, {
        action: suspended ? "community.suspend" : status !== before.status ? "community.resume" : "community.update",
        targetType: "community",
        targetId: communityId,
        communityId,
        before: { name: before.name, commissionBps: Number(before.commission_bps), status: before.status },
        after: { name, commissionBps, status },
      });
    });

    const updated = await db.one<Row>("SELECT * FROM communities WHERE id = $1", [communityId]);
    return communityDto(updated as Row);
  });

  /* --------------------------------------------------------------- marques */

  /**
   * Les marques visibles par l'appelant. Une app appartient à une communauté :
   * c'est elle qui borne la liste, jamais un identifiant venu de la requête.
   * `brandReady` est calculé depuis la ligne `apps`, pas depuis un état de build :
   * une marque incomplète est signalée **avant** de lancer la CI (§3.5).
   */
  app.get(`${PREFIX}/apps`, async (req) => {
    const admin = await requireAdmin(db, req);
    authorize(admin, "community.read", null);

    const columns = "a.id, a.community_id, a.name, a.package_name, a.theme, a.support_url, a.brand";
    const rows =
      admin.platformRole === "owner"
        ? await db.query<Row>(`SELECT ${columns} FROM apps a ORDER BY a.name ASC LIMIT 200`)
        : await db.query<Row>(
            `SELECT ${columns}
               FROM apps a
               JOIN community_memberships m ON m.community_id = a.community_id
              WHERE m.admin_user_id = $1 AND m.status = 'active'
              ORDER BY a.name ASC LIMIT 200`,
            [admin.adminId],
          );
    return { items: rows.map(appDto) };
  });

  /* --------------------------------------------------------- forfaits (prix) */

  app.get<{ Params: { appId: string } }>(`${PREFIX}/apps/:appId/plans`, async (req) => {
    const admin = await requireAdmin(db, req);
    const appRow = await mustApp(db, req.params.appId);
    const communityId = scopedCommunity(admin, String(appRow.community_id)) as string;
    authorize(admin, "community.read", communityId);
    const rows = await db.query<Row>(
      "SELECT * FROM plans WHERE app_id = $1 ORDER BY sort_order ASC, price_xaf ASC",
      [req.params.appId],
    );
    return { items: rows.map(planDto) };
  });

  app.post<{ Params: { appId: string } }>(`${PREFIX}/apps/:appId/plans`, async (req, reply) => {
    const admin = await requireAdmin(db, req);
    const appRow = await mustApp(db, req.params.appId);
    const communityId = scopedCommunity(admin, String(appRow.community_id)) as string;
    authorize(admin, "plan.manage", communityId);
    const input = parseBody(planCreateSchema, req.body);
    const id = newId();

    try {
      await db.tx(async (q) => {
        await q.query(
          `INSERT INTO plans (id, app_id, code, name, description, price_xaf, duration_days,
                              device_limit, badge, featured, active, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            id,
            req.params.appId,
            input.code,
            input.name,
            input.description ?? "",
            input.priceXaf,
            input.durationDays,
            input.deviceLimit ?? 1,
            input.badge ?? null,
            input.featured ?? false,
            input.active ?? true,
            input.sortOrder ?? 0,
          ],
        );
        await appendAudit(q, admin, req, {
          action: "plan.create",
          targetType: "plan",
          targetId: id,
          communityId,
          after: { appId: req.params.appId, code: input.code, priceXaf: input.priceXaf },
        });
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw fail.conflict("Ce code d'offre existe déjà pour cette application.");
      throw err;
    }

    const created = await db.one<Row>("SELECT * FROM plans WHERE id = $1", [id]);
    return reply.code(201).send(planDto(created as Row));
  });

  app.patch<{ Params: { planId: string } }>(`${PREFIX}/plans/:planId`, async (req) => {
    const admin = await requireAdmin(db, req);
    const before = await db.one<Row>(
      `SELECT p.*, a.community_id FROM plans p JOIN apps a ON a.id = p.app_id WHERE p.id = $1`,
      [req.params.planId],
    );
    if (!before) throw fail.notFound("Offre introuvable.");
    const communityId = scopedCommunity(admin, String(before.community_id)) as string;
    authorize(admin, "plan.manage", communityId);
    const input = parseBody(planPatchSchema, req.body);

    const name = input.name ?? (before.name as string);
    const description = input.description ?? (before.description as string);
    const priceXaf = input.priceXaf ?? Number(before.price_xaf);
    const durationDays = input.durationDays ?? Number(before.duration_days);
    const deviceLimit = input.deviceLimit ?? Number(before.device_limit);
    const badge = input.badge !== undefined ? input.badge : ((before.badge as string | null) ?? null);
    const featured = input.featured ?? before.featured === true;
    const active = input.active ?? before.active === true;
    const sortOrder = input.sortOrder ?? Number(before.sort_order);

    await db.tx(async (q) => {
      await q.query(
        `UPDATE plans
            SET name = $2, description = $3, price_xaf = $4, duration_days = $5,
                device_limit = $6, badge = $7, featured = $8, active = $9, sort_order = $10
          WHERE id = $1`,
        [req.params.planId, name, description, priceXaf, durationDays, deviceLimit, badge, featured, active, sortOrder],
      );
      await appendAudit(q, admin, req, {
        action: "plan.update",
        targetType: "plan",
        targetId: req.params.planId,
        communityId,
        before: {
          name: before.name,
          priceXaf: Number(before.price_xaf),
          durationDays: Number(before.duration_days),
          active: before.active,
        },
        after: { name, priceXaf, durationDays, active },
      });
    });

    const updated = await db.one<Row>("SELECT * FROM plans WHERE id = $1", [req.params.planId]);
    return planDto(updated as Row);
  });

  /* ----------------------------------------------------- personnel (staff) */

  app.get<{ Params: { communityId: string } }>(`${PREFIX}/communities/:communityId/memberships`, async (req) => {
    const admin = await requireAdmin(db, req);
    const communityId = scopedCommunity(admin, req.params.communityId) as string;
    authorize(admin, "membership.read", communityId);
    await mustCommunity(db, communityId);
    const rows = await db.query<Row>(`${MEMBERSHIP_SELECT} WHERE m.community_id = $1 ORDER BY m.created_at ASC`, [
      communityId,
    ]);
    return { items: rows.map(membershipDto) };
  });

  app.post<{ Params: { communityId: string } }>(`${PREFIX}/communities/:communityId/memberships`, async (req, reply) => {
    const admin = await requireAdmin(db, req);
    const communityId = scopedCommunity(admin, req.params.communityId) as string;
    // Autorisation avant validation : un rôle non autorisé n'obtient pas de
    // retour sur la forme du corps.
    authorize(admin, "membership.write", communityId);
    await mustCommunity(db, communityId);

    const input = parseBody(membershipCreateSchema, req.body);
    if (admin.platformRole !== "owner" && input.adminUserId === admin.adminId) {
      throw fail.forbidden("Vous ne pouvez pas modifier votre propre appartenance.");
    }
    const target = await db.one<Row>("SELECT id, active FROM admin_users WHERE id = $1", [input.adminUserId]);
    if (!target) throw fail.notFound("Compte administrateur introuvable.");
    if (target.active !== true) throw fail.conflict("Ce compte administrateur est désactivé.");

    const id = newId();
    try {
      await db.tx(async (q) => {
        await q.query(
          `INSERT INTO community_memberships (id, admin_user_id, community_id, role, status)
           VALUES ($1, $2, $3, $4, 'active')`,
          [id, input.adminUserId, communityId, input.role],
        );
        await appendAudit(q, admin, req, {
          action: "membership.create",
          targetType: "membership",
          targetId: id,
          communityId,
          after: { adminUserId: input.adminUserId, role: input.role, status: "active" },
        });
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw fail.conflict("Ce compte a déjà une appartenance dans cette communauté.");
      throw err;
    }

    const row = await db.one<Row>(`${MEMBERSHIP_SELECT} WHERE m.id = $1`, [id]);
    return reply.code(201).send(membershipDto(row as Row));
  });

  app.patch<{ Params: { membershipId: string } }>(`${PREFIX}/memberships/:membershipId`, async (req) => {
    const admin = await requireAdmin(db, req);
    const target = await db.one<Row>(
      "SELECT id, admin_user_id, community_id, role, status FROM community_memberships WHERE id = $1",
      [req.params.membershipId],
    );
    if (!target) throw fail.notFound("Appartenance introuvable.");
    const communityId = target.community_id as string;
    authorize(admin, "membership.write", communityId);
    if (admin.platformRole !== "owner" && target.admin_user_id === admin.adminId) {
      throw fail.forbidden("Vous ne pouvez pas modifier votre propre appartenance.");
    }

    const input = parseBody(membershipPatchSchema, req.body);
    const role = (input.role ?? target.role) as StaffRole;
    const status = input.status ?? (target.status as string);
    const losesAdmin =
      target.role === "community_admin" && (role !== "community_admin" || status !== "active");
    if (losesAdmin) await assertNotLastCommunityAdmin(db, communityId, target.id as string);

    await db.tx(async (q) => {
      await q.query("UPDATE community_memberships SET role = $2, status = $3 WHERE id = $1", [
        target.id,
        role,
        status,
      ]);
      await appendAudit(q, admin, req, {
        action: status === "disabled" ? "membership.disable" : "membership.update",
        targetType: "membership",
        targetId: target.id as string,
        communityId,
        before: { role: target.role, status: target.status },
        after: { role, status },
      });
    });

    const row = await db.one<Row>(`${MEMBERSHIP_SELECT} WHERE m.id = $1`, [target.id]);
    return membershipDto(row as Row);
  });

  /** Retrait = désactivation logique : la ligne d'audit garde la trace. */
  app.delete<{ Params: { membershipId: string } }>(`${PREFIX}/memberships/:membershipId`, async (req) => {
    const admin = await requireAdmin(db, req);
    const target = await db.one<Row>(
      "SELECT id, admin_user_id, community_id, role, status FROM community_memberships WHERE id = $1",
      [req.params.membershipId],
    );
    if (!target) throw fail.notFound("Appartenance introuvable.");
    const communityId = target.community_id as string;
    authorize(admin, "membership.write", communityId);
    if (admin.platformRole !== "owner" && target.admin_user_id === admin.adminId) {
      throw fail.forbidden("Vous ne pouvez pas modifier votre propre appartenance.");
    }
    if (target.role === "community_admin" && target.status === "active") {
      await assertNotLastCommunityAdmin(db, communityId, target.id as string);
    }

    await db.tx(async (q) => {
      await q.query("UPDATE community_memberships SET status = 'disabled' WHERE id = $1", [target.id]);
      await appendAudit(q, admin, req, {
        action: "membership.disable",
        targetType: "membership",
        targetId: target.id as string,
        communityId,
        before: { role: target.role, status: target.status },
        after: { role: target.role, status: "disabled" },
      });
    });

    const row = await db.one<Row>(`${MEMBERSHIP_SELECT} WHERE m.id = $1`, [target.id]);
    return membershipDto(row as Row);
  });

  /** Provisionnement d'un compte d'administration (owner uniquement). */
  app.post(`${PREFIX}/admins`, async (req, reply) => {
    const admin = await requireAdmin(db, req);
    authorize(admin, "community.manage", null);
    const input = parseBody(adminCreateSchema, req.body);
    const id = newId();
    const platformRole = input.platformRole ?? "none";
    try {
      await db.tx(async (q) => {
        // La colonne héritée `role` reste synchronisée : voir schema.ts, la
        // migration ne doit jamais pouvoir re-promouvoir un compte rétrogradé.
        await q.query(
          `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active)
           VALUES ($1, $2, $3, $4, $5, $6, true)`,
          [id, input.email, hashPassword(input.password), input.name, platformRole === "owner" ? "platform" : "partner", platformRole],
        );
        await appendAudit(q, admin, req, {
          action: "admin.create",
          targetType: "admin_user",
          targetId: id,
          after: { email: input.email, platformRole },
        });
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw fail.conflict("Cette adresse email est déjà utilisée.");
      throw err;
    }
    return reply.code(201).send({ adminId: id, email: input.email, name: input.name, platformRole });
  });

  /**
   * Annuaire de l'équipe (owner). Sans lui, la console devine des identifiants :
   * on ne peut pas composer un formulaire « ajouter ce compte à cette
   * communauté » sans savoir qui existe. Aucun secret n'y figure — ni empreinte
   * de mot de passe, ni jeton, ni appartenance.
   */
  app.get(`${PREFIX}/admins`, async (req) => {
    const admin = await requireAdmin(db, req);
    // Même garde que la création d'un compte : provisionner l'équipe est un
    // acte de propriétaire.
    authorize(admin, "community.manage", null);
    const rows = await db.query<Row>(
      `SELECT id, email, name, platform_role, active FROM admin_users ORDER BY created_at ASC, id ASC LIMIT 500`,
    );
    return { items: rows.map(adminDirectoryDto) };
  });

  /* ------------------------------------------------------------- abonnés */

  app.get<{ Params: { communityId: string } }>(`${PREFIX}/communities/:communityId/users`, async (req) => {
    const admin = await requireAdmin(db, req);
    const communityId = scopedCommunity(admin, req.params.communityId) as string;
    authorize(admin, "member.read", communityId);
    await mustCommunity(db, communityId);
    const rows = await db.query<Row>(
      `SELECT id, email, name, locale, email_verified_at, deleted_at, created_at
         FROM users WHERE community_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [communityId],
    );
    return {
      items: rows.map((row) => ({
        id: row.id as string,
        email: row.email as string,
        name: row.name as string,
        locale: row.locale as string,
        emailVerified: row.email_verified_at !== null,
        deleted: row.deleted_at !== null,
        createdAt: iso(row.created_at),
      })),
    };
  });

  /* ------------------------------------------------------------ appareils */

  app.get<{ Params: { communityId: string } }>(`${PREFIX}/communities/:communityId/devices`, async (req) => {
    const admin = await requireAdmin(db, req);
    const communityId = scopedCommunity(admin, req.params.communityId) as string;
    authorize(admin, "member.read", communityId);
    await mustCommunity(db, communityId);
    const rows = await db.query<Row>(
      `SELECT d.id, d.user_id, d.name, d.platform, d.status, d.last_seen_at, d.revoked_at, d.created_at
         FROM devices d
         JOIN users u ON u.id = d.user_id
        WHERE u.community_id = $1
        ORDER BY d.created_at DESC LIMIT 100`,
      [communityId],
    );
    return {
      items: rows.map((row) => ({
        deviceId: row.id as string,
        userId: row.user_id as string,
        name: row.name as string,
        platform: row.platform as string,
        status: row.status as string,
        lastSeenAt: iso(row.last_seen_at),
        revokedAt: iso(row.revoked_at),
        createdAt: iso(row.created_at),
      })),
    };
  });

  app.post<{ Params: { deviceId: string } }>(`${PREFIX}/devices/:deviceId/revoke`, async (req) => {
    const admin = await requireAdmin(db, req);
    const device = await db.one<Row>(
      `SELECT d.id, d.status, u.community_id
         FROM devices d JOIN users u ON u.id = d.user_id
        WHERE d.id = $1`,
      [req.params.deviceId],
    );
    if (!device) throw fail.notFound("Appareil introuvable.");
    const communityId = device.community_id as string;
    authorize(admin, "device.revoke", communityId);

    let sessionsRevoked = 0;
    await db.tx(async (q) => {
      await q.query("UPDATE devices SET status = 'revoked', revoked_at = now() WHERE id = $1", [device.id]);
      const sessions = await q.query<Row>(
        "UPDATE auth_sessions SET revoked_at = now() WHERE device_id = $1 AND revoked_at IS NULL RETURNING id",
        [device.id],
      );
      sessionsRevoked = sessions.length;
      await appendAudit(q, admin, req, {
        action: "device.revoke",
        targetType: "device",
        targetId: device.id as string,
        communityId,
        before: { status: device.status },
        after: { status: "revoked", sessionsRevoked },
      });
    });

    return { deviceId: device.id as string, status: "revoked", sessionsRevoked };
  });

  /* ------------------------------------------------------ bundles hors-ligne */

  app.post<{ Params: { deviceId: string } }>(`${PREFIX}/devices/:deviceId/offline-bundles`, async (req, reply) => {
    const admin = await requireAdmin(db, req);
    const device = await db.one<Row>(
      `SELECT d.id, d.user_id, u.community_id
         FROM devices d JOIN users u ON u.id = d.user_id
        WHERE d.id = $1`,
      [req.params.deviceId],
    );
    if (!device) throw fail.notFound("Appareil introuvable.");
    const communityId = device.community_id as string;
    authorize(admin, "offline_bundle.issue", communityId);

    const input = parseBody(offlineBundleSchema, req.body);
    // Défaut court : un fichier de secours qui traîne ne doit pas rester
    // utilisable (D29). L'admin peut allonger, jamais au-delà de 24 h.
    const ttlMinutes = (input.ttlHours ?? 1) * 60;

    const issued = await issueOfflineBundle(db, {
      deviceId: String(device.id),
      userId: String(device.user_id),
      createdBy: admin.adminId,
      ttlMinutes,
    });

    await appendAudit(db, admin, req, {
      action: "offline_bundle.issue",
      targetType: "offline_bundle",
      targetId: issued.file.bundleId,
      communityId,
      after: { deviceId: device.id, notAfter: issued.notAfter, endpointCount: issued.endpointCount },
    });

    // Le fichier est scellé pour cet appareil : même un administrateur ne peut
    // pas en lire le contenu. La réponse ne montre que le droit et le sceau.
    return reply.code(201).send({
      bundleId: issued.file.bundleId,
      deviceId: device.id as string,
      notAfter: issued.notAfter,
      singleUse: true,
      endpointCount: issued.endpointCount,
      file: issued.file,
    });
  });

  /* ---------------------------------------------------------- commandes */

  app.get<{ Params: { communityId: string } }>(`${PREFIX}/communities/:communityId/orders`, async (req) => {
    const admin = await requireAdmin(db, req);
    const communityId = scopedCommunity(admin, req.params.communityId) as string;
    authorize(admin, "order.read", communityId);
    await mustCommunity(db, communityId);
    const query = parseQuery(listQuerySchema, req.query);
    const limit = query.limit ?? 20;

    const params: unknown[] = [communityId];
    let where = "WHERE community_id = $1";
    if (query.status) {
      params.push(query.status);
      where += ` AND status = $${params.length}`;
    }
    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      params.push(cursor.createdAt, cursor.id);
      where += ` AND (created_at < $${params.length - 1}::timestamptz
                      OR (created_at = $${params.length - 1}::timestamptz AND id < $${params.length}))`;
    }
    params.push(limit + 1);
    const rows = await db.query<Row>(
      `SELECT id, user_id, plan_id, status, currency, amount_xaf, commission_bps, commission_xaf,
              created_at, paid_at, activated_at
         FROM orders ${where}
        ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
      params,
    );

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    const withMoney = seesMoney(admin, communityId);
    return {
      items: page.map((row) => orderDto(row, withMoney)),
      ...(hasMore && last ? { nextCursor: encodeCursor(last) } : {}),
    };
  });

  /* --------------------------------------------------------- commissions */

  app.get<{ Params: { communityId: string } }>(`${PREFIX}/communities/:communityId/commissions`, async (req) => {
    const admin = await requireAdmin(db, req);
    const communityId = scopedCommunity(admin, req.params.communityId) as string;
    authorize(admin, "commission.read", communityId);
    await mustCommunity(db, communityId);
    const query = parseQuery(listQuerySchema, req.query);
    const limit = query.limit ?? 20;

    const params: unknown[] = [communityId];
    let where = "WHERE community_id = $1";
    if (query.status) {
      params.push(query.status);
      where += ` AND status = $${params.length}`;
    }
    params.push(limit);
    const rows = await db.query<Row>(
      `SELECT id, order_id, bps, amount_xaf, status, payout_id, created_at, available_at
         FROM commissions ${where}
        ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return { items: rows.map(commissionDto) };
  });

  /* ------------------------------------------------------------- versements */

  app.post<{ Params: { communityId: string } }>(`${PREFIX}/communities/:communityId/payouts`, async (req, reply) => {
    const admin = await requireAdmin(db, req);
    const communityId = scopedCommunity(admin, req.params.communityId) as string;
    authorize(admin, "payout.create", communityId);
    await mustCommunity(db, communityId);
    const input = parseBody(payoutCreateSchema, req.body);

    const id = newId();
    let amountXaf = 0;
    let commissionCount = 0;

    await db.tx(async (q) => {
      // Le montant n'est jamais fourni par le client : il est la somme des
      // commissions disponibles, marquées dans la même transaction.
      const totals = await q.one<Row>(
        `SELECT COALESCE(SUM(amount_xaf), 0) AS total, count(*) AS n
           FROM commissions
          WHERE community_id = $1 AND status = 'available' AND payout_id IS NULL AND available_at <= now()`,
        [communityId],
      );
      amountXaf = Number(totals?.total ?? 0);
      commissionCount = Number(totals?.n ?? 0);
      if (amountXaf <= 0 || commissionCount === 0) {
        throw fail.conflict("Aucune commission disponible pour un versement.");
      }

      await q.query(
        `INSERT INTO payouts (id, community_id, amount_xaf, status, note, created_by)
         VALUES ($1, $2, $3, 'pending', $4, $5)`,
        [id, communityId, amountXaf, input.note ?? null, admin.adminId],
      );
      const attached = await q.query<Row>(
        `UPDATE commissions SET payout_id = $1
          WHERE community_id = $2 AND status = 'available' AND payout_id IS NULL AND available_at <= now()
          RETURNING id`,
        [id, communityId],
      );
      if (attached.length !== commissionCount) {
        // Concurrence entre le SELECT et l'UPDATE : on annule plutôt que de
        // payer deux fois les mêmes commissions.
        throw fail.conflict("Commissions modifiées pendant le calcul, réessayez.");
      }
      await appendAudit(q, admin, req, {
        action: "payout.create",
        targetType: "payout",
        targetId: id,
        communityId,
        after: { amountXaf, commissionCount, status: "pending" },
      });
    });

    const row = await db.one<Row>("SELECT * FROM payouts WHERE id = $1", [id]);
    return reply.code(201).send({
      id,
      communityId,
      amountXaf,
      status: "pending",
      commissionCount,
      note: (row?.note as string | null) ?? null,
      createdAt: iso(row?.created_at),
      createdBy: (row?.created_by as string | null) ?? null,
    });
  });

  app.post<{ Params: { payoutId: string } }>(`${PREFIX}/payouts/:payoutId/approve`, async (req) => {
    const admin = await requireAdmin(db, req);
    const payout = await mustPayout(db, req.params.payoutId);
    const communityId = payout.community_id as string;
    authorize(admin, "payout.approve", communityId);

    /*
     * Transition **conditionnelle**, jamais un « lire puis écrire » (D57/D65) :
     * - `status = 'pending'` : deux approbations simultanées, une seule passe ;
     * - `created_by IS DISTINCT FROM $2` : personne n'approuve sa propre demande,
     *   propriétaire compris (`IS DISTINCT FROM` traite `created_by NULL` comme
     *   distinct, donc une demande sans auteur reste approuvable).
     * Zéro ligne = l'un des deux refus, et l'appelant reçoit un 409 explicite.
     */
    const approved = await db.tx(async (q) => {
      const rows = await q.query<Row>(
        `UPDATE payouts
            SET status = 'approved', approved_by = $2, approved_at = now(), failed_reason = NULL
          WHERE id = $1 AND status = 'pending' AND created_by IS DISTINCT FROM $2
          RETURNING *`,
        [req.params.payoutId, admin.adminId],
      );
      const row = rows[0];
      if (!row) throw fail.conflict("Ce versement n'est plus en attente, ou c'est votre propre demande.");

      await appendAudit(q, admin, req, {
        action: "payout.approve",
        targetType: "payout",
        targetId: payout.id as string,
        communityId,
        before: { status: payout.status, approvedBy: (payout.approved_by as string | null) ?? null },
        after: { status: "approved", approvedBy: admin.adminId },
      });
      return row;
    });

    return payoutDto(approved);
  });

  /**
   * Exécute le virement (D58, D65).
   *
   * L'ordre des opérations est le contrat : on **réclame** la ligne en base
   * avant l'appel réseau. Un crash entre les deux laisse `processing` — jamais
   * un `approved` dont l'argent est déjà parti. Un accusé de réception du
   * fournisseur n'est pas un versement : le statut reste `processing` jusqu'à
   * `/confirm`, qui exige une référence.
   */
  app.post<{ Params: { payoutId: string } }>(`${PREFIX}/payouts/:payoutId/pay`, async (req) => {
    const admin = await requireAdmin(db, req);
    const payout = await mustPayout(db, req.params.payoutId);
    const communityId = payout.community_id as string;
    authorize(admin, "payout.pay", communityId);

    const community = await db.one<Row>(
      "SELECT name, payout_phone, payout_name FROM communities WHERE id = $1",
      [communityId],
    );
    if (!community) throw fail.notFound("Communauté introuvable.");
    // Le bénéficiaire est une donnée de la communauté, jamais du corps : on ne
    // vire pas l'argent d'une marque vers un numéro saisi dans la requête.
    const phone = String(community.payout_phone ?? "").replace(/[\s.-]/g, "");
    if (!/^\+?[0-9]{8,15}$/.test(phone)) {
      throw fail.conflict("Aucun numéro de versement valide n'est configuré pour cette communauté.");
    }
    const beneficiary = String(community.payout_name ?? community.name ?? "").trim().slice(0, 120);

    // Réclamation atomique : `attempts < 3` n'empêche pas de payer, il oblige à
    // passer par un humain (`needs_review` puis `/resolve`) au-delà.
    const claimed = await db.query<Row>(
      `UPDATE payouts
          SET status = 'processing', claimed_at = now(), attempts = attempts + 1, failed_reason = NULL
        WHERE id = $1 AND status IN ('approved', 'failed') AND attempts < 3
        RETURNING *`,
      [req.params.payoutId],
    );
    const claim = claimed[0];
    if (!claim) {
      /*
       * `attempts` épuisé : D65 — « trois tentatives ne bloquent pas l'argent,
       * elles forcent le passage par `needs_review` », donc par un humain qui a
       * vérifié chez Fapshi. Sans cette ligne, un versement resterait
       * `approved` avec trois échecs et demanderait un UPDATE SQL manuel.
       */
      const exhausted = await db.tx(async (q) => {
        const rows = await q.query<Row>(
          `UPDATE payouts
              SET status = 'needs_review', claimed_at = COALESCE(claimed_at, now())
            WHERE id = $1 AND status IN ('approved', 'failed') AND attempts >= 3
            RETURNING id`,
          [req.params.payoutId],
        );
        if (rows.length === 0) return false;
        await appendAudit(q, admin, req, {
          action: "payout.review",
          targetType: "payout",
          targetId: payout.id as string,
          communityId,
          before: { status: payout.status, attempts: Number(payout.attempts ?? 0) },
          after: { status: "needs_review", reason: "attempts_exhausted" },
        });
        return true;
      });
      throw fail.conflict(
        exhausted
          ? "Versement à vérifier : trois tentatives ont échoué. Vérifiez chez Fapshi puis clôturez par /resolve."
          : "Versement non réclamable : il est déjà en cours, ou doit être vérifié.",
      );
    }

    let providerRef: string;
    try {
      const result = await payoutProvider.payout({
        amountXaf: Number(claim.amount_xaf),
        phone,
        name: beneficiary,
        // `externalId` = l'identifiant du versement : la clé d'idempotence
        // fournisseur (H4), pas une référence inventée côté API.
        externalId: String(claim.id),
        message: `Commission ${String(community.name ?? "").trim()}`.slice(0, 120),
      });
      providerRef = result.providerRef;
    } catch (error) {
      // L'échec réseau remet le versement **approuvé et rejouable**, avec la
      // raison écrite : aucun état ne demande un UPDATE SQL (D65).
      const reason = payoutFailureReason(error);
      try {
        await db.tx(async (q) => {
          await q.query(
            `UPDATE payouts SET status = 'approved', claimed_at = NULL, failed_reason = $2 WHERE id = $1`,
            [req.params.payoutId, reason],
          );
          await appendAudit(q, admin, req, {
            action: "payout.pay.failed",
            targetType: "payout",
            targetId: payout.id as string,
            communityId,
            before: { status: claim.status, attempts: Number(claim.attempts) },
            after: { status: "approved", failedReason: reason },
          });
        });
      } catch (auditError) {
        // L'audit ne doit pas masquer la cause réelle de l'échec ni empêcher le
        // retour à `approved` (le versement doit rester rejouable).
        req.log.error({ err: auditError }, "audit payout.pay.failed");
        await db.query(`UPDATE payouts SET status = 'approved', claimed_at = NULL, failed_reason = $2 WHERE id = $1`, [
          req.params.payoutId,
          reason,
        ]);
      }
      throw fail.paymentProvider("Virement non envoyé : le versement reste approuvé et rejouable.");
    }

    let settled: Row;
    try {
      // Référence et ligne d'audit dans la même transaction : une référence
      // écrite sans trace serait un versement sans auteur.
      settled = await db.tx(async (q) => {
        const rows = await q.query<Row>(
          `UPDATE payouts SET provider_ref = $2, failed_reason = NULL WHERE id = $1 RETURNING *`,
          [req.params.payoutId, providerRef],
        );
        const row = rows[0];
        if (!row) throw fail.notFound("Versement introuvable.");
        await appendAudit(q, admin, req, {
          action: "payout.pay",
          targetType: "payout",
          targetId: payout.id as string,
          communityId,
          before: { status: claim.status, attempts: Number(claim.attempts) - 1 },
          after: { status: "processing", providerRef, attempts: Number(row.attempts) },
        });
        return row;
      });
    } catch (error) {
      // `provider_ref` est UNIQUE : deux versements ne peuvent pas partager une
      // référence. On ne laisse pas la ligne en `processing` sans explication.
      if (isUniqueViolation(error)) {
        await db.query(
          `UPDATE payouts SET status = 'approved', claimed_at = NULL, failed_reason = $2 WHERE id = $1`,
          [req.params.payoutId, "provider_ref déjà utilisé par un autre versement"],
        );
        throw fail.paymentProvider(
          "Le fournisseur a renvoyé une référence déjà utilisée : le versement reste approuvé, à vérifier.",
        );
      }
      throw error;
    }

    return payoutDto(settled);
  });

  /** `processing -> paid` : la référence fournisseur est la preuve, pas la promesse. */
  app.post<{ Params: { payoutId: string } }>(`${PREFIX}/payouts/:payoutId/confirm`, async (req) => {
    const admin = await requireAdmin(db, req);
    const payout = await mustPayout(db, req.params.payoutId);
    const communityId = payout.community_id as string;
    authorize(admin, "payout.confirm", communityId);

    const confirmed = await db.tx(async (q) => {
      const rows = await q.query<Row>(
        `UPDATE payouts
            SET status = 'paid',
                confirmed_at = now(),
                paid_at = COALESCE(paid_at, now()),
                resolved_by = $2,
                failed_reason = NULL
          WHERE id = $1 AND status = 'processing' AND provider_ref IS NOT NULL
          RETURNING *`,
        [req.params.payoutId, admin.adminId],
      );
      const row = rows[0];
      if (!row) {
        throw fail.conflict(
          "Ce versement n'est pas en cours de traitement, ou aucune référence fournisseur n'a été enregistrée.",
        );
      }
      await appendAudit(q, admin, req, {
        action: "payout.confirm",
        targetType: "payout",
        targetId: payout.id as string,
        communityId,
        before: { status: payout.status, providerRef: (payout.provider_ref as string | null) ?? null },
        after: { status: "paid", confirmedAt: iso(row.confirmed_at) },
      });
      return row;
    });

    return payoutDto(confirmed);
  });

  /**
   * Clôt une ambiguïté (`processing` ou `needs_review`) avec ce qu'un humain a
   * lu chez Fapshi. C'est le seul chemin qui sort un versement de
   * `needs_review` : aucun état ne demande un UPDATE SQL manuel (D65).
   */
  app.post<{ Params: { payoutId: string } }>(`${PREFIX}/payouts/:payoutId/resolve`, async (req) => {
    const admin = await requireAdmin(db, req);
    const payout = await mustPayout(db, req.params.payoutId);
    const communityId = payout.community_id as string;
    authorize(admin, "payout.resolve", communityId);
    const input = parseBody(payoutResolveSchema, req.body);
    const status = input.outcome === "paid" ? "paid" : "failed";

    // Un versement « paid » sans référence est exactement le mensonge que D58
    // interdit : la référence est la preuve, elle vient du corps ou de la ligne.
    // Le contrôle ne s'applique qu'à une ligne réellement clivable : un versement
    // `pending` doit répondre « rien à clore » (409), pas une erreur de champ.
    const resolvable = payout.status === "processing" || payout.status === "needs_review";
    if (resolvable && status === "paid" && !input.providerRef && !payout.provider_ref) {
      throw fail.validation({ providerRef: "Référence fournisseur requise pour clore en « paid »." });
    }

    const resolved = await db.tx(async (q) => {
      const rows = await q.query<Row>(
        `UPDATE payouts
            SET status = $2::text,
                confirmed_at = now(),
                resolved_by = $3,
                provider_ref = COALESCE($4::text, provider_ref),
                paid_at = CASE WHEN $2::text = 'paid' THEN COALESCE(paid_at, now()) ELSE paid_at END,
                failed_reason = CASE WHEN $2::text = 'failed' THEN $5::text ELSE NULL END
          WHERE id = $1 AND status IN ('processing', 'needs_review')
          RETURNING *`,
        [req.params.payoutId, status, admin.adminId, input.providerRef ?? null, input.reason ?? null],
      );
      const row = rows[0];
      if (!row) {
        throw fail.conflict("Ce versement n'est ni en cours de traitement ni à vérifier : rien à clore.");
      }
      await appendAudit(q, admin, req, {
        action: "payout.resolve",
        targetType: "payout",
        targetId: payout.id as string,
        communityId,
        before: { status: payout.status, providerRef: (payout.provider_ref as string | null) ?? null },
        after: {
          status,
          providerRef: (row.provider_ref as string | null) ?? null,
          reason: input.reason ?? null,
          resolvedBy: admin.adminId,
        },
      });
      return row;
    });

    return payoutDto(resolved);
  });

  /**
   * La file d'attente des versements. `needs_review` en tête : c'est le seul
   * état où l'argent est peut-être déjà parti sans preuve.
   */
  app.get(`${PREFIX}/payouts`, async (req) => {
    const admin = await requireAdmin(db, req);
    const query = parseQuery(payoutQueueQuerySchema, req.query);
    // `finance` encaisse pour toutes les marques (D57) : sans filtre explicite,
    // elle voit toute la file. Les autres restent dans leur périmètre.
    const seesAllMoney =
      admin.platformRole === "owner" || admin.memberships.some((membership) => membership.role === "finance");
    const requested = query.communityId ?? query.community_id ?? null;
    const communityId = requested
      ? (scopedCommunity(admin, requested) as string)
      : seesAllMoney
        ? null
        : scopedCommunity(admin, null);
    authorize(admin, "commission.read", communityId);

    const params: unknown[] = [];
    let where = "";
    if (communityId) {
      params.push(communityId);
      where = "WHERE p.community_id = $1";
    }
    if (query.status) {
      params.push(query.status);
      where += `${where.length > 0 ? " AND" : " WHERE"} p.status = $${params.length}`;
    }
    params.push(query.limit ?? 50);

    const rows = await db.query<Row>(
      `SELECT p.*, c.name AS community_name
         FROM payouts p
         JOIN communities c ON c.id = p.community_id
         ${where}
        ORDER BY CASE p.status
                   WHEN 'needs_review' THEN 0
                   WHEN 'pending'      THEN 1
                   WHEN 'approved'     THEN 2
                   WHEN 'processing'   THEN 3
                   ELSE 4
                 END,
                 p.created_at ASC
        LIMIT $${params.length}`,
      params,
    );
    return { items: rows.map(payoutDto) };
  });

  /* ------------------------------------------------------------------ pool */

  app.get(`${PREFIX}/pool`, async (req) => {
    const admin = await requireAdmin(db, req);
    // Ressource globale : aucune communauté à filtrer, seulement un droit de
    // lecture (owner, community_admin, support).
    authorize(admin, "endpoint.read", null);
    const rows = await db.query<Row>(
      `SELECT id, label, host, port, protocol, transport, security, region, tier, capacity, in_use,
              status, health, down_since, down_reason, latency_ms, last_seen_at, expires_at
         FROM endpoints ORDER BY created_at DESC LIMIT 200`,
    );
    const revision = await db.scalar<number>("SELECT revision FROM pool_state WHERE id = 'pool'");
    return { poolRevision: Number(revision ?? 0), count: rows.length, endpoints: rows.map(endpointDto) };
  });

  /**
   * Le levier manuel de l'exigence 3 : un nœud qui ment sur sa santé (ou dont le
   * contrat est douteux) sort de la liste servie immédiatement, sans attendre
   * trois rapports clients.
   *
   * La transition est conditionnelle (`health <> $2`) : forcer `down` deux fois
   * n'écrit qu'une ligne d'audit et ne bumpe la révision qu'une fois. Le bump est
   * ce qui fait bouger l'ETag du bundle — sans lui, le client garde le nœud mort
   * en cache (D48).
   */
  app.post<{ Params: { endpointId: string } }>(`${PREFIX}/endpoints/:endpointId/health`, async (req) => {
    const admin = await requireAdmin(db, req);
    authorize(admin, "endpoint.write", null);
    const input = parseBody(endpointHealthSchema, req.body);

    const before = await db.one<Row>(
      "SELECT id, label, tier, health FROM endpoints WHERE id = $1",
      [req.params.endpointId],
    );
    if (!before) throw fail.notFound("Nœud introuvable.");
    const reason = input.reason?.trim() ? input.reason.trim() : input.state === "down" ? "manual" : null;

    let changed = false;
    let revision = 0;
    await db.tx(async (q) => {
      const rows = await q.query<Row>(
        `UPDATE endpoints
            SET health = $2::text,
                down_since  = CASE WHEN $2::text = 'down' THEN now() ELSE NULL END,
                down_reason = $3,
                health_checked_at = now(),
                updated_at = now()
          WHERE id = $1 AND health <> $2::text
          RETURNING id`,
        [req.params.endpointId, input.state, reason],
      );
      changed = rows.length > 0;
      revision = changed ? await bumpPoolRevision(q) : await poolRevision(q);
      if (changed) {
        await appendAudit(q, admin, req, {
          action: "endpoint.health",
          targetType: "endpoint",
          targetId: String(before.id),
          after: { health: input.state, previousHealth: before.health, reason },
        });
      }
    });

    const after = await db.one<Row>(
      "SELECT health, down_since, down_reason FROM endpoints WHERE id = $1",
      [req.params.endpointId],
    );
    return {
      endpointId: String(before.id),
      label: String(before.label),
      tier: (before.tier as string | null) ?? "free-labs",
      health: (after?.health as string | undefined) ?? input.state,
      previousHealth: String(before.health),
      downSince: iso(after?.down_since),
      downReason: (after?.down_reason as string | null | undefined) ?? null,
      changed,
      poolRevision: revision,
    };
  });

  /* ------------------------------------------------------------ audit log */

  app.get(`${PREFIX}/audit-log`, async (req) => {
    const admin = await requireAdmin(db, req);
    const query = parseQuery(auditQuerySchema, req.query);
    const requested = query.community_id ?? query.communityId ?? null;
    const communityId = scopedCommunity(admin, requested);
    authorize(admin, "audit.read", communityId);

    const limit = query.limit ?? 50;
    const params: unknown[] = [];
    let where = "";
    if (communityId) {
      params.push(communityId);
      where = "WHERE community_id = $1";
    }
    params.push(limit);
    const rows = await db.query<Row>(
      `SELECT id, action, actor_id, actor_role, target_type, target_id, community_id, ip,
              before_state, after_state, created_at
         FROM audit_log ${where}
        ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return { items: rows.map(auditDto) };
  });
}

