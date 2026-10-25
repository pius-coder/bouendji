"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/page/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABEL, type Role } from "@/lib/roles";
import { reactivateMemberAction, removeMemberAction, updateMemberRoleAction } from "@/server/actions/members.action";

const STAFF_ROLES = ["community_admin", "support", "finance"] as const;
const ROLE_SELECT_LABEL = "Rôle";
const REMOVE_LABEL = "Retirer";
const REACTIVATE_LABEL = "Réactiver";

/** Changement de rôle : appel direct, annonce après la réponse (pas d'écriture optimiste). */
export function MemberRoleSelect({
  membershipId,
  name,
  role,
}: {
  membershipId: string;
  name: string;
  role: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Select
      value={role}
      disabled={pending}
      onValueChange={(next) =>
        startTransition(async () => {
          const result = await updateMemberRoleAction(membershipId, next);
          if (result.ok) toast.success(`${name} : rôle ${ROLE_LABEL[result.data.role as Role] ?? result.data.role}`);
          else toast.error(result.message);
        })
      }
    >
      <SelectTrigger className="h-11 w-full min-w-40 sm:h-9" aria-label={`${ROLE_SELECT_LABEL} de ${name}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STAFF_ROLES.map((r) => (
          <SelectItem key={r} value={r}>
            {ROLE_LABEL[r]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Retrait confirmé : le membre perd l'accès à la communauté (ligne conservée, statut « désactivé »). */
export function RemoveMemberButton({ membershipId, name }: { membershipId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await removeMemberAction(membershipId);
      if (result.ok) {
        setOpen(false);
        toast.success(`${name} a été retiré`);
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <>
      <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9" onClick={() => setOpen(true)}>
        {REMOVE_LABEL}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Retirer ${name} ?`}
        description="Ce compte perd l'accès à cette communauté. Vous pourrez le réactiver ensuite."
        confirmLabel={REMOVE_LABEL}
        pending={pending}
        onConfirm={remove}
      />
    </>
  );
}

export function ReactivateMemberButton({ membershipId, name }: { membershipId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      className="min-h-11 sm:min-h-9"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await reactivateMemberAction(membershipId);
          if (result.ok) toast.success(`${name} est de nouveau actif`);
          else toast.error(result.message);
        })
      }
    >
      {REACTIVATE_LABEL}
    </Button>
  );
}
