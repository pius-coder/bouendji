/**
 * Fonctions pures de la page Applications : aucune dépendance React ni serveur.
 * Testées par `test/builds.test.ts`.
 */

/** Champs de marque manquants renvoyés par l'API (`brandMissing`) et leur libellé. */
export const BRAND_MISSING_LABELS: Record<string, string> = {
  appName: "nom de l'application",
  packageName: "identifiant de paquet",
  theme: "thème",
  supportUrl: "lien d'assistance",
};

/** Liste lisible des champs manquants ; un champ inconnu passe tel quel. */
export function brandMissingText(missing: readonly string[]): string {
  return missing.map((field) => BRAND_MISSING_LABELS[field] ?? field).join(", ");
}

/**
 * Version affichée : « 1.0.0 (3) ». Sans nom, le numéro seul ; sans numéro, le nom
 * seul ; rien, un tiret.
 */
export function formatVersion(versionName: string | null | undefined, versionCode: number | null | undefined): string {
  const name = versionName?.trim() ?? "";
  const hasCode = typeof versionCode === "number" && Number.isInteger(versionCode);
  if (name && hasCode) return `${name} (${versionCode})`;
  if (name) return name;
  if (hasCode) return `code ${versionCode}`;
  return "—";
}

/** Nombre de caractères de l'empreinte SHA-256 affichés ; le reste est dans le `title`. */
export const SHA256_SHORT_LENGTH = 12;

/** Empreinte abrégée (12 premiers caractères), ou `null` quand il n'y en a pas. */
export function shortSha256(sha256: string | null | undefined): string | null {
  const value = sha256?.trim().toLowerCase() ?? "";
  if (value.length === 0) return null;
  return value.slice(0, SHA256_SHORT_LENGTH);
}
