import { randomInt } from "node:crypto";
import { sha256Hex } from "./crypto.js";

/**
 * Noms génériques des nœuds : lisibles à voix haute, sans rien qui identifie
 * l'hôte ni le compte qui le porte. ASCII uniquement (libellés VLESS, Telegram).
 */
const ADJECTIVES = [
  "calme", "vif", "clair", "proche", "rapide", "doux", "libre", "stable",
  "vaste", "brave", "neuf", "fier", "sage", "large", "tendre", "agile",
];
const NOUNS = [
  "faucon", "riviere", "lagon", "colline", "acacia", "baobab", "palmier", "nuage",
  "etoile", "savane", "cascade", "delta", "sommet", "aube", "brise", "orchidee",
];

/** Un nom stable pour une même graine (clé de déploiement, empreinte d'URI). */
export function nodeNameFor(seed: string): string {
  const digest = sha256Hex(seed);
  const a = parseInt(digest.slice(0, 8), 16) % ADJECTIVES.length;
  const b = parseInt(digest.slice(8, 16), 16) % NOUNS.length;
  const n = (parseInt(digest.slice(16, 24), 16) % 90) + 10;
  return `${ADJECTIVES[a]}-${NOUNS[b]}-${n}`;
}

/** Un nom neuf, tiré au hasard, pour l'ajout manuel. */
export function randomNodeName(): string {
  const a = randomInt(ADJECTIVES.length);
  const b = randomInt(NOUNS.length);
  const n = randomInt(10, 100);
  return `${ADJECTIVES[a]}-${NOUNS[b]}-${n}`;
}

/**
 * Fleuves du Cameroun : noms courts, ASCII, lisibles dans la liste des serveurs.
 * Un nœud manuel reçoit `Sanaga 42`, stable pour la même empreinte — republier
 * la même URI ne renomme pas le serveur.
 */
const CAMEROON_RIVERS = [
  "Sanaga", "Wouri", "Nyong", "Nkam", "Mungo", "Dibamba", "Lokundje",
  "Kienke", "Benoue", "Logone", "Chari", "Faro", "Donga", "Mbam", "Noun",
  "Boumba", "Ngoko", "Dja", "Kadei", "Vina", "Pangar", "Mayo-Kebbi",
];

export function cameroonRiverNameFor(seed: string): string {
  const digest = sha256Hex(seed);
  const river = CAMEROON_RIVERS[parseInt(digest.slice(0, 8), 16) % CAMEROON_RIVERS.length]!;
  const n = (parseInt(digest.slice(8, 16), 16) % 90) + 10;
  return `${river} ${n}`;
}
