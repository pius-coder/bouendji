/**
 * Telegram is an operations channel, not a data channel.
 *
 * A notification may say "the node dies in 20 minutes". It may never carry a
 * configuration, a UUID, a WebSocket path or a payment credential. The `scrub`
 * pass below is not decoration: it is the guarantee, and it runs on every
 * message, including the ones written in a hurry.
 */
import { env } from "../config.js";

const QUEUE_GAP_MS = 1_100; // Telegram tolerates ~1 msg/s per chat.
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_LENGTH = 3_800; // Under the 4 096 limit, leaves room for the HTML tags.

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const VLESS_RE = /vless:\/\/[^\s<]+/gi;
const BEARER_RE = /\b(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}/gi;

/** Removes anything that would turn a notification into a credential leak. */
export function scrub(text: string): string {
  return text
    .replace(VLESS_RE, "[configuration masquée]")
    .replace(UUID_RE, "[identifiant masqué]")
    .replace(BEARER_RE, "$1[jeton masqué]");
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c);
}

export function telegramEnabled(): boolean {
  return env.telegram.enabled && env.telegram.botToken.length > 0 && env.telegram.chatId.length > 0;
}

/**
 * Messages are serialised: two alerts a second apart would be throttled by
 * Telegram and the second one lost. Ordering matters for an ops channel.
 */
let chain: Promise<unknown> = Promise.resolve();
let lastSentAt = 0;

async function sendOnce(text: string): Promise<{ ok: boolean; retryAfter?: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.telegram.botToken}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: env.telegram.chatId,
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

/**
 * Fire-and-forget by contract: resolves `false` instead of throwing, so a
 * caller can `void notify(...)` inside a request handler safely.
 */
export async function notify(text: string): Promise<boolean> {
  if (!telegramEnabled()) return false;
  const message = scrub(text).slice(0, MAX_LENGTH);

  const job = chain.then(async () => {
    const wait = QUEUE_GAP_MS - (Date.now() - lastSentAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));

    let result = await sendOnce(message);
    if (!result.ok && result.retryAfter !== undefined) {
      // Telegram said exactly how long to wait; respect it, capped so a rogue
      // value cannot park the queue for an hour.
      await new Promise((resolve) => setTimeout(resolve, Math.min(result.retryAfter ?? 5, 30) * 1_000));
      result = await sendOnce(message);
    }
    lastSentAt = Date.now();
    return result.ok;
  });

  chain = job.catch(() => undefined);
  return job;
}

/* ----------------------------------------------------------- message shapes */

export interface DeployReminder {
  minutesLeft: number;
  activeCount: number;
  service: string;
  region: string;
}

/**
 * The one reminder that actually matters: a new node must exist *before* the
 * current one expires, not after. Deploying takes longer than the drain window.
 */
export function deployReminder(input: DeployReminder): string {
  const sign = input.minutesLeft < 0 ? "expiré depuis" : "expire dans";
  const rest = Math.abs(input.minutesLeft);
  return [
    `<b>Déployer un nouveau nœud</b>`,
    ``,
    `Le dernier nœud actif ${sign} <b>${rest} min</b>.`,
    `Nœuds actifs : ${input.activeCount}.`,
    `Service : <code>${escapeHtml(input.service)}</code> — région <code>${escapeHtml(input.region)}</code>.`,
    ``,
    `Rappel : une révision Cloud Run vit 4 h 30. Passé le drain, les clients déjà servis continuent, les nouveaux n'en reçoivent plus.`,
  ].join("\n");
}

export function noEndpoint(): string {
  return [
    `<b>Aucun nœud actif</b>`,
    ``,
    `Le pool est vide : les applications ne peuvent plus tirer de configuration.`,
    `Vérifiez les logs du conteneur, puis redéployez.`,
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
