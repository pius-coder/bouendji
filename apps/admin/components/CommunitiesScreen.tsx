"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { bpsPercent } from "@/lib/format";
import { asRecord, num, str } from "@/lib/normalize";
import { isOwner } from "@/lib/permissions";
import { useSession } from "./SessionProvider";
import { useCommunities } from "./CommunitiesProvider";
import { DataTable, FailurePanel, Loading, Notice, Panel, Pill, ScreenHeader, TimeTag } from "./ui";
import { FormActions, FormError, NumberField, SelectField, TextField } from "./fields";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function CommunitiesScreen() {
  const { admin, request, showBanner } = useSession();
  const { communities, loading, error, reload, select } = useCommunities();
  const owner = isOwner(admin);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [percent, setPercent] = useState("20");
  const [formError, setFormError] = useState("");
  const [creating, setCreating] = useState(false);

  const [editId, setEditId] = useState<string>("");
  const [editPercent, setEditPercent] = useState("");
  const [editError, setEditError] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const currentEditId =
    editId && communities.some((community) => community.id === editId) ? editId : (communities[0]?.id ?? "");

  // La valeur du champ suit la communauté choisie. Une saisie n'est écrasée que
  // lorsque la sélection change réellement.
  useEffect(() => {
    const target = communities.find((community) => community.id === currentEditId);
    setEditPercent(target && target.commissionBps !== null ? (target.commissionBps / 100).toFixed(2) : "20");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEditId]);

  if (loading && communities.length === 0) return <Loading label="Chargement des communautés…" />;
  if (error && communities.length === 0) {
    return <FailurePanel error={error} onRetry={() => void reload()} />;
  }


  async function createCommunity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nameValue = name.trim();
    const slugValue = slug.trim();
    const percentage = num(percent);
    if (nameValue.length < 2) {
      setFormError("Le nom doit contenir au moins 2 caractères.");
      return;
    }
    if (!SLUG_PATTERN.test(slugValue)) {
      setFormError("L’identifiant doit être en minuscules, chiffres et tirets, sans tiret au début ni à la fin.");
      return;
    }
    if (percentage === null || percentage < 0 || percentage > 100) {
      setFormError("La commission doit être comprise entre 0 et 100 %.");
      return;
    }
    setFormError("");
    setCreating(true);
    try {
      const payload = await request("/v1/admin/communities", {
        method: "POST",
        body: { name: nameValue, slug: slugValue, commissionBps: Math.round(percentage * 100) },
      });
      const created = asRecord(payload);
      const newId = created ? str(created.id) : "";
      setName("");
      setSlug("");
      setPercent("20");
      await reload();
      if (newId) select(newId);
      showBanner("Communauté créée.", "ok");
    } catch (caught) {
      if (caught instanceof ApiError && caught.handled) return;
      setFormError(caught instanceof Error ? caught.message : "Création impossible.");
    } finally {
      setCreating(false);
    }
  }

  async function toggleStatus(communityId: string, status: string, communityName: string) {
    const nextStatus = status === "suspended" ? "active" : "suspended";
    if (
      nextStatus === "suspended" &&
      !window.confirm(`Suspendre « ${communityName} » ? Les accès de ses abonnés seront bloqués.`)
    ) {
      return;
    }
    setRowBusy(communityId);
    try {
      await request(`/v1/admin/communities/${encodeURIComponent(communityId)}`, {
        method: "PATCH",
        body: { status: nextStatus },
      });
      await reload();
      showBanner(nextStatus === "suspended" ? "Communauté suspendue." : "Communauté réactivée.", "ok");
    } catch (caught) {
      if (caught instanceof ApiError && caught.handled) return;
      showBanner(caught instanceof Error ? caught.message : "L’opération a échoué.", "error");
    } finally {
      setRowBusy(null);
    }
  }

  async function saveCommission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const percentage = num(editPercent);
    if (percentage === null || percentage < 0 || percentage > 100) {
      setEditError("La commission doit être comprise entre 0 et 100 %.");
      return;
    }
    if (!currentEditId) return;
    setEditError("");
    setSavingEdit(true);
    try {
      await request(`/v1/admin/communities/${encodeURIComponent(currentEditId)}`, {
        method: "PATCH",
        body: { commissionBps: Math.round(percentage * 100) },
      });
      await reload();
      showBanner("Commission mise à jour.", "ok");
    } catch (caught) {
      if (caught instanceof ApiError && caught.handled) return;
      setEditError(caught instanceof Error ? caught.message : "Enregistrement impossible.");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <section className="stack">
      <ScreenHeader
        title="Communautés"
        description="Création, suspension et taux de commission. Seul le propriétaire peut modifier une communauté."
      />
      <Notice>L’API renvoie au plus 200 communautés, les plus récentes.</Notice>

      {owner ? (
        <Panel title="Créer une communauté">
          <form noValidate onSubmit={createCommunity}>
            <FormError message={formError} />
            <div className="form-grid">
              <TextField label="Nom" name="name" required minLength={2} maxLength={120} value={name} onChange={setName} />
              <TextField
                label="Identifiant (slug)"
                name="slug"
                required
                maxLength={64}
                spellCheck={false}
                placeholder="exemple-communaute"
                hint="Minuscules, chiffres et tirets uniquement."
                value={slug}
                onChange={setSlug}
              />
              <NumberField
                label="Commission"
                min={0}
                max={100}
                step={0.01}
                hint="Pourcentage des ventes reversé à la communauté (0 à 100)."
                value={percent}
                onChange={setPercent}
              />
              <FormActions>
                <button className="button button-primary" type="submit" disabled={creating}>
                  {creating ? "Création…" : "Créer la communauté"}
                </button>
              </FormActions>
            </div>
          </form>
        </Panel>
      ) : null}

      <Panel flush title="Liste">
        {communities.length ? (
          <DataTable
            caption="Liste des communautés"
            columns={[
              { label: "Nom" },
              { label: "Statut" },
              { label: "Commission" },
              { label: "Créée le" },
              { label: "Actions" },
            ]}
          >
            {communities.map((community) => {
              const suspended = community.status === "suspended";
              return (
                <tr key={community.id}>
                  <td>
                    <span className="cell-title">{community.name}</span>
                    <span className="meta mono">{community.slug || "—"}</span>
                  </td>
                  <td>
                    <Pill value={community.status} />
                  </td>
                  <td>{bpsPercent(community.commissionBps)}</td>
                  <td>
                    <TimeTag value={community.createdAt} />
                  </td>
                  <td>
                    <div className="row-actions">
                      {owner ? (
                        <button
                          className={suspended ? "button button-compact button-quiet" : "button button-compact button-danger"}
                          type="button"
                          disabled={rowBusy === community.id}
                          onClick={() => void toggleStatus(community.id, community.status, community.name)}
                        >
                          {rowBusy === community.id ? "En cours…" : suspended ? "Reprendre" : "Suspendre"}
                        </button>
                      ) : (
                        "—"
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        ) : (
          <div className="panel-body">
            <p className="muted">
              Ce compte n’est rattaché à aucune communauté. Le propriétaire peut en créer une ci-dessus.
            </p>
          </div>
        )}
      </Panel>

      {owner && communities.length ? (
        <Panel title="Modifier la commission">
          <form noValidate onSubmit={saveCommission}>
            <FormError message={editError} />
            <div className="form-grid">
              <SelectField
                label="Communauté"
                value={currentEditId}
                onChange={(value) => {
                  setEditId(value);
                  setEditError("");
                }}
                options={communities.map((community) => ({ value: community.id, label: community.name }))}
              />
              <NumberField
                label="Nouvelle commission"
                min={0}
                max={100}
                step={0.01}
                hint="Le changement est journalisé dans audit_log."
                value={editPercent}
                onChange={setEditPercent}
              />
              <FormActions>
                <button className="button button-primary" type="submit" disabled={savingEdit}>
                  {savingEdit ? "Enregistrement…" : "Enregistrer la commission"}
                </button>
              </FormActions>
            </div>
          </form>
        </Panel>
      ) : null}
    </section>
  );
}
