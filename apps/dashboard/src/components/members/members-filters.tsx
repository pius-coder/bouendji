"use client";

import { useQueryStates } from "nuqs";
import { Field, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { membersParsers, membersUrlKeys } from "@/server/query/members.params";

const SHOW_DISABLED_LABEL = "Afficher les membres retirés";

export function MembersFilters() {
  const [{ disabled }, setParams] = useQueryStates(membersParsers, {
    urlKeys: membersUrlKeys,
    shallow: false,
    history: "replace",
    clearOnDefault: true,
  });
  return (
    <Field orientation="horizontal" className="min-h-11 w-fit">
      <Switch id="members-disabled" checked={disabled} onCheckedChange={(next) => setParams({ disabled: next })} />
      <FieldLabel htmlFor="members-disabled">{SHOW_DISABLED_LABEL}</FieldLabel>
    </Field>
  );
}
