import { can } from "@/lib/roles";
import { getMe } from "@/server/context";
import { ManualEndpointSheet } from "./manual-endpoint-sheet";

/** Bouton d'en-tête de la page Réseau : affiché au seul rôle qui peut écrire (`endpoint.write`). */
export async function ManualEndpointAction() {
  const me = await getMe();
  return can(me, "network.write", null) ? <ManualEndpointSheet /> : null;
}
