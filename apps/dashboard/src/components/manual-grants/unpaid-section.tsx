import Link from "next/link";
import { cache } from "react";
import { Icon } from "@/components/common/icon";
import { StatusBadge } from "@/components/common/status-badge";
import { UpdatedAt } from "@/components/common/updated-at";
import { EntityLink } from "@/components/drawers/entity-link";
import { EmptyBlock, ForbiddenBlock } from "@/components/page/empty";
import { CellStack, TableMessage, TableRows, type TableColumn } from "@/components/page/table";
import { formatDateTime, formatXaf, NO_VALUE } from "@/lib/format";
import { can, platformRolesOf } from "@/lib/roles";
import { getMe, withSession } from "@/server/context";
import { getServices } from "@/server/services";
import { PAYMENT_METHOD_LABEL } from "@/server/services/manual-grants/manual-grants.schema";
import { RefreshSettlementButton, SettleButton } from "./settlement-buttons";

type Params = Promise<{ communityId: string }>;

/** Une lecture par requête, partagée par les chiffres, le bandeau et le tableau. */
const loadOwed = cache((communityId: string) => withSession(() => getServices().manualGrants.owed(communityId)));
const loadSettlements = cache((communityId: string) => withSession(() => getServices().manualGrants.listSettlements(communityId)));
const loadAllOwed = cache(() => withSession(() => getServices().manualGrants.owed()));

async function allowed(communityId: string): Promise<boolean> {
  return can(await getMe(), "manual_grants.manage", communityId);
}

export const UNPAID_COLUMNS = [
  { id: "user", header: "Abonné", mobile: "primary" },
  { id: "amount", header: "Dû", align: "right", mobile: "trailing" },
  { id: "plan", header: "Forfait", mobile: "secondary" },
  { id: "method", header: "Payé par" },
  { id: "grantedAt", header: "Accordé le" },
  { id: "grantedBy", header: "Par", wide: true },
  { id: "note", header: "Note", wide: true },
] as const satisfies readonly TableColumn[];

export const SETTLEMENT_COLUMNS = [
  { id: "amount", header: "Montant", mobile: "primary" },
  { id: "status", header: "Statut", mobile: "trailing" },
  { id: "grants", header: "Accès", align: "right", mobile: "secondary" },
  { id: "createdAt", header: "Créé le" },
  { id: "paidAt", header: "Payé le" },
  { id: "actions", header: "", align: "right" },
] as const satisfies readonly TableColumn[];

export const COMMUNITY_COLUMNS = [
  { id: "community", header: "Communauté", mobile: "primary" },
  { id: "count", header: "Accès", align: "right", mobile: "secondary" },
  { id: "total", header: "Total dû", align: "right", mobile: "trailing" },
] as const satisfies readonly TableColumn[];

/* ------------------------------------------------------------- en-tête */

export async function SettleAction({ params }: { params: Params }) {
  const { communityId } = await params;
  if (!(await allowed(communityId))) return null;
  const data = await loadOwed(communityId);
  if (data.owed.totalXaf <= 0) return null;
  return <SettleButton communityId={communityId} totalXaf={data.owed.totalXaf} />;
}

/** Avertissement (décision par défaut : on peut accorder malgré des impayés, mais on le voit). */
export async function UnpaidWarning({ params }: { params: Params }) {
  const { communityId } = await params;
  if (!(await allowed(communityId))) return null;
  const data = await loadOwed(communityId);
  if (data.owed.count === 0) return null;
  return (
    <p role="status" className="flex items-start gap-2 rounded-xl border border-border bg-warning-soft px-4 py-3 text-footnote text-warning-text">
      <Icon name="warning" className="mt-0.5 size-4 shrink-0" />
      <span>
        Cette communauté doit <strong className="font-semibold">{formatXaf(data.owed.totalXaf)}</strong> à la plateforme pour{" "}
        {data.owed.count} accès accordé{data.owed.count > 1 ? "s" : ""} à la main. Les nouveaux accès restent possibles ; la commission
        de la communauté sur ces accès n&apos;est créditée qu&apos;après le versement.
      </span>
    </p>
  );
}

export async function OwedTotalValue({ params }: { params: Params }) {
  const { communityId } = await params;
  if (!(await allowed(communityId))) return <>{NO_VALUE}</>;
  return <>{formatXaf((await loadOwed(communityId)).owed.totalXaf)}</>;
}

export async function OwedCountValue({ params }: { params: Params }) {
  const { communityId } = await params;
  if (!(await allowed(communityId))) return <>{NO_VALUE}</>;
  return <>{(await loadOwed(communityId)).owed.count}</>;
}

export async function LastSettlementValue({ params }: { params: Params }) {
  const { communityId } = await params;
  if (!(await allowed(communityId))) return <>{NO_VALUE}</>;
  const last = (await loadSettlements(communityId)).find((s) => s.status === "paid" || s.status === "needs_review");
  return <>{last ? formatXaf(last.amountXaf) : NO_VALUE}</>;
}

/* ---------------------------------------------------------- impayés */

export async function UnpaidRows({ params }: { params: Params }) {
  const { communityId } = await params;
  if (!(await allowed(communityId))) {
    return (
      <TableMessage columns={UNPAID_COLUMNS}>
        <ForbiddenBlock />
      </TableMessage>
    );
  }
  const data = await loadOwed(communityId);
  if (data.items.length === 0) {
    return (
      <TableMessage columns={UNPAID_COLUMNS}>
        <EmptyBlock
          icon="check"
          tone="success"
          title="Aucun impayé"
          description="Chaque forfait accordé à la main depuis la fiche d'un abonné apparaît ici jusqu'à son versement."
        />
      </TableMessage>
    );
  }
  return (
    <TableRows
      rows={data.items}
      columns={UNPAID_COLUMNS}
      getKey={(g) => g.id}
      cells={(g) => ({
        user: (
          <EntityLink kind="abonne" id={g.userId} className="text-subhead">
            {g.userName || "Abonné"}
          </EntityLink>
        ),
        amount: formatXaf(g.amountXaf),
        plan: g.planName,
        method: PAYMENT_METHOD_LABEL[g.paymentMethod],
        grantedAt: formatDateTime(g.grantedAt),
        grantedBy: g.grantedByName ?? NO_VALUE,
        note: g.note ? <span className="line-clamp-2 whitespace-normal">{g.note}</span> : NO_VALUE,
      })}
    />
  );
}

export async function UnpaidFooter({ params }: { params: Params }) {
  const { communityId } = await params;
  if (!(await allowed(communityId))) return <UpdatedAt />;
  const data = await loadOwed(communityId);
  return (
    <>
      <span className="text-footnote text-muted-foreground">
        {data.truncated ? `${data.items.length} premiers accès affichés · ` : ""}
        Total dû : <strong className="font-semibold text-foreground">{formatXaf(data.owed.totalXaf)}</strong>
      </span>
      <UpdatedAt />
    </>
  );
}

/* -------------------------------------------------------- versements */

export async function SettlementRows({ params }: { params: Params }) {
  const { communityId } = await params;
  if (!(await allowed(communityId))) {
    return (
      <TableMessage columns={SETTLEMENT_COLUMNS}>
        <ForbiddenBlock />
      </TableMessage>
    );
  }
  const items = await loadSettlements(communityId);
  if (items.length === 0) {
    return (
      <TableMessage columns={SETTLEMENT_COLUMNS}>
        <EmptyBlock icon="wallet" title="Aucun versement" description="« Verser » crée un lien de paiement Fapshi pour le total dû." />
      </TableMessage>
    );
  }
  return (
    <TableRows
      rows={items}
      columns={SETTLEMENT_COLUMNS}
      getKey={(s) => s.id}
      cells={(s) => ({
        amount: <CellStack title={formatXaf(s.amountXaf)} subtitle={s.createdByName ? `Par ${s.createdByName}` : undefined} />,
        status: <StatusBadge status={`settlement_${s.status}`} />,
        grants: String(s.grantCount),
        createdAt: formatDateTime(s.createdAt),
        paidAt: s.paidAt ? formatDateTime(s.paidAt) : NO_VALUE,
        actions:
          s.status === "pending" || s.status === "failed" ? (
            <span className="inline-flex items-center gap-1">
              {s.paymentUrl ? (
                <a
                  href={s.paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-caption-1 font-semibold text-accent-text underline-offset-4 hover:underline"
                >
                  Ouvrir le lien
                </a>
              ) : null}
              <RefreshSettlementButton settlementId={s.id} />
            </span>
          ) : null,
      })}
    />
  );
}

/* ------------------------------------------- toutes les communautés (owner) */

export async function AllCommunitiesRows() {
  const me = await getMe();
  if (!platformRolesOf(me).includes("owner")) return null;
  const data = await loadAllOwed();
  if (data.communities.length === 0) {
    return (
      <TableMessage columns={COMMUNITY_COLUMNS}>
        <EmptyBlock icon="check" tone="success" title="Aucun impayé sur la plateforme" />
      </TableMessage>
    );
  }
  return (
    <TableRows
      rows={data.communities}
      columns={COMMUNITY_COLUMNS}
      getKey={(c) => c.communityId}
      cells={(c) => ({
        community: (
          <Link href={`/${c.communityId}/manual-grants`} className="text-subhead font-medium text-foreground hover:underline">
            {c.communityName || "Communauté"}
          </Link>
        ),
        count: String(c.count),
        total: formatXaf(c.totalXaf),
      })}
    />
  );
}
