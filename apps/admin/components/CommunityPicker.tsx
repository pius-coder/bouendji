"use client";

import { useCommunities } from "./CommunitiesProvider";
import { SelectField } from "./fields";

/**
 * Sélecteur de communauté. Le `communityId` part dans le **chemin** de la
 * requête, jamais dans un corps : l'API le relit et refuse un périmètre
 * étranger par 403.
 */
export function CommunityPicker({
  value,
  onChange,
  allowAll,
  allLabel = "Toutes les communautés",
  hint,
}: {
  value: string;
  onChange: (value: string) => void;
  allowAll?: boolean;
  allLabel?: string;
  hint?: string;
}) {
  const { communities } = useCommunities();
  const options = [
    ...(allowAll ? [{ value: "", label: allLabel }] : []),
    ...communities.map((community) => ({
      value: community.id,
      label: community.name + (community.status === "suspended" ? " (suspendue)" : ""),
    })),
  ];
  return (
    <SelectField
      label="Communauté"
      value={value}
      onChange={onChange}
      options={options}
      hint={hint ?? (allowAll ? "Sans filtre, la liste couvre toutes les communautés visibles." : undefined)}
    />
  );
}
