import { NO_VALUE } from "@/lib/format";

/**
 * Mise à plat d'une valeur « avant » ou « après » du journal en lignes clé / valeur.
 * Fonction pure (sans React) : testée dans `test/network-audit.test.ts`.
 *
 * - Un objet devient une ligne par champ ; un objet imbriqué garde son chemin
 *   (`commission.bps`), jusqu'à `MAX_DEPTH` niveaux, puis se résume (« 3 champs »).
 * - Une valeur longue est tronquée ; un tableau de scalaires devient une liste.
 * - Une valeur absente (`null`) s'affiche « — ».
 */

/** Longueur maximale d'une valeur affichée, au-delà : troncature avec « … ». */
export const MAX_VALUE_LENGTH = 120;
/** Au-delà de ce niveau d'imbrication, un objet est résumé et non développé. */
export const MAX_DEPTH = 3;

export interface AuditRow {
  key: string;
  value: string;
}

export function truncateText(text: string, max: number = MAX_VALUE_LENGTH): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export function auditValueRows(value: unknown): AuditRow[] {
  if (value === null || value === undefined) return [];
  const rows: AuditRow[] = [];
  collect(value, "", 0, rows);
  return rows;
}

function collect(value: unknown, path: string, depth: number, rows: AuditRow[]): void {
  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      rows.push({ key: path || "valeur", value: "(vide)" });
      return;
    }
    for (const [name, child] of entries) {
      const key = path ? `${path}.${name}` : name;
      if (isPlainObject(child) && depth < MAX_DEPTH) collect(child, key, depth + 1, rows);
      else rows.push({ key: truncateText(key, 60), value: describe(child) });
    }
    return;
  }
  rows.push({ key: path || "valeur", value: describe(value) });
}

function describe(value: unknown): string {
  if (value === null || value === undefined) return NO_VALUE;
  if (typeof value === "string") return value === "" ? "(vide)" : truncateText(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "(vide)";
    if (value.every(isScalar)) return truncateText(value.map(describe).join(", "));
    return `${value.length} élément${value.length > 1 ? "s" : ""}`;
  }
  if (isPlainObject(value)) {
    const count = Object.keys(value).length;
    return `${count} champ${count > 1 ? "s" : ""}`;
  }
  return truncateText(String(value));
}

function isScalar(value: unknown): boolean {
  return value === null || value === undefined || ["string", "number", "boolean"].includes(typeof value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
