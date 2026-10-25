/**
 * Regroupe des lignes par abonné (`userId`), en gardant l'ordre d'entrée.
 *
 * Le tableau des abonnés lit appareils et commandes UNE fois par page, puis répartit
 * les lignes par abonné : chaque tiroir ne reçoit que ses propres données. Fonction
 * pure (aucun appel réseau) : testée dans `test/orders-subscribers.test.ts`.
 */
export function groupByUser<T extends { userId: string }>(items: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(item.userId);
    if (group) group.push(item);
    else groups.set(item.userId, [item]);
  }
  return groups;
}
