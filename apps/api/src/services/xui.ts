/**
 * Client de l'API du panneau 3x-ui (forfait limité, D113/D114) et lecture des
 * configurations du forfait limité.
 *
 * Authentification : `Authorization: Bearer <jeton>` (scope admin, jeton créé par
 * `x-ui setting -getApiToken`). Le chemin de base du panneau fait partie de
 * `panel_url` (ex. `https://ctl-aura.numzer0.store/<basePath>`), les chemins
 * d'API sont ajoutés derrière `/panel/api/`.
 *
 * Statut des chemins :
 * - `clients/traffic/:email`, `clients/bulkDisable`, `clients/bulkEnable` :
 *   cités par knowledge/agents/xray-ops/notes/3x-ui-verdict.md et
 *   knowledge/60-research/3x-ui.md. (non vérifié) sur aura-vps.
 * - `clients/list` : vérifié sur aura-vps (200 avec Bearer, 404 sans).
 * - `clients/add` et son corps : (non vérifié). Les notes ne donnent pas le nom
 *   exact des champs ; `totalGB` est envoyé en octets (non vérifié).
 * - `inbounds/get/:id` : (non vérifié). La règle de tunnel
 *   `inbounds/get/[0-9]+` existe (aura-vps-3x-ui.md), elle n'a pas été appelée.
 * - Réponse de `clients/traffic` : `obj.up` et `obj.down` (non vérifié).
 *
 * Aucun message d'erreur ne contient `panel_url` ni le jeton : le chemin de base
 * fait office de secret, il ne doit pas sortir dans un journal.
 */
import type { Queryable, Row } from "../db.js";
import { decryptSecret } from "../lib/crypto.js";
import { buildVlessUri } from "../lib/vless.js";
import type { EndpointRow } from "./endpoints.js";
import type { BundleConfig } from "../routes/bundle.js";

const REQUEST_TIMEOUT_MS = 8_000;

export class XuiError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "XuiError";
    this.status = status;
  }
}

export interface XuiPanel {
  serverId: string;
  panelUrl: string;
  apiToken: string;
  inboundId: number;
}

/** Ligne `xui_servers` convertie en panneau utilisable, jeton déscellé. */
export function panelFromRow(row: Row): XuiPanel {
  return {
    serverId: String(row.id),
    panelUrl: String(row.panel_url),
    apiToken: decryptSecret(String(row.api_token_sealed)),
    inboundId: Number(row.inbound_id),
  };
}

export async function panelFor(db: Queryable, serverId: string): Promise<XuiPanel> {
  const row = await db.one<Row>("SELECT * FROM xui_servers WHERE id = $1", [serverId]);
  if (!row) throw new XuiError("Serveur 3x-ui introuvable.");
  return panelFromRow(row);
}

async function request(panel: XuiPanel, method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
  const url = `${panel.panelUrl.replace(/\/+$/, "")}/panel/api/${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        authorization: `Bearer ${panel.apiToken}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new XuiError(`3x-ui ${method} ${path} : panneau injoignable.`);
  }
  if (!res.ok) throw new XuiError(`3x-ui ${method} ${path} : HTTP ${res.status}.`, res.status);
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new XuiError(`3x-ui ${method} ${path} : réponse non JSON.`, res.status);
  }
  const envelope = (json ?? {}) as { success?: boolean; msg?: unknown; obj?: unknown };
  if (envelope.success === false) {
    const msg = typeof envelope.msg === "string" ? envelope.msg.slice(0, 120) : "sans message";
    throw new XuiError(`3x-ui ${method} ${path} : refus (${msg}).`, res.status);
  }
  return envelope.obj ?? null;
}

export interface NewXuiClient {
  email: string;
  uuid: string;
  /** Quota en octets (non vérifié : champ `totalGB`). */
  quotaBytes: number;
  /** Échéance en millisecondes depuis l'epoch (`expiryTime`). */
  expiresAtMs: number;
}

/** Crée le client dans l'inbound du serveur. (non vérifié) : corps de `clients/add`. */
export async function addClient(panel: XuiPanel, client: NewXuiClient): Promise<void> {
  await request(panel, "POST", "clients/add", {
    client: {
      id: client.uuid,
      email: client.email,
      enable: true,
      totalGB: client.quotaBytes,
      expiryTime: client.expiresAtMs,
      limitIp: 0,
      reset: 0,
    },
    inboundIds: [panel.inboundId],
  });
}

/** Octets consommés par le client (montée + descente), cumulés depuis la création. */
export async function getClientTraffic(panel: XuiPanel, email: string): Promise<number> {
  const obj = (await request(panel, "GET", `clients/traffic/${encodeURIComponent(email)}`)) as
    | { up?: unknown; down?: unknown }
    | null;
  const up = Number(obj?.up ?? 0);
  const down = Number(obj?.down ?? 0);
  if (!Number.isFinite(up) || !Number.isFinite(down)) throw new XuiError("3x-ui clients/traffic : valeurs invalides.");
  return up + down;
}

/**
 * Active ou coupe le client. `bulkDisable` ne touche qu'au champ `enable`
 * (knowledge/60-research/3x-ui.md) : il ne réécrit pas le quota.
 */
export async function setClientEnabled(panel: XuiPanel, email: string, enabled: boolean): Promise<void> {
  await request(panel, "POST", enabled ? "clients/bulkEnable" : "clients/bulkDisable", { emails: [email] });
}

/** Vérifie que le jeton passe et que l'inbound existe. Ne renvoie aucun secret. */
export async function testPanel(panel: XuiPanel): Promise<{ inboundRemark: string | null }> {
  const obj = (await request(panel, "GET", `inbounds/get/${panel.inboundId}`)) as { remark?: unknown } | null;
  if (!obj) throw new XuiError(`3x-ui : inbound ${panel.inboundId} introuvable.`);
  return { inboundRemark: typeof obj.remark === "string" ? obj.remark.slice(0, 80) : null };
}

/* ------------------------------------------------- configurations du limité */

export type NightWindow = "20-24" | "24-04" | "20-04";

/** Créneaux de nuit couverts par une plage achetée (D115). */
export function slotsForWindow(window: NightWindow): Array<"20" | "00"> {
  if (window === "20-24") return ["20"];
  if (window === "24-04") return ["00"];
  return ["20", "00"];
}

export interface LimitedSubscription {
  subscriptionId: string;
  family: "limited" | "limited_night";
  endsAt: Date;
  quotaBytes: number | null;
  nightWindow: NightWindow | null;
  exhausted: boolean;
}

const LIMITED_FAMILIES: readonly string[] = ["limited", "limited_night"];

function toLimited(row: Row): LimitedSubscription | null {
  const family = typeof row.family === "string" ? row.family : null;
  if (!family || !LIMITED_FAMILIES.includes(family)) return null;
  const window = typeof row.night_window === "string" ? row.night_window : null;
  return {
    subscriptionId: String(row.id),
    family: family as LimitedSubscription["family"],
    endsAt: new Date(row.ends_at as string | Date),
    quotaBytes: row.quota_bytes === null || row.quota_bytes === undefined ? null : Number(row.quota_bytes),
    nightWindow: window === "20-24" || window === "24-04" || window === "20-04" ? window : null,
    exhausted: row.exhausted_at !== null && row.exhausted_at !== undefined,
  };
}

/**
 * Lit la famille d'un abonnement. `null` si le forfait n'est pas limité : le
 * chemin des niveaux de nœuds s'applique alors.
 */
export async function loadLimitedSubscription(db: Queryable, subscriptionId: string): Promise<LimitedSubscription | null> {
  const row = await db.one<Row>(
    `SELECT s.id, s.ends_at, s.quota_bytes, s.night_window, s.exhausted_at, p.family
       FROM subscriptions s JOIN plans p ON p.id = s.plan_id
      WHERE s.id = $1`,
    [subscriptionId],
  );
  return row ? toLimited(row) : null;
}

/** Abonnement limité le plus récent d'un compte, actif ou non. */
export async function latestLimitedSubscription(db: Queryable, userId: string): Promise<LimitedSubscription | null> {
  const row = await db.one<Row>(
    `SELECT s.id, s.ends_at, s.quota_bytes, s.night_window, s.exhausted_at, p.family
       FROM subscriptions s JOIN plans p ON p.id = s.plan_id
      WHERE s.user_id = $1 AND p.family IN ('limited', 'limited_night')
      ORDER BY s.ends_at DESC LIMIT 1`,
    [userId],
  );
  return row ? toLimited(row) : null;
}

/**
 * Configuration VLESS du client 3x-ui dédié. `null` tant que le panneau n'a pas
 * confirmé le client : l'appelant ne sert alors rien pour ce forfait. Jamais de
 * repli sur un credential partagé.
 */
export async function xuiLeadConfig(db: Queryable, sub: LimitedSubscription): Promise<BundleConfig | null> {
  const row = await db.one<Row>(
    `SELECT x.uuid_sealed, x.confirmed_at, srv.label, srv.public_host, srv.public_port,
            srv.security, srv.sni, srv.ws_path, srv.ws_host
       FROM xui_clients x
       JOIN subscriptions s ON s.id = x.subscription_id
       JOIN xui_servers srv ON srv.id = s.xui_server_id
      WHERE x.subscription_id = $1`,
    [sub.subscriptionId],
  );
  if (!row || row.confirmed_at === null || row.confirmed_at === undefined) return null;
  const label = String(row.label);
  return {
    id: `xui-${sub.subscriptionId}`,
    label,
    uri: buildVlessUri({
      id: decryptSecret(String(row.uuid_sealed)),
      host: String(row.public_host),
      port: Number(row.public_port),
      security: row.security === "none" ? "none" : "tls",
      sni: (row.sni as string | null) ?? null,
      wsPath: (row.ws_path as string | null) ?? null,
      hostHeader: (row.ws_host as string | null) ?? null,
      label,
    }),
    expiresAt: sub.endsAt.toISOString(),
    region: "limited",
    maxSessionSeconds: 0,
  };
}

/**
 * Nœuds de nuit couverts par la plage achetée, avec le début de leur créneau.
 * Un nœud sans créneau (`night_slot_id` NULL) n'entre jamais ici.
 */
export async function nightRowsFor(
  db: Queryable,
  window: NightWindow,
  drainLeadSeconds: number,
): Promise<{ rows: EndpointRow[]; startsAt: Map<string, string> }> {
  const rows = await db.query<EndpointRow & { slot_starts_at: string | Date }>(
    `SELECT e.*, ns.starts_at AS slot_starts_at
       FROM endpoints e
       JOIN night_slots ns ON ns.id = e.night_slot_id
      WHERE e.status = 'active'
        AND e.health <> 'down'
        AND ns.slot = ANY($1::text[])
        AND ns.ends_at > now()
        AND e.expires_at > now() + ($2::int * interval '1 second')
      ORDER BY ns.starts_at, e.created_at`,
    [slotsForWindow(window), drainLeadSeconds],
  );
  const startsAt = new Map<string, string>();
  for (const row of rows) startsAt.set(row.id, new Date(row.slot_starts_at).toISOString());
  return { rows, startsAt };
}
