/**
 * Lecture d'un lien VLESS collé par l'admin (D107), dans le navigateur seulement :
 * il pré-remplit le formulaire d'ajout manuel et n'est ni envoyé tel quel, ni
 * journalisé, ni stocké. Seule la forme servie par `POST /v1/admin/endpoints/manual`
 * est acceptée : transport WebSocket + TLS.
 */
export interface VlessFields {
  uuid: string;
  address: string;
  port: string;
  sni: string;
  hostHeader: string;
  wsPath: string;
  label: string;
}

export type VlessParse = { ok: true; fields: VlessFields } | { ok: false; error: string };

/**
 * Bloc de plusieurs liens (un par ligne). Utilisé par l'import en lot : le
 * nombre affiché est celui des liens réellement distincts.
 */
export function parseVlessLinks(raw: string): { ok: true; fields: VlessFields[] } | { ok: false; error: string } {
  const matches = raw.match(/vless:\/\/[^\s"'<>]+/gi) ?? [];
  if (matches.length === 0) return { ok: false, error: "Aucun lien vless:// trouvé." };
  const seen = new Set<string>();
  const fields: VlessFields[] = [];
  for (const [index, match] of matches.entries()) {
    const parsed = parseVlessLink(match.replace(/[),;]+$/, ""));
    if (!parsed.ok) return { ok: false, error: `Lien ${index + 1} : ${parsed.error}` };
    const key = [parsed.fields.address, parsed.fields.port, parsed.fields.sni, parsed.fields.hostHeader, parsed.fields.wsPath].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    fields.push(parsed.fields);
  }
  return { ok: true, fields };
}

const SCHEME = "vless:";

export function parseVlessLink(raw: string): VlessParse {
  const text = raw.trim();
  if (!text.toLowerCase().startsWith(SCHEME)) return { ok: false, error: "Le lien doit commencer par vless://." };
  let url: URL;
  try {
    // `URL` ne sait pas lire un schéma inconnu avec autorité : on passe par https.
    url = new URL(`https${text.slice(SCHEME.length - 1)}`);
  } catch {
    return { ok: false, error: "Lien illisible." };
  }
  const q = url.searchParams;
  const type = (q.get("type") ?? "tcp").toLowerCase();
  const security = (q.get("security") ?? "none").toLowerCase();
  if (type !== "ws") return { ok: false, error: `Transport « ${type} » non pris en charge : seul WebSocket (ws) l'est.` };
  if (security !== "tls") return { ok: false, error: `Sécurité « ${security} » non prise en charge : seul TLS l'est.` };
  const uuid = decodeURIComponent(url.username);
  if (!uuid) return { ok: false, error: "UUID absent du lien." };
  const address = url.hostname.replace(/^\[|\]$/g, "");
  const hostHeader = q.get("host") ?? "";
  const sni = q.get("sni") ?? q.get("serverName") ?? hostHeader ?? address;
  return {
    ok: true,
    fields: {
      uuid,
      address,
      port: url.port || "443",
      sni: sni || address,
      hostHeader: hostHeader && hostHeader !== sni ? hostHeader : "",
      wsPath: q.get("path") || "/",
      label: decodeURIComponent(url.hash.replace(/^#/, "")).slice(0, 40),
    },
  };
}
