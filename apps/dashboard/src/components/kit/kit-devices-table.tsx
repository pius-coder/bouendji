"use client";

import { Icon } from "@/components/common/icon";
import { DataTable, type DataColumn } from "@/components/common/data-table";
import { StatusBadge, statusLabel } from "@/components/common/status-badge";
import { notify } from "@/components/common/toast";
import { formatDateTime } from "@/lib/format";
import { kitTable, type KitDevice } from "@/server/query/kit.params";

/**
 * Modèle d'un module client de table (à recopier par page) : colonnes, filtres,
 * actions. Il ne charge RIEN : `rows`, `total`, `exportRows` viennent du bloc serveur.
 */
const PLATFORM_LABEL: Record<KitDevice["platform"], string> = { android: "Android", ios: "iOS", windows: "Windows" };

const columns: DataColumn<KitDevice>[] = [
  { id: "name", header: "Appareil", cell: (d) => d.name, sortKey: "name", hideable: false, mobile: "title", exportValue: (d) => d.name },
  { id: "owner", header: "Abonné", cell: (d) => d.owner, mobile: "subtitle", exportValue: (d) => d.owner },
  { id: "platform", header: "Plateforme", cell: (d) => PLATFORM_LABEL[d.platform], sortKey: "platform", exportValue: (d) => PLATFORM_LABEL[d.platform] },
  { id: "status", header: "Statut", cell: (d) => <StatusBadge status={d.status} />, sortKey: "status", mobile: "trailing", exportValue: (d) => statusLabel(d.status) },
  { id: "sessions", header: "Sessions", cell: (d) => d.sessions, sortKey: "sessions", align: "end", width: "7rem", exportValue: (d) => d.sessions },
  { id: "lastSeen", header: "Dernier signal", cell: (d) => formatDateTime(d.lastSeenAt), sortKey: "lastSeen", mobile: "value", exportValue: (d) => d.lastSeenAt ?? "" },
  { id: "id", header: "Identifiant", cell: (d) => <span className="font-mono text-footnote text-muted-foreground">{d.id}</span>, defaultHidden: true, exportValue: (d) => d.id },
];

const filters = [
  {
    key: "status",
    label: "Statut",
    options: [
      { value: "active", label: "Actif" },
      { value: "inactive", label: "Inactif" },
      { value: "revoked", label: "Révoqué" },
    ],
  },
  {
    key: "platform",
    label: "Plateforme",
    options: [
      { value: "android", label: "Android" },
      { value: "ios", label: "iOS" },
      { value: "windows", label: "Windows" },
    ],
  },
] as const;

export function KitDevicesTable({ rows, total, exportRows }: { rows: KitDevice[]; total: number; exportRows: KitDevice[] }) {
  return (
    <DataTable
      table={kitTable}
      rows={rows}
      total={total}
      exportRows={exportRows}
      columns={columns}
      filters={filters}
      getRowId={(d) => d.id}
      rowLabel={(d) => d.name}
      label="Appareils de démonstration"
      searchPlaceholder="Appareil, abonné, identifiant"
      storageKey="kit-devices"
      scopeNote="données fictives"
      empty={{ title: "Aucun appareil", description: "Les appareils apparaissent après leur premier enregistrement." }}
      rowActions={(d) => [
        {
          label: "Copier l’identifiant",
          icon: <Icon name="copy" />,
          onSelect: () => {
            void navigator.clipboard?.writeText(d.id);
            notify.success("Identifiant copié", d.id);
          },
        },
        { label: "Émettre un fichier hors ligne", icon: <Icon name="file-download" />, onSelect: () => notify.success("Démonstration : aucune action envoyée") },
        { label: "Révoquer", icon: <Icon name="forbidden" />, destructive: true, hidden: d.status === "revoked", onSelect: () => notify.success("Démonstration : aucune action envoyée") },
      ]}
      bulkActions={[
        { label: "Exporter la sélection", run: (ids) => notify.success(`${ids.length} appareil(s) — démonstration`) },
        {
          label: "Révoquer",
          destructive: true,
          confirm: {
            title: (n) => `Révoquer ${n} appareil${n > 1 ? "s" : ""} ?`,
            message: "Démonstration : aucune action n’est envoyée à l’API.",
            confirmLabel: "Révoquer",
          },
          run: async (ids) => {
            await new Promise((r) => setTimeout(r, 400));
            notify.success(`${ids.length} appareil(s) révoqué(s) — démonstration`);
          },
        },
      ]}
    />
  );
}
