"use client";

import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import { Icon } from "@/components/common/icon";
import { SegmentedControl } from "@/components/common/segmented-control";
import { StatusBadge } from "@/components/common/status-badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { useAdminQuery, useInvalidateAdmin } from "@/hooks/use-admin-query";
import { formatDateTime, formatDurationMinutes, formatXaf } from "@/lib/format";
import { grantPlanAction } from "@/server/actions/manual-grants.action";
import {
  grantOptions,
  manualGrantList,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  type PaymentMethod,
} from "@/server/services/manual-grants/manual-grants.schema";
import { NIGHT_WINDOW_LABEL, type NightWindow } from "@/server/services/plans/custom-offer.schema";

const METHOD_OPTIONS = PAYMENT_METHODS.map((value) => ({ value, label: PAYMENT_METHOD_LABEL[value] }));

function newRequestKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/**
 * « Accorder un forfait » (105, décisions owner 1-3) : l'abonné a payé
 * l'administrateur en direct (Orange Money, MTN ou autre, sur son numéro).
 * L'accès est immédiat ; le prix plein du forfait devient dû à la plateforme
 * jusqu'au versement (page « Impayés »).
 *
 * Décision par défaut (non tranchée par l'owner) : des impayés n'empêchent pas
 * d'accorder ; ils s'affichent ici en avertissement.
 */
export function SubscriberManualGrant({ userId, communityId }: { userId: string; communityId: string | null }) {
  const optionsPath = `/v1/admin/users/${userId}/manual-grants/options`;
  const grantsPath = `/v1/admin/users/${userId}/manual-grants`;
  const options = useAdminQuery(optionsPath, { schema: grantOptions });
  const grants = useAdminQuery(grantsPath, { schema: manualGrantList });
  const invalidate = useInvalidateAdmin();

  const [planId, setPlanId] = React.useState("");
  const [nightWindow, setNightWindow] = React.useState<NightWindow | "">("");
  const [method, setMethod] = React.useState<PaymentMethod>("orange_money");
  const [note, setNote] = React.useState("");
  // Une clé par formulaire : un double clic ou un renvoi ne crée qu'une dette.
  const [requestKey, setRequestKey] = React.useState(newRequestKey);
  const [pending, startTransition] = React.useTransition();

  const plans = options.data?.plans ?? [];
  const plan = plans.find((p) => p.id === planId) ?? null;
  const needsNight = plan?.family === "limited_night";
  const nightOption = needsNight ? (plan?.nightOptions.find((o) => o.window === nightWindow) ?? null) : null;
  const total = plan ? plan.priceXaf + (nightOption?.priceXaf ?? 0) : 0;
  const owed = options.data?.owed ?? null;
  const ready = plan !== null && (!needsNight || nightOption !== null) && !pending;
  const unpaidHref = communityId ? `/${communityId}/manual-grants` : null;

  const submit = () => {
    if (!plan || !ready) return;
    startTransition(async () => {
      const result = await grantPlanAction(
        userId,
        {
          planId: plan.id,
          paymentMethod: method,
          note: note.trim() ? note.trim() : null,
          nightWindow: needsNight && nightWindow ? nightWindow : null,
        },
        requestKey,
      );
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      const endsAt = result.data.subscription?.endsAt ?? result.data.grant.accessEndsAt;
      toast.success(`Forfait accordé${endsAt ? ` jusqu'au ${formatDateTime(endsAt)}` : ""}`, {
        description: `${formatXaf(result.data.grant.amountXaf)} à verser à la plateforme.`,
      });
      setPlanId("");
      setNightWindow("");
      setNote("");
      setRequestKey(newRequestKey());
      await invalidate([optionsPath, grantsPath]);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {owed && owed.count > 0 ? (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-border bg-warning-soft px-4 py-3 text-footnote text-warning-text">
          <Icon name="warning" className="mt-0.5 size-4 shrink-0" />
          <span>
            Impayés en cours : {owed.count} accès manuel{owed.count > 1 ? "s" : ""} non réglé{owed.count > 1 ? "s" : ""},{" "}
            <strong className="font-semibold">{formatXaf(owed.totalXaf)}</strong> à verser à la plateforme. Vous pouvez continuer
            à accorder des accès.
            {unpaidHref ? (
              <>
                {" "}
                <Link href={unpaidHref} className="font-semibold underline underline-offset-2">
                  Voir les impayés
                </Link>
              </>
            ) : null}
          </span>
        </p>
      ) : null}

      {options.isLoading ? (
        <p className="text-footnote text-muted-foreground">Chargement des forfaits…</p>
      ) : options.isError ? (
        <p className="text-footnote text-destructive">{options.error.message}</p>
      ) : plans.length === 0 ? (
        <p className="text-footnote text-muted-foreground">Aucun forfait actif à accorder pour cette application.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`grant-plan-${userId}`}>Forfait</Label>
            <Select
              value={planId}
              onValueChange={(value) => {
                setPlanId(value);
                setNightWindow("");
              }}
            >
              <SelectTrigger id={`grant-plan-${userId}`} className="h-11 w-full" aria-label="Forfait à accorder">
                <SelectValue placeholder="Choisir un forfait" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {formatDurationMinutes(p.durationMinutes)} · {formatXaf(p.priceXaf)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsNight && plan ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`grant-night-${userId}`}>Plage de nuit</Label>
              <Select value={nightWindow} onValueChange={(value) => setNightWindow(value as NightWindow)}>
                <SelectTrigger id={`grant-night-${userId}`} className="h-11 w-full" aria-label="Plage de nuit">
                  <SelectValue placeholder="Choisir une plage" />
                </SelectTrigger>
                <SelectContent>
                  {plan.nightOptions.map((o) => (
                    <SelectItem key={o.window} value={o.window}>
                      {NIGHT_WINDOW_LABEL[o.window]} · +{formatXaf(o.priceXaf)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label>Moyen de paiement reçu</Label>
            <SegmentedControl options={METHOD_OPTIONS} value={method} onValueChange={setMethod} label="Moyen de paiement reçu" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`grant-note-${userId}`}>Note (facultative)</Label>
            <Textarea
              id={`grant-note-${userId}`}
              value={note}
              maxLength={280}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Référence de la transaction, remarque…"
            />
          </div>

          {plan ? (
            <p className="text-footnote text-muted-foreground">
              Accès immédiat. <strong className="font-semibold text-foreground">{formatXaf(total)}</strong> seront dus à la plateforme
              jusqu&apos;au versement.
            </p>
          ) : null}

          <div>
            <Button type="button" size="sm" disabled={!ready} onClick={submit}>
              {pending ? <Spinner /> : <Icon name="add" className="size-4" />}
              Accorder le forfait
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h5 className="text-footnote font-semibold text-foreground">Forfaits accordés à la main</h5>
        {grants.isLoading ? (
          <p className="text-footnote text-muted-foreground">Chargement…</p>
        ) : grants.isError ? (
          <p className="text-footnote text-destructive">{grants.error.message}</p>
        ) : (grants.data?.items ?? []).length === 0 ? (
          <p className="text-footnote text-muted-foreground">Aucun forfait accordé à la main pour cet abonné.</p>
        ) : (
          <ul className="divide-y divide-separator overflow-hidden rounded-section border border-separator bg-background">
            {(grants.data?.items ?? []).map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-subhead text-foreground">
                    {g.planName} · {formatXaf(g.amountXaf)}
                  </p>
                  <p className="text-caption text-muted-foreground">
                    {PAYMENT_METHOD_LABEL[g.paymentMethod]} · accordé le {formatDateTime(g.grantedAt)}
                    {g.grantedByName ? ` par ${g.grantedByName}` : ""}
                    {g.settledAt ? ` · réglé le ${formatDateTime(g.settledAt)}` : ""}
                  </p>
                  {g.note ? <p className="text-caption text-muted-foreground">{g.note}</p> : null}
                </div>
                <StatusBadge status={`grant_${g.status}`} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
