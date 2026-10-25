# Propositions (non intégrées : fichiers partagés hors périmètre)

## 1. Factoriser `DrawerSection` et `Line` (fichiers partagés, à intégrer par l'orchestrateur)

Trois tiroirs recopient le même couple de helpers :
- `src/components/payouts/payout-drawer.tsx` (source, non exporté)
- `src/components/orders/order-drawer.tsx` (copie, mon fichier)
- `src/components/subscribers/subscriber-drawer.tsx` (copie, mon fichier, `Line` sans `strong`)

Proposition : les exporter depuis `src/components/page/drawer-parts.tsx` (fichier nouveau,
partagé) puis les importer dans les trois tiroirs. Je n'ai pas touché `payout-drawer.tsx`
ni `src/components/page/*` (interdits à ma charte).

## 2. Bouton « Détails » masqué sur mobile dans les versements (à corriger par le propriétaire de payouts)

`src/components/payouts/payouts-columns.tsx` déclare `{ id: "open", header: "", align: "right" }`
sans `mobile`. `cellClass` (page/table.tsx) rend alors la cellule `hidden` sous 768 px :
sur téléphone, aucun moyen d'ouvrir le tiroir d'un versement.
Mes colonnes `open` (commandes, abonnés) portent `mobile: "trailing"` pour éviter ce défaut.
Proposition : ajouter `mobile: "trailing"` à la colonne `open` de `PAYOUT_COLUMNS`.

## 3. Limites de l'API affichées dans le tiroir abonné (information, pas de changement)

- `GET /v1/admin/communities/:id/devices` : `ORDER BY d.created_at DESC LIMIT 100`
  (`apps/api/src/routes/admin.ts`, l. 1157). Un abonné ancien peut avoir ses appareils hors des 100.
- `listOrders` avec `limit: 100` : 100 commandes les plus récentes de la communauté, pas
  forcément toutes celles de l'abonné. Le tiroir l'indique en note de section.
