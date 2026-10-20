/** Libellés et formats — repris de `apps/admin-legacy/public/app.js`. */

import type { StaffRole } from "./types";

const STATUS_LABEL: Record<string, string> = {
  active: "Actif",
  suspended: "Suspendue",
  disabled: "Désactivé",
  revoked: "Révoqué",
  pending: "En attente",
  paid: "Payée",
  failed: "Échouée",
  refunded: "Remboursée",
  expired: "Expirée",
  healthy: "Sain",
  degraded: "Dégradé",
  down: "Hors service",
  draining: "En drainage",
  available: "Disponible",
  approved: "Approuvé",
  rejected: "Rejeté",
  reversed: "Annulée",
  created: "Créé",
  running: "En cours",
  succeeded: "Réussi",
  unknown: "Inconnu",
};

const ROLE_LABEL: Record<StaffRole, string> = {
  community_admin: "Administrateur de communauté",
  support: "Support",
  finance: "Finance",
};

export function statusLabel(value: string): string {
  const key = value.toLowerCase();
  return STATUS_LABEL[key] ?? (key || "Inconnu");
}

export function roleLabel(value: string): string {
  if (value === "owner") return "Propriétaire";
  return ROLE_LABEL[value as StaffRole] ?? (value || "—");
}

const intFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });

export function intFormat(value: number | null): string {
  return value === null ? "—" : intFormatter.format(value);
}

export function countLabel(count: number | null, singular: string, plural: string): string {
  if (count === null) return "—";
  return `${intFormat(count)} ${count === 1 ? singular : plural}`;
}

export function money(value: number | null): string {
  return value === null ? "—" : `${intFormat(value)}\u00a0XAF`;
}

export function bpsPercent(value: number | null): string {
  if (value === null) return "—";
  return `${(value / 100).toFixed(2).replace(".", ",")}\u00a0%`;
}

export function dateTime(value: string | null): string {
  if (!value) return "—";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "—";
  return dateFormatter.format(new Date(time));
}

export function relative(value: string | null): string {
  if (!value) return "—";
  const diff = Date.parse(value) - Date.now();
  if (!Number.isFinite(diff)) return "—";
  const abs = Math.abs(diff);
  const minutes = Math.round(abs / 60_000);
  if (minutes < 1) return diff >= 0 ? "dans moins d’une minute" : "à l’instant";
  if (minutes < 60) return diff >= 0 ? `dans ${minutes} min` : `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 48) {
    const base = diff >= 0 ? `dans ${hours} h` : `il y a ${hours} h`;
    return rest && diff >= 0 ? `${base} ${rest} min` : base;
  }
  const days = Math.floor(hours / 24);
  return diff >= 0 ? `dans ${days} j` : `il y a ${days} j`;
}

export function shortRef(value: string): string {
  if (!value) return "—";
  return value.length > 12 ? `${value.slice(0, 12)}…` : value;
}
