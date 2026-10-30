"use client";

import * as React from "react";
import { DetailFacts } from "@/components/common/detail-panel";
import { Icon } from "@/components/common/icon";
import { StatusBadge } from "@/components/common/status-badge";
import { EntityLink } from "@/components/drawers/entity-link";
import { OfflineStatusBadge } from "@/components/offline/offline-status-badge";
import { offlineFileStatus, shortId } from "@/components/offline/offline-status";
import { SubscriberManualGrant } from "@/components/manual-grants/subscriber-manual-grant";
import { SubscriberCoupons } from "@/components/subscribers/subscriber-coupons";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBytes, formatDateTime, formatXaf, NO_VALUE } from "@/lib/format";
import type { OfflineBundleState } from "@/server/services/devices/devices.schema";
import type { SubscriberDetail } from "@/server/services/subscribers/subscribers.schema";

/**
 * Contenu de la fiche abonné (`?abonne=id`) chargée via `GET /v1/admin/users/:userId`.
 * Onglets : Résumé · Appareils · Commandes · Secours.
 * Chaque appareil ou commande est cliquable et ouvre directement son propre tiroir.
 * « Gérer » (104) ouvre la génération de coupon de réduction pour cet abonné.
 * « Accorder un forfait » (105) enregistre un forfait payé en direct à l'administrateur.
 */
export function SubscriberSheetBody({
  detail,
  offlineBundles = [],
  caps = { coupons: false },
}: {
  detail: SubscriberDetail;
  offlineBundles?: readonly OfflineBundleState[];
  caps?: { coupons: boolean; grants?: boolean };
}) {
  const { subscription, usage, devices, recentOrders } = detail;
  const [manageOpen, setManageOpen] = React.useState(false);
  const [grantOpen, setGrantOpen] = React.useState(false);
  const canManage = caps.coupons && !detail.deleted;
  const canGrant = caps.grants === true && !detail.deleted;
  const state = detail.deleted ? "deleted" : detail.emailVerified ? "verified" : "unverified";
  const bytesUsed = usage ? usage.bytesUp + usage.bytesDown : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusBadge status={state} />
          {subscription ? <StatusBadge status={subscription.status} /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-footnote text-muted-foreground">
            Inscrit le {formatDateTime(detail.createdAt)}
          </span>
          {canManage ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-expanded={manageOpen}
              onClick={() => setManageOpen((v) => !v)}
            >
              <Icon name="pen" className="size-4" />
              Gérer
            </Button>
          ) : null}
          {canGrant ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-expanded={grantOpen}
              onClick={() => setGrantOpen((v) => !v)}
            >
              <Icon name="wallet" className="size-4" />
              Accorder un forfait
            </Button>
          ) : null}
        </div>
      </div>

      {canGrant && grantOpen ? (
        <div className="rounded-section border border-separator bg-muted/40 p-4">
          <h4 className="mb-1 text-subhead font-semibold text-foreground">Accorder un forfait</h4>
          <p className="mb-3 text-footnote text-muted-foreground">
            L&apos;abonné vous a payé en direct (Orange Money, MTN ou autre). L&apos;accès est immédiat ; le prix du forfait est dû
            à la plateforme jusqu&apos;à votre versement.
          </p>
          <SubscriberManualGrant userId={detail.id} communityId={detail.communityId ?? null} />
        </div>
      ) : null}

      {canManage && manageOpen ? (
        <div className="rounded-section border border-separator bg-muted/40 p-4">
          <h4 className="mb-1 text-subhead font-semibold text-foreground">Coupon de réduction</h4>
          <p className="mb-3 text-footnote text-muted-foreground">
            Accès illimité offert pour la durée du type choisi. À usage unique, lié à ce compte.
          </p>
          <SubscriberCoupons userId={detail.id} />
        </div>
      ) : null}

      {subscription ? (
        <div className="rounded-section border border-separator bg-muted/40 p-3.5">
          <div className="flex items-center justify-between gap-2 text-subhead">
            <span className="font-medium text-foreground">
              {subscription.planName || subscription.planCode || "Abonnement actif"}
            </span>
            <span className="font-mono text-footnote text-muted-foreground">
              Expire le {formatDateTime(subscription.endsAt)}
            </span>
          </div>
          <div className="mt-2 flex justify-between text-footnote text-muted-foreground">
            <span>Volume consommé sur la période</span>
            <span className="font-mono text-foreground tabular-nums">
              {formatBytes(bytesUsed)}
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-section border border-separator bg-muted/30 px-3.5 py-2.5 text-footnote text-muted-foreground">
          Aucun abonnement actif en cours pour cet abonné.
        </div>
      )}

      <Tabs defaultValue="resume" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="resume">Résumé</TabsTrigger>
          <TabsTrigger value="appareils">Appareils ({devices.length})</TabsTrigger>
          <TabsTrigger value="commandes">Commandes ({recentOrders.length})</TabsTrigger>
          <TabsTrigger value="secours">Secours ({offlineBundles.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="resume" className="mt-3 flex flex-col gap-4">
          <DetailFacts
            items={[
              { label: "Nom", value: detail.name || NO_VALUE },
              { label: "Identifiant / Contact", value: detail.phone || detail.email },
              { label: "Langue", value: detail.locale.toUpperCase() },
              { label: "Vérifié", value: detail.emailVerified ? "Oui" : "Non" },
              { label: "Appareils enregistrés", value: String(devices.length) },
              { label: "Commandes récentes", value: String(recentOrders.length) },
            ]}
          />
        </TabsContent>

        <TabsContent value="appareils" className="mt-3 flex flex-col gap-2">
          {devices.length === 0 ? (
            <p className="py-4 text-center text-subhead text-muted-foreground">
              Aucun appareil enregistré pour cet abonné.
            </p>
          ) : (
            <ul className="divide-y divide-separator overflow-hidden rounded-section border border-separator bg-background">
              {devices.map((d) => (
                <li key={d.deviceId} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <EntityLink kind="appareil" id={d.deviceId} className="text-subhead">
                      <Icon name="smartphone" className="size-4 text-muted-foreground" />
                      <span>{d.name || shortId(d.deviceId)}</span>
                    </EntityLink>
                    <p className="text-caption text-muted-foreground">
                      {d.platform} · Dernière activité : {formatDateTime(d.lastSeenAt)}
                    </p>
                  </div>
                  <StatusBadge status={d.status} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="commandes" className="mt-3 flex flex-col gap-2">
          {recentOrders.length === 0 ? (
            <p className="py-4 text-center text-subhead text-muted-foreground">
              Aucune commande pour cet abonné.
            </p>
          ) : (
            <ul className="divide-y divide-separator overflow-hidden rounded-section border border-separator bg-background">
              {recentOrders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <EntityLink kind="commande" id={o.id} className="text-subhead">
                      <Icon name="receipt" className="size-4 text-muted-foreground" />
                      <span>Commande {shortId(o.id)}</span>
                    </EntityLink>
                    <p className="text-caption text-muted-foreground">
                      {formatDateTime(o.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-subhead font-medium tabular-nums text-foreground">
                      {o.amountXaf !== undefined ? formatXaf(o.amountXaf) : NO_VALUE}
                    </span>
                    <StatusBadge status={o.status} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="secours" className="mt-3 flex flex-col gap-2">
          {offlineBundles.length === 0 ? (
            <p className="py-4 text-center text-subhead text-muted-foreground">
              Aucun fichier de secours émis. Ouvrez un appareil pour générer un fichier `.bvpn`.
            </p>
          ) : (
            <ul className="divide-y divide-separator overflow-hidden rounded-section border border-separator bg-background">
              {offlineBundles.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <EntityLink kind="appareil" id={b.deviceId} className="text-subhead">
                      Appareil {shortId(b.deviceId)}
                    </EntityLink>
                    <p className="text-caption text-muted-foreground">
                      Valable jusqu&apos;au {formatDateTime(b.notAfter)}
                    </p>
                  </div>
                  <OfflineStatusBadge state={offlineFileStatus(b)} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
