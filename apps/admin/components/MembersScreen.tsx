"use client";

import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { roleLabel } from "@/lib/format";
import { asRecord, list, normalizeMembership, str } from "@/lib/normalize";
import { can, isOwner } from "@/lib/permissions";
import { STAFF_ROLES, type Membership, type StaffRole } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";
import { useSession } from "./SessionProvider";
import { useCommunities } from "./CommunitiesProvider";
import { CommunityPicker } from "./CommunityPicker";
import { AccessPanel, DataTable, EmptyPanel, FailurePanel, Loading, Panel, Pill, ScreenHeader, TimeTag } from "./ui";
import { FormActions, FormError, SelectField, TextField } from "./fields";

const ROLE_OPTIONS = STAFF_ROLES.map((role) => ({ value: role, label: roleLabel(role) }));

export function MembersScreen() {
  const { admin, request, showBanner } = useSession();
  const { communities, selectedId, select, loading: communitiesLoading } = useCommunities();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [lastAdminId, setLastAdminId] = useState("");
  const [newAdminUserId, setNewAdminUserId] = useState("");
  const [newRole, setNewRole] = useState<StaffRole>("support");
  const [addError, setAddError] = useState("");
  const [adding, setAdding] = useState(false);

  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminPlatformRole, setAdminPlatformRole] = useState("none");
  const [adminError, setAdminError] = useState("");
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  const allowed = can(admin, "membership.read", selectedId);
  const writable = can(admin, "membership.write", selectedId);
  const owner = isOwner(admin);

  const memberships = useAsync<Membership[]>(
    async () => {
      if (!selectedId || !allowed) return [];
      return list(await request(`/v1/admin/communities/${encodeURIComponent(selectedId)}/memberships`)).map(
        normalizeMembership,
      );
    },
    [selectedId, allowed],
  );

  if (communitiesLoading && communities.length === 0) return <Loading label="Chargement des communautés…" />;
  if (!communities.length) {
    return (
      <section className="stack">
        <ScreenHeader title="Membres" description="Personnel rattaché aux communautés." />
        <EmptyPanel
          title="Aucune communauté"
          message="Aucune communauté n’est accessible à ce compte : il n’y a donc aucun membre à afficher."
        />
      </section>
    );
  }
  if (!allowed) {
    return (
      <AccessPanel
        title="Membres"
        message="La gestion des membres est réservée au propriétaire et aux administrateurs de la communauté sélectionnée."
      />
    );
  }

  async function changeRole(membership: Membership, role: string) {
    setPendingId(membership.id);
    try {
      await request(`/v1/admin/memberships/${encodeURIComponent(membership.id)}`, {
        method: "PATCH",
        body: { role },
      });
      memberships.reload();
      showBanner("Rôle mis à jour.", "ok");
    } catch (caught) {
      if (caught instanceof ApiError && caught.handled) return;
      showBanner(caught instanceof Error ? caught.message : "Le rôle n’a pas pu être modifié.", "error");
    } finally {
      setPendingId(null);
    }
  }

  async function toggleMember(membership: Membership) {
    const name = membership.name || membership.email || "ce membre";
    if (membership.status === "active" && !window.confirm(`Désactiver l’accès de ${name} ?`)) return;
    setPendingId(membership.id);
    try {
      if (membership.status === "active") {
        await request(`/v1/admin/memberships/${encodeURIComponent(membership.id)}`, { method: "DELETE" });
        showBanner("Membre désactivé.", "ok");
      } else {
        await request(`/v1/admin/memberships/${encodeURIComponent(membership.id)}`, {
          method: "PATCH",
          body: { status: "active" },
        });
        showBanner("Membre réactivé.", "ok");
      }
      memberships.reload();
    } catch (caught) {
      if (caught instanceof ApiError && caught.handled) return;
      showBanner(caught instanceof Error ? caught.message : "L’opération a échoué.", "error");
    } finally {
      setPendingId(null);
    }
  }

  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const adminUserId = newAdminUserId.trim();
    if (!adminUserId) {
      setAddError("Renseignez l’identifiant du compte administrateur.");
      return;
    }
    setAddError("");
    setAdding(true);
    try {
      await request(`/v1/admin/communities/${encodeURIComponent(selectedId ?? "")}/memberships`, {
        method: "POST",
        body: { adminUserId, role: newRole },
      });
      setNewAdminUserId("");
      setLastAdminId("");
      memberships.reload();
      showBanner("Membre ajouté.", "ok");
    } catch (caught) {
      if (caught instanceof ApiError && caught.handled) return;
      setAddError(caught instanceof Error ? caught.message : "Ajout impossible.");
    } finally {
      setAdding(false);
    }
  }

  async function createAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = adminEmail.trim();
    const name = adminName.trim();
    if (!email || name.length < 2 || adminPassword.length < 12) {
      setAdminError("Email valide, nom d’au moins 2 caractères et mot de passe d’au moins 12 caractères requis.");
      return;
    }
    setAdminError("");
    setCreatingAdmin(true);
    try {
      const payload = await request("/v1/admin/admins", {
        method: "POST",
        body: { email, name, password: adminPassword, platformRole: adminPlatformRole },
      });
      const record = asRecord(payload);
      const adminId = record ? str(record.adminId) : "";
      setAdminPassword("");
      setLastAdminId(adminId);
      setNewAdminUserId(adminId);
      showBanner(adminId ? `Compte créé. Identifiant : ${adminId}` : "Compte créé.", "ok");
    } catch (caught) {
      if (caught instanceof ApiError && caught.handled) return;
      setAdminError(caught instanceof Error ? caught.message : "Création impossible.");
    } finally {
      setCreatingAdmin(false);
    }
  }

  const rows = memberships.data ?? [];

  return (
    <section className="stack">
      <ScreenHeader
        title="Membres"
        description="Personnel de la communauté sélectionnée. Les rôles sont locaux : une personne peut avoir un rôle différent dans chaque communauté."
      />

      <div className="toolbar">
        <CommunityPicker
          value={selectedId ?? ""}
          onChange={(value) => {
            select(value);
            setAddError("");
          }}
        />
      </div>

      {memberships.error ? (
        <FailurePanel error={memberships.error} onRetry={memberships.reload} />
      ) : memberships.loading && !memberships.data ? (
        <Loading label="Chargement des membres…" />
      ) : (
        <Panel flush>
          {rows.length ? (
            <DataTable
              caption="Membres de la communauté"
              columns={[
                { label: "Membre" },
                { label: "Rôle" },
                { label: "Statut" },
                { label: "Depuis" },
                { label: "Action" },
              ]}
            >
              {rows.map((membership) => {
                const self = !!admin && membership.adminUserId === admin.adminId;
                const busy = pendingId === membership.id;
                const roleValue = STAFF_ROLES.includes(membership.role as StaffRole)
                  ? membership.role
                  : "support";
                return (
                  <tr key={membership.id}>
                    <td>
                      <span className="cell-title">
                        {membership.name || membership.email || "Compte sans nom"}
                      </span>
                      {membership.email ? <span className="meta">{membership.email}</span> : null}
                    </td>
                    <td>
                      <SelectField
                        label={`Rôle de ${membership.name || membership.email || "ce membre"}`}
                        hideLabel
                        compact
                        value={roleValue}
                        disabled={self || !writable || busy}
                        options={ROLE_OPTIONS}
                        onChange={(value) => void changeRole(membership, value)}
                      />
                    </td>
                    <td>
                      <Pill value={membership.status} />
                    </td>
                    <td>
                      <TimeTag value={membership.createdAt} />
                    </td>
                    <td>
                      <div className="row-actions">
                        {self ? (
                          <span className="muted">Vous</span>
                        ) : writable ? (
                          <button
                            className={
                              membership.status === "active"
                                ? "button button-compact button-quiet button-danger"
                                : "button button-compact button-quiet"
                            }
                            type="button"
                            disabled={busy}
                            onClick={() => void toggleMember(membership)}
                          >
                            {busy ? "En cours…" : membership.status === "active" ? "Désactiver" : "Réactiver"}
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
              <p className="muted">Cette communauté n’a encore aucun membre du personnel.</p>
            </div>
          )}
        </Panel>
      )}

      {writable ? (
        <Panel title="Ajouter un membre">
          <form noValidate onSubmit={addMember}>
            <FormError message={addError} />
            <div className="form-grid">
              <TextField
                label="Identifiant du compte"
                name="adminUserId"
                required
                maxLength={190}
                spellCheck={false}
                placeholder="identifiant du compte administrateur"
                hint="L’API attend l’identifiant admin (adminUserId), pas l’adresse email. Un compte existant est requis."
                value={newAdminUserId}
                onChange={setNewAdminUserId}
              />
              <SelectField
                label="Rôle dans la communauté"
                value={newRole}
                onChange={(value) => setNewRole(value as StaffRole)}
                options={ROLE_OPTIONS}
              />
              <FormActions>
                <button className="button button-primary" type="submit" disabled={adding}>
                  {adding ? "Ajout…" : "Ajouter le membre"}
                </button>
              </FormActions>
            </div>
          </form>
        </Panel>
      ) : null}

      {owner ? (
        <Panel title="Créer un compte administrateur">
          <p className="muted">
            Le mot de passe n’est jamais conservé par cette page. Il est transmis une fois à l’API, qui le hache.
            {lastAdminId ? ` Dernier identifiant créé : ${lastAdminId}.` : ""}
          </p>
          <form noValidate onSubmit={createAdmin}>
            <FormError message={adminError} />
            <div className="form-grid">
              <TextField
                label="Adresse email"
                type="email"
                name="adminEmail"
                required
                maxLength={190}
                value={adminEmail}
                onChange={setAdminEmail}
              />
              <TextField
                label="Nom"
                name="adminName"
                required
                minLength={2}
                maxLength={120}
                value={adminName}
                onChange={setAdminName}
              />
              <TextField
                label="Mot de passe"
                type="password"
                name="adminPassword"
                required
                minLength={12}
                maxLength={256}
                autoComplete="new-password"
                hint="12 caractères minimum."
                value={adminPassword}
                onChange={setAdminPassword}
              />
              <SelectField
                label="Rôle plateforme"
                hint="Un rôle plateforme « owner » donne tous les droits ; sinon, ajoutez une appartenance ci-dessus."
                value={adminPlatformRole}
                onChange={setAdminPlatformRole}
                options={[
                  { value: "none", label: "Aucun rôle plateforme (staff)" },
                  { value: "owner", label: "Propriétaire" },
                ]}
              />
              <FormActions>
                <button className="button button-primary" type="submit" disabled={creatingAdmin}>
                  {creatingAdmin ? "Création…" : "Créer le compte"}
                </button>
              </FormActions>
            </div>
          </form>
        </Panel>
      ) : null}
    </section>
  );
}
