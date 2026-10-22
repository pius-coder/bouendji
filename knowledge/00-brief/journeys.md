---
id: journeys
title: Parcours utilisateur et machine — récapitulatif
tags: [parcours,architecture,api,android,machine]
status: decided
updated: 2026-10-21
related: [api-routes, endpoint-lifecycle, pricing-and-split, fapshi, revocation, android-app]
---

## Acteurs

| Acteur | Rôle |
|---|---|
| Utilisateur | Paie, crée un compte, connecte son appareil |
| Application Android | Marque blanche ; deux clés dans le Keystore (signature + accord) ; moteur Xray |
| API (`apps/api`) | Comptes, appareils, commandes, abonnements, bundles, administration |
| Fapshi | Encaissement ; l'API revérifie chaque webhook |
| Conteneur endpoint | Xray sur Cloud Run ; s'auto-enregistre et bat le cœur |
| Dashboard admin | À réécrire (D33) ; l'API est prête |
| `owner` / `community_admin` | Plateforme / marque |

## A. Premier lancement → compte

```
App                            API                          Postgres
 |-- POST /v1/devices/challenges ->|                              |
 |<-- nonce -----------------------|                              |
 |  génère 2 clés EC dans le Keystore (SIGN + AGREE)             |
 |-- POST /v1/devices/enroll ----->| crée devices                 |
 |   (preuve signée par SIGN)      |<-- deviceToken --------------|
 |-- POST /v1/auth/register ------>| crée users + lie devices     |
 |   (deviceToken + preuve)        |<-- access + refresh ---------|
```

- L'appareil est **enrôlé avant** l'inscription ou la connexion.
- Un appareil déjà rattaché à un compte renvoie `409` : une installation ne
  glisse pas d'un compte à un autre.
- Le jeton d'appareil seul ne suffit pas : chaque appel porte une preuve signée
  (`requireBoundDevice`).
- Le refresh tourne (15 min d'accès, 45 jours de refresh) et l'ancien jeton est
  remplacé, avec une fenêtre de tolérance pour une réponse perdue.

## B. Choisir une offre

```
GET /v1/apps/:appId/plans
```

- Public, sans compte : l'APK connaît son `appId` au build
  (`BrandTokens.appId`).
- Ne renvoie que les offres **actives** de cette app.
- Chaque offre porte une `revision` (prix, durée, limite, activation).

## C. Payer

```
App                            API                       Fapshi
 |-- POST /v1/orders ------------>| prix lu en base,          |
 |   { planId, planRevision }     | commission figée          |
 |<-- paymentUrl ----------------|                           |
 |  ouvre le navigateur ------------------------------------->|
 |                                |<-- webhook ----------------|
 |                                | revérifie via l'API Fapshi |
 |                                | paid -> abonnement +       |
 |                                | commission (1 transaction) |
```

- Le client n'envoie **jamais** de montant ; un montant dans le corps est refusé
  par le schéma strict.
- Révision périmée → `409 PLAN_CHANGED`, aucune commande créée.
- Webhook rejoué → une seule activation, une seule commission.
- Webhook « paid » alors que Fapshi dit « pending » → rien.
- Montant falsifié → rejeté, commande intacte.
- Filet de sécurité : `GET /v1/orders/:id?refresh=1` réconcilie si le webhook
  est en retard.

## D. Obtenir l'accès

```
GET /v1/me/subscription          -> droits, plan, échéance
GET /v1/configuration-bundles/current
   -> { revision, expiresAt, envelope scellée pour la clé AGREE }
```

- Rien en clair ne sort : les URI VLESS n'existent qu'à l'intérieur du chiffré.
- La clé AGREE ne quitte pas le Keystore ; un bundle scellé pour un appareil ne
  s'ouvre pas pour un autre.
- `maxSessionSeconds` vient du serveur (D25) : l'app tourne et se renouvelle à
  ce rythme.
- `expiresAt` = le plus tôt entre la fin des droits et la première
  configuration expirée.
- L'app ne retélécharge que si `revision` change ; un heartbeat ne la change
  pas (D10).

## E. Cycle de vie de l'accès

- **Expiration** : plus de bundle ; l'app ne peut plus se connecter.
- **Quota** : `plans.device_limit` ; un appareil de plus est refusé.
- **Révocation** : l'admin passe `devices.status='revoked'` et révoque les
  sessions ; l'appel suivant est coupé. L'intérieur du conteneur Cloud Run est
  injoignable, donc la révocation est appliquée à la livraison du bundle et par
  la rotation courte, pas par une commande au nœud (voir `50-security/revocation`).
- **Remboursement** : l'abonnement est annulé, la commission passe `reversed`
  sans solde négatif.

## F. Hors-ligne (fichier de secours)

- L'admin émet un fichier scellé pour un appareil
  (`POST /v1/admin/devices/:id/offline-bundles`).
- L'appareil le marque consommé une seule fois
  (`POST /v1/offline-bundles/:bundleId/consumed`).
- Aucune route ne rend le contenu : ni UUID, ni chemin, ni clé.

## G. Administrateur d'une marque

```
owner : crée communauté + app
community_admin :
  GET/POST /v1/admin/apps/:appId/plans      prix de sa marque
  PATCH    /v1/admin/plans/:planId          prix, durée, badge, activation
  GET /v1/admin/communities/:id/{users,devices,orders,commissions}
  POST /v1/admin/devices/:id/revoke
finance  : prépare un versement (montant = somme des commissions disponibles)
owner    : approuve le versement
```

- Le périmètre vient de la session, jamais du corps.
- Le prix est la décision de la marque ; la commission est plafonnée à 30 %.
- Un versement ne peut pas être fabriqué : son montant est la somme des
  commissions disponibles.

## H. Machine : le conteneur endpoint

```
1. POST /v1/internal/endpoints/register   (retry infini)
   <- endpoint_id, uuid, ws_path, expires_at
2. écrit /etc/xray/config.json (mode 600)
3. xray run -test -c ...                  (échec -> exit 70)
4. xray run -c ... en tâche de fond
5. POST /v1/internal/endpoints/ready      -> pending devient active
6. heartbeat toutes les 45 s              -> last_seen_at, latence
7. SIGTERM                                -> tue xray, sort 0, n'appelle pas l'API
```

- `register` est idempotent : un restart réutilise l'identité, **n'étend pas**
  la durée de vie.
- TTL actuel : 4 h 30 ; drain 15 min avant l'expiration ; un endpoint n'est
  jamais supprimé, il est marqué `expired`.
- Le pool ne sert que les endpoints `active` et non expirés.

## Ce qui manque encore dans le parcours

1. **L'interface Android n'existe plus** (D33) : `MainActivity.kt` est vide. Le
   serveur sait faire tout le parcours A→F, l'app ne l'affiche pas encore.
2. **Le dashboard est supprimé** (D33), à réécrire sur Vercel (D32).
3. **Le versement réel n'est pas câblé** : `POST /payouts/:id/approve` passe
   `status='approved'` sans appeler `fapshi.payout()`.
4. **`ready` est déclaratif** : rien ne prouve qu'un endpoint actif répond
   réellement (angle mort de `endpoint-lifecycle`).

## Vérifié

- `test/e2e.test.ts` couvre inscription → commande → paiement simulé → webhook
  → abonnement → bundle chiffré → déchiffrement, sur vrai HTTP.
- `npm test` : 100 tests, 100 passés ; `npx tsc --noEmit` sans sortie.
