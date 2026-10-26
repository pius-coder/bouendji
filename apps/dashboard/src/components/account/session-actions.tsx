"use client";

import { useActionState } from "react";
import { notify } from "@/components/common/toast";
import { Button } from "@/components/ui/button";
import { revokeOtherSessionsAction, revokeSessionAction } from "@/server/actions/auth-account.action";
import type { ActionResult } from "@/server/actions/action-result";

/** Déconnecte une session listée. La liste se relit toute seule (refreshAfter côté service). */
export function RevokeSessionButton({ id }: { id: string }) {
  const [, action, pending] = useActionState<ActionResult | null, FormData>(async (_prev, form) => {
    const result = await revokeSessionAction(form);
    if (result.ok) notify.success("Session déconnectée.");
    else notify.error(result.message);
    return result;
  }, null);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        Déconnecter
      </Button>
    </form>
  );
}

/** Déconnecte toutes les sessions sauf la courante. */
export function RevokeOtherSessionsButton() {
  const [, action, pending] = useActionState<ActionResult | null, FormData>(async () => {
    const result = await revokeOtherSessionsAction();
    if (result.ok) notify.success("Autres sessions déconnectées.");
    else notify.error(result.message);
    return result;
  }, null);
  return (
    <form action={action}>
      <Button type="submit" variant="outline" disabled={pending}>
        Déconnecter toutes les autres
      </Button>
    </form>
  );
}
