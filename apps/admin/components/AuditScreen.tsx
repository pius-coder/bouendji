"use client";

import { useState } from "react";
import { roleLabel } from "@/lib/format";
import { list, normalizeAudit } from "@/lib/normalize";
import { can, isOwner } from "@/lib/permissions";
import type { AuditEntry } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";
import { useSession } from "./SessionProvider";
import { useCommunities } from "./CommunitiesProvider";
import { CommunityPicker } from "./CommunityPicker";
import {
  AccessPanel,
  DataTable,
  EmptyPanel,
  FailurePanel,
  Loading,
  Notice,
  Panel,
  ScreenHeader,
  TimeTag,
} from "./ui";
import { SelectField } from "./fields";

const LIMIT_OPTIONS = [
  { value: "25", label: "25" },
  { value: "50", label: "50" },
  { value: "100", label: "100" },
  { value: "200", label: "200" },
];

/**
 * Journal d'audit — lecture seule. Ni adresse IP ni états avant/après ne sont
 * affichés : le journal sert à savoir qui a fait quoi, pas à recopier des
 * données personnelles dans une capture d'écran.
 */
export function AuditScreen() {
  const { admin, request } = useSession();
  const { communities, selectedId, loading: communitiesLoading } = useCommunities();
  const [filter, setFilter] = useState<string | null>(null);
  const [limit, setLimit] = useState("50");

  const owner = isOwner(admin);
  const allowed = can(admin, "audit.read", selectedId);

  // Le propriétaire peut demander toutes les communautés (filtre vide) ; les
  // autres restent sur la leur, choisie dans la liste de leurs appartenances.
  const communityFilter = filter !== null ? filter : owner ? "" : (selectedId ?? "");

  const audit = useAsync<AuditEntry[]>(
    async () => {
      if (!allowed) return [];
      const query = new URLSearchParams({ limit });
      if (communityFilter) query.set("community_id", communityFilter);
      return list(await request(`/v1/admin/audit-log?${query.toString()}`)).map(normalizeAudit);
    },
    [allowed, limit, communityFilter],
  );

  if (communitiesLoading && communities.length === 0) return <Loading label="Chargement des communautés…" />;
  if (!allowed) {
    return (
      <AccessPanel
        title="Journal d’audit"
        message="Le journal est lisible par le propriétaire et les administrateurs de communauté."
      />
    );
  }
  if (!owner && communities.length === 0) {
    return <EmptyPanel title="Aucune communauté" message="Aucune communauté n’est rattachée à ce compte." />;
  }

  return (
    <section className="stack">
      <ScreenHeader
        title="Journal d’audit"
        description="Lecture seule. Chaque action privilégiée est écrite par l’API dans la transaction de la mutation."
      />
      <Notice>
        L’API refuse toute modification du journal. Les états avant/après et les adresses IP ne sont pas affichés ici.
      </Notice>

      <div className="toolbar">
        <CommunityPicker
          value={communityFilter}
          allowAll={owner}
          onChange={(value) => setFilter(value)}
          hint={owner ? "Sans filtre, le journal couvre toutes les communautés." : undefined}
        />
        <SelectField label="Lignes" value={limit} onChange={setLimit} options={LIMIT_OPTIONS} />
      </div>

      {audit.error ? (
        <FailurePanel error={audit.error} onRetry={audit.reload} />
      ) : audit.loading && !audit.data ? (
        <Loading label="Chargement du journal…" />
      ) : (audit.data?.length ?? 0) > 0 ? (
        <Panel flush>
          <DataTable
            caption="Journal d’audit"
            columns={[
              { label: "Date" },
              { label: "Action" },
              { label: "Rôle exercé" },
              { label: "Cible" },
              { label: "Communauté" },
            ]}
          >
            {(audit.data ?? []).map((entry) => {
              const community = communities.find((candidate) => candidate.id === entry.communityId);
              return (
                <tr key={entry.id}>
                  <td>
                    <TimeTag value={entry.createdAt} />
                  </td>
                  <td>
                    <span className="mono">{entry.action}</span>
                  </td>
                  <td>{roleLabel(entry.actorRole)}</td>
                  <td>{entry.targetType}</td>
                  <td>{community ? community.name : "—"}</td>
                </tr>
              );
            })}
          </DataTable>
        </Panel>
      ) : (
        <EmptyPanel title="Journal vide" message="Aucune action n’a encore été journalisée pour ce filtre." />
      )}
    </section>
  );
}
