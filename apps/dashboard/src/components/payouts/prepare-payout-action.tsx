import { can } from "@/lib/roles";
import { getCommunities, getMe } from "@/server/context";
import { PreparePayoutSheet } from "./prepare-payout-sheet";

/** Bouton d'en-tête : affiché seulement s'il existe une communauté où l'utilisateur peut préparer. */
export async function PreparePayoutAction() {
  const [me, communities] = await Promise.all([getMe(), getCommunities()]);
  const allowed = communities.filter((c) => can(me, "payouts.create", c.id)).map((c) => ({ id: c.id, name: c.name }));
  return allowed.length > 0 ? <PreparePayoutSheet communities={allowed} /> : null;
}
