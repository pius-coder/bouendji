/**
 * Compte : profil, abonnement, et les gardes partagées des routes privées.
 *
 * Ce module est volontairement le seul endroit qui sait deux choses :
 *
 * 1. **Ce que « session » veut dire.** `requireUser` (lib/auth.ts) valide le
 *    bearer et la ligne `auth_sessions`, mais pas la preuve d'appareil, et il ne
 *    vérifie pas que l'appareil de la session appartient bien au compte. Le
 *    contrat exige les deux (`Authorization` + `Device-Proof`), donc
 *    `requireSession` compose les deux contrôles. Les routes d'auth, d'appareils
 *    et de bundle l'importent au lieu de réimplémenter la règle.
 *
 * 2. **Ce qu'un droit d'accès vaut.** `loadEntitlement` est la lecture unique de
 *    `subscriptions ⋈ plans` ; le bundle et `/v1/me` doivent répondre la même
 *    chose, sinon l'écran d'abonnement et la liste de configurations se
 *    contredisent.
 *
 * L'ordre des contrôles dans `requireSession` est délibéré : la preuve
 * d'appareil est vérifiée **avant** le contrôle de propriété, pour qu'un
 * identifiant d'appareil existant ne puisse pas servir de sonde à un tiers qui
 * ne possède pas la clé. Une fois la preuve valide, un appareil d'un autre
 * compte renvoie **403** et jamais 404 (brief api-bundle).
 */
import type { FastifyInstance, FastifyRequest, FastifySchema, FastifySchemaCompiler } from "fastify";
import { z } from "zod";
import type { Database, Queryable, Row } from "../db.js";
import { COMMON_ERRORS, DEVICE_SECURITY, errorResponse, jsonResponse } from "../http/schemas.js";
import { requireDeviceByToken, requireUser, verifyDeviceProof, type AuthContext } from "../lib/auth.js";
import { fail } from "../lib/errors.js";
import type { EndpointTier } from "../services/endpoints.js";

/* -------------------------------------------------------------- validation */

export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body ?? {});
  if (result.success) return result.data;
  const details: Record<string, string> = {};
  for (const issue of result.error.issues) {
    details[issue.path.join(".") || "_"] = issue.message;
  }
  throw fail.validation(details);
}

/* ------------------------------------------------------------------ gardes */

/**
 * Bearer + preuve d'appareil + propriété de l'appareil.
 *
 * `verifyDeviceProof` consomme le nonce : une requête rejouée avec le même
 * nonce échoue en 401 côté lib/auth.ts, pas ici.
 */
export async function requireSession(db: Database, req: FastifyRequest): Promise<AuthContext> {
  const auth = await requireUser(db, req);
  await verifyDeviceProof(db, req, auth.device);
  if (auth.device.user_id !== auth.userId) {
    throw fail.forbidden("Cet appareil est rattaché à un autre compte.");
  }
  return auth;
}

/**
 * Appareil pas encore rattaché à un compte : c'est la situation de
 * l'inscription et de la connexion. Le jeton d'appareil identifie la ligne, la
 * preuve identifie la clé de signature — sans elle, un jeton volé suffirait à
 * se connecter.
 */
export async function requireBoundDevice(db: Database, req: FastifyRequest): Promise<Row> {
  const device = await requireDeviceByToken(db, req);
  await verifyDeviceProof(db, req, device);
  return device;
}

/* -------------------------------------------------------------------- DTOs */

const iso = (value: Date | string): string => (value instanceof Date ? value.toISOString() : new Date(value).toISOString());

/**
 * Défaut du schéma : `plans.device_limit integer NOT NULL DEFAULT 1`
 * (schema.ts:126). Un compte sans abonnement n'a pas de quota contractuel ; on
 * retombe sur ce défaut pour qu'un premier appareil puisse être enregistré,
 * sans jamais autoriser un bundle (celui-ci exige un abonnement actif).
 */
export const DEVICE_QUOTA_FALLBACK = 1;

export interface SubscriptionDto {
  id: string;
  planId: string;
  planCode: string;
  planName: string;
  startsAt: string;
  endsAt: string;
  deviceLimit: number;
}

export interface EntitlementDto {
  active: boolean;
  planCode: string | null;
  planName: string | null;
  /**
   * D45 : la nature de nœuds que ce forfait achète. Le bundle ne sert que ce
   * tier — les deux infrastructures ne se mélangent jamais, sinon toute mesure
   * de consommation devient incohérente.
   */
  endpointTier: EndpointTier;
  startsAt: string | null;
  endsAt: string | null;
  daysRemaining: number;
  deviceLimit: number;
  /** Une commande payée dont l'activation n'a pas encore eu lieu. */
  activationPending: boolean;
}

export interface EntitlementSnapshot {
  entitlement: EntitlementDto;
  subscription: SubscriptionDto | null;
}

export interface UserDto {
  id: string;
  email: string;
  name: string;
  locale: string;
  phone?: string | null;
  emailVerified: boolean;
  communityId: string;
  createdAt: string;
}

export interface DeviceDto {
  id: string;
  name: string;
  platform: string;
  status: string;
  current: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export function toUserDto(user: Row): UserDto {
  return {
    id: String(user.id),
    email: String(user.email),
    name: String(user.name),
    locale: String(user.locale),
    phone: user.phone ? String(user.phone) : null,
    emailVerified: user.email_verified_at != null,
    communityId: String(user.community_id),
    createdAt: iso(user.created_at as Date | string),
  };
}

export function toDeviceDto(device: Row, currentDeviceId: string | null): DeviceDto {
  return {
    id: String(device.id),
    name: String(device.name),
    platform: String(device.platform),
    status: String(device.status),
    current: currentDeviceId !== null && device.id === currentDeviceId,
    lastSeenAt: device.last_seen_at == null ? null : iso(device.last_seen_at as Date | string),
    createdAt: iso(device.created_at as Date | string),
  };
}

/* ------------------------------------------------------------- abonnement */

/**
 * Le droit actif est l'abonnement `active` dont `ends_at` est le plus tardif.
 * Aucun JWT ne le porte : l'app consomme cette projection, jamais un claim.
 */
export async function loadEntitlement(db: Queryable, userId: string): Promise<EntitlementSnapshot> {
  const row = await db.one<Row>(
    `SELECT s.id, s.plan_id, s.starts_at, s.ends_at,
            p.code AS plan_code, p.name AS plan_name, p.device_limit, p.endpoint_tier
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
      WHERE s.user_id = $1 AND s.status = 'active' AND s.ends_at > now()
      ORDER BY s.ends_at DESC
      LIMIT 1`,
    [userId],
  );

  const pending = Number(
    await db.scalar(
      "SELECT count(*)::int FROM orders WHERE user_id = $1 AND status = 'paid' AND activated_at IS NULL",
      [userId],
    ),
  ) > 0;

  if (!row) {
    const isOwner = Number(await db.scalar(
      `SELECT count(*)::int FROM users u
       JOIN admin_users a ON (
         (a.email IS NOT NULL AND lower(a.email) = lower(u.email))
         OR (a.whatsapp_number IS NOT NULL AND u.phone LIKE '%' || a.whatsapp_number)
       )
       WHERE u.id = $1 AND a.platform_role = 'owner' AND a.active = true`,
      [userId],
    )) > 0;

    if (isOwner) {
      const farFuture = new Date(Date.now() + 3650 * 86400 * 1000).toISOString();
      return {
        subscription: {
          id: "owner-lifetime",
          planId: "owner-plan",
          planCode: "owner-unlimited",
          planName: "Accès Propriétaire (Illimité)",
          startsAt: new Date().toISOString(),
          endsAt: farFuture,
          deviceLimit: 99,
        },
        entitlement: {
          active: true,
          planCode: "owner-unlimited",
          planName: "Accès Propriétaire (Illimité)",
          endpointTier: "paid-gcp",
          startsAt: new Date().toISOString(),
          endsAt: farFuture,
          daysRemaining: 3650,
          deviceLimit: 99,
          activationPending: false,
        },
      };
    }
    return {
      subscription: null,
      entitlement: {
        active: false,
        planCode: null,
        planName: null,
        endpointTier: "free-labs",
        startsAt: null,
        endsAt: null,
        daysRemaining: 0,
        deviceLimit: DEVICE_QUOTA_FALLBACK,
        activationPending: pending,
      },
    };
  }

  const endsAt = iso(row.ends_at as Date | string);
  const remainingMs = new Date(endsAt).getTime() - Date.now();
  // Une colonne absente ou une valeur inattendue retombe sur `free-labs` : le
  // tier le moins cher est le seul défaut sûr (D45).
  const endpointTier: EndpointTier = row.endpoint_tier === "paid-gcp" ? "paid-gcp" : "free-labs";
  const subscription: SubscriptionDto = {
    id: String(row.id),
    planId: String(row.plan_id),
    planCode: String(row.plan_code),
    planName: String(row.plan_name),
    startsAt: iso(row.starts_at as Date | string),
    endsAt,
    deviceLimit: Number(row.device_limit),
  };

  return {
    subscription,
    entitlement: {
      active: true,
      planCode: subscription.planCode,
      planName: subscription.planName,
      endpointTier,
      startsAt: subscription.startsAt,
      endsAt,
      daysRemaining: Math.max(0, Math.ceil(remainingMs / 86_400_000)),
      deviceLimit: subscription.deviceLimit,
      activationPending: pending,
    },
  };
}

export type SubscriptionState = "active" | "exhausted" | "expired";

/**
 * Vue « abonnement » enrichie (R6) : famille, quota, consommation de la période,
 * plage de nuit et état.
 *
 * La consommation somme `usage_daily` des appareils du compte, source `node`
 * seulement (le client ne peut pas la gonfler, cf. telemetry.ts), sur les jours
 * UTC couverts par la période. Cette lecture ne coupe rien : la coupure à
 * l'épuisement appartient au travailleur de consommation (R7).
 *
 * `state` : `expired` sans abonnement actif ; `exhausted` quand le quota est
 * atteint ; sinon `active`. Un forfait sans quota (offre legacy) reste `active`.
 */
export async function loadSubscriptionView(db: Database, userId: string) {
  const base = await loadEntitlement(db, userId);
  const sub = base.subscription;

  let family: "limited" | "limited_night" | "unlimited" | null = null;
  let quotaBytes: number | null = null;
  let nightWindow: string | null = null;
  let usedBytes = 0;

  if (sub) {
    const detail = await db.one<Row>(
      `SELECT s.quota_bytes, s.night_window, p.family
         FROM subscriptions s
         JOIN plans p ON p.id = s.plan_id
        WHERE s.id = $1`,
      [sub.id],
    );
    if (detail) {
      // Sur mesure (D127) : la plage achetée en option fait la famille. Illimité : D132.
      family =
        detail.family === "unlimited"
          ? "unlimited"
          : detail.family === "limited_night" || (detail.family === "custom" && detail.night_window)
            ? "limited_night"
            : "limited";
      quotaBytes = detail.quota_bytes === null || detail.quota_bytes === undefined ? null : Number(detail.quota_bytes);
      nightWindow = (detail.night_window as string | null) ?? null;
    }
    usedBytes = Number(
      await db.scalar(
        `SELECT COALESCE(SUM(u.bytes_up + u.bytes_down), 0)::bigint
           FROM usage_daily u
           JOIN devices d ON d.id = u.device_id
           JOIN subscriptions s ON s.id = $2
          WHERE d.user_id = $1
            AND u.source = 'node'
            AND u.day >= (s.starts_at AT TIME ZONE 'UTC')::date
            AND u.day <= (s.ends_at AT TIME ZONE 'UTC')::date`,
        [userId, sub.id],
      ),
    );
  }

  const remainingBytes = quotaBytes === null ? null : Math.max(0, quotaBytes - usedBytes);
  const state: SubscriptionState = !sub
    ? "expired"
    : quotaBytes !== null && usedBytes >= quotaBytes
      ? "exhausted"
      : "active";

  return {
    entitlement: { ...base.entitlement, family, quotaBytes, usedBytes, remainingBytes, nightWindow, state },
    subscription: sub,
  };
}

/**
 * Applique le quota d'appareils et promeut l'appareil courant en `active` s'il
 * reste une place.
 *
 * Le contrat veut un quota atomique. On verrouille donc les lignes de
 * l'utilisateur (`FOR UPDATE`) avant de compter : deux connexions simultanées
 * sur deux appareils ne peuvent pas consommer la même place. Le comptage
 * n'inclut que `active` — `enrolled` est un appareil connu mais sans place.
 *
 * Trois appelants : la connexion et le tirage du bundle promeuvent
 * implicitement, et `POST /v1/me/devices/current/activate` (devices.ts) le fait
 * explicitement après révocation d'un ancien appareil.
 */
export async function ensureDeviceSlot(
  db: Database,
  userId: string,
  deviceId: string,
): Promise<{ status: string; limit: number; used: number }> {
  const { entitlement } = await loadEntitlement(db, userId);
  const limit = entitlement.deviceLimit;

  return db.tx(async (q) => {
    const rows = await q.query<{ id: string; status: string }>(
      `SELECT id, status FROM devices
        WHERE user_id = $1 AND status IN ('enrolled', 'active')
        FOR UPDATE`,
      [userId],
    );
    const current = rows.find((row) => row.id === deviceId);
    if (!current) throw fail.forbidden("Appareil indisponible.");

    const others = rows.filter((row) => row.id !== deviceId && row.status === "active").length;
    if (current.status === "enrolled" && others < limit) {
      await q.query("UPDATE devices SET status = 'active' WHERE id = $1 AND status = 'enrolled'", [deviceId]);
      return { status: "active", limit, used: others + 1 };
    }
    return {
      status: current.status,
      limit,
      used: others + (current.status === "active" ? 1 : 0),
    };
  });
}

export async function activeDeviceCount(db: Queryable, userId: string): Promise<number> {
  return Number(await db.scalar("SELECT count(*)::int FROM devices WHERE user_id = $1 AND status = 'active'", [userId]));
}

/* ------------------------------------------------------------------ routes */

const patchSchema = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    locale: z
      .string()
      .trim()
      .regex(/^[a-z]{2}$/, "Code langue attendu (deux lettres minuscules).")
      .optional(),
  })
  .strict()
  .refine((value) => value.name !== undefined || value.locale !== undefined, {
    message: "Rien à mettre à jour.",
    path: ["_"],
  });

export function registerMeRoutes(app: FastifyInstance, db: Database): void {
  app.get("/v1/me", async (req: FastifyRequest) => {
    const auth = await requireSession(db, req);
    const { entitlement, subscription } = await loadEntitlement(db, auth.userId);
    const community = await db.one<Row>("SELECT id, slug, name FROM communities WHERE id = $1", [auth.communityId]);
    const used = await activeDeviceCount(db, auth.userId);

    return {
      user: toUserDto(auth.user),
      community: community
        ? { id: String(community.id), slug: String(community.slug), name: String(community.name) }
        : { id: auth.communityId, slug: "", name: "" },
      entitlement,
      subscription,
      device: toDeviceDto(auth.device, auth.deviceId),
      devicesUsed: used,
      devicesLimit: entitlement.deviceLimit,
    };
  });

  app.patch("/v1/me", async (req: FastifyRequest) => {
    const auth = await requireSession(db, req);
    const input = parseBody(patchSchema, req.body);
    const updated = await db.one<Row>(
      `UPDATE users
          SET name = COALESCE($2, name), locale = COALESCE($3, locale)
        WHERE id = $1
        RETURNING *`,
      [auth.userId, input.name ?? null, input.locale ?? null],
    );
    if (!updated) throw fail.notFound("Compte introuvable.");
    return toUserDto(updated);
  });

  /**
   * Vue « abonnement » seule : l'app recharge cet écran plus souvent que
   * `/v1/me`, qui porte aussi l'appareil courant et la communauté.
   */
  app.get("/v1/me/subscription", async (req: FastifyRequest) => {
    const auth = await requireSession(db, req);
    return loadSubscriptionView(db, auth.userId);
  });
}
