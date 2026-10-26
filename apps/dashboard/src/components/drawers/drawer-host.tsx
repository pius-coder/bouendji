import type { ReactNode } from "react";
import { DetailPanel } from "@/components/common/detail-panel";
import { drawerCloseHref, parseDrawer, type DrawerKind, type SearchParamsLike } from "@/lib/drawers";

/** Contenu d'un tiroir, chargé côté serveur pour l'identifiant de l'URL. */
export interface DrawerView {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  body: ReactNode;
}

export type DrawerRegistry = Record<DrawerKind, (id: string) => Promise<DrawerView>>;

/**
 * Hôte unique des tiroirs : rendu une fois par page, piloté par `?abonne=`, `?appareil=`,
 * `?commande=`, `?forfait=`, `?versement=`, `?build=`. Chaque page fournit le registre
 * (un chargeur par type) ; sans paramètre reconnu, il ne rend rien.
 */
export async function DrawerHost({
  pathname,
  searchParams,
  registry,
}: {
  pathname: string;
  searchParams: SearchParamsLike | Promise<SearchParamsLike>;
  registry: Partial<DrawerRegistry>;
}) {
  const params = await searchParams;
  const open = parseDrawer(params);
  const load = open ? registry[open.kind] : undefined;
  if (!open || !load) return null;
  const view = await load(open.id);
  return (
    <DetailPanel
      title={view.title}
      subtitle={view.subtitle}
      actions={view.actions}
      closeHref={drawerCloseHref(pathname, params)}
    >
      {view.body}
    </DetailPanel>
  );
}
