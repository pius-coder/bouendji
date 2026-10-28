import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Icon } from "@/components/common/icon";
import { PhonePreview } from "@/components/common/phone-preview";
import { ShareAppCard } from "@/components/common/qr-code";
import { StatusBadge } from "@/components/common/status-badge";
import { EntityLink } from "@/components/drawers/entity-link";
import { UniversalDrawerHost } from "@/components/drawers/universal-drawer-host";
import { shortId } from "@/components/offline/offline-status";
import { EmptyBlock } from "@/components/page/empty";
import { PageContent, PageHeader } from "@/components/page/page";
import { Button } from "@/components/ui/button";
import type { DrawerKind } from "@/lib/drawers";
import { formatBytes, formatDateTime, formatXaf } from "@/lib/format";
import { can, ROLE_LABEL, roleIn } from "@/lib/roles";
import { getCommunities, getMe, withSession } from "@/server/context";
import { getServices } from "@/server/services";
import type { Build } from "@/server/services/builds/builds.service";
import { BRAND_THEMES, type BrandTheme } from "@/server/services/onboarding/onboarding.schema";

export const metadata: Metadata = { title: "Accueil" };

const TODO_META: Record<
  string,
  { label: string; description: string; drawerKind: DrawerKind; icon: "receipt" | "download" | "wallet" | "smartphone" }
> = {
  order_pending: {
    label: "Paiement en attente de confirmation",
    description: "Vérifier le statut Fapshi et l'activation de l'abonnement",
    drawerKind: "commande",
    icon: "receipt",
  },
  build_requested: {
    label: "Demande d'application Android",
    description: "Valider le manifeste de la marque ou indiquer un motif de refus",
    drawerKind: "build",
    icon: "download",
  },
  payout_pending: {
    label: "Versement en attente d'approbation",
    description: "Contrôler les commissions incluses et approuver le virement",
    drawerKind: "versement",
    icon: "wallet",
  },
  device_failing: {
    label: "Appareil en échec de connexion",
    description: "Consulter la santé 24h ou émettre un fichier de secours (.bvpn)",
    drawerKind: "appareil",
    icon: "smartphone",
  },
};

function targetToDrawerKind(targetType: string | null | undefined): DrawerKind | null {
  if (!targetType) return null;
  const t = targetType.toLowerCase();
  if (t.includes("user") || t.includes("subscriber") || t.includes("abonne")) return "abonne";
  if (t.includes("device") || t.includes("appareil")) return "appareil";
  if (t.includes("order") || t.includes("commande")) return "commande";
  if (t.includes("plan") || t.includes("forfait")) return "forfait";
  if (t.includes("payout") || t.includes("versement")) return "versement";
  if (t.includes("build")) return "build";
  return null;
}

/**
 * Accueil Refonte v2 (`docs/refonte-admin/parcours-admin-bouendji-v2.md` §22) :
 * 1. Carte Onboarding & État de la demande d'application (`GET /v1/admin/onboarding` + builds)
 * 2. Chiffres du jour cliquables (`GET /v1/admin/communities/:id/summary`)
 * 3. File « À traiter » (clic → ouvre directement le tiroir Sheet) + Carte « Partager l'application » (QR SVG + WhatsApp)
 * 4. Activité récente (`GET /v1/admin/communities/:id/audit-log`, chaque ligne ouvre son tiroir)
 * 5. Tiroir universel (`UniversalDrawerHost`)
 */
export default function HomePage({ searchParams }: PageProps<"/">) {
  return (
    <PageContent wide>
      <Suspense fallback={<HomeV2Skeleton />}>
        <HomeV2Content />
      </Suspense>
      <Suspense fallback={null}>
        <HomeDrawerLoader searchParams={searchParams} />
      </Suspense>
    </PageContent>
  );
}

function HomeV2Skeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-16 animate-pulse rounded-section bg-muted/40" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="h-28 animate-pulse rounded-section bg-muted/40" />
        <div className="h-28 animate-pulse rounded-section bg-muted/40" />
        <div className="h-28 animate-pulse rounded-section bg-muted/40" />
        <div className="h-28 animate-pulse rounded-section bg-muted/40" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="h-72 animate-pulse rounded-section bg-muted/40" />
        <div className="h-72 animate-pulse rounded-section bg-muted/40" />
      </div>
    </div>
  );
}

async function HomeV2Content() {
  const services = getServices();
  const [me, communities, onboarding, allApps] = await Promise.all([
    getMe(),
    getCommunities(),
    withSession(() => services.onboarding.getOnboarding()).catch(() => ({
      step: 1,
      completedAt: null,
      guideStep: 0,
      guideDoneAt: null,
      communityId: null,
      appId: null,
    })),
    withSession(() => services.plans.listApps()).catch(() => []),
  ]);

  const primaryCommunity = communities[0] ?? null;
  const cid = primaryCommunity?.id ?? null;
  const role = roleIn(me, cid);
  const isOwner = me.platformRole === "owner";

  const [summary, auditItems, pendingPayouts] = await Promise.all([
    cid
      ? withSession(() => services.communities.getSummary({ communityId: cid })).catch(() => null)
      : Promise.resolve(null),
    cid && can(me, "audit.read", cid)
      ? withSession(() => services.audit.listAuditEntries({ communityId: cid, limit: 8 })).catch(() => [])
      : Promise.resolve([]),
    can(me, "payouts.read", null)
      ? withSession(() => services.payouts.listPayouts({ status: "pending", limit: 5 })).catch(() => [])
      : Promise.resolve([]),
  ]);

  const primaryApp = cid ? (allApps.find((a) => a.communityId === cid) ?? null) : null;
  const primaryBuilds = primaryApp
    ? await withSession(() => services.builds.listBuilds({ appId: primaryApp.id })).catch(() => [])
    : [];
  const latestBuild = primaryBuilds[0] ?? null;
  const readyBuild =
    primaryBuilds.find((b) => b.apkUrl && (b.status === "Ready" || b.status === "succeeded")) ??
    primaryBuilds.find((b) => b.apkUrl) ??
    null;

  // Demandes de build en attente pour l'owner
  const requestedBuilds: Array<{ communityName: string; appName: string; build: Build }> = [];
  if (isOwner && allApps.length > 0) {
    const commById = new Map(communities.map((c) => [c.id, c.name]));
    const perApp = await Promise.all(
      allApps.slice(0, 12).map(async (a) => ({
        app: a,
        builds: await withSession(() => services.builds.listBuilds({ appId: a.id })).catch(() => []),
      })),
    );
    for (const entry of perApp) {
      for (const b of entry.builds) {
        if (b.status === "requested") {
          requestedBuilds.push({
            communityName: commById.get(entry.app.communityId) ?? entry.app.communityId,
            appName: entry.app.name,
            build: b,
          });
        }
      }
    }
  }

  const salesTodayXaf = summary?.sales.today.amountXaf ?? 0;
  const salesTodayCount = summary?.sales.today.count ?? 0;
  const salesMonthCount = summary?.sales.month.count ?? 0;
  const activeSubscribers = summary?.activeSubscribers ?? 0;
  const usageTodayBytes = summary?.usageTodayBytes ?? 0;
  const commissionsAvailXaf = summary?.commissionsAvailable?.amountXaf ?? 0;
  const commissionsAvailCount = summary?.commissionsAvailable?.count ?? 0;

  const safeTheme: BrandTheme =
    primaryApp && (BRAND_THEMES as readonly string[]).includes(primaryApp.theme)
      ? (primaryApp.theme as BrandTheme)
      : "billet";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={primaryCommunity ? primaryCommunity.name : "Bienvenue sur Bouendji"}
        description={
          primaryCommunity
            ? `Tableau de bord ${role ? `(${ROLE_LABEL[role]})` : ""} · Chiffres du jour, actions prioritaires et partage de votre application Android.`
            : "Créez votre communauté, votre marque Android et vos forfaits en 6 étapes."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/onboarding">
                <Icon name="tag" className="size-4" />
                Assistant marque & APK (6 étapes)
              </Link>
            </Button>
            {cid ? (
              <Button asChild size="sm">
                <Link href={`/${cid}/plans?tab=forfaits`}>
                  <Icon name="plus" className="size-4" />
                  Gérer mes offres
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />

      {/* 1. CARTE ONBOARDING & ÉTAT DE L'APPLICATION */}
      {!onboarding.completedAt || !primaryCommunity || !primaryApp ? (
        <div className="flex flex-col justify-between gap-4 rounded-section border-2 border-foreground/20 bg-accent/15 p-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3.5">
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-foreground text-background">
              <Icon name="smartphone" className="size-5" />
            </span>
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-title-3 font-semibold text-foreground">
                  Configuration de votre marque ({Math.min(6, Math.max(1, onboarding.step || 1))} sur 6)
                </p>
                <span className="rounded-full bg-foreground px-2.5 py-0.5 text-caption font-semibold text-background">
                  Libre-service
                </span>
              </div>
              <p className="text-subhead text-muted-foreground">
                Personnalisez le nom de votre application, votre thème Android, votre groupe WhatsApp, vos prix au-dessus du plancher et demandez votre APK.
              </p>
            </div>
          </div>
          <Button asChild className="shrink-0">
            <Link href="/onboarding">
              Reprendre à l&apos;étape {Math.min(6, Math.max(1, onboarding.step || 1))}
            </Link>
          </Button>
        </div>
      ) : latestBuild && latestBuild.status !== "Ready" && latestBuild.status !== "succeeded" ? (
        <div className="flex flex-col justify-between gap-4 rounded-section border border-separator bg-muted/40 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <StatusBadge status={latestBuild.status} />
            <div>
              <p className="text-subhead font-semibold text-foreground">
                Application « {primaryApp.name} » · Version {latestBuild.versionName ?? "1.0.0"}
              </p>
              <p className="text-footnote text-muted-foreground">
                {latestBuild.status === "requested"
                  ? "Votre demande d'application est en attente de validation par l'administrateur de la plateforme."
                  : latestBuild.status === "rejected"
                    ? `Demande refusée : ${latestBuild.rejectReason || "Vérifiez la configuration de votre marque."}`
                    : "Compilation de votre APK en cours sur la pipeline."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <EntityLink kind="build" id={latestBuild.id} className="no-underline">
                Voir la fiche du build
              </EntityLink>
            </Button>
            {latestBuild.status === "rejected" ? (
              <Button asChild size="sm">
                <Link href="/onboarding">Corriger dans l&apos;assistant</Link>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 2. CHIFFRES DU JOUR CLIQUABLES (GET /v1/admin/communities/:id/summary) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href={cid ? `/${cid}/subscribers?tab=commandes` : "/payouts"}
          className="group flex flex-col justify-between gap-3 rounded-section border border-separator bg-background p-4 transition-colors hover:border-foreground/40 hover:bg-muted/20"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-footnote font-medium">Ventes du jour</span>
            <Icon name="receipt" className="size-4 transition-transform group-hover:translate-x-0.5" />
          </div>
          <div>
            <p className="text-title-2 font-bold tabular-nums text-foreground">
              {formatXaf(salesTodayXaf)}
            </p>
            <p className="mt-0.5 text-caption text-muted-foreground">
              {salesTodayCount} commande{salesTodayCount > 1 ? "s" : ""} aujourd&apos;hui · {salesMonthCount} ce mois
            </p>
          </div>
        </Link>

        <Link
          href={cid ? `/${cid}/subscribers?tab=abonnes` : "/communities"}
          className="group flex flex-col justify-between gap-3 rounded-section border border-separator bg-background p-4 transition-colors hover:border-foreground/40 hover:bg-muted/20"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-footnote font-medium">Abonnés actifs</span>
            <Icon name="users" className="size-4 transition-transform group-hover:translate-x-0.5" />
          </div>
          <div>
            <p className="text-title-2 font-bold tabular-nums text-foreground">
              {activeSubscribers.toLocaleString("fr-FR")}
            </p>
            <p className="mt-0.5 text-caption text-muted-foreground">
              Ouvrir la liste des abonnés →
            </p>
          </div>
        </Link>

        <Link
          href={cid ? `/${cid}/subscribers?tab=appareils` : "/network"}
          className="group flex flex-col justify-between gap-3 rounded-section border border-separator bg-background p-4 transition-colors hover:border-foreground/40 hover:bg-muted/20"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-footnote font-medium">Data consommée (jour)</span>
            <Icon name="smartphone" className="size-4 transition-transform group-hover:translate-x-0.5" />
          </div>
          <div>
            <p className="text-title-2 font-bold tabular-nums text-foreground">
              {formatBytes(usageTodayBytes)}
            </p>
            <p className="mt-0.5 text-caption text-muted-foreground">
              Voir les appareils connectés →
            </p>
          </div>
        </Link>

        <Link
          href={cid ? `/${cid}/commissions?tab=commissions` : "/payouts"}
          className="group flex flex-col justify-between gap-3 rounded-section border border-separator bg-background p-4 transition-colors hover:border-foreground/40 hover:bg-muted/20"
        >
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-footnote font-medium">Commissions disponibles</span>
            <Icon name="wallet" className="size-4 transition-transform group-hover:translate-x-0.5" />
          </div>
          <div>
            <p className="text-title-2 font-bold tabular-nums text-positive">
              {formatXaf(commissionsAvailXaf)}
            </p>
            <p className="mt-0.5 text-caption text-muted-foreground">
              {commissionsAvailCount} commission{commissionsAvailCount > 1 ? "s" : ""} prête{commissionsAvailCount > 1 ? "s" : ""} au retrait →
            </p>
          </div>
        </Link>
      </div>

      {/* 3. GRILLE PRINCIPALE : À TRAITER (GAUCHE) & PARTAGER L'APPLICATION + APERÇU (DROITE) */}
      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="flex flex-col gap-6">
          {/* File À traiter */}
          <section className="flex flex-col gap-3 rounded-section border border-separator bg-background p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-title-3 font-semibold text-foreground">À traiter</h2>
                <p className="text-footnote text-muted-foreground">
                  Cliquez sur une ligne pour ouvrir directement son tiroir d&apos;action.
                </p>
              </div>
              {isOwner ? (
                <Link
                  href="/communities?tab=builds"
                  className="text-footnote font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  Toutes les demandes Plateforme
                </Link>
              ) : null}
            </div>

            {(!summary || summary.todo.length === 0) &&
            requestedBuilds.length === 0 &&
            pendingPayouts.length === 0 ? (
              <EmptyBlock
                icon="check"
                title="Rien en attente"
                description="Aucun paiement bloqué, aucune demande de build ni appareil en alerte pour le moment."
              />
            ) : (
              <ul className="divide-y divide-separator overflow-hidden rounded-xl border border-separator">
                {/* Demandes de build pour l'owner */}
                {requestedBuilds.map((item) => (
                  <li
                    key={`req-build-${item.build.id}`}
                    className="flex items-center justify-between gap-3 bg-accent/10 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <EntityLink kind="build" id={item.build.id} className="text-subhead font-semibold">
                        <Icon name="download" className="size-4 text-foreground" />
                        <span>
                          Build demandé : {item.appName} ({item.communityName})
                        </span>
                      </EntityLink>
                      <p className="text-caption text-muted-foreground">
                        Version {item.build.versionName ?? "1.0.0"} · Cliquez pour valider ou refuser
                      </p>
                    </div>
                    <StatusBadge status={item.build.status} />
                  </li>
                ))}

                {/* Éléments du résumé de la communauté (commandes, builds, versements, appareils) */}
                {(summary?.todo ?? []).flatMap((todo) => {
                  const meta = TODO_META[todo.kind];
                  if (!meta) return [];
                  return todo.ids.slice(0, 4).map((id) => (
                    <li key={`${todo.kind}-${id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <EntityLink kind={meta.drawerKind} id={id} className="text-subhead">
                          <Icon name={meta.icon} className="size-4 text-muted-foreground" />
                          <span>
                            {meta.label} ({shortId(id)})
                          </span>
                        </EntityLink>
                        <p className="text-caption text-muted-foreground">{meta.description}</p>
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <EntityLink kind={meta.drawerKind} id={id} className="no-underline">
                          Ouvrir
                        </EntityLink>
                      </Button>
                    </li>
                  ));
                })}

                {/* Versements en attente */}
                {pendingPayouts.map((p) => (
                  <li key={`payout-${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <EntityLink kind="versement" id={p.id} className="text-subhead">
                        <Icon name="wallet" className="size-4 text-muted-foreground" />
                        <span>
                          Versement {shortId(p.id)} · {formatXaf(p.amountXaf)}
                        </span>
                      </EntityLink>
                      <p className="text-caption text-muted-foreground">
                        {p.communityName || p.communityId} · Créé le {formatDateTime(p.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={p.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 4. ACTIVITÉ RÉCENTE (GET /v1/admin/communities/:id/audit-log) */}
          <section className="flex flex-col gap-3 rounded-section border border-separator bg-background p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-title-3 font-semibold text-foreground">Activité récente</h2>
                <p className="text-footnote text-muted-foreground">
                  Dernières opérations de la communauté. Chaque cible ouvre sa fiche en tiroir.
                </p>
              </div>
              {cid ? (
                <Link
                  href={`/${cid}/audit?tab=journal`}
                  className="text-footnote font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  Journal complet →
                </Link>
              ) : null}
            </div>

            {auditItems.length === 0 ? (
              <p className="py-6 text-center text-subhead text-muted-foreground">
                Aucune activité récente enregistrée pour cette communauté.
              </p>
            ) : (
              <ul className="divide-y divide-separator overflow-hidden rounded-xl border border-separator">
                {auditItems.map((entry) => {
                  const kind = targetToDrawerKind(entry.targetType);
                  return (
                    <li key={entry.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-subhead">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">{entry.action}</p>
                        <p className="truncate text-caption text-muted-foreground">
                          {formatDateTime(entry.createdAt)}
                        </p>
                      </div>
                      {kind && entry.targetId ? (
                        <EntityLink kind={kind} id={entry.targetId} className="font-mono text-caption">
                          {entry.targetType} · {shortId(entry.targetId)}
                        </EntityLink>
                      ) : entry.targetId ? (
                        <span className="font-mono text-caption text-muted-foreground">
                          {shortId(entry.targetId)}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        {/* Colonne droite : Partager l'app (QR code SVG + WhatsApp) & Aperçu téléphone Android */}
        <div className="flex flex-col gap-5">
          <ShareAppCard
            appName={primaryApp?.name ?? (primaryCommunity ? `${primaryCommunity.name} VPN` : "Mon Application VPN")}
            apkUrl={readyBuild?.apkUrl ?? null}
            versionName={readyBuild?.versionName ?? latestBuild?.versionName ?? null}
            whatsappGroupUrl={primaryCommunity?.whatsappGroupUrl}
          />

          <div className="flex flex-col items-center gap-3 rounded-section border border-separator bg-background p-5">
            <div className="flex w-full items-center justify-between">
              <div>
                <h3 className="text-subhead font-semibold text-foreground">Aperçu de votre marque</h3>
                <p className="text-caption text-muted-foreground">
                  Ce que voient vos abonnés à l&apos;ouverture de l&apos;application.
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={cid ? `/${cid}/builds?tab=application` : "/onboarding"}>
                  Modifier
                </Link>
              </Button>
            </div>
            <PhonePreview
              displayName={primaryApp?.name ?? (primaryCommunity ? `${primaryCommunity.name} VPN` : "Mon VPN")}
              theme={safeTheme}
              packageName={primaryApp?.packageName}
              communityName={primaryCommunity?.name}
              whatsappGroupUrl={primaryCommunity?.whatsappGroupUrl}
              compact
            />
          </div>
        </div>
      </div>
    </div>
  );
}

async function HomeDrawerLoader({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const services = getServices();
  const [me, communities, pricing] = await Promise.all([
    getMe(),
    getCommunities(),
    withSession(() => services.pricing.getPricing()).catch(() => undefined),
  ]);
  const primary = communities[0];
  return (
    <UniversalDrawerHost
      pathname="/"
      searchParams={searchParams}
      me={me}
      communityId={primary?.id}
      commissionBps={primary?.commissionBps}
      pricing={pricing}
      appName={primary?.name ? `${primary.name} VPN` : "Application VPN"}
    />
  );
}
