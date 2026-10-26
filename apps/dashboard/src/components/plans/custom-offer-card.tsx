import { StatusBadge } from "@/components/common/status-badge";
import { formatXaf } from "@/lib/format";
import { withSession } from "@/server/context";
import { getServices } from "@/server/services";
import { customPriceXaf, NIGHT_WINDOW_LABEL } from "@/server/services/plans/custom-offer.schema";
import { CustomOfferSheet } from "./custom-offer-sheet";

/**
 * Offre sur mesure d'une marque (D127) : l'abonné choisit les Go et la durée
 * dans l'app ; ici, l'admin règle les deux prix du Go et les bornes.
 */
export async function CustomOfferCard({ appId, canManage }: { appId: string; canManage: boolean }) {
  const offer = await withSession(() => getServices().plans.getCustomOffer(appId));
  const t = offer?.terms ?? null;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-headline font-semibold">{offer?.name ?? "Forfait sur mesure"}</h3>
            {offer ? <StatusBadge status={offer.active ? "active" : "inactive"} /> : null}
          </div>
          <p className="text-footnote text-muted-foreground">
            L’abonné règle la data et la validité avec deux curseurs ; le prix suit vos deux prix du Go.
          </p>
        </div>
        {canManage ? <CustomOfferSheet appId={appId} offer={offer} /> : null}
      </div>

      {t ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-subheadline sm:grid-cols-4">
          <div>
            <dt className="text-footnote text-muted-foreground">Go à 1 jour</dt>
            <dd className="font-semibold tabular-nums">{formatXaf(t.pricePerGb1dXaf)}</dd>
          </div>
          <div>
            <dt className="text-footnote text-muted-foreground">Go à 30 jours</dt>
            <dd className="font-semibold tabular-nums">{formatXaf(t.pricePerGb30dXaf)}</dd>
          </div>
          <div>
            <dt className="text-footnote text-muted-foreground">Data</dt>
            <dd className="tabular-nums">
              {t.minGb} à {t.maxGb} Go
            </dd>
          </div>
          <div>
            <dt className="text-footnote text-muted-foreground">Validité</dt>
            <dd className="tabular-nums">
              {t.minDays} à {t.maxDays} j
            </dd>
          </div>
          <div className="col-span-2 sm:col-span-4">
            <dt className="text-footnote text-muted-foreground">Exemples vus par l’abonné</dt>
            <dd className="tabular-nums">
              {[
                [t.minGb, t.minDays],
                [Math.min(t.maxGb, Math.max(t.minGb, 5)), Math.min(t.maxDays, Math.max(t.minDays, 7))],
                [t.maxGb, t.maxDays],
              ]
                .map(([gb, days]) => `${gb} Go · ${days} j = ${formatXaf(customPriceXaf(t, gb, days))}`)
                .join("   ·   ")}
            </dd>
          </div>
          {offer && offer.nightOptions.some((o) => o.active) ? (
            <div className="col-span-2 sm:col-span-4">
              <dt className="text-footnote text-muted-foreground">Illimité de nuit (option)</dt>
              <dd className="tabular-nums">
                {offer.nightOptions
                  .filter((o) => o.active)
                  .map((o) => `${NIGHT_WINDOW_LABEL[o.window]} +${formatXaf(o.priceXaf)}`)
                  .join("   ·   ")}
              </dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="text-footnote text-muted-foreground">Pas encore réglée : l’app ne propose pas d’offre sur mesure.</p>
      )}
    </div>
  );
}
