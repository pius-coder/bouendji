/**
 * Calculs de l'accueil. Fonctions pures (testées) : la page n'en contient aucun.
 * L'API n'expose pas de compteurs (D82, question ouverte) : les chiffres sont calculés
 * sur ce que renvoient les listes, et la portée réelle est rendue explicite (`truncated`).
 */

export interface OrderLike {
  status: string;
  amountXaf?: number;
  createdAt: string | null;
  paidAt: string | null;
}

export interface OrdersPageLike {
  items: readonly OrderLike[];
  nextCursor?: string;
}

const DAY = 86_400_000;

export function periodStart(now: number, days: number): number {
  return now - days * DAY;
}

function time(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/** Commande payée dans la fenêtre : date de paiement, à défaut date de création. */
export function isPaidIn(order: OrderLike, since: number): boolean {
  if (order.status !== "paid") return false;
  const t = time(order.paidAt) ?? time(order.createdAt);
  return t !== null && t >= since;
}

export interface SalesSummary {
  paidCount: number;
  /** `null` : montants masqués pour ce rôle (l'API les retire), on n'affiche pas 0. */
  amountXaf: number | null;
  /**
   * La page reçue ne couvre pas toute la période : il existe des commandes plus
   * anciennes non chargées ET la plus ancienne reçue est encore dans la période.
   */
  truncated: boolean;
}

export function summarizeSales(pages: readonly OrdersPageLike[], since: number): SalesSummary {
  let paidCount = 0;
  let amount = 0;
  let amountKnown = false;
  let truncated = false;
  for (const page of pages) {
    for (const order of page.items) {
      if (!isPaidIn(order, since)) continue;
      paidCount += 1;
      if (order.amountXaf !== undefined) {
        amount += order.amountXaf;
        amountKnown = true;
      }
    }
    if (page.nextCursor) {
      const oldest = Math.min(...page.items.map((o) => time(o.createdAt) ?? Number.POSITIVE_INFINITY));
      if (Number.isFinite(oldest) && oldest >= since) truncated = true;
    }
  }
  // Aucune vente : 0 est exact. Des ventes sans montant : rôle sans accès aux montants.
  return { paidCount, amountXaf: amountKnown ? amount : paidCount === 0 ? 0 : null, truncated };
}

/** Éléments créés dans la fenêtre (abonnés). Liste plafonnée à `cap` par l'API. */
export function countCreatedIn(items: readonly { createdAt: string | null }[], since: number, cap: number) {
  const count = items.filter((i) => {
    const t = time(i.createdAt);
    return t !== null && t >= since;
  }).length;
  // Liste pleine et toute dans la fenêtre : il peut en exister d'autres.
  return { count, truncated: items.length >= cap && count === items.length };
}

export interface EndpointLike {
  health: string;
  status: string;
}

export function summarizePool(endpoints: readonly EndpointLike[]) {
  const total = endpoints.length;
  const down = endpoints.filter((e) => e.health === "down").length;
  return { total, healthy: total - down, down };
}

/** Versements qui demandent une action humaine, du plus urgent au moins urgent. */
export const PAYOUT_ATTENTION = ["needs_review", "failed", "pending"] as const;

export function payoutsNeedingAttention<T extends { status: string; createdAt: string | null }>(payouts: readonly T[]): T[] {
  const rank = (s: string) => {
    const i = (PAYOUT_ATTENTION as readonly string[]).indexOf(s);
    return i === -1 ? Number.POSITIVE_INFINITY : i;
  };
  return payouts
    .filter((p) => rank(p.status) !== Number.POSITIVE_INFINITY)
    .sort((a, b) => rank(a.status) - rank(b.status) || (time(a.createdAt) ?? 0) - (time(b.createdAt) ?? 0));
}

/** Jours `YYYY-MM-DD` (UTC) de la fenêtre, du plus ancien au plus récent, `now` inclus. */
export function windowDays(now: number, days: number): string[] {
  const end = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate());
  return Array.from({ length: days }, (_, i) => new Date(end - (days - 1 - i) * DAY).toISOString().slice(0, 10));
}

/**
 * Série quotidienne : somme de `value(item)` par jour de `when(item)` dans la fenêtre.
 * Les jours sans donnée valent 0 (la courbe ne saute pas de jour).
 */
export function dailySeries<T>(items: readonly T[], days: readonly string[], when: (item: T) => string | null, value: (item: T) => number = () => 1) {
  const index = new Map(days.map((d, i) => [d, i]));
  const out = days.map(() => 0);
  for (const item of items) {
    const iso = when(item);
    if (!iso) continue;
    const i = index.get(iso.slice(0, 10));
    if (i !== undefined) out[i] += value(item);
  }
  return out;
}

/** Date de vente retenue : paiement, à défaut création. */
export function saleDate(order: OrderLike): string | null {
  return order.paidAt ?? order.createdAt;
}

/**
 * Ventes de la fenêtre précédente de même durée [since − durée, since[, pour la
 * variation. `null` quand les données chargées ne couvrent pas cette fenêtre
 * (page à curseur dont la plus ancienne commande est plus récente que son début).
 */
export function previousWindowSales(pages: readonly OrdersPageLike[], since: number, days: number): { paidCount: number; amountXaf: number } | null {
  const from = since - days * DAY;
  let paidCount = 0;
  let amountXaf = 0;
  for (const page of pages) {
    if (page.nextCursor) {
      const oldest = Math.min(...page.items.map((o) => time(o.createdAt) ?? Number.POSITIVE_INFINITY));
      if (!Number.isFinite(oldest) || oldest > from) return null;
    }
    for (const order of page.items) {
      if (order.status !== "paid") continue;
      const t = time(order.paidAt) ?? time(order.createdAt);
      if (t === null || t < from || t >= since) continue;
      paidCount += 1;
      amountXaf += order.amountXaf ?? 0;
    }
  }
  return { paidCount, amountXaf };
}
