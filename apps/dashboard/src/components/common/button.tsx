import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Bouton du kit (règles §5.5). Une seule action `prominent` par vue.
 * Tailles : `md` 44 px (défaut), `lg` 50 px (action pleine largeur d'un formulaire),
 * `sm` 36 px réservé aux barres d'outils denses du desktop : il remonte à 44 px
 * sous 768 px, la cible tactile reste respectée.
 * Appui : `scale(0.96)` (better-ui). Aucune ombre.
 */
export const buttonVariants = cva(
  [
    "relative inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap select-none",
    "font-semibold outline-none transition-[background-color,color,opacity,scale] duration-150",
    "active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1.125rem]",
  ].join(" "),
  {
    variants: {
      variant: {
        prominent: "bg-primary text-primary-foreground [@media(hover:hover)]:hover:bg-primary-hover",
        tinted: "bg-fill text-accent-foreground [@media(hover:hover)]:hover:bg-fill/70",
        plain: "bg-transparent text-accent-foreground [@media(hover:hover)]:hover:bg-accent",
        neutral: "bg-fill text-foreground [@media(hover:hover)]:hover:bg-fill/70",
        destructive: "bg-destructive-solid text-white [@media(hover:hover)]:hover:bg-destructive-solid/90",
        "destructive-plain": "bg-transparent text-destructive [@media(hover:hover)]:hover:bg-destructive/10",
      },
      size: {
        sm: "h-11 rounded-field px-4 text-subhead md:h-9 md:px-3.5",
        md: "h-11 rounded-field px-5 text-body md:text-subhead",
        lg: "h-[50px] w-full rounded-field px-5 text-headline",
        icon: "size-11 rounded-full md:size-9",
      },
    },
    defaultVariants: { variant: "tinted", size: "md" },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    /** Action en cours : indicateur dans le bouton, bouton inerte, libellé conservé ou remplacé. */
    loading?: boolean;
    loadingLabel?: string;
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  loading = false,
  loadingLabel,
  asChild = false,
  children,
  disabled,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="kit-button"
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? <Spinner /> : null}
          {loading && loadingLabel ? loadingLabel : children}
        </>
      )}
    </Comp>
  );
}

/** Indicateur d'activité discret, hérite de la couleur du texte. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
    />
  );
}
