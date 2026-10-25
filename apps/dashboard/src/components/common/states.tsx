import { Icon } from "./icon";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * États d'une zone de données (règles §8). Même géométrie partout : icône 28 px,
 * titre (headline), une phrase, au plus UNE action. Pas de cadre pointillé, pas de carte.
 * `inset` : posé sur une cellule (dans une section) ; sinon directement sur le fond.
 */
function StateFrame({
  icon,
  title,
  description,
  action,
  role,
  inset = true,
  className,
}: {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  role?: "alert" | "status";
  inset?: boolean;
  className?: string;
}) {
  return (
    <div
      role={role}
      className={cn(
        "flex flex-col items-center gap-2 px-6 py-10 text-center",
        inset && "rounded-section bg-card",
        className,
      )}
    >
      <span aria-hidden className="mb-1 text-muted-foreground [&_svg]:size-7">
        {icon}
      </span>
      <p className="text-headline text-foreground">{title}</p>
      {description ? <p className="max-w-sm text-subhead text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/**
 * Vide. Premier usage : dit ce qu'est l'endroit et comment le remplir.
 * Vide filtré (`query` ou `filtered`) : nomme la requête et propose de sortir du filtre.
 */
export function EmptyState({
  title,
  description,
  action,
  filtered = false,
  query,
  inset,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  filtered?: boolean;
  query?: string;
  inset?: boolean;
  className?: string;
}) {
  const isFiltered = filtered || Boolean(query);
  return (
    <StateFrame
      role="status"
      icon={isFiltered ? <Icon name="search" /> : <Icon name="inbox" />}
      title={query ? `Aucun résultat pour « ${query} »` : title}
      description={description}
      action={action}
      inset={inset}
      className={className}
    />
  );
}

/** Erreur : ce qui a échoué et comment s'en sortir. Jamais « oups », jamais « nous ». */
export function ErrorState({
  title = "Impossible de charger ces données",
  description = "Vérifiez la connexion et réessayez.",
  action,
  inset,
  className,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  inset?: boolean;
  className?: string;
}) {
  return (
    <StateFrame role="alert" icon={<Icon name="danger" />} title={title} description={description} action={action} inset={inset} className={className} />
  );
}

/** Accès refusé : sobre, sans bouton trompeur. L'API reste l'autorité (403). */
export function ForbiddenState({
  title = "Accès réservé",
  description = "Votre rôle dans cette communauté ne donne pas accès à ces informations.",
  inset,
  className,
}: {
  title?: string;
  description?: ReactNode;
  inset?: boolean;
  className?: string;
}) {
  return <StateFrame role="status" icon={<Icon name="lock" />} title={title} description={description} inset={inset} className={className} />;
}
