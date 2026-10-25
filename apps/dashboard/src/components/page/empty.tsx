import type { ReactNode } from "react";
import type { IconName } from "@/components/common/icon";
import { IconTile, type Tone } from "./icon-tile";

/** État vide : tuile d'icône, une phrase, une action éventuelle. */
export function EmptyBlock({
  title,
  description,
  action,
  icon = "inbox",
  tone = "neutral",
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: IconName;
  tone?: Tone;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-control-border px-6 py-12 text-center">
      <IconTile name={icon} tone={tone} size="lg" />
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-headline font-semibold text-foreground">{title}</p>
        {description ? <p className="text-subhead text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ForbiddenBlock() {
  return <EmptyBlock icon="lock" tone="warning" title="Accès non autorisé" description="Votre rôle ne donne pas accès à cet écran." />;
}
