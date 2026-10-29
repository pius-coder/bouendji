import "server-only";
import { BuildSheetBody } from "@/components/drawers/build-sheet";
import { DeviceSheetBody } from "@/components/drawers/device-sheet";
import { DrawerHost, type DrawerRegistry } from "@/components/drawers/drawer-host";
import { OrderSheetBody } from "@/components/drawers/order-sheet";
import { PayoutSheetBody } from "@/components/drawers/payout-sheet";
import { PlanSheetBody } from "@/components/drawers/plan-sheet-view";
import { SubscriberSheetBody } from "@/components/drawers/subscriber-sheet";
import { shortId } from "@/components/offline/offline-status";
import { parseDrawer, type SearchParamsLike } from "@/lib/drawers";
import { formatDateTime } from "@/lib/format";
import { can, type RoleSource } from "@/lib/roles";
import { getCommunities, getMe } from "@/server/context";
import { getServices } from "@/server/services";
import type { Build } from "@/server/services/builds/builds.service";
import type { OfflineBundleState } from "@/server/services/devices/devices.schema";
import type { Plan } from "@/server/services/plans/plans.schema";
import type { PricingSettings } from "@/server/services/pricing/pricing.schema";

/**
 * Bloc serveur atomique à monter dans `<Suspense fallback={null}>` sur chaque page.
 * Ne déclenche de lecture API que lorsqu'un paramètre de tiroir (`?abonne=`, `?appareil=`,
 * `?commande=`, `?forfait=`, `?versement=`, `?build=`) est réellement présent dans l'URL.
 */
export async function UniversalDrawerSection({
  params,
  searchParams,
  routeSegment,
  pathname: explicitPathname,
}: {
  params?: Promise<{ communityId: string }>;
  searchParams: SearchParamsLike | Promise<SearchParamsLike>;
  routeSegment?: string;
  pathname?: string;
}) {
  const resolvedSearch = await searchParams;
  const open = parseDrawer(resolvedSearch);
  if (!open) return null;

  const resolvedParams = params ? await params : undefined;
  const communityId = resolvedParams?.communityId;
  const pathname =
    explicitPathname ??
    (communityId && routeSegment ? `/${communityId}/${routeSegment}` : routeSegment ? `/${routeSegment}` : "/");

  const services = getServices();
  const me = await getMe();

  const needsBundles =
    Boolean(communityId) &&
    (open.kind === "abonne" || open.kind === "appareil") &&
    can(me, "devices.offline", communityId ?? null);

  const needsPricing = open.kind === "forfait";

  const [offlineBundles, communities, pricing] = await Promise.all([
    needsBundles && open.kind === "appareil"
      ? services.devices.listOfflineBundles({ deviceId: open.id }).catch(() => [])
      : Promise.resolve([]),
    needsPricing ? getCommunities().catch(() => []) : Promise.resolve([]),
    needsPricing ? services.pricing.getPricing().catch(() => undefined) : Promise.resolve(undefined),
  ]);

  const activeCommunity = communityId ? communities.find((c) => c.id === communityId) : communities[0];

  return (
    <UniversalDrawerHost
      pathname={pathname}
      searchParams={resolvedSearch}
      me={me}
      communityId={communityId}
      commissionBps={activeCommunity?.commissionBps ?? 1500}
      pricing={pricing}
      offlineBundles={offlineBundles}
    />
  );
}

/**
 * Hôte universel des tiroirs (`?abonne=`, `?appareil=`, `?commande=`, `?forfait=`,
 * `?versement=`, `?build=`). Permet à n'importe quelle page du dashboard d'ouvrir
 * n'importe quelle fiche et de naviguer d'une fiche à l'autre sans revenir en arrière.
 */
export async function UniversalDrawerHost({
  pathname,
  searchParams,
  me,
  communityId,
  commissionBps = 1500,
  pricing,
  plans = [],
  builds = [],
  offlineBundles = [],
  appName = "Application VPN",
}: {
  pathname: string;
  searchParams: SearchParamsLike | Promise<SearchParamsLike>;
  me: RoleSource;
  communityId?: string;
  commissionBps?: number;
  pricing?: PricingSettings;
  plans?: readonly Plan[];
  builds?: readonly Build[];
  offlineBundles?: readonly OfflineBundleState[];
  appName?: string;
}) {
  const params = await searchParams;
  const open = parseDrawer(params);
  if (!open) return null;

  const services = getServices();

  const registry: Partial<DrawerRegistry> = {
    abonne: async (id) => {
      try {
        const detail = await services.subscribers.getSubscriber(id);
        const deviceIds = new Set(detail.devices.map((d) => d.deviceId));
        const userBundles = offlineBundles.filter((b) => deviceIds.has(b.deviceId));
        return {
          title: detail.name || detail.phone || detail.email,
          subtitle: `Abonné · ${shortId(detail.id)}`,
          body: <SubscriberSheetBody detail={detail} offlineBundles={userBundles} />,
        };
      } catch {
        return {
          title: `Abonné ${shortId(id)}`,
          subtitle: "Introuvable ou hors périmètre",
          body: (
            <p className="text-subhead text-muted-foreground">
              Impossible de charger la fiche de cet abonné.
            </p>
          ),
        };
      }
    },

    appareil: async (id) => {
      try {
        const detail = await services.devices.getDevice(id);
        const cid = detail.communityId || communityId || null;
        const devBundles = offlineBundles.filter((b) => b.deviceId === id);
        return {
          title: detail.name || `Appareil ${shortId(detail.deviceId)}`,
          subtitle: `${detail.platform} · ${shortId(detail.deviceId)}`,
          body: (
            <DeviceSheetBody
              detail={detail}
              bundles={devBundles}
              caps={{
                revoke: can(me, "devices.revoke", cid),
                offline: can(me, "devices.offline", cid),
              }}
            />
          ),
        };
      } catch {
        return {
          title: `Appareil ${shortId(id)}`,
          subtitle: "Introuvable ou hors périmètre",
          body: (
            <p className="text-subhead text-muted-foreground">
              Impossible de charger la fiche de cet appareil.
            </p>
          ),
        };
      }
    },

    commande: async (id) => {
      try {
        const detail = await services.orders.getOrder(id);
        return {
          title: `Commande ${shortId(detail.id)}`,
          subtitle: formatDateTime(detail.createdAt),
          body: <OrderSheetBody detail={detail} canReconcile={can(me, "orders.reconcile", detail.communityId)} />,
        };
      } catch {
        return {
          title: `Commande ${shortId(id)}`,
          subtitle: "Introuvable ou hors périmètre",
          body: (
            <p className="text-subhead text-muted-foreground">
              Impossible de charger la fiche de cette commande.
            </p>
          ),
        };
      }
    },

    versement: async (id) => {
      try {
        const detail = await services.payouts.getPayout(id);
        const cid = detail.communityId || communityId || null;
        return {
          title: `Versement ${shortId(detail.id)}`,
          subtitle: formatDateTime(detail.createdAt),
          body: (
            <PayoutSheetBody
              detail={detail}
              caps={{
                approve: can(me, "payouts.approve", cid),
                operate: can(me, "payouts.operate", cid),
              }}
            />
          ),
        };
      } catch {
        return {
          title: `Versement ${shortId(id)}`,
          subtitle: "Introuvable ou hors périmètre",
          body: (
            <p className="text-subhead text-muted-foreground">
              Impossible de charger la fiche de ce versement.
            </p>
          ),
        };
      }
    },

    forfait: async (id) => {
      let plan = plans.find((p) => p.id === id);
      if (!plan) {
        try {
          const allApps = await services.plans.listApps();
          const scopedApps = communityId ? allApps.filter((a) => a.communityId === communityId) : allApps;
          for (const a of scopedApps) {
            const appPlans = await services.plans.listPlans({ appId: a.id });
            const found = appPlans.find((p) => p.id === id);
            if (found) {
              plan = found;
              break;
            }
          }
        } catch {
          // ignore
        }
      }
      if (!plan) {
        return {
          title: `Forfait ${shortId(id)}`,
          subtitle: "Introuvable",
          body: (
            <p className="text-subhead text-muted-foreground">
              Ce forfait n&apos;a pas été trouvé dans la communauté active.
            </p>
          ),
        };
      }
      return {
        title: plan.name,
        subtitle: `Forfait · ${plan.code}`,
        body: (
          <PlanSheetBody
            plan={plan}
            pricing={pricing}
            commissionBps={commissionBps}
            canManage={can(me, "plans.manage", communityId ?? null)}
          />
        ),
      };
    },

    build: async (id) => {
      let found = builds.find((b) => b.id === id);
      if (!found) {
        try {
          const allApps = await services.plans.listApps();
          for (const a of allApps) {
            const appBuilds = await services.builds.listBuilds({ appId: a.id }).catch(() => []);
            const b = appBuilds.find((x) => x.id === id);
            if (b) {
              found = b;
              break;
            }
          }
        } catch {
          // ignore
        }
      }
      if (!found) {
        return {
          title: `Build ${shortId(id)}`,
          subtitle: "Introuvable",
          body: (
            <p className="text-subhead text-muted-foreground">
              Impossible de trouver ce build dans l&apos;historique.
            </p>
          ),
        };
      }
      return {
        title: `Version ${found.versionName ?? "1.0.0"}`,
        subtitle: `Build ${found.versionCode ? `#${found.versionCode}` : ""} · ${shortId(found.id)}`,
        body: (
          <BuildSheetBody
            build={found}
            appName={appName}
            isOwner={me.platformRole === "owner"}
          />
        ),
      };
    },
  };

  return <DrawerHost pathname={pathname} searchParams={params} registry={registry} />;
}
