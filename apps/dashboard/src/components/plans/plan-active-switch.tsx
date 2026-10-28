"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { useInvalidateAdmin } from "@/hooks/use-admin-query";
import { setPlanActiveAction } from "@/server/actions/plans.action";

/**
 * Interrupteur « proposé à la vente » d'une ligne de forfait. Désactiver retire
 * le forfait de la vente immédiatement ; le tiroir Modifier reste disponible.
 */
export function PlanActiveSwitch({ planId, name, active, disabled }: { planId: string; name: string; active: boolean; disabled: boolean }) {
  const invalidate = useInvalidateAdmin();
  const [value, setValue] = useState(active);
  const [pending, startTransition] = useTransition();

  function toggle(next: boolean) {
    setValue(next);
    startTransition(async () => {
      const result = await setPlanActiveAction(planId, next);
      if (result.ok) {
        toast.success(next ? `« ${name} » proposé à la vente` : `« ${name} » retiré de la vente`);
        await invalidate("/v1/admin/plans");
      } else {
        setValue(!next);
        toast.error(result.message);
      }
    });
  }

  return (
    <Switch
      checked={value}
      onCheckedChange={toggle}
      disabled={disabled || pending}
      aria-label={`${name} : proposé à la vente`}
    />
  );
}
