import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";

/**
 * Pièces d'écran d'authentification, d'après la référence Chariow décrite par
 * l'utilisateur (D84) : écran scindé en deux (panneau coloré : titre + puces ;
 * panneau blanc : logo, bouton social, séparateur « Ou », champs libellés avec
 * icône et astérisque, bouton principal plein, lien de pied). Les captures n'ont
 * pas été transmises à ce sous-agent : la composition suit la description écrite.
 */
export function SplitAuthLayout({
  title,
  points,
  children,
  footer,
}: {
  title: string;
  /** Puces du panneau coloré (3 à 4, une ligne chacune). */
  points: readonly string[];
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh bg-card lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <span aria-hidden className="flex size-10 items-center justify-center rounded-field bg-primary-foreground text-headline font-bold text-primary">
          C
        </span>
        <div className="flex max-w-md flex-col gap-6">
          <h2 className="font-display text-[2.5rem] leading-[1.1] font-semibold tracking-tight">{title}</h2>
          <ul className="flex flex-col gap-3">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-body">
                <Icon name="check" className="mt-0.5 size-5" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <span />
      </aside>
      <main className="flex flex-col items-center justify-center px-4 py-10 md:px-10">
        <div className="flex w-full max-w-sm flex-col gap-6">{children}</div>
        {footer ? <div className="mt-8 text-subhead text-muted-foreground">{footer}</div> : null}
      </main>
    </div>
  );
}

/** Bouton d'identité tierce (« Continuer avec … ») : plein largeur, bordure fine, logo à gauche. */
export function SocialButton({ logo, children, className, ...props }: ComponentProps<"button"> & { logo: ReactNode }) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-11 w-full items-center justify-center gap-2.5 rounded-field bg-card px-4 text-body font-semibold text-foreground shadow-hairline outline-none md:text-subhead",
        "transition-[background-color,scale] duration-150 active:scale-[0.98] [@media(hover:hover)]:hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      <span aria-hidden className="flex size-5 items-center justify-center [&_svg]:size-5">
        {logo}
      </span>
      {children}
    </button>
  );
}

/** Séparateur « Ou » entre l'option sociale et le formulaire. */
export function OrDivider({ label = "Ou" }: { label?: string }) {
  return (
    <div role="separator" aria-label={label} className="flex items-center gap-3 text-footnote text-muted-foreground">
      <span className="h-px flex-1 bg-separator" />
      {label}
      <span className="h-px flex-1 bg-separator" />
    </div>
  );
}
