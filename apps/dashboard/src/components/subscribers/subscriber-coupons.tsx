"use client";

import * as React from "react";
import { toast } from "sonner";
import { Icon } from "@/components/common/icon";
import { StatusBadge } from "@/components/common/status-badge";
import { ConfirmDialog } from "@/components/page/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useAdminQuery, useInvalidateAdmin } from "@/hooks/use-admin-query";
import { formatDateTime, formatDurationMinutes } from "@/lib/format";
import { issueCouponAction, revokeCouponAction } from "@/server/actions/coupons.action";
import { couponList, couponTypeList, type Coupon } from "@/server/services/coupons/coupons.schema";

function couponState(c: Coupon): string {
  if (c.status === "issued" && c.expired) return "coupon_expired";
  return `coupon_${c.status}`;
}

/**
 * « Gérer » → « Générer un coupon de réduction » (décision owner 2) : un coupon
 * d'un type défini par l'owner, pour CET abonné, à usage unique. Le code n'est
 * affiché qu'une fois, ici, puis oublié (état local seulement : ni cache React
 * Query, ni URL, ni stockage).
 */
export function SubscriberCoupons({ userId }: { userId: string }) {
  const typesPath = `/v1/admin/users/${userId}/coupon-types`;
  const couponsPath = `/v1/admin/users/${userId}/coupons`;
  const types = useAdminQuery(typesPath, { schema: couponTypeList });
  const coupons = useAdminQuery(couponsPath, { schema: couponList });
  const invalidate = useInvalidateAdmin();

  const [typeId, setTypeId] = React.useState<string>("");
  const [issued, setIssued] = React.useState<{ code: string; label: string; expiresAt: string | null } | null>(null);
  const [revoking, setRevoking] = React.useState<Coupon | null>(null);
  const [pending, startTransition] = React.useTransition();

  const typeItems = types.data?.items ?? [];
  const selected = typeItems.find((t) => t.id === typeId) ?? null;

  const generate = () => {
    if (!selected) return;
    startTransition(async () => {
      const result = await issueCouponAction(userId, { typeId: selected.id });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      setIssued({ code: result.data.code, label: result.data.coupon.label, expiresAt: result.data.coupon.expiresAt });
      await invalidate(couponsPath);
    });
  };

  const copy = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.code);
      toast.success("Code copié");
    } catch {
      toast.error("Copie impossible : recopiez le code à la main.");
    }
  };

  const revoke = () => {
    if (!revoking) return;
    startTransition(async () => {
      const result = await revokeCouponAction(revoking.id);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success("Coupon annulé");
      setRevoking(null);
      await invalidate(couponsPath);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {issued ? (
        <div className="flex flex-col gap-3 rounded-section border border-separator bg-background p-4">
          <p className="text-footnote text-muted-foreground">
            Coupon « {issued.label} » · à utiliser avant le {formatDateTime(issued.expiresAt)}
          </p>
          <p className="select-all break-all text-center font-mono text-title-2 font-semibold tracking-[0.12em] text-foreground">
            {issued.code}
          </p>
          <p className="text-footnote text-muted-foreground">
            Ce code ne sera plus jamais affiché. Transmettez-le à l&apos;abonné : il le saisit dans l&apos;application, écran
            Forfaits, rubrique « Coupon de réduction ». Il ne fonctionne que sur son compte, une seule fois.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={copy}>
              <Icon name="copy" className="size-4" />
              Copier le code
            </Button>
            <Button type="button" size="sm" onClick={() => setIssued(null)}>
              J&apos;ai transmis le code
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {types.isLoading ? (
            <p className="text-footnote text-muted-foreground">Chargement des types de coupon…</p>
          ) : types.isError ? (
            <p className="text-footnote text-destructive">{types.error.message}</p>
          ) : typeItems.length === 0 ? (
            <p className="text-footnote text-muted-foreground">
              Aucun type de coupon pour cette application. Le propriétaire les définit dans « Types de coupon ».
            </p>
          ) : (
            <>
              <Select value={typeId} onValueChange={setTypeId}>
                <SelectTrigger className="h-11 w-full" aria-label="Type de coupon">
                  <SelectValue placeholder="Choisir un type de coupon" />
                </SelectTrigger>
                <SelectContent>
                  {typeItems.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label} · {formatDurationMinutes(t.durationMinutes)} d&apos;accès illimité
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div>
                <Button type="button" size="sm" disabled={!selected || pending} onClick={generate}>
                  {pending ? <Spinner /> : <Icon name="add" className="size-4" />}
                  Générer un coupon de réduction
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h5 className="text-footnote font-semibold text-foreground">Coupons émis</h5>
        {coupons.isLoading ? (
          <p className="text-footnote text-muted-foreground">Chargement…</p>
        ) : coupons.isError ? (
          <p className="text-footnote text-destructive">{coupons.error.message}</p>
        ) : (coupons.data?.items ?? []).length === 0 ? (
          <p className="text-footnote text-muted-foreground">Aucun coupon émis pour cet abonné.</p>
        ) : (
          <ul className="divide-y divide-separator overflow-hidden rounded-section border border-separator bg-background">
            {(coupons.data?.items ?? []).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-subhead text-foreground">
                    {c.label} · {formatDurationMinutes(c.durationMinutes)}
                  </p>
                  <p className="text-caption text-muted-foreground">
                    Émis le {formatDateTime(c.issuedAt)}
                    {c.issuedByName ? ` par ${c.issuedByName}` : ""}
                    {c.redeemedAt ? ` · utilisé le ${formatDateTime(c.redeemedAt)}` : ` · valable jusqu'au ${formatDateTime(c.expiresAt)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={couponState(c)} />
                  {c.status === "issued" && !c.expired ? (
                    <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setRevoking(c)}>
                      Annuler
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => (open ? null : setRevoking(null))}
        title="Annuler ce coupon ?"
        description="Le code ne pourra plus être utilisé. Un nouveau coupon peut être généré ensuite."
        confirmLabel="Annuler le coupon"
        pending={pending}
        onConfirm={revoke}
      />
    </div>
  );
}
