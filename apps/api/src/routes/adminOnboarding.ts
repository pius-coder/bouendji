/**
 * Onboarding en libre-service (R4).
 *
 * Un administrateur sans communauté crée **la sienne**, une seule fois ; il en
 * devient `community_admin`. Il crée ensuite **une seule** application pour
 * cette communauté, la modifie, et en charge le logo. Le périmètre vient de la
 * session : aucune route ne lit un `communityId` ou un `appId` de confiance
 * dans le corps. Les règles de marque restent celles de `lib/brand.ts`.
 *
 * Capacités : `onboarding.self` (admin sans communauté, ou admin de la sienne).
 * R1 l'ajoute à `permitted()` ; ce fichier ne peut pas l'appeler (fonction non
 * exportée, et R1 n'est pas dans cette copie), donc `ownCommunityIds` en est
 * l'équivalent local, à remplacer à la fusion.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { isUniqueViolation, type Database, type Queryable, type Row } from "../db.js";
import { requireAdmin, type AdminContext } from "../lib/auth.js";
import { BRAND_THEMES, validateBrandSpec } from "../lib/brand.js";
import { newId } from "../lib/crypto.js";
import { ApiFailure, fail } from "../lib/errors.js";
import {
  isWhatsappGroupUrl,
  normalizeWhatsappNumber,
  packageNameForCommunity,
  slugFromName,
  validateLogo,
} from "../lib/onboarding.js";
import { appendAudit, parseBody } from "./admin.js";

const PREFIX = "/v1/admin";
/** Logo : 1 Mo décodé, soit 1 398 104 caractères base64, plus l'enveloppe JSON. */
const LOGO_BODY_LIMIT = 2 * 1024 * 1024;

/* ------------------------------------------------------------- validation */

const whatsappGroupField = z
  .string()
  .trim()
  .refine(isWhatsappGroupUrl, "Lien de groupe attendu : https://chat.whatsapp.com/...");
const whatsappNumberField = z
  .string()
  .trim()
  .refine((value) => normalizeWhatsappNumber(value) !== null, "9 chiffres attendus, +237 facultatif.");
const httpsUrlField = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:";
    } catch {
      return false;
    }
  }, "URL https attendue.");

const onboardingPatchSchema = z
  .object({
    /** 0 à 5 : profil, communauté, application, forfaits, équipe, récapitulatif. */
    step: z.number().int().min(0).max(5).optional(),
    guideStep: z.number().int().min(0).max(20).optional(),
    guideDone: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Aucun champ à modifier.");

const communityOnboardingSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(64)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Minuscules, chiffres et tirets uniquement.")
      .optional(),
    whatsappGroupUrl: whatsappGroupField.optional(),
    contactWhatsapp: whatsappNumberField.optional(),
  })
  .strict();

/** `name`, `supportUrl` et `accent` sont revalidés par `validateBrandSpec`. */
const appCreateSchema = z
  .object({
    name: z.string(),
    theme: z.enum(BRAND_THEMES),
    accent: z.string().nullable().optional(),
    supportUrl: z.string(),
    supportEmail: z.string().trim().email().max(190).optional(),
  })
  .strict();

const appPatchSchema = z
  .object({
    name: z.string().optional(),
    theme: z.enum(BRAND_THEMES).optional(),
    accent: z.string().nullable().optional(),
    supportUrl: z.string().optional(),
    supportEmail: z.string().trim().email().max(190).nullable().optional(),
    privacyUrl: httpsUrlField.nullable().optional(),
    termsUrl: httpsUrlField.nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Aucun champ à modifier.");

const logoSchema = z
  .object({
    mime: z.enum(["image/png", "image/svg+xml"]),
    data: z.string().min(1).max(1_398_104),
  })
  .strict();

/* ----------------------------------------------------------- périmètre */

/**
 * Communautés où l'admin est chez lui : celle qu'il a créée, ou celles où il est
 * `community_admin` actif. Lecture à chaque requête, comme `requireAdmin`.
 */
async function ownCommunityIds(db: Queryable, admin: AdminContext): Promise<string[]> {
  const rows = await db.query<{ id: string }>(
    `SELECT c.id AS id FROM communities c WHERE c.created_by = $1
     UNION
     SELECT m.community_id AS id FROM community_memberships m
      WHERE m.admin_user_id = $1 AND m.role = 'community_admin' AND m.status = 'active'`,
    [admin.adminId],
  );
  return rows.map((row) => row.id);
}

/** Application de l'admin (ou de tout admin pour l'owner). 403 hors périmètre. */
async function ownedApp(db: Queryable, admin: AdminContext, appId: string): Promise<Row> {
  const row = await db.one<Row>("SELECT * FROM apps WHERE id = $1", [appId]);
  if (!row) throw fail.notFound("Application introuvable.");
  if (admin.platformRole !== "owner") {
    const mine = await ownCommunityIds(db, admin);
    if (!mine.includes(row.community_id as string)) {
      throw fail.forbidden("Cette application n'appartient pas à votre communauté.");
    }
  }
  return row;
}

/* ----------------------------------------------------------- projections */

function appDto(row: Row) {
  return {
    id: row.id as string,
    communityId: row.community_id as string,
    name: row.name as string,
    packageName: row.package_name as string,
    theme: row.theme as string,
    accent: (row.accent as string | null) ?? null,
    supportUrl: (row.support_url as string | null) ?? null,
    supportEmail: (row.support_email as string | null) ?? null,
    privacyUrl: (row.privacy_url as string | null) ?? null,
    termsUrl: (row.terms_url as string | null) ?? null,
    logoKey: (row.logo_key as string | null) ?? null,
  };
}

function communityDto(row: Row) {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    status: row.status as string,
    whatsappGroupUrl: (row.whatsapp_group_url as string | null) ?? null,
    contactWhatsapp: (row.contact_whatsapp as string | null) ?? null,
  };
}

async function readOnboarding(db: Queryable, admin: AdminContext) {
  const state = await db.one<Row>("SELECT * FROM admin_onboarding WHERE admin_id = $1", [admin.adminId]);
  const communityIds = await ownCommunityIds(db, admin);
  const communityId = communityIds[0] ?? null;
  const app = communityId ? await db.one<Row>("SELECT id FROM apps WHERE community_id = $1", [communityId]) : null;
  return {
    step: state ? Number(state.step) : 0,
    completedAt: state?.completed_at ? new Date(state.completed_at as string).toISOString() : null,
    guideStep: state ? Number(state.guide_step) : 0,
    guideDoneAt: state?.guide_done_at ? new Date(state.guide_done_at as string).toISOString() : null,
    communityId,
    appId: (app?.id as string | undefined) ?? null,
  };
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/* --------------------------------------------------------------- routes */

export function registerAdminOnboardingRoutes(app: FastifyInstance, db: Database): void {
  app.get(`${PREFIX}/onboarding`, async (req: FastifyRequest) => {
    const admin = await requireAdmin(db, req);
    return readOnboarding(db, admin);
  });

  /** Avancement de l'assistant et du guide. `step` 5 (récapitulatif) date `completedAt`. */
  app.patch(`${PREFIX}/onboarding`, async (req: FastifyRequest) => {
    const admin = await requireAdmin(db, req);
    const input = parseBody(onboardingPatchSchema, req.body);
    await db.query(
      `INSERT INTO admin_onboarding (admin_id, step, guide_step, completed_at, guide_done_at)
       VALUES ($1, COALESCE($2::int, 0), COALESCE($3::int, 0),
               CASE WHEN $2::int = 5 THEN now() END,
               CASE WHEN $4::boolean IS TRUE THEN now() END)
       ON CONFLICT (admin_id) DO UPDATE SET
         step          = COALESCE($2::int, admin_onboarding.step),
         guide_step    = COALESCE($3::int, admin_onboarding.guide_step),
         completed_at  = CASE WHEN $2::int = 5 THEN COALESCE(admin_onboarding.completed_at, now())
                              ELSE admin_onboarding.completed_at END,
         guide_done_at = CASE WHEN $4::boolean IS TRUE THEN COALESCE(admin_onboarding.guide_done_at, now())
                              WHEN $4::boolean IS FALSE THEN NULL
                              ELSE admin_onboarding.guide_done_at END,
         updated_at    = now()`,
      [admin.adminId, input.step ?? null, input.guideStep ?? null, input.guideDone ?? null],
    );
    return readOnboarding(db, admin);
  });

  /**
   * Crée la communauté de l'admin, une seule fois. Refus si l'admin a déjà une
   * appartenance active ou s'il a déjà créé une communauté. Le verrou sur la
   * ligne `admin_users` ferme la course entre deux requêtes simultanées ; l'index
   * `communities_created_by_uq` reste la dernière barrière.
   */
  app.post(`${PREFIX}/onboarding/community`, async (req, reply) => {
    const admin = await requireAdmin(db, req);
    const input = parseBody(communityOnboardingSchema, req.body);
    const slug = input.slug ?? slugFromName(input.name);
    if (!slug) throw fail.validation({ slug: "Impossible de dériver un identifiant depuis ce nom : précisez-le." });

    const id = newId();
    const whatsappGroupUrl = input.whatsappGroupUrl ?? null;
    const contactWhatsapp = input.contactWhatsapp ? normalizeWhatsappNumber(input.contactWhatsapp) : null;
    try {
      await db.tx(async (q) => {
        await q.query("SELECT id FROM admin_users WHERE id = $1 FOR UPDATE", [admin.adminId]);
        const created = await q.one("SELECT id FROM communities WHERE created_by = $1", [admin.adminId]);
        const memberships = await q.scalar<number>(
          "SELECT count(*)::int FROM community_memberships WHERE admin_user_id = $1 AND status = 'active'",
          [admin.adminId],
        );
        if (created || Number(memberships) > 0) {
          throw fail.conflict("Vous avez déjà une communauté : un administrateur n'en crée qu'une.");
        }
        await q.query(
          `INSERT INTO communities (id, name, slug, whatsapp_group_url, contact_whatsapp, created_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [id, input.name, slug, whatsappGroupUrl, contactWhatsapp, admin.adminId],
        );
        await q.query(
          `INSERT INTO community_memberships (id, admin_user_id, community_id, role, status)
           VALUES ($1, $2, $3, 'community_admin', 'active')`,
          [newId(), admin.adminId, id],
        );
        await appendAudit(q, admin, req, {
          action: "community.create",
          targetType: "community",
          targetId: id,
          communityId: id,
          after: { name: input.name, slug, whatsappGroupUrl, contactWhatsapp, createdBy: admin.adminId },
        });
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw fail.conflict(
          errorText(err).includes("slug")
            ? "Cet identifiant de communauté est déjà utilisé."
            : "Vous avez déjà une communauté : un administrateur n'en crée qu'une.",
        );
      }
      throw err;
    }
    const row = await db.one<Row>("SELECT * FROM communities WHERE id = $1", [id]);
    return reply.code(201).send(communityDto(row as Row));
  });

  /**
   * Crée l'application de la communauté de l'admin. Le paquet est calculé ici
   * (`packageNameForCommunity`), la marque est validée par `validateBrandSpec`.
   */
  app.post(`${PREFIX}/apps`, async (req, reply) => {
    const admin = await requireAdmin(db, req);
    const input = parseBody(appCreateSchema, req.body);

    const communityIds = await ownCommunityIds(db, admin);
    if (communityIds.length === 0) throw fail.forbidden("Créez d'abord votre communauté.");
    if (communityIds.length > 1) throw fail.conflict("Plusieurs communautés : une seule application par administrateur.");
    const communityId = communityIds[0] as string;

    const community = await db.one<Row>("SELECT id, slug, status FROM communities WHERE id = $1", [communityId]);
    if (!community) throw fail.notFound("Communauté introuvable.");
    if (community.status !== "active") throw fail.forbidden("Communauté suspendue.");

    const existing = await db.one("SELECT id FROM apps WHERE community_id = $1", [communityId]);
    if (existing) throw fail.conflict("Votre communauté a déjà une application : une seule par communauté.");

    const brand = validateBrandSpec({
      appName: input.name,
      packageName: packageNameForCommunity(community.slug as string),
      theme: input.theme,
      supportUrl: input.supportUrl,
      accent: input.accent ?? null,
    });

    const appId = newId();
    try {
      await db.tx(async (q) => {
        await q.query(
          `INSERT INTO apps (id, community_id, slug, name, package_name, theme, accent, support_url, support_email)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            appId,
            communityId,
            `${community.slug as string}-android`,
            brand.appName,
            brand.packageName,
            brand.theme,
            brand.accent,
            brand.supportUrl,
            input.supportEmail ?? null,
          ],
        );
        await appendAudit(q, admin, req, {
          action: "app.create",
          targetType: "app",
          targetId: appId,
          communityId,
          after: { name: brand.appName, packageName: brand.packageName, theme: brand.theme },
        });
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        const text = errorText(err);
        throw fail.conflict(
          text.includes("community_id")
            ? "Votre communauté a déjà une application : une seule par communauté."
            : text.includes("package")
              ? "Ce paquet d'application est déjà utilisé."
              : "Cet identifiant d'application est déjà pris.",
        );
      }
      throw err;
    }
    const row = await db.one<Row>("SELECT * FROM apps WHERE id = $1", [appId]);
    return reply.code(201).send(appDto(row as Row));
  });

  /** Nom, thème, couleur d'accent (#RRGGBB), liens. Le paquet ne change jamais. */
  app.patch<{ Params: { appId: string } }>(`${PREFIX}/apps/:appId`, async (req) => {
    const admin = await requireAdmin(db, req);
    const current = await ownedApp(db, admin, req.params.appId);
    const input = parseBody(appPatchSchema, req.body);

    const building = await db.scalar<number>(
      "SELECT count(*)::int FROM builds WHERE app_id = $1 AND status IN ('queued', 'running')",
      [current.id],
    );
    if (Number(building) > 0) throw fail.conflict("Un build est en cours sur cette application : attendez sa fin.");

    // `validateBrandSpec` relit le paquet existant : une marque déjà refusée
    // (paquet de référence) reste refusée à la modification, avec le champ nommé.
    const brand = validateBrandSpec({
      appName: input.name ?? (current.name as string),
      packageName: (current.package_name as string) === "cm.bouendji.vpn" ? "com.bouendji.vpn" : (current.package_name as string),
      theme: input.theme ?? (current.theme as string),
      supportUrl: input.supportUrl ?? (current.support_url as string | null) ?? "",
      accent: input.accent !== undefined ? input.accent : ((current.accent as string | null) ?? null),
    });
    const supportEmail = input.supportEmail === undefined ? current.support_email : input.supportEmail;
    const privacyUrl = input.privacyUrl === undefined ? current.privacy_url : input.privacyUrl;
    const termsUrl = input.termsUrl === undefined ? current.terms_url : input.termsUrl;

    await db.tx(async (q) => {
      await q.query(
        `UPDATE apps SET name = $2, theme = $3, accent = $4, support_url = $5,
                         support_email = $6, privacy_url = $7, terms_url = $8, package_name = $9
          WHERE id = $1`,
        [current.id, brand.appName, brand.theme, brand.accent, brand.supportUrl, supportEmail, privacyUrl, termsUrl, brand.packageName],
      );
      await appendAudit(q, admin, req, {
        action: "app.update",
        targetType: "app",
        targetId: current.id as string,
        communityId: current.community_id as string,
        before: { name: current.name, theme: current.theme, accent: current.accent, supportUrl: current.support_url },
        after: { name: brand.appName, theme: brand.theme, accent: brand.accent, supportUrl: brand.supportUrl },
      });
    });
    const row = await db.one<Row>("SELECT * FROM apps WHERE id = $1", [current.id]);
    return appDto(row as Row);
  });

  /**
   * Logo PNG ou SVG, 1 Mo au plus, en JSON base64 (pas de multipart dans
   * l'API). STOCKAGE PROVISOIRE : table `app_logos`, `apps.logo_key` pointe dessus.
   * La copie vers R2 n'est pas câblée (accès en écriture non vérifié).
   */
  app.post<{ Params: { appId: string } }>(
    `${PREFIX}/apps/:appId/logo`,
    { bodyLimit: LOGO_BODY_LIMIT },
    async (req) => {
      const admin = await requireAdmin(db, req);
      const current = await ownedApp(db, admin, req.params.appId);
      const input = parseBody(logoSchema, req.body);
      const logo = validateLogo(input.mime, input.data);
      if (typeof logo === "string") {
        throw new ApiFailure(422, "VALIDATION_FAILED", `Logo invalide : ${logo}`, { logo });
      }

      const logoKey = `db:app_logos/${current.id as string}`;
      await db.tx(async (q) => {
        await q.query(
          `INSERT INTO app_logos (app_id, mime, sha256, data_b64) VALUES ($1, $2, $3, $4)
           ON CONFLICT (app_id) DO UPDATE SET
             mime = EXCLUDED.mime, sha256 = EXCLUDED.sha256, data_b64 = EXCLUDED.data_b64, updated_at = now()`,
          [current.id, logo.mime, logo.sha256, input.data],
        );
        await q.query("UPDATE apps SET logo_key = $2 WHERE id = $1", [current.id, logoKey]);
        await appendAudit(q, admin, req, {
          action: "app.logo",
          targetType: "app",
          targetId: current.id as string,
          communityId: current.community_id as string,
          after: { mime: logo.mime, sha256: logo.sha256, bytes: logo.bytes.length },
        });
      });
      return { appId: current.id as string, logoKey, mime: logo.mime, sha256: logo.sha256, bytes: logo.bytes.length };
    },
  );
}
