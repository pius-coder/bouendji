"use client";

import { useMemo, useState } from "react";
import { SegmentedControl } from "@/components/common/segmented-control";
import { EmptyBlock } from "@/components/page/empty";
import { TableCard, TableMessage, TableRows } from "@/components/page/table";
import type { PoolEndpoint } from "@/server/services/network/network.schema";
import { NETWORK_COLUMNS, networkCells } from "./network-columns";
import { PurgeExpiredButton } from "./purge-button";

export function NetworkEndpointsClient({
  endpoints,
  canWrite,
  poolRevision,
}: {
  endpoints: PoolEndpoint[];
  canWrite: boolean;
  poolRevision: number;
}) {
  const [filter, setFilter] = useState<"active" | "all" | "expired">("active");

  const activeCount = useMemo(() => endpoints.filter((e) => e.status !== "expired").length, [endpoints]);
  const allCount = endpoints.length;
  const expiredCount = useMemo(() => endpoints.filter((e) => e.status === "expired").length, [endpoints]);

  const filtered = useMemo(() => {
    if (filter === "active") return endpoints.filter((e) => e.status !== "expired");
    if (filter === "expired") return endpoints.filter((e) => e.status === "expired");
    return endpoints;
  }, [endpoints, filter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<"active" | "all" | "expired">
          size="sm"
          label="Filtre des nœuds"
          options={[
            { value: "active", label: `Actifs (${activeCount})` },
            { value: "all", label: `Tous (${allCount})` },
            { value: "expired", label: `Expirés (${expiredCount})` },
          ]}
          value={filter}
          onValueChange={setFilter}
        />

        {canWrite && expiredCount > 0 && (
          <PurgeExpiredButton />
        )}
      </div>

      <TableCard
        label="Nœuds du pool"
        columns={NETWORK_COLUMNS}
        footer={
          <p className="text-footnote text-muted-foreground">
            Pool · révision {poolRevision}
          </p>
        }
      >
        {filtered.length === 0 ? (
          <TableMessage columns={NETWORK_COLUMNS}>
            <EmptyBlock
              icon="server"
              title="Aucun nœud"
              description={
                filter === "active"
                  ? "Aucun serveur actif dans le pool. Déployez ou réactivez un serveur."
                  : filter === "expired"
                  ? "Aucun serveur expiré."
                  : "Le pool est vide."
              }
            />
          </TableMessage>
        ) : (
          <TableRows
            rows={filtered}
            columns={NETWORK_COLUMNS}
            getKey={(e) => e.endpointId}
            cells={(e) => networkCells(e, { canWrite })}
          />
        )}
      </TableCard>
    </div>
  );
}
