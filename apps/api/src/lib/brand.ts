/**
 * Manifeste de marque (D66) — la validation qui décide, pas la CI.
 *
 * `tools/inject-brand.mjs` refuse un manifeste invalide en sortant 78. Ce
 * chiffre-là est un build rouge 90 secondes plus tard, sans explication dans la
 * console : un admin découvre son erreur après avoir cliqué. Les mêmes règles
 * sont donc appliquées **ici**, avant qu'une ligne de `builds` existe : une
 * violation est un `422` qui nomme le champ fautif, jamais un `exit 78`.
 *
 * Deux champs ne sont jamais saisis (§3.5) :
 *
 *   - `apiBaseUrl` vient de `env.publicBaseUrl` : une seule API pour toutes les
 *     marques, `X-App-Id` départage ;
 *   - `appId` vient de la ligne `apps`, donc de la base.
 *
 * `validateBrandSpec` ne les lit même pas dans son entrée : ce qui n'est pas lu
 * ne peut pas être usurpé. `buildBrandSpec` est le seul chemin qui les pose.
 */
import { env } from "../config.js";
import { ApiFailure } from "./errors.js";

export const BRAND_THEMES = ["billet", "halo", "mono", "vector", "otaku", "sahel", "nebula", "glacier", "ligne"] as const;
export type BrandTheme = (typeof BRAND_THEMES)[number];

/**
 * Champs validés puis stockés dans `apps.brand` (jsonb). Ce sont exactement les
 * champs saisis par un admin (§3.5) : ni `appId`, ni `apiBaseUrl`.
 */
export interface BrandSpec {
  appName: string;
  packageName: string;
  theme: BrandTheme;
  supportUrl: string;
  accent: string | null;
  versionName: string;
  versionCode: number;
  defaultLocale: string;
  offlineBundleSigningKeyB64: string;
  /** Lien du groupe WhatsApp de la communauté (https), ou null. */
  communityWhatsappUrl: string | null;
  /** Numéro WhatsApp de contact de la communauté (chiffres, + facultatif), ou null. */
  contactWhatsapp: string | null;
  /** Référence du logo : URL https ou clé R2 relative, ou null. */
  logoRef: string | null;
}

/**
 * Manifeste final, tel qu'il part chez GitHub (`workflow_dispatch.inputs.spec`)
 * et tel qu'il est rejoué par `inject-brand.mjs`. Le contrat complet de §3.5.
 */
export interface BrandManifest extends BrandSpec {
  appId: string;
  apiBaseUrl: string;
}

/** Marque de référence : un APK de marque ne doit jamais réutiliser ce package. */
const REFERENCE_PACKAGE = "cm.bouendji.vpn";

/** Mots réservés Java : un segment de package qui en est un ne compile pas. */
const JAVA_RESERVED = new Set([
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const",
  "continue", "default", "do", "double", "else", "enum", "extends", "final", "finally", "float",
  "for", "goto", "if", "implements", "import", "instanceof", "int", "interface", "long", "native",
  "new", "package", "private", "protected", "public", "return", "short", "static", "strictfp",
  "super", "switch", "synchronized", "this", "throw", "throws", "transient", "try", "void",
  "volatile", "while", "true", "false", "null",
]);

const PACKAGE_SEGMENT_RE = /^[a-z][a-z0-9_]*$/;
const VERSION_NAME_RE = /^\d+(\.\d+){0,3}([-+][0-9A-Za-z.-]+)?$/;
const ACCENT_RE = /^#[0-9a-fA-F]{6}$/;
const LOCALE_RE = /^[a-z]{2}$/;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const SUPPORT_PROTOCOLS = new Set(["https:", "mailto:", "tel:"]);
const CONTACT_WHATSAPP_RE = /^\+?\d{8,15}$/;
/** Clé R2 relative (ex. brands/x/logo.png) : pas de slash initial, pas de `..`. */
const LOGO_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/;
const MAX_LOGO_REF_LENGTH = 512;

/**
 * Garde-fous qui ne changent rien pour une marque réelle et empêchent un
 * manifeste de casser le build autrement : un saut de ligne dans `appName`
 * sortirait du littéral Kotlin de `BrandTokens.kt` et de `brand.properties`, et
 * une URL ou une clé démesurée dépasserait la limite d'entrée de
 * `workflow_dispatch`.
 */
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;
const MAX_SUPPORT_URL_LENGTH = 2_048;
const MAX_SIGNING_KEY_LENGTH = 4_096;

/** `versionCode` maximal accepté par Android (`android:versionCode` est un int). */
export const MAX_VERSION_CODE = 2_100_000_000;

function invalid(field: string, message: string): ApiFailure {
  return new ApiFailure(422, "VALIDATION_FAILED", `Manifeste de marque invalide : ${message}`, { [field]: message });
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Chaîne non vide, ou null : une colonne vide vaut « non renseigné ». */
function nonEmpty(value: unknown): string | null {
  const trimmed = text(value);
  return trimmed.length > 0 ? trimmed : null;
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw invalid("_", "un objet JSON est attendu.");
  }
  return value as Record<string, unknown>;
}

/**
 * Valide les champs saisis (§3.5). Lève `ApiFailure(422, "VALIDATION_FAILED")`
 * avec `details[champ]` — l'enveloppe d'erreur déjà en place dans `app.ts`.
 *
 * Les valeurs par défaut sont celles d'`inject-brand.mjs` : `accent: null`,
 * `versionName: "1.0.0"`, `versionCode: 1`, `defaultLocale: "fr"`,
 * `offlineBundleSigningKeyB64: ""`. `theme`, `packageName`, `appName` et
 * `supportUrl` sont requis.
 */
export function validateBrandSpec(input: unknown): BrandSpec {
  const raw = record(input);

  /* ------------------------------------------------------------ appName */
  const appName = text(raw.appName);
  if (appName.length < 2 || appName.length > 40) {
    throw invalid("appName", "2 à 40 caractères attendus.");
  }
  if (CONTROL_CHARS_RE.test(appName)) {
    throw invalid("appName", "caractère de contrôle interdit (il casserait BrandTokens.kt).");
  }

  /* -------------------------------------------------------- packageName */
  const packageName = text(raw.packageName);
  const segments = packageName.split(".");
  if (segments.length < 2) {
    throw invalid("packageName", "au moins deux segments attendus (ex. cm.marque.vpn).");
  }
  for (const segment of segments) {
    if (!PACKAGE_SEGMENT_RE.test(segment)) {
      throw invalid(
        "packageName",
        `segment invalide « ${segment} » : minuscules, chiffres et _, et il commence par une lettre.`,
      );
    }
    if (JAVA_RESERVED.has(segment)) {
      throw invalid("packageName", `« ${segment} » est un mot réservé Java.`);
    }
  }
  if (packageName === REFERENCE_PACKAGE) {
    throw invalid("packageName", "package de la marque de référence : fournissez le vôtre.");
  }

  /* -------------------------------------------------------------- theme */
  const theme = text(raw.theme).toLowerCase();
  if (!BRAND_THEMES.includes(theme as BrandTheme)) {
    throw invalid("theme", `theme doit être l'un de ${BRAND_THEMES.join(", ")}.`);
  }

  /* --------------------------------------------------------- supportUrl */
  const supportRaw = text(raw.supportUrl);
  if (supportRaw.length === 0) {
    throw invalid("supportUrl", "requis : c'est le contact affiché quand plus rien ne passe (D19).");
  }
  if (supportRaw.length > MAX_SUPPORT_URL_LENGTH) {
    throw invalid("supportUrl", `${MAX_SUPPORT_URL_LENGTH} caractères au maximum.`);
  }
  let support: URL;
  try {
    support = new URL(supportRaw);
  } catch {
    throw invalid("supportUrl", "URL absolue attendue.");
  }
  if (!SUPPORT_PROTOCOLS.has(support.protocol)) {
    throw invalid("supportUrl", "https:, mailto: ou tel: attendu.");
  }
  // `hostname` est vide pour mailto:/tel: : on regarde aussi la valeur brute
  // pour qu'un `mailto:a@b.invalid` ne passe pas par la porte de derrière.
  if (support.hostname.endsWith(".invalid") || /\.invalid(?:[/:?#]|$)/i.test(supportRaw)) {
    throw invalid("supportUrl", "un domaine .invalid n'est pas un contact.");
  }

  /* ------------------------------------------------------------- accent */
  let accent: string | null = null;
  if (raw.accent !== undefined && raw.accent !== null) {
    if (typeof raw.accent !== "string" || !ACCENT_RE.test(raw.accent)) {
      throw invalid("accent", "#RRGGBB ou null attendu.");
    }
    accent = raw.accent.toUpperCase();
  }

  /* -------------------------------------------------------- versionName */
  const versionNameRaw = raw.versionName ?? "1.0.0";
  const versionName = typeof versionNameRaw === "string" ? versionNameRaw.trim() : "";
  if (!VERSION_NAME_RE.test(versionName)) {
    throw invalid("versionName", "format attendu : 1.0.0 (0 à 3 nombres, suffixe -beta.1 optionnel).");
  }

  /* -------------------------------------------------------- versionCode */
  const versionCodeRaw = raw.versionCode ?? 1;
  if (
    typeof versionCodeRaw !== "number" ||
    !Number.isInteger(versionCodeRaw) ||
    versionCodeRaw < 1 ||
    versionCodeRaw > MAX_VERSION_CODE
  ) {
    throw invalid("versionCode", `entier de 1 à ${MAX_VERSION_CODE} attendu.`);
  }

  /* ------------------------------------------------------ defaultLocale */
  const localeRaw = raw.defaultLocale ?? "fr";
  const defaultLocale = typeof localeRaw === "string" ? localeRaw.trim().toLowerCase() : "";
  if (!LOCALE_RE.test(defaultLocale)) {
    throw invalid("defaultLocale", "deux lettres minuscules attendues (ex. fr).");
  }

  /* ------------------------------------- offlineBundleSigningKeyB64 */
  const keyRaw = raw.offlineBundleSigningKeyB64 ?? "";
  const key = typeof keyRaw === "string" ? keyRaw.trim() : null;
  if (key === null) {
    throw invalid("offlineBundleSigningKeyB64", "chaîne base64 attendue, ou \"\".");
  }
  if (key.length > MAX_SIGNING_KEY_LENGTH) {
    throw invalid("offlineBundleSigningKeyB64", `${MAX_SIGNING_KEY_LENGTH} caractères au maximum.`);
  }
  if (key.length > 0 && !BASE64_RE.test(key)) {
    throw invalid("offlineBundleSigningKeyB64", "base64 attendu, ou \"\".");
  }

  /* ------------------------------------------- communityWhatsappUrl (facultatif) */
  let communityWhatsappUrl: string | null = null;
  const groupRaw = text(raw.communityWhatsappUrl);
  if (groupRaw.length > 0) {
    let group: URL;
    try {
      group = new URL(groupRaw);
    } catch {
      throw invalid("communityWhatsappUrl", "URL absolue attendue.");
    }
    if (group.protocol !== "https:") throw invalid("communityWhatsappUrl", "https: attendu.");
    if (groupRaw.length > MAX_SUPPORT_URL_LENGTH) {
      throw invalid("communityWhatsappUrl", `${MAX_SUPPORT_URL_LENGTH} caractères au maximum.`);
    }
    communityWhatsappUrl = group.toString();
  }

  /* ------------------------------------------- contactWhatsapp (facultatif) */
  let contactWhatsapp: string | null = null;
  const contactRaw = text(raw.contactWhatsapp).replace(/[\s-]/g, "");
  if (contactRaw.length > 0) {
    if (!CONTACT_WHATSAPP_RE.test(contactRaw)) {
      throw invalid("contactWhatsapp", "8 à 15 chiffres, + facultatif en tête.");
    }
    contactWhatsapp = contactRaw;
  }

  /* ----------------------------------------------- logoRef (facultatif) */
  let logoRef: string | null = null;
  const logoRaw = text(raw.logoRef);
  if (logoRaw.length > 0) {
    if (logoRaw.length > MAX_LOGO_REF_LENGTH || CONTROL_CHARS_RE.test(logoRaw)) {
      throw invalid("logoRef", `${MAX_LOGO_REF_LENGTH} caractères au maximum, sans contrôle.`);
    }
    const isHttps = logoRaw.startsWith("https://");
    if (!isHttps && (!LOGO_KEY_RE.test(logoRaw) || logoRaw.includes(".."))) {
      throw invalid("logoRef", "URL https ou clé R2 relative attendue (ex. brands/marque/logo.png).");
    }
    logoRef = logoRaw;
  }

  return {
    appName,
    packageName,
    theme: theme as BrandTheme,
    supportUrl: support.toString(),
    accent,
    versionName,
    versionCode: versionCodeRaw,
    defaultLocale,
    offlineBundleSigningKeyB64: key,
    communityWhatsappUrl,
    contactWhatsapp,
    logoRef,
  };
}

/**
 * Origine publique de l'API, sans slash final. C'est `apiBaseUrl` dans le
 * manifeste **et** la base des URL de callback : les deux doivent sortir de la
 * même valeur, sinon la CI appelle une origine que l'APK n'utilise pas.
 *
 * En production, `inject-brand.mjs` exige `https` sans chemin ; une valeur http
 * ferait échouer la CI à 78 (D66). On refuse ici, avec le champ nommé, plutôt
 * que de laisser partir un build condamné.
 */
export function apiOrigin(): string {
  const base = env.publicBaseUrl.trim().replace(/\/+$/, "");
  if (env.isProduction && !/^https:\/\/[^/?#]+$/.test(base)) {
    throw new ApiFailure(500, "INTERNAL", "PUBLIC_BASE_URL doit être une origine https sans chemin (manifeste de marque).");
  }
  return base;
}

/** `jsonb` est un objet chez pg/PGlite, parfois une chaîne selon le driver. */
function jsonObject(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string" && value.trim().startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // jsonb illisible : les colonnes de `apps` restent la source.
    }
  }
  return {};
}

/**
 * Assemble le manifeste final à partir de la ligne `apps` (jamais d'un corps de
 * requête) et du numéro de version calculé par la route.
 *
 * Les champs de marque repassent par `validateBrandSpec` : une ligne héritée
 * sans `support_url` (par exemple la marque de référence du seed) ne produit pas
 * un build condamné à 78, elle produit un 422 qui nomme `supportUrl`.
 */
export function buildBrandSpec(
  app: Record<string, unknown>,
  versionCode: number,
  versionName: string,
  community: Record<string, unknown> | null = null,
): BrandManifest {
  const stored = jsonObject(app.brand);
  // `community` vient d'une ligne `communities` lue en entier : les colonnes
  // ajoutées par R4 (`whatsapp_group_url`, `contact_whatsapp`) peuvent être
  // absentes d'une base non migrée, elles sont alors simplement « non
  // renseignées ».
  const communityFields = community ?? {};

  const spec = validateBrandSpec({
    appName: typeof app.name === "string" ? app.name : "",
    packageName: typeof app.package_name === "string" ? app.package_name : "",
    theme: typeof app.theme === "string" ? app.theme : stored.theme,
    // La colonne fait foi ; `apps.brand` prend le relais pour une ligne ancienne.
    supportUrl:
      typeof app.support_url === "string" && app.support_url.length > 0 ? app.support_url : stored.supportUrl,
    // Une colonne vide vaut « pas d'accent », comme la valeur par défaut de §3.5.
    accent:
      typeof app.accent === "string" && app.accent.length > 0 ? app.accent : (stored.accent ?? null),
    versionName,
    versionCode,
    defaultLocale: stored.defaultLocale,
    offlineBundleSigningKeyB64: stored.offlineBundleSigningKeyB64,
    communityWhatsappUrl: nonEmpty(communityFields.whatsapp_group_url),
    contactWhatsapp: nonEmpty(communityFields.contact_whatsapp),
    // Le logo de l'app : la clé R2 (R4, `logo_key`) fait foi, sinon l'URL héritée.
    logoRef: nonEmpty(app.logo_key) ?? nonEmpty(app.logo_url),
  });

  const appId = typeof app.id === "string" ? app.id.trim() : "";
  if (appId.length === 0) throw invalid("appId", "ligne `apps` sans identifiant.");

  return { ...spec, appId, apiBaseUrl: apiOrigin() };
}
