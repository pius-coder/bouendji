import { randomBytes } from "node:crypto";
import { env } from "../config.js";
import type { Queryable } from "../db.js";
import { sha256Hex } from "../lib/crypto.js";
import { fail } from "../lib/errors.js";
import { nightReminder, notifyRecipients } from "./telegram.js";

/**
 * Surveille l'*offre*, pas le trafic, et porte les créneaux de nuit (D119, D124).
 *
 * Un nœud de nuit ne peut pas prévenir de sa propre fin : il est parti. L'API
 * connaît le planning, donc elle rappelle :
 *  - un premier rappel `DEPLOY_WARN_MINUTES` (15 min) avant le début du créneau ;
 *  - puis une relance toutes les 5 min tant qu'aucun nœud n'est `active` pour lui ;
 *  - les deux sont portés par un seul verrou : une ligne `alert_state` prise en
 *    `INSERT ... ON CONFLICT ... WHERE` atomiquement. Deux instances qui tickent
 *    en même temps ne peuvent pas gagner toutes les deux ; un envoi échoué libère
 *    la ligne, et le tick suivant réessaie.
 *
 * Fuseau : `Africa/Douala`, calculé par Intl. Tous les créneaux sont donc fixés
 * à l'heure locale, pas à UTC+1 codé en dur.
 */

export type SlotCode = "20" | "00";

/** Début du créneau, heure de Douala. `20` = 20 h – 24 h, `00` = minuit – 4 h. */
const SLOT_HOUR: Record<SlotCode, number> = { "20": 20, "00": 0 };
const SLOT_HOURS = 4;
const DOUALA = "Africa/Douala";
const DAY_MS = 86_400_000;

const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: DOUALA, year: "numeric", month: "2-digit", day: "2-digit" });
const PARTS_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: DOUALA,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Jour civil de Douala (`YYYY-MM-DD`) pour un instant donné. */
export function doualaDay(at: Date): string {
  return DAY_FORMAT.format(at);
}

/** Décalage de Douala par rapport à UTC, en minutes, à cet instant. */
function doualaOffsetMinutes(at: Date): number {
  const parts: Record<string, number> = {};
  for (const part of PARTS_FORMAT.formatToParts(at)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  const wall = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
  const floored = Math.floor(at.getTime() / 1000) * 1000;
  return Math.round((wall - floored) / 60_000);
}

/** Instant réel du début d'un créneau : `day` (Douala) à l'heure du créneau. */
export function slotStart(day: string, slot: SlotCode): Date {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const naive = Date.UTC(y, m - 1, d, SLOT_HOUR[slot], 0, 0);
  return new Date(naive - doualaOffsetMinutes(new Date(naive)) * 60_000);
}

export function slotEnd(startsAt: Date): Date {
  return new Date(startsAt.getTime() + SLOT_HOURS * 3_600_000);
}

export interface NightSlotRow {
  id: string;
  day: string;
  slot: SlotCode;
  starts_at: Date | string;
  ends_at: Date | string;
  state: string;
  claimed_by: string | null;
  claimed_at: Date | string | null;
  deployed_by: string | null;
  deploy_key_expires_at: Date | string | null;
  bound_deployment_key: string | null;
  endpoint_id: string | null;
  reminded_at: Date | string | null;
  escalated_at: Date | string | null;
}

/** Colonnes lues, avec le jour rendu en texte pour éviter le décalage de fuseau du driver. */
export const SLOT_COLUMNS = `s.id, to_char(s.day, 'YYYY-MM-DD') AS day, s.slot, s.starts_at, s.ends_at, s.state,
  s.claimed_by, s.claimed_at, s.deployed_by, s.deploy_key_expires_at, s.bound_deployment_key,
  s.endpoint_id, s.reminded_at, s.escalated_at`;

/**
 * Crée les créneaux d'aujourd'hui et des deux jours suivants (heure de Douala).
 * Idempotent : `ON CONFLICT (day, slot)`.
 */
export async function ensureNightSlots(db: Queryable, now: Date): Promise<void> {
  for (let offset = 0; offset < 3; offset += 1) {
    const day = doualaDay(new Date(now.getTime() + offset * DAY_MS));
    for (const slot of ["20", "00"] as const) {
      const startsAt = slotStart(day, slot);
      await db.query(
        `INSERT INTO night_slots (id, day, slot, starts_at, ends_at)
         VALUES ($1, $2::date, $3, $4, $5)
         ON CONFLICT (day, slot) DO NOTHING`,
        [`ns_${day}_${slot}`, day, slot, startsAt, slotEnd(startsAt)],
      );
    }
  }
}

/**
 * Recalcule l'état d'un créneau à partir du réel : `active` si un nœud tourne,
 * `missed` si le créneau est fini sans nœud, `deployed` si un nœud est lié, sinon
 * `planned`. Seules les lignes qui changent sont écrites.
 */
export async function refreshSlotStates(db: Queryable, now: Date): Promise<void> {
  await db.query(
    `UPDATE night_slots
        SET state = x.next
       FROM (
         SELECT s.id,
                CASE
                  WHEN EXISTS (SELECT 1 FROM endpoints e
                                WHERE e.night_slot_id = s.id AND e.status = 'active') THEN 'active'
                  WHEN s.ends_at <= $1 THEN 'missed'
                  WHEN s.endpoint_id IS NOT NULL THEN 'deployed'
                  ELSE 'planned'
                END AS next
           FROM night_slots s
       ) x
      WHERE night_slots.id = x.id AND night_slots.state <> x.next`,
    [now],
  );
}

/** Une clé de créneau valable (non expirée) : renvoie le créneau, sinon `null`. */
export async function nightSlotForKey(
  db: Queryable,
  key: string,
  now: Date,
): Promise<{ id: string; bound_deployment_key: string | null } | null> {
  return db.one<{ id: string; bound_deployment_key: string | null }>(
    `SELECT id, bound_deployment_key FROM night_slots
      WHERE deploy_key_hash = $1 AND deploy_key_expires_at > $2`,
    [sha256Hex(key), now],
  );
}

/** Empreinte stockée d'une clé de créneau. La clé elle-même n'est jamais persistée. */
export function nightKeyHash(key: string): string {
  return sha256Hex(key);
}

/** Clé de déploiement neuve, 256 bits, préfixée pour reconnaître une fuite. */
export function newNightKey(): string {
  return `nk_${randomBytes(32).toString("base64url")}`;
}

/**
 * Lie un déploiement (`deployment_key`) à un créneau, une seule fois. Un second
 * déploiement qui présente la même clé est refusé. Un redémarrage du même
 * déploiement passe (même `deployment_key`).
 */
export async function bindNightSlot(db: Queryable, slotId: string, deploymentKey: string, now: Date): Promise<void> {
  const rows = await db.query<{ id: string }>(
    `UPDATE night_slots
        SET bound_deployment_key = $2
      WHERE id = $1
        AND deploy_key_expires_at > $3
        AND (bound_deployment_key IS NULL OR bound_deployment_key = $2)
      RETURNING id`,
    [slotId, deploymentKey, now],
  );
  if (rows.length === 0) {
    throw fail.conflict("Cette clé de créneau est déjà liée à un autre déploiement, ou le créneau est terminé.");
  }
}

/** Rattache le nœud enregistré à son créneau. Idempotent (un redémarrage repasse ici). */
export async function attachNodeToSlot(db: Queryable, slotId: string, endpointId: string): Promise<void> {
  await db.query("UPDATE endpoints SET night_slot_id = $2 WHERE id = $1", [endpointId, slotId]);
  await db.query(
    `UPDATE night_slots
        SET endpoint_id = $2,
            state = CASE WHEN state = 'planned' THEN 'deployed' ELSE state END
      WHERE id = $1 AND (endpoint_id IS NULL OR endpoint_id = $2)`,
    [slotId, endpointId],
  );
}

/**
 * Prend le verrou d'une alerte pour `everyMinutes`. Vrai seulement pour l'instance
 * qui gagne l'écriture conditionnelle : c'est le verrou contre les doublons
 * multi-instance (Postgres comme PGlite).
 */
async function claimAlert(db: Queryable, key: string, now: Date, everyMinutes: number): Promise<boolean> {
  const rows = await db.query<{ key: string }>(
    `INSERT INTO alert_state (key, last_sent_at) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET last_sent_at = EXCLUDED.last_sent_at
       WHERE alert_state.last_sent_at <= ($2::timestamptz - ($3::int * interval '1 minute'))
     RETURNING key`,
    [key, now, everyMinutes],
  );
  return rows.length > 0;
}

/** Libère le verrou après un envoi échoué : le tick suivant réessaie. */
async function releaseAlert(db: Queryable, key: string): Promise<void> {
  await db.query("UPDATE alert_state SET last_sent_at = to_timestamp(0) WHERE key = $1", [key]);
}

export type Sender = (text: string) => Promise<boolean>;

export interface PoolWatchState {
  /** Réservé : le verrou vit en base, rien ne reste en mémoire d'une instance. */
}

export interface PoolWatchResult {
  /** Au moins un rappel ou une relance est parti pendant ce tick. */
  sent: boolean;
  /** Clé du dernier verrou pris (`night:<créneau>`), ou `null`. */
  key: string | null;
  /** Nœuds actifs au moment du tick, tous créneaux confondus. */
  activeCount: number;
  /** Minutes avant le début du dernier créneau rappelé (négatif = commencé). */
  minutesLeft: number | null;
}

export function newPoolWatchState(): PoolWatchState {
  return {};
}

/**
 * Un tick du surveillant. Nom conservé pour `server.ts` : c'est la même boucle
 * de 60 s, qui fait désormais les rappels de créneaux de nuit.
 */
export async function checkPoolExpiry(
  db: Queryable,
  _state: PoolWatchState,
  options: { send?: Sender; now?: Date } = {},
): Promise<PoolWatchResult> {
  const now = options.now ?? new Date();
  const send: Sender = options.send ?? ((text) => notifyRecipients(db, text));

  await ensureNightSlots(db, now);
  await refreshSlotStates(db, now);

  const active = await db.one<{ n: number | string }>(
    "SELECT CAST(count(*) AS int) AS n FROM endpoints WHERE status = 'active' AND expires_at > $1",
    [now],
  );
  const activeCount = Number(active?.n ?? 0);

  const due = await db.query<NightSlotRow>(
    `SELECT ${SLOT_COLUMNS} FROM night_slots s
      WHERE s.ends_at > $1
        AND s.starts_at - ($2::int * interval '1 minute') <= $1
        AND s.state <> 'active'
      ORDER BY s.starts_at`,
    [now, env.telegram.deployWarnMinutes],
  );

  let sent = false;
  let key: string | null = null;
  let minutesLeft: number | null = null;

  for (const slot of due) {
    const startsAt = new Date(slot.starts_at);
    const left = Math.ceil((startsAt.getTime() - now.getTime()) / 60_000);
    const claimKey = `night:${slot.id}`;

    if (!(await claimAlert(db, claimKey, now, env.telegram.repeatMinutes))) continue;

    const text = nightReminder({
      slot: slot.slot,
      startsAt,
      minutesLeft: left,
      first: slot.reminded_at === null,
    });
    let delivered = false;
    try {
      delivered = await send(text);
    } catch {
      delivered = false;
    }
    if (!delivered) {
      await releaseAlert(db, claimKey);
      continue;
    }

    await db.query(
      `UPDATE night_slots
          SET reminded_at  = COALESCE(reminded_at, $2),
              escalated_at = CASE WHEN $2::timestamptz >= starts_at THEN COALESCE(escalated_at, $2::timestamptz) ELSE escalated_at END
        WHERE id = $1`,
      [slot.id, now],
    );
    sent = true;
    key = claimKey;
    minutesLeft = left;
  }

  return { sent, key, activeCount, minutesLeft };
}
