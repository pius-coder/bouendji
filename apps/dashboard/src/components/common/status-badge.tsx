import { Icon, type IconName } from "@/components/common/icon";
import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "neutral" | "info";

/** Vocabulaire unique des statuts. Un état inconnu s'affiche tel quel, en neutre. */
export const STATUS: Record<string, { label: string; tone: StatusTone }> = {
  paid: { label: "Payée", tone: "success" },
  pending: { label: "En attente", tone: "warning" },
  created: { label: "Créée", tone: "neutral" },
  failed: { label: "Échouée", tone: "danger" },
  canceled: { label: "Annulée", tone: "neutral" },
  refunded: { label: "Remboursée", tone: "neutral" },
  approved: { label: "Approuvé", tone: "info" },
  processing: { label: "En cours", tone: "info" },
  needs_review: { label: "À vérifier", tone: "danger" },
  active: { label: "Actif", tone: "success" },
  draining: { label: "En vidange", tone: "warning" },
  inactive: { label: "Inactif", tone: "neutral" },
  disabled: { label: "Désactivé", tone: "neutral" },
  enrolled: { label: "Enregistré", tone: "success" },
  revoked: { label: "Révoqué", tone: "danger" },
  suspended: { label: "Suspendue", tone: "danger" },
  healthy: { label: "En service", tone: "success" },
  down: { label: "Hors service", tone: "danger" },
  degraded: { label: "Dégradé", tone: "warning" },
  unknown: { label: "Non mesuré", tone: "neutral" },
  verified: { label: "Email vérifié", tone: "success" },
  unverified: { label: "Email non vérifié", tone: "warning" },
  deleted: { label: "Supprimé", tone: "neutral" },
  expired: { label: "Expiré", tone: "neutral" },
  available: { label: "Disponible", tone: "info" },
  reversed: { label: "Annulée", tone: "neutral" },
  // 104 : coupons de réduction (préfixés : `revoked`/`expired` ont déjà un autre sens).
  coupon_issued: { label: "Émis", tone: "info" },
  coupon_redeemed: { label: "Utilisé", tone: "success" },
  coupon_revoked: { label: "Annulé", tone: "neutral" },
  coupon_expired: { label: "Expiré", tone: "neutral" },
  // 105 : accès manuels (préfixés : `paid`/`pending` ont déjà un sens « commande »).
  grant_owed: { label: "À régulariser", tone: "warning" },
  grant_settled: { label: "Réglé", tone: "success" },
  settlement_pending: { label: "Lien envoyé", tone: "warning" },
  settlement_paid: { label: "Versé", tone: "success" },
  settlement_failed: { label: "Échoué", tone: "danger" },
  settlement_needs_review: { label: "À vérifier", tone: "danger" },
  // 106 : opérateurs de paiement (préfixés : `available` a déjà un sens « commission »).
  operator_available: { label: "Disponible", tone: "success" },
  operator_unavailable: { label: "Indisponible", tone: "danger" },
};

const PILL: Record<StatusTone, string> = {
  success: "bg-success-soft text-success-text",
  warning: "bg-warning-soft text-warning-text",
  danger: "bg-danger-soft text-destructive",
  info: "bg-info-soft text-info-text",
  neutral: "bg-group text-muted-foreground shadow-[inset_0_0_0_1px_var(--separator)]",
};

const GLYPH: Record<StatusTone, IconName> = {
  success: "check",
  warning: "history",
  danger: "close-circle",
  info: "refresh",
  neutral: "info",
};

export function statusLabel(status: string): string {
  return STATUS[status]?.label ?? status;
}

/**
 * Statut en pilule teintée avec icône (Chariow : « Réglé », « Échoué »…) : icône +
 * libellé, jamais la couleur seule.
 */
export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const known = STATUS[status];
  const tone = known?.tone ?? "neutral";
  return (
    <span className={cn("inline-flex h-7 items-center gap-1 rounded-full ps-1.5 pe-2.5 text-footnote font-semibold whitespace-nowrap", PILL[tone], className)}>
      <Icon name={GLYPH[tone]} className="size-4" strokeWidth={2} />
      {known?.label ?? status}
    </span>
  );
}
