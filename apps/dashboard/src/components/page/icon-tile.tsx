import { Icon, type IconName } from "@/components/common/icon";
import { cn } from "@/lib/utils";

export type Tone = "accent" | "success" | "warning" | "danger" | "info" | "neutral";

const TILE: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent-text",
  success: "bg-success-soft text-success-text",
  warning: "bg-warning-soft text-warning-text",
  danger: "bg-danger-soft text-destructive",
  info: "bg-info-soft text-info-text",
  neutral: "bg-group text-muted-foreground",
};

/** Tuile d'icône teintée (Chariow : cartes de paramètres, sections du tiroir). */
export function IconTile({ name, tone = "accent", size = "md", className }: { name: IconName; tone?: Tone; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center",
        size === "sm" && "size-7 rounded-lg [&_svg]:size-4",
        size === "md" && "size-10 rounded-xl [&_svg]:size-5",
        size === "lg" && "size-12 rounded-2xl [&_svg]:size-6",
        TILE[tone],
        className,
      )}
    >
      <Icon name={name} />
    </span>
  );
}
