import Link from "next/link";
import type { ReactNode } from "react";
import { DetailPanel } from "@/components/common/detail-panel";
import type { IconName } from "@/components/common/icon";
import { Icon } from "@/components/common/icon";
import { StatusBadge } from "@/components/common/status-badge";
import { EmptyBlock } from "@/components/page/empty";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatXaf, NO_VALUE } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getHomeAccess, getPayouts, getPool } from "@/server/loaders/home";
import { loadHomeParams, parseHomeOpen, serializeHome } from "@/server/query/home.params";
import { ApprovePayoutButton } from "./approve-payout-button";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Panneau de détail de l'élément ouvert dans « À traiter » (`h_open`). Rendu serveur :
 * relit la même liste que la file (dédoublonnée), cherche l'élément, affiche les faits
 * et l'action possible. Rien ouvert : rien rendu (la grille reste à une colonne).
 * Même mise en forme que le tiroir des versements (`payouts/payout-drawer.tsx`) :
 * en-tête (statut, date), sections à tuile d'icône, lignes libellé / valeur.
 */
export async function HomeDetail({ searchParams }: { searchParams: SearchParams }) {
  const { period, open } = await loadHomeParams(searchParams);
  const target = parseHomeOpen(open);
  if (!target) return null;
  const closeHref = `/${serializeHome({ period, open: null })}`;
  const access = await getHomeAccess();

  if (target.kind === "payout" && access.payouts) {
    const payout = (await getPayouts()).find((p) => p.id === target.id);
    if (!payout) return <Missing closeHref={closeHref} />;
    const amount = formatXaf(payout.amountXaf);
    return (
      <DetailPanel
        title={`Versement de ${amount}`}
        subtitle={payout.communityName ?? payout.communityId}
        closeHref={closeHref}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/payouts">Ouvrir dans Versements</Link>
            </Button>
            {payout.status === "pending" && access.payoutsApprove ? <ApprovePayoutButton payoutId={payout.id} amountLabel={amount} /> : null}
          </>
        }
      >
        <Header status={payout.status} date={payout.createdAt} />
        <DetailSection icon="wallet" title="Montant">
          <Line label="Montant" value={amount} strong />
          <Line label="Devise" value={payout.currency} />
          <Line label="Tentatives" value={String(payout.attempts)} />
        </DetailSection>
        <DetailSection icon="history" title="Étapes">
          <Line label="Créé" value={formatDateTime(payout.createdAt)} />
          <Line label="Approuvé" value={formatDateTime(payout.approvedAt)} />
          <Line label="Pris en charge" value={formatDateTime(payout.claimedAt)} />
          <Line label="Payé" value={formatDateTime(payout.paidAt)} />
          <Line label="Confirmé" value={formatDateTime(payout.confirmedAt)} />
        </DetailSection>
        {payout.failedReason ? (
          <DetailSection icon="danger" title="Incident">
            <p className="text-subhead text-destructive">{payout.failedReason}</p>
          </DetailSection>
        ) : null}
        <DetailSection icon="receipt" title="Références">
          <Line label="Référence fournisseur" value={payout.providerRef ?? NO_VALUE} mono={Boolean(payout.providerRef)} />
          <Line label="Identifiant" value={payout.id} mono />
        </DetailSection>
        {payout.note ? (
          <DetailSection icon="pen" title="Note">
            <p className="text-subhead text-foreground">{payout.note}</p>
          </DetailSection>
        ) : null}
      </DetailPanel>
    );
  }

  if (target.kind === "endpoint" && access.network) {
    const endpoint = (await getPool()).endpoints.find((e) => e.endpointId === target.id);
    if (!endpoint) return <Missing closeHref={closeHref} />;
    return (
      <DetailPanel
        title={`Nœud ${endpoint.label}`}
        subtitle={`Région ${endpoint.region} · ${endpoint.tier}`}
        closeHref={closeHref}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/network">Ouvrir dans Réseau</Link>
          </Button>
        }
      >
        <Header status={endpoint.health} date={endpoint.lastSeenAt} dateLabel="Dernier signal" />
        <DetailSection icon="server" title="Disponibilité">
          <Line label="Hors service depuis" value={formatDateTime(endpoint.downSince)} />
          <Line label="Expire le" value={formatDateTime(endpoint.expiresAt)} />
        </DetailSection>
        <DetailSection icon="history" title="Charge">
          <Line label="Occupation" value={`${endpoint.inUse} / ${endpoint.capacity}`} />
          <Line label="Latence" value={endpoint.latencyMs !== null ? `${endpoint.latencyMs} ms` : NO_VALUE} />
        </DetailSection>
        {endpoint.downReason ? (
          <DetailSection icon="danger" title="Incident">
            <p className="text-subhead text-destructive">{endpoint.downReason}</p>
          </DetailSection>
        ) : null}
      </DetailPanel>
    );
  }

  return <Missing closeHref={closeHref} />;
}

/** En-tête du tiroir : statut en pastille, date à côté (Chariow : identifiant, date, badge). */
function Header({ status, date, dateLabel = "Créé le" }: { status: string; date: string | null; dateLabel?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <StatusBadge status={status} />
      <span className="text-footnote text-muted-foreground">
        {dateLabel} {formatDateTime(date)}
      </span>
    </div>
  );
}

/** Section du tiroir : petite tuile d'icône + titre gras + filet, puis les lignes. */
function DetailSection({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 border-b border-border pb-3 text-subhead font-bold text-foreground">
        <span className="grid size-6 place-items-center rounded-md bg-group text-muted-foreground">
          <Icon name={icon} className="size-4" />
        </span>
        {title}
      </h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

/** Ligne libellé gris à gauche, valeur à droite. */
function Line({ label, value, strong = false, mono = false }: { label: string; value: ReactNode; strong?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-subhead">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 text-end break-words text-foreground tabular-nums select-text", strong && "font-bold", mono && "font-mono text-footnote")}>
        {value}
      </span>
    </div>
  );
}

function Missing({ closeHref }: { closeHref: string }) {
  return (
    <DetailPanel title="Élément introuvable" closeHref={closeHref}>
      <EmptyBlock icon="inbox" title="Cet élément n’est plus dans la file" description="Il a peut-être déjà été traité. La liste a été relue." />
    </DetailPanel>
  );
}
