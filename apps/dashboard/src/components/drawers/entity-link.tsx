"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { DRAWER_KEYS, type DrawerKind } from "@/lib/drawers";
import { cn } from "@/lib/utils";

/**
 * Lien cliquable vers n'importe quelle fiche tiroir (`?abonne=`, `?appareil=`,
 * `?commande=`, `?forfait=`, `?versement=`, `?build=`). Remplace le paramètre
 * de tiroir actif tout en conservant l'onglet (`?tab=`) et les filtres de la page,
 * ce qui permet de passer d'un tiroir à un autre sans revenir en arrière.
 */
export function EntityLink({
  kind,
  id,
  pathnameOverride,
  className,
  children,
}: {
  kind: DrawerKind;
  id: string;
  pathnameOverride?: string;
  className?: string;
  children: ReactNode;
}) {
  const currentPathname = usePathname();
  const searchParams = useSearchParams();
  const targetPathname = pathnameOverride ?? currentPathname;

  const next = new URLSearchParams(searchParams.toString());
  for (const key of DRAWER_KEYS) {
    next.delete(key);
  }
  next.set(kind, id);
  const qs = next.toString();
  const href = qs ? `${targetPathname}?${qs}` : targetPathname;

  return (
    <Link
      href={href}
      scroll={false}
      className={cn(
        "inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className,
      )}
    >
      {children}
    </Link>
  );
}
