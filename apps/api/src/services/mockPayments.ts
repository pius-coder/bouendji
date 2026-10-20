/**
 * État des paiements simulés, en mémoire.
 *
 * Le fournisseur `mock` crée des références `mock_<id>` et sert une page
 * hébergée par cette API. Ce module est le seul endroit où l'état vit : il
 * disparaît au redémarrage, ce qui est voulu — un paiement simulé ne doit
 * jamais survivre à un redéploiement.
 *
 * Jamais utilisé quand `PAYMENT_PROVIDER=fapshi`.
 */

export type MockPaymentStatus = "pending" | "paid" | "failed";

const statuses = new Map<string, MockPaymentStatus>();

export function setMockPaymentStatus(providerRef: string, status: MockPaymentStatus): void {
  statuses.set(providerRef, status);
}

export function getMockPaymentStatus(providerRef: string): MockPaymentStatus {
  return statuses.get(providerRef) ?? "pending";
}

/** Utilisé par les tests pour isoler un cas d'un autre. */
export function resetMockPayments(): void {
  statuses.clear();
}
