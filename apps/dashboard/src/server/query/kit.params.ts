import { defineTable } from "./table";

/**
 * Table de démonstration du kit (page interne `/kit`, absente en production).
 * Modèle à recopier : une table = un `defineTable` avec son préfixe.
 */
export const kitTable = defineTable({
  prefix: "k",
  sortKeys: ["name", "platform", "status", "lastSeen", "sessions"],
  defaultSort: { key: "lastSeen", dir: "desc" },
  filterKeys: ["status", "platform"],
});

export interface KitDevice {
  id: string;
  name: string;
  owner: string;
  platform: "android" | "ios" | "windows";
  status: "active" | "revoked" | "inactive";
  sessions: number;
  lastSeenAt: string | null;
}

const NAMES = ["Pixel 8", "Galaxy A54", "iPhone 15", "Redmi Note 13", "Tecno Spark 20", "Infinix Hot 40", "ThinkPad", "Moto G84"];
const OWNERS = ["Awa Ndiaye", "Jean Mbarga", "Fatou Diallo", "Paul Essomba", "Mireille Ngo", "Ibrahim Bello", "Chantal Fotso", "Éric Tchamba"];
const PLATFORMS = ["android", "android", "ios", "android", "android", "android", "windows", "android"] as const;
const STATUSES = ["active", "active", "active", "inactive", "revoked"] as const;

/** Données fictives DÉTERMINISTES (aucun aléa : rendu identique à chaque requête). */
export const KIT_DEVICES: readonly KitDevice[] = Array.from({ length: 64 }, (_, i) => {
  const base = Date.UTC(2026, 9, 24, 12, 0, 0);
  return {
    id: `dev_${String(i + 1).padStart(3, "0")}`,
    name: `${NAMES[i % NAMES.length]}${i >= NAMES.length ? ` #${Math.floor(i / NAMES.length) + 1}` : ""}`,
    owner: OWNERS[(i * 3) % OWNERS.length],
    platform: PLATFORMS[i % PLATFORMS.length],
    status: STATUSES[(i * 7) % STATUSES.length],
    sessions: (i * 13) % 9,
    lastSeenAt: i % 11 === 0 ? null : new Date(base - i * 5_400_000).toISOString(),
  };
});
