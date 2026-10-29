import { randomBytes } from "node:crypto";
import { cloudRunLocationOf, type CloudRunLocation } from "./cloudrun.js";

/**
 * VLESS URI construction. Kept in one place because this string is the only
 * thing the client needs, and it is never logged nor stored in clear.
 *
 * Format understood by sing-box / v2rayN / Xray:
 *   vless://<uuid>@<host>:<port>?encryption=none&security=tls&type=ws&...#label
 */
export interface VlessTarget {
  id: string;
  host: string;
  port: number;
  security: "tls" | "none";
  sni?: string | null;
  wsPath?: string | null;
  /** En-tête Host du WebSocket s'il diffère du SNI (domain fronting). */
  hostHeader?: string | null;
  fingerprint?: string | null;
  alpn?: string | null;
  label?: string | null;
}

export function buildVlessUri(target: VlessTarget): string {
  const params = new URLSearchParams();
  params.set("encryption", "none");
  params.set("type", "ws");

  if (target.security === "tls") {
    params.set("security", "tls");
    if (target.sni) params.set("sni", target.sni);
    params.set("fp", target.fingerprint ?? "chrome");
    if (target.alpn) params.set("alpn", target.alpn);
    // The WS Host header must match what the front proxy routes on (CDN/LB).
    params.set("host", target.hostHeader ?? target.sni ?? target.host);
  } else {
    params.set("security", "none");
  }

  if (target.wsPath) params.set("path", target.wsPath);

  const host = target.host.includes(":") && !target.host.startsWith("[") ? `[${target.host}]` : target.host;
  const fragment = target.label ? `#${encodeURIComponent(target.label)}` : "";
  return `vless://${target.id}@${host}:${target.port}?${params.toString()}${fragment}`;
}

/** Test/tooling helper: reads back what buildVlessUri wrote. */
export function parseVlessUri(uri: string): {
  id: string;
  host: string;
  port: number;
  params: Record<string, string>;
  label: string;
} {
  const match = /^vless:\/\/([^@]+)@(\[[^\]]+\]|[^:/?#]+):(\d+)\?([^#]*)(?:#(.*))?$/.exec(uri);
  if (!match) throw new Error(`invalid vless uri: ${uri}`);
  const [, id, rawHost, rawPort, rawQuery, rawLabel] = match;
  const params: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(rawQuery ?? "")) params[key] = value;
  return {
    id: id!,
    host: rawHost!.replace(/^\[|\]$/g, ""),
    port: Number(rawPort),
    params,
    label: rawLabel ? decodeURIComponent(rawLabel) : "",
  };
}

/** Opaque, CDN-friendly path. Looks like any other websocket endpoint. */
export function randomWsPath(): string {
  return `/ws/${randomBytes(9).toString("base64url")}`;
}

/* -------------------------------------------------- ajout manuel d'un nœud */

const NODE_URI_RE = /^vless:\/\/([^@\s/?#]+)@(\[[0-9a-f:.]+\]|[a-z0-9.-]+):(\d{1,5})\?([^#\s]*)(?:#[^\s]*)?$/i;
const UUID_STRICT_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOST_STRICT_RE = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?$/i;

export interface ParsedNodeUri {
  uuid: string;
  host: string;
  port: number;
  wsPath: string;
  sni: string | null;
  /** En-tête Host du WebSocket quand il diffère du SNI et de l'hôte ; sinon null. */
  hostHeader: string | null;
  /** Pays déduit du host Cloud Run (`host=...`), null si le host n'en est pas un. */
  cloudRun: CloudRunLocation | null;
}

/**
 * Extrait tous les liens d'un bloc collé (un par ligne ou séparés par des
 * espaces). Les doublons exacts sont retirés ; l'ordre d'entrée est conservé.
 */
export function extractVlessUris(raw: string): string[] {
  const matches = raw.match(/vless:\/\/[^\s"'<>]+/gi) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rawMatch of matches) {
    const uri = rawMatch.replace(/[),;]+$/, "");
    if (!seen.has(uri)) {
      seen.add(uri);
      out.push(uri);
    }
  }
  return out;
}

/**
 * Lit une URI VLESS collée par un administrateur. Seul le transport WebSocket
 * sous TLS est accepté : c'est le seul que le reste de l'API sait servir.
 *
 * L'erreur ne contient **jamais** l'URI ni l'UUID : elle sert à un message
 * générique, et l'entrée reste hors des journaux.
 */
export function parseNodeVless(raw: string): ParsedNodeUri {
  const fail = (): never => {
    throw new Error("uri-vless-invalide");
  };
  if (typeof raw !== "string" || raw.length > 2048) fail();
  const match = NODE_URI_RE.exec(raw.trim());
  if (!match) fail();
  const [, uuid, rawHost, rawPort, query] = match as unknown as [string, string, string, string, string];

  if (!UUID_STRICT_RE.test(uuid)) fail();
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) fail();

  const params = new URLSearchParams(query ?? "");
  if ((params.get("type") ?? "ws") !== "ws") fail();
  if ((params.get("encryption") ?? "none") !== "none") fail();
  if (params.get("security") !== "tls") fail();

  const host = rawHost.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host.includes(":") && !HOST_STRICT_RE.test(host)) fail();

  const wsPath = params.get("path") ?? "";
  if (!/^\/[^\s?#]{0,199}$/.test(wsPath) || wsPath.includes("//")) fail();

  const sniRaw = params.get("sni");
  const sni = sniRaw ? sniRaw.trim().toLowerCase() : null;
  if (sni !== null && !HOST_STRICT_RE.test(sni)) fail();

  const hostRaw = params.get("host");
  const hostHeader = hostRaw ? hostRaw.trim().toLowerCase() : null;
  if (hostHeader !== null && !HOST_STRICT_RE.test(hostHeader)) fail();

  const effectiveSni = sni ?? host;
  const effectiveHost = hostHeader && hostHeader !== effectiveSni && hostHeader !== host ? hostHeader : null;
  return {
    uuid: uuid.toLowerCase(),
    host,
    port,
    wsPath,
    sni,
    hostHeader: effectiveHost,
    // Le service Cloud Run est dans `host=`, pas dans l'adresse du frontal.
    cloudRun: cloudRunLocationOf(effectiveHost ?? host),
  };
}
