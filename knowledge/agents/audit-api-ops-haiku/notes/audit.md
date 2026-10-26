# Audit — API opérations admin (admin.ts 1122-1891)

> Rapport rendu dans la réponse finale de l'agent (il n'a pas pu écrire de .md) ;
> recopié tel quel par l'orchestrateur le 2026-10-26. Statut : non recontrôlé.

## Verdict
Solide sur les mutations d'argent et de nœuds (transitions conditionnelles, audit
dans la transaction). Creux pour le dashboard : aucune fiche de détail, aucune
recherche, aucun résumé d'accueil, pas de pagination par curseur hors commandes.

## Réponses
1. Routes (toutes `requireAdmin` + `authorize`) : `users` (1122, LIMIT 100,
   `member.read`), `devices` (1147, LIMIT 100), `orders` (1255, curseur keyset +
   filtre status, `order.read`, montants masqués via `seesMoney` 1287),
   `commissions` (1296, LIMIT, sans curseur), `payouts` (1679, LIMIT 50 max 200),
   `pool` (1727, LIMIT 200), `audit-log` (1866, LIMIT 200). `permitted()` 281-339.
2. Fiches manquantes : pas de `GET /users/:id`, `/orders/:id`, `/devices/:id`,
   `/payouts/:id` côté admin. Seul `GET /v1/orders/:orderId` utilisateur
   (`routes/orders.ts:168`). Jointures utiles : `subscriptions` (schema.ts:163),
   `usage_daily` (schema.ts:506), `devices`, `orders`.
3. Accueil/recherche : rien. Réutilisables : orders (1277), commissions
   `available` (1337), `usage_daily` (`account.ts:40`), `users.phone`
   (schema.ts:490, non exposé par la liste 1128). Pas de « code d'appareil »
   lisible (non vérifié ailleurs).
4. `endpoints/manual` (1751-1807) : pas de parseur VLESS ; le corps exige
   `address`, `snis`, `wsPath`, `uuid`, `label` (schéma 153-172).
   `parseVlessUri` (`lib/vless.ts:48`) n'est utilisé qu'en test. Libellé fourni
   par le client (1762). `randomWsPath` existe (`lib/vless.ts:70`), pas de
   générateur de nom.
5. Virement Fapshi : `/pay` appelle `payoutProvider.payout` (admin.ts:1498),
   réel si `PAYMENT_PROVIDER=fapshi` (`lib/fapshi.ts:150`), sinon mock
   (`fapshi.ts:53`). Réclamation avant l'appel (1455-1461), retour `approved` en
   cas d'erreur (1512-1534).
6. Audit : `appendAudit` (admin.ts:445) ; `target_type`/`target_id` permettent un
   lien, sauf `endpoint.manual` (targetId = groupe, 1801). Pas de filtre ni curseur.

## Écarts majeurs
1. Pas de fiches détail ni de recherche globale (plan 7).
2. Pas de parseur VLESS en prod ni de noms aléatoires (plan 8).
3. Finance hors communauté : `permitted` l'autorise (286, 302) mais
   `scopedCommunity` renvoie 403 (`lib/auth.ts:261`) sur orders (1257) et
   commissions (1301).
4. Pagination par curseur seulement sur les commandes.
5. Versement : Fapshi OK mais écriture de la référence en échec → retour à
   `approved` (1531) → rejouable alors que l'argent est parti ; dépend de
   l'idempotence `externalId` côté Fapshi (non vérifié).

## Non vérifié
Comportement de Fapshi sur `externalId` ; identifiant d'appareil lisible.
