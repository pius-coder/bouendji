---
id: flux-serveurs-app
title: Flux de la liste des serveurs (prod, application Android)
tags: [app, serveurs, bundle, endpoints, flux]
status: verified
updated: 2026-10-27
related: [decisions, livraison-apk-2026-10-26, admin-journeys]
---

# Flux de la liste des serveurs

## Ce qui est vérifié (base prod, lecture seule, 2026-10-27)

- 13 lignes dans `endpoints`. **3 actives** : Francfort (de, `node1.numzer0.store`),
  Paris (fr, `node2.numzer0.store`), Ballon d'or (Oregon, `192.179.18.100`, healthy,
  expire 2026-10-28). Les autres sont `expired` (dont 9 avec la même adresse
  192.179.18.100 et un `smoke.invalid`).
- Le serveur ne renvoie que `status='active'`, `tier` = tier du forfait, `health <> 'down'`,
  `expires_at` > maintenant + 900 s (`services/endpoints.ts`, `servedEndpoints`).

## Chemin de la liste

1. L'app appelle `GET /v1/configuration-bundles/current` (`BundleFetch`).
2. Réponse 200 → `vault.save` (sauf bundle vide, D61). Réponse 304 → rien.
3. La page Serveurs affiche le coffre local (`syncServersFromVault`, `nodesOf`).

## Déclencheurs (état au 2026-10-27)

- lancement, retour au premier plan, bouton « Vérifier le paiement » ;
- **ajouté le 2026-10-27** : ouverture de la page Serveurs et bouton
  « Actualiser la liste » (`AppController.refreshServers`) → appel réseau.

## Non fait (décisions à prendre)

- Push vers le téléphone quand un nœud change (FCM) : recompilation des 8 APK,
  projet Firebase à créer par l'utilisateur.
- Bouton « Activer » un nœud en attente, à côté de « Tester » dans le tableau de
  bord : nécessite une route API et un déploiement prod.
- Nettoyage des 13 lignes (9 doublons expirés) : non fait.

## Statut de vérification

- Code Android modifié : **relu, non compilé** dans cette session (pas de build local).
- Requête SQL : **vérifié** (sortie citée ci-dessus).
