"use client";

import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api";
import { asRecord, list, normalizeOrder, str } from "@/lib/normalize";
import { bpsPercent, money } from "@/lib/format";
import { can, seesMoney } from "@/lib/permissions";
import type { Order } from "@/lib/types";
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
  MonoRef,
  Notice,
  Panel,
  Pill,
  ScreenHeader,
  TimeTag,
} from "./ui";
import { SelectField } from "./fields";

const STATUS_OPTIONS = [
  { value: "", label: "Tous les statuts" },
  { value: "pending", label: "En attente" },
  { value: "paid", label: "Payée" },
  { value: "failed", label: "Échouée" },
  { value: "refunded", label: "Remboursée" },
  { value: "expired", label: "Expirée" },
];

interface OrderPage {
  items: Order[];
  nextCursor: string | null;
}

export function OrdersScreen() {
  const { admin, request, showBanner } = useSession();
  const { communities, selectedId, select, loading: communitiesLoading } = useCommunities();
  const [status, setStatus] = useState("");
  const [more, setMore] = useState<{ items: Order[]; cursor: string | null; loaded: boolean }>({
    items: [],
    cursor: null,
    loaded: false,
  });
  const [loadingMore, setLoadingMore] = useState(false);

  const allowed = can(admin, "order.read", selectedId);
  const showMoney = seesMoney(admin, selectedId);

  const page = useAsync<OrderPage>(
    async () => {
      if (!selectedId || !allowed) return { items: [], nextCursor: null };
      const query = new URLSearchParams({ limit: "20" });
      if (status) query.set("status", status);
      const payload = await request(
        `/v1/admin/communities/${encodeURIComponent(selectedId)}/orders?${query.toString()}`,
      );
      const record = asRecord(payload);
      return {
        items: list(payload).map(normalizeOrder),
        nextCursor: record ? str(record.nextCursor) || null : null,
      };
    },
    [selectedId, status, allowed],
  );

  useEffect(() => {
    setMore({ items: [], cursor: null, loaded: false });
  }, [selectedId, status]);

  if (communitiesLoading && communities.length === 0) return <Loading label="Chargement des communautés…" />;
  if (!communities.length) {
    return (
      <section className="stack">
        <ScreenHeader title="Commandes" description="Ventes par communauté." />
        <EmptyPanel title="Aucune communauté" message="Aucune communauté n’est accessible à ce compte." />
      </section>
    );
  }
  if (!allowed) {
    return (
      <AccessPanel
        title="Commandes"
        message="Votre rôle ne permet pas de lire les commandes de cette communauté."
      />
    );
  }

  async function loadMore() {
    const cursor = more.loaded ? more.cursor : page.data?.nextCursor ?? null;
    if (!cursor || !selectedId) return;
    setLoadingMore(true);
    try {
      const query = new URLSearchParams({ limit: "20", cursor });
      if (status) query.set("status", status);
      const payload = await request(
        `/v1/admin/communities/${encodeURIComponent(selectedId)}/orders?${query.toString()}`,
      );
      const record = asRecord(payload);
      setMore((previous) => ({
        items: [...previous.items, ...list(payload).map(normalizeOrder)],
        cursor: record ? str(record.nextCursor) || null : null,
        loaded: true,
      }));
    } catch (caught) {
      if (caught instanceof ApiError && caught.handled) return;
      showBanner(caught instanceof Error ? caught.message : "Chargement impossible.", "error");
    } finally {
      setLoadingMore(false);
    }
  }

  const rows = [...(page.data?.items ?? []), ...more.items];
  const cursor = more.loaded ? more.cursor : page.data?.nextCursor ?? null;

  return (
    <section className="stack" aria-busy={page.loading || loadingMore}>
      <ScreenHeader
        title="Commandes"
        description="Montants en XAF. L’API omet les champs financiers pour les rôles qui n’y ont pas droit."
      />
      <div className="toolbar">
        <CommunityPicker
          value={selectedId ?? ""}
          onChange={(value) => {
            select(value);
            setStatus("");
          }}
        />
        <SelectField label="Statut" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
      </div>

      {showMoney ? null : (
        <Notice>Votre rôle ne donne pas accès aux montants : les colonnes financières restent vides.</Notice>
      )}

      {page.error ? (
        <FailurePanel error={page.error} onRetry={page.reload} />
      ) : page.loading && !page.data ? (
        <Loading label="Chargement des commandes…" />
      ) : (
        <Panel flush title="Commandes" description="20 commandes par page ; curseur opaque fourni par l’API.">
          <DataTable
            caption="Commandes de la communauté"
            columns={[
              { label: "Date" },
              { label: "Statut" },
              { label: "Montant" },
              { label: "Taux" },
              { label: "Commission" },
              { label: "Référence" },
            ]}
            empty={rows.length ? undefined : "Aucune commande pour ce filtre."}
          >
            {rows.map((order) => (
              <tr key={order.id}>
                <td>
                  <TimeTag value={order.createdAt} />
                </td>
                <td>
                  <Pill value={order.status} />
                </td>
                <td>{showMoney ? money(order.amountXaf) : <span className="muted">masqué</span>}</td>
                <td>{showMoney ? bpsPercent(order.commissionBps) : "—"}</td>
                <td>{showMoney ? money(order.commissionXaf) : "—"}</td>
                <td>
                  <MonoRef value={order.id} />
                </td>
              </tr>
            ))}
          </DataTable>
          <div className="table-footer">
            {cursor ? (
              <button className="button" type="button" disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? "Chargement…" : "Charger plus"}
              </button>
            ) : (
              <span className="muted">Fin de la liste pour ce filtre.</span>
            )}
          </div>
        </Panel>
      )}
    </section>
  );
}
