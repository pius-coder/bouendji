/**
 * Telegram is an operations channel, not a data channel.
 *
 * A notification may say "le créneau de 20 h commence dans 15 min". It may never
 * carry a configuration, a UUID, a WebSocket path, a deployment key or a payment
 * credential. The `scrub` pass below is not decoration: it is the guarantee, and
 * it runs on every message, including the ones written in a hurry.
 *
 * Destinataires (D119/D120) : les `telegram_chat_id` des comptes actifs de rôle
 * `owner` et `reseau`, plus l'ancien `TELEGRAM_CHAT_ID` s'il est défini.
 */
import type { Queryable } from "../db.js";
import { env } from "../config.js";

const QUEUE_GAP_MS = 1_100; // Telegram tolerates ~1 msg/s per chat.
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_LENGTH = 3_800; // Under the 4 096 limit, leaves room for the HTML tags.
const MAX_ATTEMPTS = 2; // Un envoi échoué est réessayé une fois.
const RETRY_PAUSE_MS = 2_000;

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const VLESS_RE = /vless:\/\/[^\s<]+/gi;
const BEARER_RE = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi;
const DEPLOY_KEY_RE = /\bnk_[A-Za-z0-9_-]{20,}/g;

/** Removes anything that would turn a notification into a credential leak. */
export function scrub(text: string): string {
  return text
    .replace(VLESS_RE, "[configuration masquée]")
    .replace(UUID_RE, "[identifiant masqué]")
    .replace(BEARER_RE, "$1[jeton masqué]")
    .replace(DEPLOY_KEY_RE, "[clé masquée]");
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

/** Jeton du bot configuré et interrupteur ouvert. Les destinataires viennent de la base. */
export function telegramEnabled(): boolean {
  return env.telegram.enabled && env.telegram.botToken.length > 0;
}

/**
 * Messages are serialised: two alerts a second apart would be throttled by
 * Telegram and the second one lost. Ordering matters for an ops channel.
 */
let chain: Promise<unknown> = Promise.resolve();
let lastSentAt = 0;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendOnce(text: string, chatId: string): Promise<{ ok: boolean; retryAfter?: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.telegram.botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => null)) as { parameters?: { retry_after?: number } } | null;
    return { ok: false, retryAfter: body?.parameters?.retry_after };
  } catch {
    // Network error, timeout, DNS: an alert that fails must never throw into
    // the request that triggered it.
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/** Un destinataire, deux essais au plus. Telegram indique la pause à respecter (plafonnée). */
async function deliver(text: string, chatId: string): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await sendOnce(text, chatId);
    if (result.ok) return true;
    if (attempt < MAX_ATTEMPTS) {
      const pause = result.retryAfter !== undefined ? Math.min(result.retryAfter, 30) * 1_000 : RETRY_PAUSE_MS;
      await sleep(pause);
    }
  }
  return false;
}

/**
 * Envoie à chaque destinataire, dans la file commune. Résout `true` seulement si
 * tous les destinataires ont reçu le message. Ne lève jamais : un appelant peut
 * `void` l'appel depuis une requête.
 */
export function notifyChats(chatIds: string[], text: string): Promise<boolean> {
  const recipients = [...new Set(chatIds.filter((id) => id.length > 0))];
  if (!telegramEnabled() || recipients.length === 0) return Promise.resolve(false);
  const message = scrub(text).slice(0, MAX_LENGTH);

  const job = chain.then(async () => {
    let allDelivered = true;
    for (const chatId of recipients) {
      const wait = QUEUE_GAP_MS - (Date.now() - lastSentAt);
      if (wait > 0) await sleep(wait);
      const ok = await deliver(message, chatId);
      lastSentAt = Date.now();
      allDelivered = allDelivered && ok;
    }
    return allDelivered;
  });

  chain = job.catch(() => undefined);
  return job;
}

/**
 * Identifiants de discussion des destinataires : owners et réseau actifs, plus
 * l'ancien `TELEGRAM_CHAT_ID`. Dédoublonnés. Lit `admin_platform_roles` (R1).
 */
export async function recipientChatIds(db: Queryable): Promise<string[]> {
  const rows = await db.query<{ chat_id: string }>(
    `SELECT DISTINCT telegram_chat_id AS chat_id
       FROM admin_users
      WHERE active = true
        AND telegram_chat_id IS NOT NULL
        AND telegram_chat_id <> ''
        AND (platform_role = 'owner'
             OR id IN (SELECT admin_id FROM admin_platform_roles WHERE role IN ('owner', 'reseau')))`,
  );
  const ids = rows.map((row) => String(row.chat_id));
  if (env.telegram.chatId.length > 0) ids.push(env.telegram.chatId);
  return [...new Set(ids)];
}

/** Envoie à tous les destinataires lus en base. */
export async function notifyRecipients(db: Queryable, text: string): Promise<boolean> {
  return notifyChats(await recipientChatIds(db), text);
}

/* ----------------------------------------------------------- message shapes */

const TIME_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Africa/Douala",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Heure locale de Douala, `HH:MM`. */
export function formatDouala(at: Date): string {
  return TIME_FORMAT.format(at).replace(":", "h");
}

export const SLOT_NAMES: Record<"20" | "00", string> = {
  "20": "20 h – 24 h",
  "00": "minuit – 4 h",
};

export interface NightReminder {
  slot: "20" | "00";
  startsAt: Date;
  /** Négatif quand le créneau a commencé. */
  minutesLeft: number;
  /** Premier rappel (15 min avant) ou relance (toutes les 5 min). */
  first: boolean;
}

/**
 * Le rappel qui compte : un nœud doit exister **avant** la fin du créneau
 * précédent, pas après. Le message ne contient jamais de clé ni d'identifiant.
 */
export function nightReminder(input: NightReminder): string {
  const name = SLOT_NAMES[input.slot];
  const at = formatDouala(input.startsAt);
  const headline =
    input.minutesLeft > 0
      ? input.first
        ? `<b>Créneau de nuit dans ${input.minutesLeft} min</b>`
        : `<b>Relance : créneau de nuit dans ${input.minutesLeft} min</b>`
      : `<b>Créneau de nuit en cours</b>`;
  const state =
    input.minutesLeft > 0
      ? `Aucun nœud actif pour ce créneau.`
      : `Aucun nœud actif depuis ${Math.abs(input.minutesLeft)} min.`;
  return [
    headline,
    ``,
    `Créneau ${escapeHtml(name)}, début à <b>${at}</b> (heure de Douala).`,
    state,
    `Déployez un nœud depuis l'espace Réseau du tableau de bord.`,
  ].join("\n");
}

export function testMessage(): string {
  return [
    `<b>Test Telegram</b>`,
    ``,
    `Ce message confirme que le bot peut vous joindre pour les rappels de créneaux de nuit.`,
    `Aucune donnée de connexion n'est envoyée sur ce canal.`,
  ].join("\n");
}

export function claimMessage(input: { adminName: string; slot: "20" | "00"; startsAt: Date }): string {
  return [
    `<b>Créneau pris en charge</b>`,
    ``,
    `${escapeHtml(input.adminName)} s'occupe du créneau ${escapeHtml(SLOT_NAMES[input.slot])} (${formatDouala(input.startsAt)}).`,
  ].join("\n");
}

export function paymentReceived(input: { amountXaf: number; plan: string; community: string }): string {
  return [
    `<b>Paiement confirmé</b>`,
    ``,
    `${input.amountXaf} XAF — ${escapeHtml(input.plan)}`,
    `Communauté : ${escapeHtml(input.community)}`,
  ].join("\n");
}
