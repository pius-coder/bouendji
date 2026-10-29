import { StatusBadge } from "@/components/common/status-badge";
import { platformRolesOf } from "@/lib/roles";
import { getMe, withSession } from "@/server/context";
import { getServices } from "@/server/services";
import { XuiDeleteButton, XuiServerSheet, XuiTestButton } from "./xui-server-sheet";

/**
 * Serveurs 3x-ui du forfait limité et du forfait sur mesure (D113, D127). Un
 * abonnement à quota reçoit un client dédié sur l'un d'eux : sans serveur actif,
 * ces forfaits ne donnent aucune connexion. Réservé à l'owner.
 */
export async function XuiServersSection() {
  const me = await getMe();
  if (!platformRolesOf(me).includes("owner")) return null;
  const servers = await withSession(() => getServices().network.listXuiServers());

  return (
    <section aria-label="Serveurs 3x-ui" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-title-3 font-semibold tracking-tight">Serveurs 3x-ui</h2>
          <p className="text-footnote text-muted-foreground">
            Forfaits à quota (sur mesure, limité) : un client dédié par abonné, data comptée sur le panneau.
          </p>
        </div>
        <XuiServerSheet />
      </div>
      {servers.length === 0 ? (
        <p role="status" className="rounded-xl border border-border bg-warning-soft px-4 py-3 text-footnote text-warning-text">
          Aucun serveur : un forfait à quota vendu maintenant ne donnerait aucune connexion. Ajoutez un panneau avant d’activer
          l’offre sur mesure.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
          {servers.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{s.label}</span>
                  <StatusBadge status={s.active ? "active" : "inactive"} />
                </div>
                <p className="font-mono text-footnote text-muted-foreground">
                  {s.publicHost}:{s.publicPort} · inbound {s.inboundId} · {s.assigned}/{s.capacity} abonnés ·{" "}
                  {s.tokenSet ? "jeton enregistré" : "jeton manquant"}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <XuiTestButton serverId={s.id} />
                <XuiDeleteButton serverId={s.id} label={s.label} assigned={s.assigned} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
