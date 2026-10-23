/**
 * Builds de marque (D66).
 *
 * Deux surfaces, deux frontières :
 *
 *   - `/v1/admin/apps/:appId/builds` : la console déclenche et suit un build.
 *     L'appartenance est relue en base (`requireAdmin` + `roleInCommunity`),
 *     comme partout ailleurs : le jeton ne porte aucun droit.
 *   - `/v1/internal/builds/:id/callback` : GitHub Actions referme le build avec
 *     `BUILD_CALLBACK_SECRET`, un secret **distinct** de l'ingestion (D66). Vide
 *     = 503, jamais un callback ouvert.
 *
 * Ce que ces routes ne font jamais :
 *
 *   1. Lire `appId`, `apiBaseUrl` ou `theme` dans le corps d'une requête : le
 *      manifeste vient de la ligne `apps` (`buildBrandSpec`) et l'origine de
 *      `env.publicBaseUrl`.
 *   2. Renvoyer `builds.spec` : le manifeste contient la clé publique hors-ligne
 *      et la configuration de la marque, pas une donnée de console. Les
 *      sélections SQL sont explicites pour que ce soit vrai par construction.
 *   3. Laisser un build `queued` quand GitHub a refusé : `failed` + 502, pour
 *      que la console dise la vérité au lieu d'attendre un callback qui ne
 *      viendra pas.
 */
import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import type { Database, Row } from "../db.js";
import { requireAdmin, roleInCommunity, type AdminContext } from "../lib/auth.js";
import { apiOrigin, buildBrandSpec, MAX_VERSION_CODE, type BrandManifest } from "../lib/brand.js";
import { newId } from "../lib/crypto.js";
import { ApiFailure, fail } from "../lib/errors.js";

const PREFIX = "/v1/admin";

/* -------------------------------------------------------------- validation */

/**
 * Même enveloppe que `routes/admin.ts` : zod filtre le corps (les clés inconnues
 * sont jetées, donc un `appId` ou un `apiBaseUrl` envoyé par erreur ne peut pas
 * remonter), et une forme invalide est un `400` nommant le champ. Les règles de
 * marque, elles, sont un `422` (`lib/brand.ts`).
 */
function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;
  const details: Record<string, string> = {};
  for (const issue of result.error.issues) {
    details[issue.path.join(".") || "_"] = issue.message;
  }
  throw fail.validation(details);
}

/**
 * Le seul champ qu'un déclenchement peut porter. Tout le reste du manifeste est
 * en base : `versionCode` est calculé, `appId` et `apiBaseUrl` sont forcés.
 */
const buildCreateSchema = z.object({
  versionName: z.string().trim().optional(),
});

/**
 * États qu'un build peut rapporter. `succeeded`/`failed`/`cancelled` sont
 * terminaux pour `completed_at` ; le statut lui-même suit le dernier rapport
 * reçu (une nouvelle livraison du même corps donne exactement la même ligne).
 */
const BUILD_STATUSES = ["queued", "running", "succeeded", "failed", "cancelled"] as const;

const callbackSchema = z.object({
  status: z.enum(BUILD_STATUSES),
  /** `sha256sum` du fichier signé, en hexadécimal. */
  sha256: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{64}$/i, "empreinte sha256 hexadécimale de 64 caractères attendue.")
    .optional(),
  /** URL publique de l'APK (Vercel Blob, D62). */
  apkUrl: z
    .string()
    .trim()
    .max(2_048)
    .url("URL absolue attendue.")
    .refine((value) => value.startsWith("https://"), "URL https attendue.")
    .optional(),
  versionCode: z.number().int().min(1).max(MAX_VERSION_CODE).optional(),
  runId: z.string().trim().min(1).max(64).optional(),
});

/* ------------------------------------------------------------------- auth */

/**
 * Même comparaison que `routes/internal.ts` : deux secrets, deux frontières, et
 * aucun module partagé n'existe pour ce helper.
 *
 * Comparaison à temps constant. Les longueurs sont comparées d'abord parce que
 * `timingSafeEqual` lève sur des tampons de tailles différentes ; la
 * comparaison factice garde la branche de refus aussi coûteuse que l'acceptation.
 */
function sameSecret(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * MUST stay async: Fastify n'avance dans le cycle de requête que si le hook
 * rend une promesse (voir `routes/internal.ts` et fastify/lib/hooks.js).
 *
 * Le secret est lu à l'exécution, pas au démarrage : une valeur vide ferme le
 * callback (503) au lieu de l'ouvrir.
 */
async function requireCallbackSecret(req: FastifyRequest): Promise<void> {
  const expected = env.builds.callbackSecret;
  if (expected.length === 0) {
    throw new ApiFailure(503, "INTERNAL", "Callback de build non configuré (BUILD_CALLBACK_SECRET).");
  }
  const header = req.headers.authorization;
  const provided = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!provided) throw fail.unauthenticated("Jeton de callback manquant.");
  if (!sameSecret(provided, expected)) throw fail.unauthenticated("Jeton de callback invalide.");
}

/* -------------------------------------------------------------- utilitaires */

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

/**
 * Un build est un acte de marque (§1.4) : le propriétaire partout, le
 * `community_admin` de la communauté de l'app chez lui. `support` et `finance`
 * n'ont pas ce droit — il déclenche une dépense de CI et produit un APK signé.
 */
function requireBuildAdmin(admin: AdminContext, communityId: string): void {
  if (admin.platformRole === "owner") return;
  if (roleInCommunity(admin, communityId) === "community_admin") return;
  throw fail.forbidden("Builds réservés au propriétaire ou à l'administrateur de la marque.");
}

/** Une app porte la marque ; sa communauté est la frontière d'autorisation. */
async function mustApp(db: Database, appId: string): Promise<Row> {
  const row = await db.one<Row>("SELECT * FROM apps WHERE id = $1", [appId]);
  if (!row) throw fail.notFound("Application introuvable.");
  return row;
}

/**
 * Projection de la file. `spec` n'est **pas** sélectionné en base : la seule
 * façon fiable de ne pas le fuiter est de ne pas le lire.
 */
function buildDto(row: Row) {
  return {
    id: String(row.id),
    status: String(row.status),
    versionCode: row.version_code === null || row.version_code === undefined ? null : Number(row.version_code),
    versionName: (row.version_name as string | null) ?? null,
    sha256: (row.sha256 as string | null) ?? null,
    apkUrl: (row.apk_url as string | null) ?? null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

/* ---------------------------------------------------------------- GitHub */

type DispatchResult = { ok: true } | { ok: false; status: number; reason: string };

/**
 * `workflow_dispatch` répond **204 sans corps** : l'identifiant de run n'est pas
 * dans la réponse, donc on ne l'invente pas. Le suivi se fait par `builds.id`
 * jusqu'au callback (D66).
 */
async function dispatchBuild(spec: BrandManifest, buildId: string): Promise<DispatchResult> {
  const { githubToken, repo, workflow, ref } = env.builds;
  if (githubToken.length === 0 || repo.length === 0) {
    return { ok: false, status: 0, reason: "GITHUB_TOKEN ou GITHUB_REPO absent" };
  }

  const url = `https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${githubToken}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "content-type": "application/json",
        // GitHub refuse une requête sans User-Agent ; on le nomme au lieu de
        // dépendre de celui du runtime.
        "user-agent": "vpn-platform-api",
      },
      body: JSON.stringify({
        ref,
        inputs: {
          spec: JSON.stringify(spec),
          build_callback_url: `${apiOrigin()}/v1/internal/builds/${buildId}/callback`,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== 204) {
      return { ok: false, status: response.status, reason: `GitHub a répondu ${response.status}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      reason: `GitHub injoignable (${err instanceof Error ? err.name : "erreur réseau"})`,
    };
  }
}

/* ---------------------------------------------------------------- routes */

export function registerBuildRoutes(app: FastifyInstance, db: Database): void {
  /* ------------------------------------------- déclencher un build de marque */

  app.post<{ Params: { appId: string } }>(`${PREFIX}/apps/:appId/builds`, async (req, reply) => {
    const admin = await requireAdmin(db, req);
    const appRow = await mustApp(db, req.params.appId);
    requireBuildAdmin(admin, String(appRow.community_id));

    const input = parseBody(buildCreateSchema, req.body);
    // Pas de « correction » silencieuse : une valeur fournie et invalide doit
    // être un 422 nommé, pas un retour discret à 1.0.0.
    const versionName = input.versionName ?? "1.0.0";

    /*
     * Le numéro de version est calculé **dans la transaction** et la ligne
     * `apps` est verrouillée : deux clics simultanés sur la même marque ne
     * partagent pas le même `versionCode` (Android exige une valeur strictement
     * croissante pour installer une mise à jour).
     */
    const { buildId, spec } = await db.tx(async (q) => {
      const locked = await q.one<Row>("SELECT id FROM apps WHERE id = $1 FOR UPDATE", [appRow.id]);
      if (!locked) throw fail.notFound("Application introuvable.");

      const next = Number(
        await q.scalar<number>(
          "SELECT COALESCE(max(version_code), 0)::int + 1 AS next FROM builds WHERE app_id = $1",
          [appRow.id],
        ),
      );
      if (!Number.isInteger(next) || next < 1 || next > MAX_VERSION_CODE) {
        throw fail.conflict("Numéro de version suivant hors limites : aucun build ne peut être créé.");
      }

      // Lève 422 (champ fautif) si la marque n'est pas constructible ; la
      // transaction est alors annulée et aucune ligne `builds` n'existe.
      const spec = buildBrandSpec(appRow, next, versionName);
      const id = newId();
      await q.query(
        `INSERT INTO builds
           (id, app_id, version_code, version_name, theme, status, spec, requested_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'queued', $6::jsonb, $7, now())`,
        [id, appRow.id, spec.versionCode, spec.versionName, spec.theme, JSON.stringify(spec), admin.adminId],
      );
      return { buildId: id, spec };
    });

    // Mode local / test : la file suffit, aucun appel réseau.
    if (env.builds.mock) return reply.code(202).send({ buildId, status: "queued" });

    const dispatched = await dispatchBuild(spec, buildId);
    if (!dispatched.ok) {
      await db.query("UPDATE builds SET status = 'failed', updated_at = now() WHERE id = $1", [buildId]);
      throw new ApiFailure(
        502,
        "INTERNAL",
        `Le build n'a pas été déclenché : ${dispatched.reason}. Il est marqué « failed » ; réessayez.`,
      );
    }

    return reply.code(202).send({ buildId, status: "queued" });
  });

  /* --------------------------------------------- suivre les builds d'une app */

  app.get<{ Params: { appId: string } }>(`${PREFIX}/apps/:appId/builds`, async (req) => {
    const admin = await requireAdmin(db, req);
    const appRow = await mustApp(db, req.params.appId);
    requireBuildAdmin(admin, String(appRow.community_id));

    const rows = await db.query<Row>(
      `SELECT id, status, version_code, version_name, sha256, apk_url, created_at, updated_at
         FROM builds
        WHERE app_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [appRow.id],
    );
    return { items: rows.map(buildDto) };
  });

  /* --------------------------------------- callback de la CI (D66, interne) */

  app.post<{ Params: { id: string } }>(
    "/v1/internal/builds/:id/callback",
    { preHandler: requireCallbackSecret },
    async (req) => {
      const input = parseBody(callbackSchema, req.body);

      /*
       * Idempotent : rejouer le même corps laisse la ligne identique, et un
       * build déjà clos répond quand même 200 (D66). Les champs optionnels sont
       * en COALESCE : un callback qui ne porte que `status` ne perd ni
       * l'empreinte ni l'URL déjà reçues.
       */
      const rows = await db.query<Row>(
        `UPDATE builds
            SET status       = $2,
                sha256       = COALESCE($3, builds.sha256),
                apk_url      = COALESCE($4, builds.apk_url),
                version_code = COALESCE($5, builds.version_code),
                run_id       = COALESCE($6, builds.run_id),
                updated_at   = now(),
                completed_at = CASE
                                 WHEN $2 IN ('succeeded', 'failed', 'cancelled') AND builds.completed_at IS NULL
                                   THEN now()
                                 ELSE builds.completed_at
                               END
          WHERE id = $1
          RETURNING id, status`,
        [
          req.params.id,
          input.status,
          input.sha256 ? input.sha256.toLowerCase() : null,
          input.apkUrl ?? null,
          input.versionCode ?? null,
          input.runId ?? null,
        ],
      );
      const row = rows[0];
      if (!row) throw fail.notFound("Build introuvable.");

      return { buildId: String(row.id), status: String(row.status) };
    },
  );
}
