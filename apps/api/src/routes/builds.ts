/**
 * Builds de marque (D66, D117).
 *
 * Trois surfaces, trois frontières :
 *
 *   - `/v1/admin/apps/:appId/build-requests` : le `community_admin` de la marque
 *     **demande** un build. Aucun appel GitHub : la ligne passe en `requested`
 *     et l'owner est alerté (Telegram, `notify`).
 *   - `/v1/admin/builds/:id/approve` et `/reject` : l'owner tranche. Seule
 *     l'approbation envoie le `workflow_dispatch`.
 *   - `/v1/admin/apps/:appId/builds` : déclenchement direct, réservé à l'owner.
 *   - `/v1/internal/builds/:id/callback` : GitHub Actions rapporte l'avancement
 *     avec `BUILD_CALLBACK_SECRET`, un secret **distinct** de l'ingestion (D66).
 *     Vide = 503, jamais un callback ouvert.
 *
 * Capacités (D117, matrice de `routes/admin.ts`) : la fonction `permitted()`
 * n'existe pas encore dans cette copie (lot R1 non fusionné). Les contrôles
 * sont donc écrits en rôle équivalent : `build.request` = owner ou
 * `community_admin` de la marque, `build.approve` et `build.reject` = owner.
 * Une fois `permitted()` fusionnée, ces deux gardes deviennent des appels à
 * `permitted(admin, "build.request" | "build.approve", communityId)`.
 *
 * Ce que ces routes ne font jamais :
 *
 *   1. Lire `appId`, `apiBaseUrl` ou `theme` dans le corps d'une requête : le
 *      manifeste vient de la ligne `apps` (`buildBrandSpec`) et l'origine de
 *      `env.publicBaseUrl`.
 *   2. Renvoyer `builds.spec` : sélections SQL explicites.
 *   3. Laisser un build `queued` quand GitHub a refusé : `failed` + 502.
 *   4. Laisser un rapport tardif réécrire un état terminal : `succeeded`,
 *      `failed`, `cancelled` et `rejected` sont collants (voir le callback).
 */
import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import type { Database, Queryable, Row } from "../db.js";
import { requireAdmin, roleInCommunity, type AdminContext } from "../lib/auth.js";
import { apiOrigin, buildBrandSpec, MAX_VERSION_CODE, type BrandManifest } from "../lib/brand.js";
import { newId } from "../lib/crypto.js";
import { ApiFailure, fail } from "../lib/errors.js";
import { escapeHtml, notifyRecipients } from "../services/telegram.js";

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

/** Motif de refus : obligatoire, court, texte seul (il part dans le dashboard). */
const rejectSchema = z.object({
  reason: z
    .string({ required_error: "motif de refus obligatoire." })
    .trim()
    .min(3, "motif de 3 à 280 caractères.")
    .max(280, "motif de 3 à 280 caractères."),
});

/**
 * États qu'un build peut rapporter depuis la CI. `requested`, `rejected` et
 * `draft` ne viennent jamais de la CI : ils sont posés par les routes admin.
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
  /** URL publique de l'APK (Cloudflare R2, D100). */
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

/** `build.request` : le propriétaire, ou l'administrateur de la communauté de la marque. */
function requireBuildRequester(admin: AdminContext, communityId: string): void {
  if (admin.platformRole === "owner") return;
  if (roleInCommunity(admin, communityId) === "community_admin") return;
  throw fail.forbidden("Builds réservés au propriétaire ou à l'administrateur de la marque.");
}

/**
 * `build.approve` / `build.reject` et déclenchement direct : propriétaire seul.
 * Le déclenchement consomme la clé de signature et des minutes de CI.
 */
function requireOwner(admin: AdminContext): void {
  if (admin.platformRole === "owner") return;
  throw fail.forbidden("Réservé au propriétaire de la plateforme.");
}

/* -------------------------------------------------------------- utilitaires */

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

/** Une app porte la marque ; sa communauté est la frontière d'autorisation. */
async function mustApp(db: Queryable, appId: string): Promise<Row> {
  const row = await db.one<Row>("SELECT * FROM apps WHERE id = $1", [appId]);
  if (!row) throw fail.notFound("Application introuvable.");
  return row;
}

async function mustBuild(db: Queryable, buildId: string): Promise<Row> {
  const row = await db.one<Row>("SELECT * FROM builds WHERE id = $1", [buildId]);
  if (!row) throw fail.notFound("Build introuvable.");
  return row;
}

/**
 * Verrou sur la marque : deux clics simultanés (demande, approbation, direct)
 * ne partagent pas le même `versionCode`, Android exigeant une valeur
 * strictement croissante.
 */
async function lockApp(q: Queryable, appId: string): Promise<Row> {
  const locked = await q.one<Row>("SELECT * FROM apps WHERE id = $1 FOR UPDATE", [appId]);
  if (!locked) throw fail.notFound("Application introuvable.");
  return locked;
}

/**
 * Prochain `versionCode` de la marque. Les demandes en attente (`requested`) et
 * les refusées (`rejected`) ne consomment pas de numéro : leur valeur n'est
 * qu'une estimation, recalculée à l'approbation.
 */
async function nextVersionCode(q: Queryable, appId: string): Promise<number> {
  const next = Number(
    await q.scalar<number>(
      `SELECT COALESCE(max(version_code), 0)::int + 1 AS next
         FROM builds
        WHERE app_id = $1
          AND status NOT IN ('requested', 'rejected', 'draft')`,
      [appId],
    ),
  );
  if (!Number.isInteger(next) || next < 1 || next > MAX_VERSION_CODE) {
    throw fail.conflict("Numéro de version suivant hors limites : aucun build ne peut être créé.");
  }
  return next;
}

/**
 * La communauté porte le lien WhatsApp et le contact (R4). Lue en entier : les
 * colonnes peuvent être absentes d'une base non migrée, `buildBrandSpec` les
 * traite alors comme « non renseignées ».
 */
async function communityOf(q: Queryable, appRow: Row): Promise<Row | null> {
  return q.one<Row>("SELECT * FROM communities WHERE id = $1", [appRow.community_id]);
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
    rejectReason: (row.reject_reason as string | null) ?? null,
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

/**
 * Envoie le dispatch après que la ligne est passée en `queued`. Un refus de
 * GitHub ferme le build en `failed` (garde `status = 'queued'`) et répond 502.
 */
async function dispatchOrFail(db: Database, spec: BrandManifest, buildId: string): Promise<void> {
  if (env.builds.mock) return; // Mode local / test : la file suffit.
  const dispatched = await dispatchBuild(spec, buildId);
  if (dispatched.ok) return;
  await db.query(
    "UPDATE builds SET status = 'failed', updated_at = now() WHERE id = $1 AND status = 'queued'",
    [buildId],
  );
  throw new ApiFailure(
    502,
    "INTERNAL",
    `Le build n'a pas été déclenché : ${dispatched.reason}. Il est marqué « failed » ; réessayez.`,
  );
}

/* ---------------------------------------------------------------- routes */

export function registerBuildRoutes(app: FastifyInstance, db: Database): void {
  /* ----------------------------------------- demander un build (community_admin) */

  app.post<{ Params: { appId: string } }>(`${PREFIX}/apps/:appId/build-requests`, async (req, reply) => {
    const admin = await requireAdmin(db, req);
    const appRow = await mustApp(db, req.params.appId);
    requireBuildRequester(admin, String(appRow.community_id));

    const input = parseBody(buildCreateSchema, req.body);
    const versionName = input.versionName ?? "1.0.0";

    const buildId = await db.tx(async (q) => {
      const locked = await lockApp(q, String(appRow.id));
      const next = await nextVersionCode(q, String(appRow.id));
      // Validation seule : une marque non constructible répond 422 nommé dès
      // la demande, et aucune ligne n'existe. Le manifeste est refait à
      // l'approbation (version et logo peuvent avoir changé entre-temps).
      const spec = buildBrandSpec(locked, next, versionName, await communityOf(q, locked));
      const id = newId();
      await q.query(
        `INSERT INTO builds
           (id, app_id, version_code, version_name, theme, status, requested_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'requested', $6, now())`,
        [id, appRow.id, next, spec.versionName, spec.theme, admin.adminId],
      );
      return id;
    });

    // Alerte à l'owner : sans contenu sensible (le nom de la marque et la version).
    void notifyRecipients(db,
      `<b>Demande de build</b> : marque « ${escapeHtml(String(appRow.name))} », version ${escapeHtml(versionName)}. ` +
        "Validation attendue dans le dashboard.",
    );

    return reply.code(202).send({ buildId, status: "requested" });
  });

  /* ------------------------------------ déclencher un build direct (owner seul) */

  app.post<{ Params: { appId: string } }>(`${PREFIX}/apps/:appId/builds`, async (req, reply) => {
    const admin = await requireAdmin(db, req);
    const appRow = await mustApp(db, req.params.appId);
    requireOwner(admin);

    const input = parseBody(buildCreateSchema, req.body);
    // Pas de « correction » silencieuse : une valeur fournie et invalide doit
    // être un 422 nommé, pas un retour discret à 1.0.0.
    const versionName = input.versionName ?? "1.0.0";

    const { buildId, spec } = await db.tx(async (q) => {
      const locked = await lockApp(q, String(appRow.id));
      const next = await nextVersionCode(q, String(appRow.id));

      // Lève 422 (champ fautif) si la marque n'est pas constructible ; la
      // transaction est alors annulée et aucune ligne `builds` n'existe.
      const spec = buildBrandSpec(locked, next, versionName, await communityOf(q, locked));
      const id = newId();
      await q.query(
        `INSERT INTO builds
           (id, app_id, version_code, version_name, theme, status, spec, requested_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'queued', $6::jsonb, $7, now())`,
        [id, appRow.id, spec.versionCode, spec.versionName, spec.theme, JSON.stringify(spec), admin.adminId],
      );
      return { buildId: id, spec };
    });

    await dispatchOrFail(db, spec, buildId);
    return reply.code(202).send({ buildId, status: "queued" });
  });

  /* ----------------------------------------- suivre les builds d'une app */

  app.get<{ Params: { appId: string } }>(`${PREFIX}/apps/:appId/builds`, async (req) => {
    const admin = await requireAdmin(db, req);
    const appRow = await mustApp(db, req.params.appId);
    requireBuildRequester(admin, String(appRow.community_id));

    const rows = await db.query<Row>(
      `SELECT id, status, version_code, version_name, sha256, apk_url, reject_reason, created_at, updated_at
         FROM builds
        WHERE app_id = $1
        ORDER BY created_at DESC
        LIMIT 100`,
      [appRow.id],
    );
    return { items: rows.map(buildDto) };
  });

  /* ------------------------------------ valider une demande (owner, dispatch) */

  app.post<{ Params: { id: string } }>(`${PREFIX}/builds/:id/approve`, async (req, reply) => {
    const admin = await requireAdmin(db, req);
    requireOwner(admin);
    const build = await mustBuild(db, req.params.id);

    // Transition `requested` -> `queued` sous verrou : deux approbations
    // simultanées, une seule passe ; la seconde reçoit 409.
    const { buildId, spec } = await db.tx(async (q) => {
      const appRow = await lockApp(q, String(build.app_id));
      const current = await q.one<Row>("SELECT id, status FROM builds WHERE id = $1 FOR UPDATE", [req.params.id]);
      if (!current) throw fail.notFound("Build introuvable.");
      if (current.status !== "requested") {
        throw fail.conflict(`Ce build n'attend pas de validation (statut : ${String(current.status)}).`);
      }

      const next = await nextVersionCode(q, appRow.id as string);
      const spec = buildBrandSpec(appRow, next, String(build.version_name), await communityOf(q, appRow));
      const updated = await q.query<Row>(
        `UPDATE builds
            SET status = 'queued',
                version_code = $2,
                theme = $3,
                spec = $4::jsonb,
                approved_by = $5,
                updated_at = now()
          WHERE id = $1 AND status = 'requested'
          RETURNING id`,
        [req.params.id, spec.versionCode, spec.theme, JSON.stringify(spec), admin.adminId],
      );
      if (updated.length === 0) throw fail.conflict("Ce build n'attend plus de validation.");
      return { buildId: req.params.id, spec };
    });

    await dispatchOrFail(db, spec, buildId);
    return reply.code(202).send({ buildId, status: "queued" });
  });

  /* ------------------------------------------- refuser une demande (owner) */

  app.post<{ Params: { id: string } }>(`${PREFIX}/builds/:id/reject`, async (req) => {
    const admin = await requireAdmin(db, req);
    requireOwner(admin);
    const input = parseBody(rejectSchema, req.body);
    const build = await mustBuild(db, req.params.id);

    const rows = await db.query<Row>(
      `UPDATE builds
          SET status = 'rejected',
              reject_reason = $2,
              approved_by = $3,
              updated_at = now()
        WHERE id = $1 AND status = 'requested'
        RETURNING id, status`,
      [req.params.id, input.reason, admin.adminId],
    );
    if (rows.length === 0) {
      throw fail.conflict(`Ce build n'attend pas de validation (statut : ${String(build.status)}).`);
    }
    return { buildId: String(rows[0]?.id), status: "rejected" };
  });

  /* --------------------------------------- callback de la CI (D66, interne) */

  app.post<{ Params: { id: string } }>(
    "/v1/internal/builds/:id/callback",
    { preHandler: requireCallbackSecret },
    async (req) => {
      const input = parseBody(callbackSchema, req.body);

      /*
       * Garde de transition : seuls `queued` et `running` peuvent avancer. Un
       * rapport tardif (un `running` qui arrive après `succeeded`, un `failed`
       * après `succeeded`, un état qui n'a jamais été dispatché) ne réécrit
       * rien et répond 200 avec l'état courant : la CI ne doit pas échouer sur
       * un message périmé, et la console ne doit pas régresser.
       *
       * Idempotent : rejouer le même corps laisse la ligne identique. Les
       * champs optionnels sont en COALESCE : un callback qui ne porte que
       * `status` ne perd ni l'empreinte ni l'URL déjà reçues.
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
            AND status IN ('queued', 'running')
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
      if (rows[0]) return { buildId: String(rows[0].id), status: String(rows[0].status) };

      // Rien appliqué : soit le build n'existe pas, soit son état ne permet pas
      // le rapport (rapport tardif ou rejeu). On renvoie l'état courant.
      const current = await mustBuild(db, req.params.id);
      return { buildId: String(current.id), status: String(current.status) };
    },
  );
}
