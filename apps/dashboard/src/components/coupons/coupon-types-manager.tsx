"use client";

import * as React from "react";
import { toast } from "sonner";
import { Icon } from "@/components/common/icon";
import { SegmentedControl } from "@/components/common/segmented-control";
import { EmptyBlock } from "@/components/page/empty";
import { Section } from "@/components/page/section";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useAdminQuery, useInvalidateAdmin } from "@/hooks/use-admin-query";
import { formatDateTime, formatDurationMinutes } from "@/lib/format";
import { createCouponTypeAction } from "@/server/actions/coupons.action";
import { couponTypeList } from "@/server/services/coupons/coupons.schema";

type Unit = "min" | "h" | "j";
const UNITS: readonly { value: Unit; label: string }[] = [
  { value: "min", label: "Minutes" },
  { value: "h", label: "Heures" },
  { value: "j", label: "Jours" },
];
const FACTOR: Record<Unit, number> = { min: 1, h: 60, j: 1440 };

export interface CouponAppOption {
  id: string;
  name: string;
}

/**
 * Page owner « Types de coupon » (décision owner 1) : par application, un
 * libellé et une durée en minutes (1 h = 60). Les administrateurs ne font
 * qu'émettre des coupons de ces types, depuis la fiche d'un abonné.
 */
export function CouponTypesManager({ apps }: { apps: readonly CouponAppOption[] }) {
  const [appId, setAppId] = React.useState<string>(apps[0]?.id ?? "");
  const path = `/v1/admin/apps/${appId}/coupon-types`;
  const types = useAdminQuery(path, { schema: couponTypeList, enabled: appId !== "" });
  const invalidate = useInvalidateAdmin();

  const [label, setLabel] = React.useState("");
  const [amount, setAmount] = React.useState("1");
  const [unit, setUnit] = React.useState<Unit>("h");
  const [pending, startTransition] = React.useTransition();

  const minutes = Number.parseInt(amount, 10) * FACTOR[unit];
  const valid = label.trim().length >= 2 && Number.isInteger(minutes) && minutes >= 1 && minutes <= 525_600;

  const create = (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || !appId) return;
    startTransition(async () => {
      const result = await createCouponTypeAction(appId, { label: label.trim(), durationMinutes: minutes });
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(`Type « ${result.data.label} » créé`);
      setLabel("");
      await invalidate(path);
    });
  };

  if (apps.length === 0) {
    return <EmptyBlock title="Aucune application" description="Créez d'abord une application de marque." icon="tag" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <Section title="Application" description="Les types sont propres à une application : un abonné ne reçoit que ceux de la sienne.">
        <Select value={appId} onValueChange={setAppId}>
          <SelectTrigger className="h-11 w-full max-w-md" aria-label="Application">
            <SelectValue placeholder="Choisir une application" />
          </SelectTrigger>
          <SelectContent>
            {apps.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Section>

      <Section title="Nouveau type" description="Durée d'accès illimité offerte par un coupon de ce type.">
        <form className="flex flex-col gap-4" onSubmit={create}>
          <Field>
            <FieldLabel htmlFor="coupon-type-label">Libellé</FieldLabel>
            <Input
              id="coupon-type-label"
              className="h-11 max-w-md"
              value={label}
              maxLength={60}
              placeholder="Ex. : Essai 1 heure"
              onChange={(e) => setLabel(e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="coupon-type-amount">Durée</FieldLabel>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                id="coupon-type-amount"
                className="h-11 w-28"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              <SegmentedControl<Unit> label="Unité" options={UNITS} value={unit} onValueChange={setUnit} />
            </div>
            <FieldDescription>
              {Number.isInteger(minutes) && minutes > 0 ? `${minutes} minutes · ${formatDurationMinutes(minutes)}` : "Durée invalide."}
              {minutes > 525_600 ? " 365 jours au plus." : ""}
            </FieldDescription>
          </Field>
          <div>
            <Button type="submit" size="sm" disabled={!valid || pending}>
              {pending ? <Spinner /> : <Icon name="add" className="size-4" />}
              Créer le type
            </Button>
          </div>
        </form>
      </Section>

      <Section title="Types existants">
        {types.isLoading ? (
          <p className="text-footnote text-muted-foreground">Chargement…</p>
        ) : types.isError ? (
          <p className="text-footnote text-destructive">{types.error.message}</p>
        ) : (types.data?.items ?? []).length === 0 ? (
          <EmptyBlock title="Aucun type de coupon" description="Les administrateurs ne peuvent rien émettre tant qu'aucun type n'existe." icon="tag" />
        ) : (
          <ul className="divide-y divide-separator overflow-hidden rounded-section border border-separator bg-background">
            {(types.data?.items ?? []).map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="text-subhead font-medium text-foreground">{t.label}</span>
                <span className="text-footnote text-muted-foreground">
                  {formatDurationMinutes(t.durationMinutes)} · créé le {formatDateTime(t.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
