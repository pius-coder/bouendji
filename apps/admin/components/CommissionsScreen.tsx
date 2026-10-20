"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { bpsPercent, money } from "@/lib/format";
import { asRecord, list, normalizeCommission, num, str } from "@/lib/normalize";
import { can } from "@/lib/permissions";
import type { Commission } from "@/lib/types";
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
import { FormActions, FormError, SelectField, TextField } from "./fields";

const STATUS_OPTIONS = [
  { value: "", label: "Tous les statuts" },
  { value: "pending", label: "En attente" },
  { value: "available", label: "Disponible" },
  { value: "paid", label: "Payée" },
  { value: "reversed", label: "Annulée" },
];

interface PreparedPayout {
  id: string;
  amountXaf: number | null;
  commissionCount: number | null;
  status: string;
  createdAt: string | null;
}

export function CommissionsScreen() {
  const { admin, request, showBanner } = useSession();
  const { communities, selectedId, select, loading: communitiesLoading } = useCommunities();
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [payoutError, setPayoutError] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [prepared, setPrepared] = useState<PreparedPayout[]>([]);

  const allowed = can(admin, "commission.read", selectedId);
  const canPrepare = can(admin, "payout.create", selectedId);

  const commissions = useAsync<Commission[]>(
    async () => {
      if (!selectedId || !allowed) return [];
      const query = new URLSearchParams({ limit: "100" });
      if (status) query.set("status", status);
      return list(
        await request(`/v1/admin/communities/${encodeURIComponent(selectedId)}/commissions?${query.toString()}`),
      ).map(normalizeCommission);
    },
    [selectedId, status, allowed],
  );

  if (communitiesLoading && communities.length === 0) return <Loading label="Chargement des communautés…" />;
  if (!communities.length) {
    return (
      <section className="stack">
        <ScreenHeader title="Commissions" description="Commissions par communauté." />
        <EmptyPanel title="Aucune communauté" message="Aucune communauté n’est accessible à ce compte." />
      </section>
    );
  }
  if (!allowed) {
    return (
      <AccessPanel
        title="Commissions"
        message="La lecture des commissions est réservée au propriétaire, aux administrateurs de communauté et à la finance."
      />
    );
  }

  async function preparePayout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;
    setPayoutError("");
    setPreparing(true);
    try {
      const payload = await request(`/v1/admin/communities/${encodeURIComponent(selectedId)}/payouts`, {
        method: "POST",
        body: note.trim() ? { note: note.trim() } : {},
      });
      const record = asRecord(payload) ?? {};
      setPrepared((previous) => [
        {
          id: str(record.id),
          amountXaf: num(record.amountXaf),
          commissionCount: num(record.commissionCount),
          status: str(record.status) || "pending",
          createdAt: null,
        },
        ...previous,
      ]);
      setNote("");
      showBanner("Versement préparé. Le montant a été calculé par l’API à partir des commissions disponibles.", "ok");
      commissions.reload();
    } catch (caught) {
      if (caught instanceof ApiError && caught.handled) return;
      setPayoutError(caught instanceof Error ? caught.message : "Préparation impossible.");
    } finally {
      setPreparing(false);
    }
  }

  return (
    <section className="stack">
      <ScreenHeader
        title="Commissions"
        description="Lecture des commissions et préparation d’un versement. Aucun montant n’est saisi ici : l’API calcule le total à partir des commissions disponibles."
      />

      <div className="toolbar">
        <CommunityPicker value={selectedId ?? ""} onChange={select} />
        <SelectField label="Statut" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
      </div>

      {commissions.error ? (
        <FailurePanel error={commissions.error} onRetry={commissions.reload} />
      ) : commissions.loading && !commissions.data ? (
        <Loading label="Chargement des commissions…" />
      ) : (
        <Panel flush title="Commissions" description="Les 100 dernières commissions de la communauté.">
          <DataTable
            caption="Commissions de la communauté"
            columns={[
              { label: "Date" },
              { label: "Commande" },
              { label: "Taux" },
              { label: "Montant" },
              { label: "Statut" },
              { label: "Disponible le" },
            ]}
            empty={(commissions.data?.length ?? 0) ? undefined : "Aucune commission ne correspond à ce filtre."}
          >
            {(commissions.data ?? []).map((commission) => (
              <tr key={commission.id}>
                <td>
                  <TimeTag value={commission.createdAt} />
                </td>
                <td>
                  <MonoRef value={commission.orderId} />
                </td>
                <td>{bpsPercent(commission.bps)}</td>
                <td>{money(commission.amountXaf)}</td>
                <td>
                  <Pill value={commission.status} />
                </td>
                <td>
                  <TimeTag value={commission.availableAt} />
                </td>
              </tr>
            ))}
          </DataTable>
        </Panel>
      )}

      {canPrepare ? (
        <Panel
          title="Préparer un versement"
          description="Le montant et le nombre de commissions sont calculés par le serveur, dans la même transaction que l’attachement des commissions. Aucun montant n’est transmis."
        >
          <form noValidate onSubmit={preparePayout}>
            <FormError message={payoutError} />
            <div className="form-grid">
              <TextField
                label="Note interne (facultative)"
                maxLength={280}
                placeholder="ex. versement de fin de mois"
                hint="280 caractères au plus. La note est journalisée dans l’audit."
                value={note}
                onChange={setNote}
              />
              <FormActions>
                <button className="button button-primary" type="submit" disabled={preparing}>
                  {preparing ? "Préparation…" : "Préparer le versement"}
                </button>
              </FormActions>
            </div>
          </form>
          <Notice>
            La préparation ne paie rien : le versement reste « en attente » jusqu’à son approbation, puis jusqu’au
            décaissement par le fournisseur.
          </Notice>

          {prepared.length ? (
            <div className="subsection">
              <h3>Préparés dans cette session</h3>
              <DataTable
                caption="Versements préparés pendant cette session"
                columns={[
                  { label: "Référence" },
                  { label: "Montant" },
                  { label: "Commissions" },
                  { label: "Statut" },
                ]}
              >
                {prepared.map((payout) => (
                  <tr key={payout.id || `${payout.amountXaf}-${payout.commissionCount}`}>
                    <td>
                      <MonoRef value={payout.id} />
                    </td>
                    <td>{money(payout.amountXaf)}</td>
                    <td>{payout.commissionCount === null ? "—" : String(payout.commissionCount)}</td>
                    <td>
                      <Pill value={payout.status} />
                    </td>
                  </tr>
                ))}
              </DataTable>
              <p className="meta">
                Liste locale à cet onglet : l’API n’expose pas encore de route de lecture des versements. La réponse de
                création ne porte ni date ni auteur.
              </p>
            </div>
          ) : null}
        </Panel>
      ) : (
        <Notice>
          La préparation d’un versement est réservée à la finance de la communauté et au propriétaire. Votre rôle donne
          la lecture des commissions, pas le droit de préparer un paiement.
        </Notice>
      )}
    </section>
  );
}
