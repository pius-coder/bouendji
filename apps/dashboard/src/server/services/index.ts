import "server-only";
import { refresh } from "next/cache";
import type { BaseServiceDeps } from "@/server/api/base-service";
import { readServerConfig } from "@/server/api/config";
import { readSessionToken } from "@/server/api/session";
import { AdminAuthService } from "./admin-auth/admin-auth.service";
import { AdminsService } from "./admins/admins.service";
import { AuditService } from "./audit/audit.service";
import { BuildsService } from "./builds/builds.service";
import { CommunitiesService } from "./communities/communities.service";
import { DevicesService } from "./devices/devices.service";
import { NetworkService } from "./network/network.service";
import { OnboardingService } from "./onboarding/onboarding.service";
import { OrdersService } from "./orders/orders.service";
import { PayoutsService } from "./payouts/payouts.service";
import { PlansService } from "./plans/plans.service";
import { PricingService } from "./pricing/pricing.service";
import { SubscribersService } from "./subscribers/subscribers.service";

/** Construit tous les services sur les mêmes dépendances. Injectable pour les tests. */
export function createServices(deps: BaseServiceDeps) {
  return {
    auth: new AdminAuthService(deps),
    communities: new CommunitiesService(deps),
    plans: new PlansService(deps),
    admins: new AdminsService(deps),
    subscribers: new SubscribersService(deps),
    devices: new DevicesService(deps),
    orders: new OrdersService(deps),
    payouts: new PayoutsService(deps),
    network: new NetworkService(deps),
    audit: new AuditService(deps),
    builds: new BuildsService(deps),
    pricing: new PricingService(deps),
    onboarding: new OnboardingService(deps),
  };
}

export type Services = ReturnType<typeof createServices>;

let cached: Services | undefined;

/**
 * Services de l'application. Sans état par requête : le JWT est relu dans le
 * cookie à chaque appel (`getToken`), jamais conservé dans l'instance.
 */
export function getServices(): Services {
  if (!cached) {
    const config = readServerConfig();
    cached = createServices({
      baseUrl: config.apiBaseUrl,
      accessKey: config.accessKey,
      getToken: readSessionToken,
      // Données admin non mises en cache : après une mutation, on relit simplement.
      // refresh() n'est valable que dans une Server Action (docs Next, refresh).
      afterMutation: () => refresh(),
    });
  }
  return cached;
}
