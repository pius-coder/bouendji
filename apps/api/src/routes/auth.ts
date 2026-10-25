/**
 * Authentification email/mot de passe.
 *
 * Quatre routes, un seul modèle de confiance :
 *
 * - l'inscription et la connexion exigent un **appareil enrôlé** (jeton
 *   d'appareil + signature de la clé SIGN). Un mot de passe volé ne suffit donc
 *   pas à ouvrir une session depuis une machine inconnue : il faut d'abord
 *   enrôler un appareil, ce qui est une trace.
 * - le **refresh est rotatif** : l'ancien jeton est marqué révoqué et un
 *   nouveau est émis. Rejouer l'ancien jeton n'est pas une simple erreur quand
 *   la chaîne est intacte, la fenêtre écoulée ou l'appareil différent : c'est
 *   le signe d'un vol, et toute la chaîne de rotation est révoquée.
 * - **exception assumée** : si la réponse d'une rotation s'est perdue en route
 *   (réseau qui coupe), le client rejoue le jeton qu'il a encore. Rejouer le
 *   jeton **vient d'être remplacé**, **depuis le même appareil**, et **dans les
 *   5 minutes** renvoie une paire neuve sur la **même session** : le client
 *   n'est pas éjecté. Voir `REFRESH_REPLAY_WINDOW_MS` plus bas.
 * - **aucun claim ne porte le droit d'accès.** Le JWT ne contient que
 *   `sub`/`did`/`cid`/`sid` ; l'abonnement se lit en base (`loadEntitlement`).
 *   L'audience, elle, est un verrou de surface : `vpn-mobile` (D17).
 * - **le compte est par marque (D53)** : l'unicité porte sur
 *   `(app_id, lower(email))` et `(app_id, phone)`, et la connexion exige
 *   `appId`. Le même email sur deux marques donne deux comptes distincts ; une
 *   connexion ne peut pas atterrir sur une autre marque que celle demandée. Le
 *   téléphone est **obligatoire** à l'inscription et normalisé (espaces, points
 *   et tirets retirés) avant d'être stocké.
 *
 * La vérification d'email n'est pas câblée dans ce lot : `email_verified_at`
 * est laissé nul, et la connexion ne le réclame pas (aucune route
 * `verify-email` n'existe encore — voir le rapport).
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import type { Database, Row } from "../db.js";
import { AttemptCounter, rateLimitError } from "../lib/attempts.js";
import { issueAccessToken, type AuthContext } from "../lib/auth.js";
import { addDays, hashToken, newId, newToken, verifyPassword, hashPassword } from "../lib/crypto.js";
import { fail } from "../lib/errors.js";
import {
  ensureDeviceSlot,
  parseBody,
  requireBoundDevice,
  requireSession,
  toDeviceDto,
  toUserDto,
  type DeviceDto,
  type UserDto,
} from "./me.js";

/* --------------------------------------------------------------- contrats */

const emailSchema = z.string().trim().toLowerCase().email("Adresse email invalide.").max(190);
/** Huit caractères est un plancher de validation, pas une promesse de robustesse. */
const passwordSchema = z.string().min(8, "Huit caractères minimum.").max(200);

/**
 * Téléphone (D53) : obligatoire, normalisé puis validé.
 *
 * La normalisation (espaces, points, tirets et parenthèses retirés) précède le
 * format : un utilisateur qui saisit « +237 6 12 34 56 78 » et un qui saisit
 * « +237612345678 » désignent le même numéro, donc la contrainte d'unicité
 * `(app_id, phone)` doit voir la même chaîne. Le format reste permissif sur
 * l'indicatif (`+` optionnel) parce que le produit sert plusieurs pays ; il
 * borne seulement la longueur utile (E.164 : 8 à 15 chiffres).
 */
const phoneSchema = z
  .string({
    required_error: "Numéro de téléphone requis.",
    invalid_type_error: "Numéro de téléphone requis.",
  })
  .trim()
  .min(1, "Numéro de téléphone requis.")
  .max(40, "Numéro de téléphone trop long.")
  .transform((value) => value.replace(/[\s.\-()]/g, ""))
  .pipe(
    z
      .string()
      .regex(/^\+?[0-9]{8,15}$/, "Numéro invalide : 8 à 15 chiffres, indicatif + optionnel."),
  );

/** Identifiant de marque : il fixe la communauté, donc il est exigé partout. */
const appIdSchema = z.string().trim().min(1, "Application requise.").max(190);

const registerSchema = z
  .object({
    /** L'app le connaît (il est injecté au build) et il fixe la communauté. */
    appId: appIdSchema,
    email: emailSchema,
    password: passwordSchema,
    name: z.string().trim().min(2).max(60),
    phone: phoneSchema,
    /** Code parrain facultatif (écran « Inviter ») ; inconnu = erreur, pas un silence. */
    referralCode: z.string().trim().toUpperCase().min(4).max(16).optional(),
    locale: z
      .string()
      .trim()
      .regex(/^[a-z]{2}$/, "Code langue attendu (deux lettres minuscules).")
      .optional(),
  })
  .strict();

const loginSchema = z
  .object({
    /**
     * D53 : sans `appId`, une même adresse email existant sur deux marques
     * rendrait la connexion ambiguë — et atterrirait silencieusement sur la
     * mauvaise communauté.
     */
    appId: appIdSchema,
    email: emailSchema,
    password: z.string().min(1).max(200),
  })
  .strict();


const refreshSchema = z
  .object({
    refreshToken: z.string().min(20).max(200),
  })
  .strict();

export interface AuthSessionDto {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
  user: UserDto;
  device: DeviceDto;
}

/* ----------------------------------------------------------------- helpers */

/**
 * Fenêtre de tolérance d'un rejeu de refresh, en millisecondes.
 *
 * Justification : 5 minutes est le délai au-delà duquel un client Android qui
 * a perdu la réponse d'un refresh a de toute façon déjà échoué plusieurs
 * tentatives et affiché un écran d'erreur ; en deçà, la reprise silencieuse est
 * celle que l'utilisateur ne remarque pas. La valeur est aussi celle du contrat
 * mobile (§4, « rotation rejouable 5 min »), donc l'app et le serveur ne se
 * contredisent pas.
 *
 * Ce que la fenêtre **ne** fait pas : elle n'ouvre rien à un autre appareil, et
 * elle ne ressuscite pas une chaîne déjà révoquée. Au-delà de la fenêtre, le
 * rejeu reste un signal de vol et coupe toute la chaîne.
 */
export const REFRESH_REPLAY_WINDOW_MS = 5 * 60_000;

/**
 * Dérive d'horloge tolérée entre l'instance et la base. `replaced_at` est écrit
 * par `now()` côté base, la comparaison se fait dans le processus : sans cette
 * marge, une instance dont l'horloge retarde de quelques secondes transformerait
 * une reprise légitime en détection de vol.
 */
const CLOCK_SKEW_TOLERANCE_MS = 60_000;

const toMs = (value: Date | string): number => (value instanceof Date ? value.getTime() : new Date(value).getTime());

/** Un rejeu est « dans la fenêtre » s'il vient d'avoir lieu, ni dans le futur lointain. */
export function isReplayWithinWindow(session: Row, now = Date.now()): boolean {
  if (!session.replaced_at || !session.replaced_by_id) return false;
  const replacedAt = toMs(session.replaced_at as Date | string);
  if (!Number.isFinite(replacedAt)) return false;
  const age = now - replacedAt;
  return age <= REFRESH_REPLAY_WINDOW_MS && age >= -CLOCK_SKEW_TOLERANCE_MS;
}

/** Toutes les sessions vivantes d'un compte sur un appareil. */
async function revokeDeviceFamily(db: Database, userId: string, deviceId: string): Promise<void> {
  await db.query(
    "UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND device_id = $2 AND revoked_at IS NULL",
    [userId, deviceId],
  );
}

/** Placeholders `$1, $2, …` pour un `IN (...)`. Les valeurs restent paramétrées. */
function placeholders(count: number): string {
  return Array.from({ length: count }, (_, i) => `$${i + 1}`).join(", ");
}

/**
 * Toute la chaîne de rotation à laquelle appartient `startId` : la session
 * elle-même, celles qu'elle a enfantées (`replaced_by_id`), et celles qui
 * l'ont enfantée — d'où la remontée par l'index `sessions_replaced_by_idx`.
 *
 * Bornée en profondeur : une chaîne ne peut pas être infinie, et une boucle
 * accidentelle (donnée corrompue) ne doit pas bloquer une requête.
 */
async function sessionChainIds(db: Database, startId: string): Promise<string[]> {
  const max = 200;
  const seen = new Set<string>([startId]);

  // Descente : chaque session remplacée pointe vers sa remplaçante.
  let cursor: string | null = startId;
  while (cursor && seen.size < max) {
    const row: Row | null = await db.one<Row>("SELECT replaced_by_id FROM auth_sessions WHERE id = $1", [cursor]);
    const next: string | null = row?.replaced_by_id == null ? null : String(row.replaced_by_id);
    if (!next || seen.has(next)) break;
    seen.add(next);
    cursor = next;
  }

  // Remontée : qui pointe vers la chaîne ? (parents, puis parents de parents)
  let frontier = [...seen];
  while (frontier.length > 0 && seen.size < max) {
    const rows = await db.query<Row>(
      `SELECT id FROM auth_sessions WHERE replaced_by_id IN (${placeholders(frontier.length)})`,
      frontier,
    );
    const next: string[] = [];
    for (const row of rows) {
      const id = String(row.id);
      if (seen.has(id)) continue;
      seen.add(id);
      next.push(id);
    }
    frontier = next;
  }

  return [...seen];
}

/** Révoque la chaîne : au-delà de la fenêtre, un rejeu est un vol probable. */
async function revokeChain(db: Database, startId: string): Promise<number> {
  const ids = await sessionChainIds(db, startId);
  if (ids.length === 0) return 0;
  await db.query(
    `UPDATE auth_sessions SET revoked_at = now()
      WHERE id IN (${placeholders(ids.length)}) AND revoked_at IS NULL`,
    ids,
  );
  return ids.length;
}

/**
 * Dernière session de la chaîne — celle dont le refresh est encore utilisable.
 * `null` si un maillon manque (purge, corruption) : on ne devine pas.
 */
async function currentSessionOf(db: Database, from: Row): Promise<Row | null> {
  let id = from.replaced_by_id == null ? null : String(from.replaced_by_id);
  for (let depth = 0; id && depth < 200; depth += 1) {
    const row = await db.one<Row>("SELECT * FROM auth_sessions WHERE id = $1", [id]);
    if (!row) return null;
    if (row.replaced_by_id == null) return row;
    id = String(row.replaced_by_id);
  }
  return null;
}

/**
 * Rejeu dans la fenêtre : on rend une paire neuve **sur la session courante**,
 * sans créer de ligne. Le jeton de la session courante est remplacé sur place :
 * le client qui a perdu la réponse précédente repart avec un secret valide, et
 * la chaîne ne grossit pas d'une session par tentative réseau.
 *
 * Retourne `null` quand la reprise n'est pas sûre (session courante révoquée,
 * expirée, d'un autre compte ou d'un autre appareil, ou course perdue) : la
 * chaîne est alors révoquée par l'appelant.
 */
async function resumeOnCurrentSession(
  db: Database,
  device: Row,
  replaced: Row,
): Promise<AuthSessionDto | null> {
  const current = await currentSessionOf(db, replaced);
  if (!current) return null;
  if (current.revoked_at) return null;
  if (String(current.user_id) !== String(replaced.user_id)) return null;
  if (String(current.device_id) !== String(device.id)) return null;

  const expiresAt = new Date(current.expires_at as Date | string);
  if (expiresAt.getTime() <= Date.now()) return null;

  const user = await db.one<Row>("SELECT * FROM users WHERE id = $1", [String(current.user_id)]);
  if (!user || user.deleted_at) return null;

  const refresh = { token: newToken(32), expiresAt };

  // Remplacement conditionnel : si un autre rejeu a déjà tourné la session
  // courante, on ne l'écrase pas — l'appelant révoque et répond 401.
  const updated = await db.query(
    `UPDATE auth_sessions SET refresh_hash = $2, last_used_at = now()
      WHERE id = $1 AND revoked_at IS NULL RETURNING id`,
    [current.id, hashToken(refresh.token)],
  );
  if (updated.length === 0) return null;

  const access = await issueAccessToken({
    userId: String(current.user_id),
    deviceId: String(current.device_id),
    communityId: String(user.community_id),
    sessionId: String(current.id),
  });

  return sessionResponse({
    access,
    refreshToken: refresh.token,
    refreshExpiresAt: expiresAt,
    user,
    device,
    deviceId: String(device.id),
  });
}

/** Forme exacte d'`AuthSession`, partagée par inscription, connexion et refresh. */
function sessionResponse(input: {
  access: { token: string; expiresAt: Date };
  refreshToken: string;
  refreshExpiresAt: Date;
  user: Row;
  device: Row;
  deviceId: string;
}): AuthSessionDto {
  return {
    accessToken: input.access.token,
    refreshToken: input.refreshToken,
    accessExpiresAt: input.access.expiresAt.toISOString(),
    refreshExpiresAt: input.refreshExpiresAt.toISOString(),
    user: toUserDto(input.user),
    device: toDeviceDto(input.device, input.deviceId),
  };
}

async function sessionDto(
  db: Database,
  input: { userId: string; deviceId: string; communityId: string },
  refresh: { token: string; expiresAt: Date },
): Promise<AuthSessionDto> {
  const sessionId = newId();
  await db.query(
    `INSERT INTO auth_sessions (id, user_id, device_id, refresh_hash, expires_at, last_used_at)
     VALUES ($1, $2, $3, $4, $5, now())`,
    [sessionId, input.userId, input.deviceId, hashToken(refresh.token), refresh.expiresAt],
  );

  const access = await issueAccessToken({
    userId: input.userId,
    deviceId: input.deviceId,
    communityId: input.communityId,
    sessionId,
  });

  const user = await db.one<Row>("SELECT * FROM users WHERE id = $1", [input.userId]);
  const device = await db.one<Row>("SELECT * FROM devices WHERE id = $1", [input.deviceId]);
  if (!user || !device) throw fail.unauthenticated("Compte indisponible.");

  return sessionResponse({
    access,
    refreshToken: refresh.token,
    refreshExpiresAt: refresh.expiresAt,
    user,
    device,
    deviceId: input.deviceId,
  });
}

function newRefresh(): { token: string; expiresAt: Date } {
  return { token: newToken(32), expiresAt: addDays(new Date(), env.refreshTokenTtlDays) };
}

/* ------------------------------------------------------------------ routes */

export function registerAuthRoutes(app: FastifyInstance, db: Database): void {
  /**
   * 10 tentatives / 15 min **par IP** (plugin) et **par email** (compteur en
   * mémoire). Deux compteurs pour deux attaques différentes : une adresse
   * unique martelée depuis mille IP passe sous le plafond par IP ; mille
   * adresses martelées depuis une IP passent sous le plafond par email.
   *
   * Le compteur par email est local au processus : sur N instances, le plafond
   * effectif est N × 10 par fenêtre et un redémarrage le remet à zéro. C'est un
   * ralentisseur, pas une frontière de sécurité (voir lib/attempts.ts).
   */
  const authLimit = env.rateLimit.enforce
    ? {
        config: {
          rateLimit: {
            max: env.rateLimit.auth.max,
            timeWindow: env.rateLimit.auth.window,
            keyGenerator: (req: FastifyRequest) => req.ip,
            errorResponseBuilder: rateLimitError,
          },
        },
      }
    : {};

  const emailAttempts = env.rateLimit.enforce
    ? new AttemptCounter(env.rateLimit.auth.max, env.rateLimit.auth.windowMs)
    : null;

  /**
   * Clé de comptage : `appId` + email normalisé. La marque est dans la clé
   * parce que l'identité d'un compte l'est aussi (D53) : marteler le compte
   * d'une marque ne doit pas consommer le budget de l'autre marque portant la
   * même adresse. La clé est hachée pour ne pas traîner d'email en clair.
   */
  const emailKey = (appId: string, email: string): string => hashToken(`auth-attempts:${appId}:${email}`);

  function guardEmail(appId: string, email: string): string | null {
    if (!emailAttempts) return null;
    const key = emailKey(appId, email);
    const attempt = emailAttempts.hit(key);
    if (!attempt.allowed) throw fail.rateLimited(attempt.retryAfterSeconds);
    return key;
  }

  /**
   * Inscription.
   *
   * L'appareil doit déjà être enrôlé (deux clés), et ne doit pas appartenir à
   * un autre compte : une installation ne glisse pas silencieusement d'un
   * compte à un autre.
   *
   * Le compte est créé **dans la marque** (`users.app_id` = `apps.id`) et le
   * téléphone y est obligatoire (D53) : c'est ce couple qui identifie un
   * client, et une adresse email peut exister sur plusieurs marques sans que
   * les comptes se mélangent.
   */
  app.post("/v1/auth/register", authLimit, async (req: FastifyRequest, reply) => {
    const device = await requireBoundDevice(db, req);
    const input = parseBody(registerSchema, req.body);
    const attemptKey = guardEmail(input.appId, input.email);

    if (device.user_id) throw fail.conflict("Cet appareil est déjà rattaché à un compte.");

    const appRow = await db.one<Row>("SELECT id, community_id FROM apps WHERE id = $1", [input.appId]);
    if (!appRow) throw fail.validation({ appId: "Application inconnue." });

    /*
     * L'unicité est **par marque** (D53) : `(app_id, lower(email))`. Le même
     * email sur deux marques est deux comptes voulus, pas un doublon. On
     * interroge en `lower(email)` : l'index est fonctionnel, une comparaison
     * sensible à la casse ne l'utiliserait pas et laisserait passer un
     * « A@x.test » après un « a@x.test ».
     */
    const taken = await db.one<Row>("SELECT id FROM users WHERE app_id = $1 AND lower(email) = lower($2)", [
      input.appId,
      input.email,
    ]);
    if (taken) throw fail.conflict("Un compte existe déjà pour cette adresse email sur cette application.");

    // Même raisonnement pour le téléphone, dans la marque : c'est la clé de
    // rattachement de la consommation (§3.4), deux comptes ne la partagent pas.
    const phoneTaken = await db.one<Row>("SELECT id FROM users WHERE app_id = $1 AND phone = $2", [
      input.appId,
      input.phone,
    ]);
    if (phoneTaken) throw fail.conflict("Un compte existe déjà pour ce numéro de téléphone sur cette application.");

    // Le parrain est cherché dans la même marque : un code d'une autre marque n'existe pas ici.
    const referrer = input.referralCode
      ? await db.one<Row>("SELECT id FROM users WHERE app_id = $1 AND referral_code = $2 AND deleted_at IS NULL", [
          input.appId,
          input.referralCode,
        ])
      : null;
    if (input.referralCode && !referrer) throw fail.validation({ referralCode: "Code parrain inconnu." });

    const userId = newId();
    try {
      await db.tx(async (q) => {
        await q.query(
          `INSERT INTO users (id, app_id, community_id, email, phone, password_hash, name, locale)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            userId,
            input.appId,
            appRow.community_id,
            input.email.toLowerCase(),
            input.phone,
            hashPassword(input.password),
            input.name,
            input.locale ?? "fr",
          ],
        );
        // Premier appareil d'un compte neuf : aucune place n'est occupée.
        await q.query("UPDATE devices SET user_id = $2, status = 'active' WHERE id = $1", [device.id, userId]);
        if (referrer) {
          await q.query("INSERT INTO referrals (referred_user_id, referrer_user_id, app_id) VALUES ($1, $2, $3)", [
            userId,
            referrer.id,
            input.appId,
          ]);
        }
      });
    } catch (error) {
      // Course entre deux inscriptions : les index UNIQUE de la marque tranchent.
      if (typeof error === "object" && error !== null && (error as { code?: string }).code === "23505") {
        const constraint = String((error as { constraint?: string }).constraint ?? "");
        if (constraint === "users_app_phone_idx") {
          throw fail.conflict("Un compte existe déjà pour ce numéro de téléphone sur cette application.");
        }
        throw fail.conflict("Un compte existe déjà pour cette adresse email sur cette application.");
      }
      throw error;
    }

    const session = await sessionDto(
      db,
      { userId, deviceId: String(device.id), communityId: String(appRow.community_id) },
      newRefresh(),
    );
    if (attemptKey) emailAttempts?.reset(attemptKey);
    return reply.code(201).send(session);
  });

  /**
   * Connexion.
   *
   * `appId` est obligatoire (D53) et la recherche filtre **les deux** :
   * `app_id = $1 AND lower(email) = lower($2)`. Sans le filtre de marque, le
   * même email existant sur deux marques ferait atterrir la session sur la
   * mauvaise communauté ; sans `lower()`, une casse différente à l'inscription
   * (« Jean@… ») et à la connexion (« jean@… ») rendrait le compte
   * inaccessible.
   *
   * Message **identique** pour un email inconnu, une marque sans ce compte et
   * un mot de passe faux : la route ne dit jamais si un compte existe, ni sur
   * quelle marque.
   */
  app.post("/v1/auth/login", authLimit, async (req: FastifyRequest) => {
    const device = await requireBoundDevice(db, req);
    const input = parseBody(loginSchema, req.body);
    const attemptKey = guardEmail(input.appId, input.email);

    const user = await db.one<Row>("SELECT * FROM users WHERE app_id = $1 AND lower(email) = lower($2)", [
      input.appId,
      input.email,
    ]);
    if (!user || user.deleted_at) throw fail.invalidCredentials();
    if (!verifyPassword(input.password, String(user.password_hash))) throw fail.invalidCredentials();

    if (device.user_id && device.user_id !== user.id) {
      throw fail.conflict("Cet appareil est rattaché à un autre compte.");
    }

    // Un appareil neuf sur un compte existant reste `enrolled` si le quota est
    // atteint : l'accès au bundle est refusé, la gestion du compte reste ouverte.
    await ensureSlotAfterBind(db, String(user.id), String(device.id));

    const session = await sessionDto(
      db,
      { userId: String(user.id), deviceId: String(device.id), communityId: String(user.community_id) },
      newRefresh(),
    );
    // Une connexion réussie solde les échecs précédents : l'utilisateur qui
    // retrouve son mot de passe ne traîne pas son compteur.
    if (attemptKey) emailAttempts?.reset(attemptKey);
    return session;
  });

  /**
   * Rotation. L'ancienne ligne est révoquée et une nouvelle est créée avec la
   * **même échéance absolue** : une rotation ne prolonge pas une session
   * indéfiniment, elle ne fait que remplacer le secret porteur.
   *
   * Le jeton remplacé garde une trace de son remplacement (`replaced_by_id`,
   * `replaced_at`) : c'est ce qui permet de distinguer plus tard « la réponse
   * s'est perdue, le client réessaie » (< 5 min, même appareil) de « quelqu'un
   * rejoue un jeton mort » (vol probable, chaîne entière révoquée).
   */
  app.post("/v1/auth/refresh", async (req: FastifyRequest) => {
    const device = await requireBoundDevice(db, req);
    const input = parseBody(refreshSchema, req.body);

    const session = await db.one<Row>("SELECT * FROM auth_sessions WHERE refresh_hash = $1", [
      hashToken(input.refreshToken),
    ]);
    if (!session) throw fail.unauthenticated("Jeton de rafraîchissement invalide.");

    const userId = String(session.user_id);
    const deviceId = String(session.device_id);

    // Jeton présenté depuis un autre appareil : on ne sait pas lequel des deux
    // est légitime, donc on coupe la famille (elle contient toute la chaîne).
    if (deviceId !== device.id) {
      await revokeDeviceFamily(db, userId, deviceId);
      throw fail.unauthenticated("Session révoquée.");
    }

    // Jeton déjà tourné.
    if (session.revoked_at) {
      if (isReplayWithinWindow(session)) {
        // Reprise : la réponse de la rotation a disparu en route.
        const resumed = await resumeOnCurrentSession(db, device, session);
        if (resumed) return resumed;
        // Chaîne cassée ou course perdue : on ne laisse rien debout.
      }
      await revokeChain(db, String(session.id));
      throw fail.unauthenticated("Jeton de rafraîchissement déjà utilisé : reconnectez-vous.");
    }

    const expiresAt = new Date(session.expires_at as Date | string);
    if (expiresAt.getTime() <= Date.now()) throw fail.unauthenticated("Session expirée.");

    const user = await db.one<Row>("SELECT * FROM users WHERE id = $1", [userId]);
    if (!user || user.deleted_at) throw fail.unauthenticated("Compte indisponible.");

    const refresh = { token: newToken(32), expiresAt };
    const nextSessionId = newId();

    // Deux refresh concurrents : la révocation conditionnelle ne laisse passer
    // qu'un seul gagnant. Le perdant reçoit un 401 simple — c'est une course,
    // pas encore un rejeu, et il n'a pas fait avancer l'état. S'il réessaie, il
    // tombe dans la fenêtre de reprise ci-dessus et récupère une paire valide.
    const rotated = await db.tx(async (q) => {
      const revoked = await q.query(
        `UPDATE auth_sessions
            SET revoked_at = now(),
                last_used_at = now(),
                replaced_by_id = $2,
                replaced_at = now()
          WHERE id = $1 AND revoked_at IS NULL
        RETURNING id`,
        [session.id, nextSessionId],
      );
      if (revoked.length === 0) return false;

      await q.query(
        `INSERT INTO auth_sessions (id, user_id, device_id, refresh_hash, expires_at, last_used_at)
         VALUES ($1, $2, $3, $4, $5, now())`,
        [nextSessionId, userId, deviceId, hashToken(refresh.token), expiresAt],
      );
      return nextSessionId;
    });
    if (rotated === false) throw fail.unauthenticated("Jeton de rafraîchissement déjà utilisé : reconnectez-vous.");

    const access = await issueAccessToken({
      userId,
      deviceId,
      communityId: String(user.community_id),
      sessionId: rotated,
    });

    return sessionResponse({
      access,
      refreshToken: refresh.token,
      refreshExpiresAt: expiresAt,
      user,
      device,
      deviceId: String(device.id),
    }) satisfies AuthSessionDto;
  });

  /** Déconnexion : révoque la session courante, rien d'autre. */
  app.post("/v1/auth/logout", async (req: FastifyRequest, reply) => {
    const auth: AuthContext = await requireSession(db, req);
    await db.query("UPDATE auth_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL", [
      auth.sessionId,
    ]);
    return reply.code(204).send();
  });
}

/**
 * Après rattachement d'un appareil à un compte existant : consommation d'une
 * place si le quota le permet. Isolé ici pour que `login` reste lisible.
 */
async function ensureSlotAfterBind(db: Database, userId: string, deviceId: string): Promise<string> {
  await db.query("UPDATE devices SET user_id = $2 WHERE id = $1 AND user_id IS NULL", [deviceId, userId]);
  const slot = await ensureDeviceSlot(db, userId, deviceId);
  return slot.status;
}
