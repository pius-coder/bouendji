"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "@/components/common/icon-compat";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { ROLE_LABEL } from "@/lib/roles";
import { addMemberAction } from "@/server/actions/members.action";
import { memberFormSchema, type MemberFormValues } from "@/server/services/communities/communities.schema";

const ADD_LABEL = "Ajouter un membre";
const STAFF_ROLES = ["community_admin", "support", "finance"] as const;

export interface AccountOption {
  id: string;
  label: string;
}

/**
 * `accounts` : annuaire des comptes (propriétaire seulement : `GET /admins` lui est
 * réservé). Sans annuaire, l'identifiant du compte se saisit à la main
 * (question ouverte 11 de dashboard-ux : comment un community_admin le trouve-t-il ?).
 */
export function AddMemberSheet({ communityId, accounts }: { communityId: string; accounts: readonly AccountOption[] | null }) {
  const [open, setOpen] = useState(false);
  const form = useForm<MemberFormValues>({
    resolver: zodResolver(memberFormSchema),
    defaultValues: { adminUserId: "", role: "support" },
  });

  async function submit(values: MemberFormValues) {
    const result = await addMemberAction(communityId, values);
    if (result.ok) {
      toast.success("Membre ajouté");
      form.reset();
      setOpen(false);
      return;
    }
    const message = result.details?.adminUserId ?? result.details?.role;
    if (result.details?.adminUserId) form.setError("adminUserId", { message: result.details.adminUserId });
    else if (result.details?.role) form.setError("role", { message: result.details.role });
    // 403, 404, 409 (déjà membre, compte désactivé) : message de l'API, tel quel.
    if (!message) toast.error(result.message);
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button className="min-h-11">
          <PlusIcon aria-hidden />
          {ADD_LABEL}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{ADD_LABEL}</SheetTitle>
          <SheetDescription>Le compte administrateur doit déjà exister.</SheetDescription>
        </SheetHeader>
        <form onSubmit={form.handleSubmit(submit)} className="flex flex-1 flex-col gap-4 px-4" noValidate>
          <FieldGroup>
            <Controller
              name="adminUserId"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="member-account">Compte</FieldLabel>
                  {accounts ? (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="member-account" className="h-11 w-full" aria-invalid={fieldState.invalid}>
                        <SelectValue placeholder="Choisir un compte" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <>
                      <Input {...field} id="member-account" className="h-11" autoCapitalize="none" autoCorrect="off" aria-invalid={fieldState.invalid} />
                      <FieldDescription>Identifiant du compte administrateur.</FieldDescription>
                    </>
                  )}
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />
            <Controller
              name="role"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="member-role">Rôle</FieldLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="member-role" className="h-11 w-full">
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
                  {fieldState.error && <FieldError>{fieldState.error.message}</FieldError>}
                </Field>
              )}
            />
          </FieldGroup>
          <SheetFooter className="px-0">
            <Button type="submit" className="h-11 w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Spinner />}
              Ajouter
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
