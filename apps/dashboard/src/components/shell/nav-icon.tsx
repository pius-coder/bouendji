import { Icon } from "@/components/common/icon";
import type { NavIcon } from "./nav-model";

/** Icône de navigation Solar : linéaire au repos, pleine quand l'entrée est active (HIG tab bars). */
export function NavGlyph({ name, className, active = false }: { name: NavIcon; className?: string; active?: boolean }) {
  return <Icon name={name} filled={active} className={className} />;
}
