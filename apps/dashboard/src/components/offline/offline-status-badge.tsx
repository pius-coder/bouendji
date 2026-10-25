import { Icon, type IconName } from "@/components/common/icon";
import { cn } from "@/lib/utils";
import type { OfflineFileState } from "./offline-status";

/**
 * Pastille d'état d'un fichier de secours. `StatusBadge` (partagé) ne connaît
 * pas « valide » ni « consommé » : ce libellé reste donc local à ce domaine, avec
 * le même dessin (pilule teintée, icône + libellé, jamais la couleur seule).
 */
const VIEW: Record<OfflineFileState, { label: string; icon: IconName; className: string }> = {
  valid: { label: "Valide", icon: "check", className: "bg-success-soft text-success-text" },
  consumed: { label: "Consommé", icon: "checkmark", className: "bg-group text-muted-foreground shadow-[inset_0_0_0_1px_var(--separator)]" },
  expired: { label: "Expiré", icon: "history", className: "bg-group text-muted-foreground shadow-[inset_0_0_0_1px_var(--separator)]" },
};

export function OfflineStatusBadge({ state, className }: { state: OfflineFileState; className?: string }) {
  const view = VIEW[state];
  return (
    <span className={cn("inline-flex h-7 items-center gap-1 rounded-full ps-1.5 pe-2.5 text-footnote font-semibold whitespace-nowrap", view.className, className)}>
      <Icon name={view.icon} className="size-4" strokeWidth={2} />
      {view.label}
    </span>
  );
}
