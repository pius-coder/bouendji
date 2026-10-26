# Journal — w1-api-r6-haiku

## 2026-10-26T11:21:30Z · Création
- fait: charte créée
- portée: Familles de forfaits, quota, options de nuit, reglages tarifaires saisis par les owners, prix plancher, commande avec plage, abonnement avec quota, corrections webhook et double abonnement.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-26T12:32:49Z · Migrations 060-065, pricing, forfaits, commande, abonnement

- fait: Migrations 060 a 065 (famille, quota, options de nuit, colonnes commande et abonnement, UNIQUE sur subscriptions.order_id avec detection de doublons sans suppression, pricing_settings). Verrou FOR UPDATE sur la commande a l'activation ; webhook pending repris au renvoi. routes/pricing.ts (GET owner+community_admin, PUT owner). Plafond de commission lu depuis les reglages (repli 30 % sans reglage). Plancher a la creation et a la modification des forfaits. Catalogue, commande (nightWindow, total serveur), abonnement (quota, plage), GET /v1/me/subscription enrichi. contracts.ts : bloc R6 et docFor. Tests test/r6.test.ts (18 verts).
- etat: ok
- suite: Suite complete en cours ; commits a faire sur w1/r6

## 2026-10-26T12:42:05Z · CLÔTURE
Arrêt demandé par le coordinateur. Commit de90dd8 sur w1/r6 ; tsc vert ; test/r6.test.ts 18/18 ; suite complète non relancée. Détail : knowledge/agents/w1-api-r6-haiku/notes/reste-a-faire.md
