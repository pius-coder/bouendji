"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";
import { asRecord, list, normalizeDevice, num, str } from "@/lib/normalize";
import { downloadJson, bundleFilename } from "@/lib/download";
import { can } from "@/lib/permissions";
import type { Device, IssuedBundle } from "@/lib/types";
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
import { CompactNumberField } from "./fields";
import { DownloadIcon } from "./Icons";

const MIN_HOURS = 1;
const MAX_HOURS = 24;

export function DevicesScreen() {
  const { admin, request, showBanner } = useSession();
  const { communities, selectedId, select, loading: communitiesLoading } = useCommunities();
  const [hours, setHours] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [issued, setIssued] = useState<IssuedBundle[]>([]);

  const allowed = can(admin, "offline_bundle.issue", selectedId);
  const canRevoke = can(admin, "device.revoke", selectedId);

  const devices = useAsync<Device[]>(
    async () => {
      if (!selectedId || !allowed) return [];
      return list(await request(`/v1/admin/communities/${encodeURIComponent(selectedId)}/devices`))
        .map(normalizeDevice)
        .filter((device): device is Device => device !== null);
    },
    [selectedId, allowed],
  );

  if (communitiesLoading && communities.length === 0) return <Loading label="Chargement des communautés…" />;
  if (!communities.length) {
    return (
      <section className="stack">
        <ScreenHeader title="Appareils" description="Appareils et bundles hors-ligne." />
        <EmptyPanel title="Aucune communauté" message="Aucune communauté n’est accessible à ce compte." />
      </section>
    );
  }
  if (!allowed) {
    return (
      <AccessPanel
        title="Appareils"
        message="L’émission d’un bundle est réservée au propriétaire, aux administrateurs de communauté et au support."
      />
    );
  }

  function hoursFor(device: Device): string {
    return hours[device.deviceId] ?? "1";
  }

  async function issueBundle(device: Device) {
    const raw = hoursFor(device);
    const value = Number(raw);
    if (!Number.isInteger(value) || value < MIN_HOURS || value > MAX_HOURS) {
      showBanner(
        "La durée doit être un nombre entier d’heures entre 1 et 24 : un fichier de secours ne doit pas rester utilisable des jours.",
        "error",
      );
      return;
    }
    if (device.status === "revoked") {
      showBanner("Cet appareil est révoqué : aucun bundle ne peut être émis.", "error");
      return;
    }
    setBusy(device.deviceId);
    try {
      const payload = await request(`/v1/admin/devices/${encodeURIComponent(device.deviceId)}/offline-bundles`, {
        method: "POST",
        body: { ttlHours: value },
      });
      const record = asRecord(payload) ?? {};
      const bundleId = str(record.bundleId);
      setIssued((previous) => [
        {
          deviceName: device.name,
          bundleId,
          notAfter: str(record.notAfter),
          singleUse: record.singleUse === true,
          endpointCount: num(record.endpointCount),
          // Le fichier est scellé pour l'appareil : l'administration le transmet
          // tel quel et ne peut pas en lire le contenu.
          file: record.file,
        },
        ...previous,
      ]);
      showBanner(
        `Bundle émis pour ${device.name}, valable jusqu’au ${new Date(str(record.notAfter)).toLocaleString("fr-FR")}. Téléchargez-le : il n’est pas réémis.`,
        "ok",
      );
    } catch (caught) {
      if (caught instanceof ApiError && caught.handled) return;
      showBanner(caught instanceof Error ? caught.message : "Émission impossible.", "error");
    } finally {
      setBusy(null);
    }
  }

  async function revoke(device: Device) {
    if (!window.confirm(`Révoquer « ${device.name} » ? Ses sessions seront fermées.`)) return;
    setBusy(device.deviceId);
    try {
      const payload = await request(`/v1/admin/devices/${encodeURIComponent(device.deviceId)}/revoke`, {
        method: "POST",
      });
      const record = asRecord(payload);
      const sessions = record ? num(record.sessionsRevoked) : null;
      showBanner(
        sessions === null
          ? "Appareil révoqué."
          : `Appareil révoqué · ${sessions} session${sessions > 1 ? "s" : ""} fermée${sessions > 1 ? "s" : ""}.`,
        "ok",
      );
      devices.reload();
    } catch (caught) {
      if (caught instanceof ApiError && caught.handled) return;
      showBanner(caught instanceof Error ? caught.message : "Révocation impossible.", "error");
    } finally {
      setBusy(null);
    }
  }

  function download(bundle: IssuedBundle) {
    const ok = downloadJson(bundleFilename(bundle.deviceName, bundle.bundleId), bundle.file);
    if (!ok) {
      showBanner("Le navigateur a refusé le téléchargement. Essayez depuis un autre navigateur.", "error");
    }
  }

  const rows = devices.data ?? [];

  return (
    <section className="stack">
      <ScreenHeader
        title="Appareils"
        description="Un bundle est un fichier daté, scellé pour un appareil précis : cette console n’en montre jamais le contenu — ni UUID, ni chemin réseau."
      />

      <div className="toolbar">
        <CommunityPicker value={selectedId ?? ""} onChange={select} />
      </div>

      {devices.error ? (
        <FailurePanel error={devices.error} onRetry={devices.reload} />
      ) : devices.loading && !devices.data ? (
        <Loading label="Chargement des appareils…" />
      ) : rows.length ? (
        <Panel flush>
          <DataTable
            caption="Appareils de la communauté"
            columns={[
              { label: "Appareil" },
              { label: "Statut" },
              { label: "Dernière activité" },
              { label: "Bundle hors-ligne" },
              { label: "Révoquer" },
            ]}
          >
            {rows.map((device) => {
              const revoked = device.status === "revoked";
              return (
                <tr key={device.deviceId}>
                  <td>
                    <span className="cell-title">{device.name}</span>
                    <span className="meta">{device.platform || "plateforme inconnue"}</span>
                  </td>
                  <td>
                    <Pill value={device.status} />
                  </td>
                  <td>
                    <TimeTag value={device.lastSeenAt} />
                  </td>
                  <td>
                    <div className="inline-form">
                      <CompactNumberField
                        label={`Durée en heures du bundle pour ${device.name}`}
                        value={hoursFor(device)}
                        min={MIN_HOURS}
                        max={MAX_HOURS}
                        onChange={(value) =>
                          setHours((previous) => ({ ...previous, [device.deviceId]: value }))
                        }
                        disabled={revoked || busy === device.deviceId}
                      />
                      <span className="meta">heures</span>
                      <button
                        className="button button-compact"
                        type="button"
                        disabled={revoked || busy === device.deviceId}
                        onClick={() => void issueBundle(device)}
                      >
                        {busy === device.deviceId ? "Émission…" : "Émettre"}
                      </button>
                    </div>
                  </td>
                  <td>
                    {canRevoke ? (
                      <button
                        className="button button-compact button-quiet button-danger"
                        type="button"
                        disabled={revoked || busy === device.deviceId}
                        onClick={() => void revoke(device)}
                      >
                        {revoked ? "Révoqué" : "Révoquer"}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </DataTable>
        </Panel>
      ) : (
        <EmptyPanel title="Aucun appareil" message="Cette communauté n’a encore aucun appareil enregistré." />
      )}

      <Panel title="Bundles émis dans cette session">
        <p className="muted">
          Le fichier est scellé pour l’appareil : il ne s’ouvre que sur lui. Téléchargez-le et transmettez-le tel quel.
          Cette liste vit dans l’onglet ; l’API ne propose pas d’historique de lecture des bundles.
        </p>
        {issued.length ? (
          <DataTable
            caption="Bundles émis pendant cette session"
            columns={[
              { label: "Appareil" },
              { label: "Valable jusqu’à" },
              { label: "Usage" },
              { label: "Configurations" },
              { label: "Référence" },
              { label: "Fichier" },
            ]}
          >
            {issued.map((bundle, index) => (
              <tr key={`${bundle.bundleId}-${index}`}>
                <td>{bundle.deviceName}</td>
                <td>
                  <TimeTag value={bundle.notAfter} />
                </td>
                <td>{bundle.singleUse ? "Unique" : "—"}</td>
                <td>{bundle.endpointCount === null ? "—" : String(bundle.endpointCount)}</td>
                <td>
                  <MonoRef value={bundle.bundleId} />
                </td>
                <td>
                  <button className="button button-compact button-quiet" type="button" onClick={() => download(bundle)}>
                    <DownloadIcon />
                    Télécharger
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>
        ) : (
          <p className="muted">Aucun bundle émis depuis l’ouverture de cet onglet.</p>
        )}
        <Notice>
          La date de validité est affichée, jamais le contenu. Un bundle expiré cesse d’être utilisable : réémettez-en un
          plutôt que de conserver l’ancien.
        </Notice>
      </Panel>
    </section>
  );
}
