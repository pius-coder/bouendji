/**
 * Règles de l'onboarding en libre-service (R4) : numéro et lien WhatsApp, lien
 * `wa.me` prêt à envoyer, mot de passe temporaire généré côté serveur, logo.
 *
 * Tout est pur (aucune base, aucune requête) : les routes décident, ce module
 * dit si une valeur est acceptable et ce qu'elle devient.
 */
import { createHash, randomInt } from "node:crypto";

/** Numéro WhatsApp : 9 chiffres, préfixe `+237` facultatif. Stocké sur 9 chiffres. */
const WHATSAPP_NUMBER_RE = /^(?:\+237)?(\d{9})$/;
/** Lien d'invitation d'un groupe WhatsApp. */
const WHATSAPP_GROUP_RE = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9_-]{8,128}$/;

export const MAX_LOGO_BYTES = 1_048_576;
export const LOGO_MIMES = ["image/png", "image/svg+xml"] as const;
export type LogoMime = (typeof LOGO_MIMES)[number];

/** Retourne les 9 chiffres, ou `null` si la valeur n'est pas un numéro camerounais valide. */
export function normalizeWhatsappNumber(input: string): string | null {
  const compact = input.replace(/[\s-]/g, "");
  const match = WHATSAPP_NUMBER_RE.exec(compact);
  return match ? (match[1] ?? null) : null;
}

export function isWhatsappGroupUrl(input: string): boolean {
  return input.length <= 200 && WHATSAPP_GROUP_RE.test(input);
}

/** Lien `wa.me` prêt à ouvrir, avec le texte déjà rédigé. */
export function waMeLink(nineDigits: string, text: string): string {
  return `https://wa.me/237${nineDigits}?text=${encodeURIComponent(text)}`;
}

/**
 * Mot de passe temporaire de 16 caractères, sans caractères ambigus (0/O, 1/l/I).
 * `randomInt` est cryptographique. Il n'est jamais stocké en clair : seul son
 * hachage (`hashPassword`) va en base, et la valeur n'est renvoyée qu'une fois.
 */
const TEMP_ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateTemporaryPassword(length = 16): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += TEMP_ALPHABET[randomInt(TEMP_ALPHABET.length)];
  }
  return out;
}

/**
 * Identifiant de communauté dérivé d'un nom : minuscules sans accents, tirets.
 * Retourne `null` si le résultat est trop court pour un slug valide.
 */
export function slugFromName(name: string): string | null {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return slug.length >= 2 ? slug : null;
}

/**
 * Identifiant de paquet d'une application, calculé côté serveur à partir du
 * slug de la communauté : `cm.<segments>.vpn`, tirets remplacés par `_` (règle
 * `PACKAGE_SEGMENT_RE` de `lib/brand.ts`). La validation finale reste celle de
 * `validateBrandSpec` : un segment réservé Java ou la marque de référence y est
 * refusé avec un 422 nommant `packageName`.
 */
export function packageNameForCommunity(communitySlug: string): string {
  let segment = communitySlug.replace(/-/g, "_");
  if (!/^[a-z]/.test(segment)) segment = `c${segment}`;
  return `cm.${segment}.vpn`;
}

export interface ValidLogo {
  mime: LogoMime;
  bytes: Buffer;
  sha256: string;
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Un SVG ne doit jamais exécuter de script ni charger de ressource externe. */
const SVG_FORBIDDEN = [/<script/i, /<foreignObject/i, /<!DOCTYPE/i, /<!ENTITY/i, /\son[a-z]+\s*=/i, /javascript:/i, /<iframe/i];

/**
 * Valide un logo envoyé en base64. Lève une erreur de message court (pour la
 * route, qui le transforme en 422) si le type, la taille ou le contenu ne
 * correspondent pas. Le contenu est contrôlé, pas seulement le `mime` déclaré.
 */
export function validateLogo(mime: string, dataB64: string): ValidLogo | string {
  if (!(LOGO_MIMES as readonly string[]).includes(mime)) return "PNG ou SVG attendu.";
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(dataB64)) return "base64 attendu.";
  const bytes = Buffer.from(dataB64, "base64");
  if (bytes.length === 0) return "fichier vide.";
  if (bytes.length > MAX_LOGO_BYTES) return "1 Mo maximum.";

  if (mime === "image/png") {
    if (!bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) return "le fichier n'est pas un PNG.";
  } else {
    const text = bytes.toString("utf8");
    if (!/<svg[\s>]/i.test(text)) return "le fichier n'est pas un SVG.";
    if (SVG_FORBIDDEN.some((re) => re.test(text))) return "SVG refusé : scripts, événements ou ressources externes interdits.";
  }

  return {
    mime: mime as LogoMime,
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
