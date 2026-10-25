import { createLoader, parseAsBoolean } from "nuqs/server";

/** Par défaut, les membres désactivés (retirés) sont masqués : la ligne reste côté API (retrait logique). */
export const membersParsers = {
  disabled: parseAsBoolean.withDefault(false),
};

export const membersUrlKeys = { disabled: "m_disabled" } as const;

export const loadMembersParams = createLoader(membersParsers, { urlKeys: membersUrlKeys });
