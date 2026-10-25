import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Bouton de barre (retour, « … », icône seule). Le nom accessible est OBLIGATOIRE
 * (`label`) ; il sert aussi d'infobulle native. Cible 44 px, visuel sans fond.
 */
export function NavBarButton({
  label,
  className,
  asChild = false,
  children,
  ...props
}: ComponentProps<"button"> & { label: string; asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-accent-foreground outline-none",
        "transition-[background-color,scale] duration-150 active:scale-[0.96] [@media(hover:hover)]:hover:bg-accent",
        "focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-[1.375rem] [&_svg]:shrink-0",
        className,
      )}
      {...(asChild ? {} : { type: "button" as const })}
      {...props}
    >
      {children}
    </Comp>
  );
}
