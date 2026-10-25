import { randomBytes } from "node:crypto";

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
