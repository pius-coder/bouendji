/**
 * Espace Réseau : créneaux de nuit (D119, D120, D124) et test Telegram.
 *
 * - `night_slot.manage` : owner et reseau. Tant que `permitted()` ne connaît pas
 *   encore cette capacité (R1 non fusionné dans cette copie), le contrôle est
 *   local : owner, ou une ligne `admin_platform_roles(role = 'reseau')`.
 * - La clé de déploiement d'un créneau est montrée **une seule fois** à sa
 *   création. Seule son empreinte est en base. Aucune réponse, aucun journal
 *   ne contient la clé après cette réponse.
 * - Le membre Réseau ne voit jamais `ENDPOINT_INGEST_SECRET` : il reçoit une
 *   clé par créneau, valable jusqu'à la fin de celui-ci.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Database, Queryable, Row } from "../db.js";
import { requireAdmin, type AdminContext } from "../lib/auth.js";
import { fail } from "../lib/errors.js";
import { appendAudit } from "./admin.js";
import { claimMessage, notifyChats, notifyRecipients, SLOT_NAMES, telegramEnabled, testMessage, recipientChatIds } from "../services/telegram.js";
import {
  doualaDay,
  ensureNightSlots,
  newNightKey,
  nightKeyHash,
  refreshSlotStates,
  SLOT_COLUMNS,
  slotEnd,
  type NightSlotRow,
} from "../services/poolWatch.js";
import { env } from "../config.js";

const PREFIX = "/v1/admin";
const TIMEZONE = "Africa/Douala";

/** Accès aux créneaux de nuit : owner, ou rôle plateforme `reseau` (D120). */
async function requireNightManager(db: Database, req: FastifyRequest): Promise<AdminContext> {
  const admin = await requireAdmin(db, req);
  if (admin.platformRole === "owner") return admin;
  const role = await db.one<Row>(
    "SELECT role FROM admin_platform_roles WHERE admin_id = $1 AND role = 'reseau'",
    [admin.adminId],
  );
  if (!role) throw fail.forbidden("Action non autorisée pour votre rôle.");
  return admin;
}

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

/** Projection lue : colonnes du créneau, noms des personnes et du nœud lié. */
const VIEW_SELECT = `
  SELECT ${SLOT_COLUMNS},
         (s.deploy_key_hash IS NOT NULL AND s.bound_deployment_key IS NULL) AS key_issued,
         c.name AS claimed_name,
         d.name AS deployed_name,
         e.label AS endpoint_label,
         e.status AS endpoint_status,
         e.health AS endpoint_health,
         e.expires_at AS endpoint_expires_at
    FROM night_slots s
    LEFT JOIN admin_users c ON c.id = s.claimed_by
    LEFT JOIN admin_users d ON d.id = s.deployed_by
    LEFT JOIN endpoints e ON e.id = s.endpoint_id`;

type ViewRow = NightSlotRow & {
  key_issued: boolean | null;
  claimed_name: string | null;
  deployed_name: string | null;
  endpoint_label: string | null;
  endpoint_status: string | null;
  endpoint_health: string | null;
  endpoint_expires_at: Date | string | null;
};

/** Ce qui sort vers le dashboard : jamais la clé, jamais l'empreinte, jamais le déploiement. */
function slotDto(row: ViewRow, now: Date) {
  const keyExpires = row.deploy_key_expires_at ? new Date(row.deploy_key_expires_at) : null;
  const keyPending = row.key_issued === true && keyExpires !== null && keyExpires > now;
  return {
    slotId: row.id,
    day: row.day,
    slot: row.slot,
    label: SLOT_NAMES[row.slot],
    startsAt: iso(row.starts_at),
    endsAt: iso(row.ends_at),
    state: row.state,
    claimedBy: row.claimed_by ? { id: row.claimed_by, name: row.claimed_name ?? "" } : null,
    claimedAt: iso(row.claimed_at),
    deployedBy: row.deployed_by ? { id: row.deployed_by, name: row.deployed_name ?? "" } : null,
    keyPending,
    keyExpiresAt: keyPending ? iso(row.deploy_key_expires_at) : null,
    endpoint: row.endpoint_id
      ? {
          endpointId: row.endpoint_id,
          label: row.endpoint_label ?? "",
          status: row.endpoint_status ?? "",
          health: row.endpoint_health ?? "",
          expiresAt: iso(row.endpoint_expires_at),
        }
      : null,
  };
}

async function loadSlotView(db: Queryable, slotId: string, now: Date) {
  const row = await db.one<ViewRow>(`${VIEW_SELECT} WHERE s.id = $1`, [slotId]);
  if (!row) throw fail.notFound("Créneau introuvable.");
  return slotDto(row, now);
}

async function loadSlotRow(db: Queryable, slotId: string): Promise<NightSlotRow> {
  const row = await db.one<NightSlotRow>(`SELECT ${SLOT_COLUMNS} FROM night_slots s WHERE s.id = $1`, [slotId]);
  if (!row) throw fail.notFound("Créneau introuvable.");
  return row;
}

export function registerAdminNightRoutes(app: FastifyInstance, db: Database): void {
  /**
   * Créneaux du jour (y compris ceux déjà finis aujourd'hui) et des deux jours
   * suivants. Heure de Douala.
   */
  app.get(`${PREFIX}/night-slots`, async (req) => {
    await requireNightManager(db, req);
    const now = new Date();
    await ensureNightSlots(db, now);
    await refreshSlotStates(db, now);

    const today = doualaDay(now);
    const horizon = doualaDay(new Date(now.getTime() + 2 * 86_400_000));
    const rows = await db.query<ViewRow>(
      `${VIEW_SELECT} WHERE s.day >= $1::date AND s.day <= $2::date ORDER BY s.starts_at`,
      [today, horizon],
    );
    const views = rows.map((row) => slotDto(row, now));
    return {
      timezone: TIMEZONE,
      now: now.toISOString(),
      today: views.filter((view) => view.day === today),
      upcoming: views.filter((view) => view.day !== today),
    };
  });

  /** Historique : créneaux terminés, les plus récents d'abord. */
  app.get(`${PREFIX}/night-slots/history`, async (req) => {
    await requireNightManager(db, req);
    const now = new Date();
    const rows = await db.query<ViewRow>(
      `${VIEW_SELECT} WHERE s.ends_at <= $1 ORDER BY s.starts_at DESC LIMIT 40`,
      [now],
    );
    return { timezone: TIMEZONE, slots: rows.map((row) => slotDto(row, now)) };
  });

  /**
   * « Je m'en occupe ». Un seul membre à la fois ; les autres destinataires
   * Telegram sont prévenus. Refusé si le créneau est fini ou déjà pris.
   */
  app.post<{ Params: { slotId: string } }>(`${PREFIX}/night-slots/:slotId/claim`, async (req) => {
    const admin = await requireNightManager(db, req);
    const now = new Date();
    const slot = await loadSlotRow(db, req.params.slotId);
    if (new Date(slot.ends_at) <= now) throw fail.conflict("Ce créneau est terminé.");

    const taken = await db.one<Row>(
      `UPDATE night_slots SET claimed_by = $2, claimed_at = $3
        WHERE id = $1 AND (claimed_by IS NULL OR claimed_by = $2)
        RETURNING id`,
      [slot.id, admin.adminId, now],
    );
    if (!taken) {
      const holder = await db.one<Row>("SELECT name FROM admin_users WHERE id = $1", [slot.claimed_by]);
      throw fail.conflict(`Déjà pris en charge par ${String(holder?.name ?? "un autre membre")}.`);
    }

    await appendAudit(db, admin, req, {
      action: "night_slot.claim",
      targetType: "night_slot",
      targetId: slot.id,
      after: { day: slot.day, slot: slot.slot },
    });

    // Les autres sont prévenus, sans attendre Telegram pour répondre.
    const text = claimMessage({ adminName: String(admin.admin.name ?? ""), slot: slot.slot, startsAt: new Date(slot.starts_at) });
    void notifyRecipients(db, text).catch(() => undefined);

    return loadSlotView(db, slot.id, now);
  });

  /**
   * Clé de déploiement à usage unique, pour un créneau sans nœud lié. Affichée
   * une seule fois, dans cette réponse. `Cache-Control: no-store`.
   */
  app.post<{ Params: { slotId: string } }>(`${PREFIX}/night-slots/:slotId/deploy-key`, async (req, reply) => {
    const admin = await requireNightManager(db, req);
    const now = new Date();
    const slot = await loadSlotRow(db, req.params.slotId);
    if (new Date(slot.ends_at) <= now) throw fail.conflict("Ce créneau est terminé.");
    if (slot.bound_deployment_key) throw fail.conflict("Un nœud est déjà déployé pour ce créneau.");

    const key = newNightKey();
    const issued = await db.one<Row>(
      `UPDATE night_slots
          SET deploy_key_hash = $2, deploy_key_expires_at = $3, deployed_by = $4
        WHERE id = $1 AND bound_deployment_key IS NULL AND ends_at > $5
        RETURNING id`,
      [slot.id, nightKeyHash(key), slotEnd(new Date(slot.starts_at)), admin.adminId, now],
    );
    if (!issued) throw fail.conflict("Ce créneau n'accepte plus de clé.");

    await appendAudit(db, admin, req, {
      action: "night_slot.deploy_key",
      targetType: "night_slot",
      targetId: slot.id,
      after: { day: slot.day, slot: slot.slot },
    });

    reply.header("cache-control", "no-store");
    return reply.code(201).send({
      slotId: slot.id,
      key,
      variable: "ENDPOINT_INGEST_SECRET",
      expiresAt: iso(slotEnd(new Date(slot.starts_at))),
      note: "Clé affichée une seule fois. Elle ne vaut que pour ce créneau et ce déploiement.",
    });
  });

  /**
   * Message de test à tous les destinataires (owners et reseau). Owner seul.
   * Le retour ne contient que le nombre de destinataires, jamais leurs identifiants.
   */
  app.post(`${PREFIX}/telegram/test`, async (req) => {
    const admin = await requireAdmin(db, req);
    if (admin.platformRole !== "owner") throw fail.forbidden("Action non autorisée pour votre rôle.");
    if (!telegramEnabled()) {
      throw fail.conflict("Telegram est désactivé : TELEGRAM_ENABLED et TELEGRAM_BOT_TOKEN doivent être renseignés.");
    }
    const chats = await recipientChatIds(db);
    if (chats.length === 0) {
      throw fail.conflict("Aucun destinataire : renseignez un identifiant Telegram sur un compte owner ou reseau.");
    }
    const delivered = await notifyChats(chats, testMessage());
    return { delivered, recipients: chats.length, timezone: TIMEZONE, deployWarnMinutes: env.telegram.deployWarnMinutes };
  });
}
