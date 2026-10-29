---
id: open-questions
title: Questions non tranchées
tags: [brief, questions, blocage]
status: open
updated: 2026-10-22
related: [decisions, 3x-ui, revocation, ingest-auth, cloud-run-url]
---

Chaque entrée doit disparaître (ou passer en `decided`) dès qu'elle est réglée.

## O1 — RÉSOLU le 2026-10-20 : 4 h 30

La durée de vie du projet qui héberge les nœuds est de 4 h 30 ; ce n'est donc
pas une décision produit. Voir **D21** : `ENDPOINT_DEFAULT_TTL = 16 200 s`,
drain 900 s, soit 4 h 15 de service utile.

## O2 — RÉSOLU le 2026-10-20 : voir `3x-ui`

Analyse faite sur la source (v3.10.2). Verdict dans le nœud `3x-ui` : la
désactivation à chaud existe, le trafic par client est fiable à 5 s, mais
`restartXrayOnClientDisable` vaut `true` par défaut et redémarre tout le nœud.

## O3 — Révocation d'un utilisateur

Avec un UUID partagé par endpoint, la seule révocation est de tuer le nœud.
Est-ce acceptable sur GCP (exposition ≤ durée de vie) et faut-il
`per_device` partout sur VPS ? Dépend de O2.

## O4 — Authentification du webhook d'ingestion

Contrainte nouvelle : accès **uniquement à l'interface Cloud Run**, donc on ne
peut poser que des variables d'environnement (pas de Secret Manager, pas
d'IAM fine). Le jeton OIDC Google reste récupérable depuis le metadata server,
mais la liste blanche d'e-mails demande des droits qu'on n'a peut-être pas.

**Besoin** : choisir entre (a) secret statique + HMAC + horodatage + nonce,
(b) OIDC avec `aud` seul, (c) les deux.

## O5 — Découverte de l'URL publique du conteneur

Idée proposée : ouvrir le lien dans une page et lire `window.location`.
Problème : la page voit sa propre URL, pas le conteneur ; et toute requête
entrante porte déjà l'en-tête `Host`. Voir `cloud-run-url`.

**Besoin** : confirmer `PUBLIC_HOST` en variable d'environnement, ou acceptons
nous l'apprentissage paresseux au premier `Host` reçu ?

## O6 — Telegram ou WhatsApp ?

Les rappels d'expiration étaient prévus sur Telegram ; la notification de
retrait Fapshi est annoncée sur WhatsApp. Deux canaux, deux bots, deux
maintenances — ou un seul ?

## O7 — Qui émet les fichiers hors-ligne, et avec quel quota ?

Owner seul, ou chaque `community_admin` pour sa communauté ? Combien par
appareil et par mois ?

## O8 — Détail du plan « données limitées »

Quota par appareil ou par compte ? Mesuré comment (Xray stats poussés toutes
les 60 s, sinon perdus avec l'instance) ? Que se passe-t-il au dépassement :
coupure, bridage, ou bascule vers le plan illimité payant ?

## O9 — Qui construit quoi ?

Le partenaire devait faire API + admin. La consigne récente est de tout faire
ici. Il faut savoir si le code produit ici est destiné à être repris par lui,
ou s'il devient la référence.

## O10 — Cold start accepté ?

Avec `min-instances=0`, le premier paquet paie 1 à 3 s de démarrage et l'app
peut classer le nœud « mauvais ». Accepte-t-on `min-instances=1` (coût) ou un
délai de grâce côté client ?

## O11 — Cadence de reconnexion préventive

55 min ? 50 min ? Et que se passe-t-il pour un téléchargement en cours au
moment de la bascule : on coupe, ou on attend la fin de la session TCP ?

> 2026-10-20 — provisoirement **55 min** (`ENDPOINT_RECONNECT_AFTER=3300`),
> exposé au client sous le nom `maxSessionSeconds` (D25). La bascule coupe la
> session en cours : à 55 min, un téléchargement long est déjà terminé dans la
> quasi-totalité des cas. À confirmer.

## O12 — Prix des forfaits

Aucun prix n'a été fourni. `apps/api/src/seed.ts` crée trois forfaits avec des
valeurs **provisoires** (5 000 / 13 500 / 48 000 XAF), surchargeables par
`SEED_PRICE_1M`, `SEED_PRICE_3M`, `SEED_PRICE_12M`. Ces montants s'affichent
tels quels dans l'application : ils doivent être validés avant toute vente.

**Besoin** : les vrais prix, et leur durée (30 / 90 / 365 j) — ou la décision
de laisser chaque communauté fixer les siens.

## O13 — Seuil de l'alerte de déploiement

`DEPLOY_WARN_MINUTES=30` : Telegram prévient quand le dernier nœud actif expire
dans moins de 30 min. Déployer prend quelques minutes ; 30 laisse une marge,
mais l'alerte arrive peut-être trop tard pour quelqu'un qui dort.

**Besoin** : 30 min, 60 min, ou deux alertes (60 puis 15) ?

## O14 — `finance` voit-elle toutes les communautés ?

Le tableau de `roles-and-commissions` dit « toutes, montants ». C'est appliqué
tel quel : un membre `finance` de la communauté A lit les commandes de la
communauté B. C'est une **exception assumée** à la règle « le `community_id`
vient de la session » : elle est cohérente pour un comptable de la plateforme,
elle est fausse si `finance` est un rôle de partenaire.

**Besoin** : confirmer que `finance` est un rôle plateforme (l'owner nomme son
comptable), ou le rattacher à une seule communauté — auquel cas la ligne
`anyRole(["finance"])` de `permitted()` doit disparaître.

## O15 — Le balayage périodique sur Vercel

`server.ts` entretient un tick de 60 s (expiration d'endpoints, `poolWatch`,
`purgeExpired`). Une fonction serverless ne vit pas entre deux requêtes : ce
tick disparaît. Trois options, aucune retenue :

- **(a)** Cron Vercel à la minute — **plan Pro obligatoire**, sur Hobby le cron
  est limité à **une exécution par jour** (vérifié dans la doc Vercel).
- **(b)** Déclencheur externe appelant une route protégée.
- **(c)** Calcul paresseux : ne plus balayer, mais filtrer par
  `expires_at > now()` à chaque lecture du pool. Seule option qui ne dépend
  d'aucun plan, et elle rend le tick inutile pour le pool — reste à décider pour
  `purgeExpired` (rétention) et l'alerte Telegram de déploiement.

**Besoin** : (a), (b) ou (c) — et si (c), qui déclenche l'alerte Telegram ?

## O16 — Adaptateur Fastify → Vercel

L'API est écrite pour un serveur qui écoute (`app.listen`). Vercel appelle une
fonction par requête. La conversion est mécanique mais **non faite et non
vérifiée** : `rawBody` (signature d'appareil), `@fastify/rate-limit`, CORS et
les hooks `preHandler` doivent être exercés dans ce runtime avant qu'on puisse
dire que l'API fonctionne là-bas.

**Besoin** : décider si on adapte Fastify (léger, réutilise les 94 tests) ou si
on réécrit la couche HTTP en `api/*.ts` natifs Vercel (plus idiomatique, mais
jette les tests de routes).

## O17 — RÉSOLU le 2026-10-21 : prix fixé par la communauté (D35)

Résolu par **D35** (2026-10-21) : le prix est fixé par la communauté ; la
plateforme encaisse 100 %, réserve **30 % du CA généré** en enveloppe de
commissions répartie au prorata, et garde **70 %**. Détail :
`40-money/pricing-and-split`.

Correction du constat initial : `plans` n'est pas « global » au sens plateforme.
Il est indexé par `app_id` (`UNIQUE(app_id, code)`), et chaque `apps` appartient
à une communauté (`apps.community_id`). Le produit étant **white label**, une
app = une marque = une communauté : les prix sont donc **déjà par marque**. Ce
qui manque n'est pas une table de prix, mais les routes admin de gestion des
forfaits et un endpoint public par app.

## O18 — RÉSOLU le 2026-10-21 : calcul de la commission (D35)

D35 fixe le modèle : **30 % du seul CA généré par les communautés**, réparti
**au prorata du CA**. Les trois détails d'implémentation sont tranchés :

1. **Assiette** : **brut**, avant frais Fapshi. La plateforme absorbe les frais
   sur ses 70 %.
2. **Plafond de prix** : **aucun**. Le produit est white label : chaque app
   porte le nom et la marque de son administrateur, donc un prix élevé engage sa
   réputation, pas celle de la plateforme.
3. **Arrondi** : **`floor`**, la plateforme ne paie jamais plus de 30 % ; un
   remboursement après versement se déduit de l'enveloppe suivante.

C'est codé (`MAX_COMMISSION_BPS = 3000`, contrainte SQL, `commissionFor`) et
vérifié par `tsc --noEmit` et 100 tests. Détail : `40-money/pricing-and-split`.

## O19 — RÉSOLU le 2026-10-21 : pas de consommation par utilisateur (D39)

**Tranché** : UUID partagé au lancement, donc **pas de consommation par
utilisateur**. Seuls des **totaux par nœud** restent possibles, et ils ne sont
pas nécessaires tout de suite. La consommation par utilisateur revient avec
l'UUID par appareil (D39, reporté). L'analyse ci-dessous reste la référence
technique pour ce moment-là.

**Question** : peut-on connaître la consommation de **chaque utilisateur** grâce
au conteneur Xray, et comment le conteneur remonte-t-il cette donnée ?

**Fait vérifié** : aujourd'hui non, pas par utilisateur.

- `endpoints.identity_mode` vaut toujours `'shared'` (valeur écrite en dur dans
  `registerEndpoint`, `services/endpoints.ts` ~159) : **un seul UUID par
  endpoint**, partagé par tous les clients.
- `endpointToConfig(row, identity)` sait lire `per_device`, mais aucun code ne
  passe d'identité et rien ne stocke un UUID par appareil.
- Le conteneur GCP n'envoie que `register`, `ready` et `heartbeat` : **aucune
  donnée de trafic** ne remonte.
- Sur un **VPS avec 3x-ui**, le mode `per_device` fournit déjà le trafic **par
  client** toutes les 5 s et la révocation individuelle
  (`50-security/revocation`). Le problème y est différent : rendre le panneau
  joignable par l'API sans l'exposer publiquement — voir
  `10-infrastructure/node-control`.
- Xray peut exposer des compteurs par `email`/UUID via son API stats, mais
  seulement si chaque client a une identité distincte dans l'inbound.

**Trois options** :

| Option | Ce qu'on obtient | Coût |
|---|---|---|
| A. UUID partagé (actuel) | Totaux **par endpoint** | Nul |
| B. UUID par utilisateur + liste de clients tirée par le nœud + stats poussées vers l'API | Consommation **par utilisateur** | Élevé : rechargement de config, distribution des UUID, bundle modifié |
| C. Un conteneur par utilisateur | Isolation parfaite, stats triviales | Très élevé |

**Recommandation** : A maintenant (le dashboard affiche les totaux par nœud,
suffisants pour la capacité), B seulement si une offre au Go ou une politique de
fair-use est vendue. Détail technique : `10-infrastructure/traffic-stats`.

Sous-questions à trancher : granularité (jour ?), rétention, et si la
consommation devient une règle commerciale (quota, bridage, suspension).

## O20 — RÉSOLU le 2026-10-21 : UUID partagé au lancement, par appareil plus tard (D39)

**Tranché** : UUID **partagé** pour le premier déploiement. Accès immédiat,
aucun délai d'activation, pas de synchronisation de clients. Le passage à l'UUID
par appareil est reporté au moment où les stats par utilisateur ou la révocation
immédiate deviendront une exigence commerciale.

Le nœud peut recevoir une identité de deux façons :

- **UUID partagé** : un seul client par endpoint (`email: "shared"`). Accès
  immédiat, aucun délai d'activation, mais **aucune statistique par utilisateur**
  et **aucune révocation individuelle**.
- **UUID par appareil** : un client par appareil (`email = "d-<device_id>"`).
  Donne les stats et la révocation, mais impose que le nœud ait la liste avant
  la première connexion : l'app doit accepter un `pending` le temps que
  `applied_revision` rattrape (`10-infrastructure/node-control`).

**Déclencheur de réévaluation** : une offre au Go, un fair-use, ou une exigence
de révocation immédiate. Sans l'un des trois, l'UUID partagé reste le bon choix.

## O21 — `X-App-Id` doit-il correspondre au `:appId` de la route ?

Relevé le 2026-10-22 en ajoutant l'en-tête côté Android.

**Fait vérifié** : `CONTRIBUTING.md` §3 dit que
`GET /v1/apps/:appId/plans` exige `X-App-Id` **égal à** `:appId`, sinon 302.
Le code ne le fait pas :

- `routes/catalog.ts` ignore complètement les en-têtes et filtre par
  `req.params.appId` ;
- `lib/decoy.ts` et `middleware.ts` ne testent que la **présence** de
  `x-app-id` (≥ 2 caractères) et `vpn-android` dans l'`User-Agent` ;
- le 302 ne se déclenche que sur `Accept: text/html` — un client JSON sans
  métadonnées reçoit un JSON normal, ce qui est voulu (tests, dashboard).

**Conséquence** : n'importe quel `X-App-Id` non vide désarme le leurre ; la
valeur n'est jamais confrontée au chemin. Ce n'est pas une faille de sécurité
(le leurre n'en est pas une, D43), mais le contrat écrit et le code divergent.

**Besoin** : soit vérifier l'égalité (et alors le leurre couvre aussi le
catalogue — utile pour qu'un curieux ne puisse pas lister les prix d'une
marque), soit corriger CONTRIBUTING pour dire « présence suffisante ».

## Fermées le 2026-10-23

| # | Fermée par | Ce qui a été tranché |
|---|---|---|
| **O4** | **D56** | Bearer `ENDPOINT_INGEST_SECRET` + `X-Ingest-Timestamp` (±120 s). Pas de HMAC : TLS couvre le rejeu réseau, le jeton reste la frontière. |
| **O5** | **§4.5 du plan** | `PUBLIC_HOST` est une variable explicite, lue depuis l'URL réelle rendue par `gcloud run deploy`. Aucun nom d'hôte deviné. |
| **O12** | **D59** | Aucun forfait au seed. Chaque admin pose ses prix et ses durées en jours. |
| **O15** | **D51** | Entretien paresseux (hook 60 s/instance). Ni cron Pro, ni déclencheur externe. |
| **O19 / O20** | **D52 / D69** | UUID partagé sur les labs ; `per_device` sur le nœud `paid-gcp` seul, avec deux sources de consommation nommées. |
| **O21** | **D71 / CONTRIBUTING §3** | Le leurre ne teste que la **présence** de `X-App-Id` et ne redirige que sur `Accept: text/html`. La phrase « même valeur que `:appId` » était fausse : corrigée. L'`appId` est public par construction. |







## Ouvertes le 2026-10-24

- ~~**Image d'endpoint hébergée par nous**~~ **réglé par D96 (GHCR)** — pour Cloud Run (au lieu de l'image
  tierce `docker.io/ajndjd2/ahmed-vip1`, dont l'UUID est figé et public) :
  Cloud Run tire depuis Docker Hub public ou Artifact Registry → il faut le
  compte Docker Hub de l'utilisateur (ou un projet GCP avec Artifact Registry).
  À faire aussi : variables `ENDPOINT_FRONT_ADDRESS` / `ENDPOINT_FRONT_SNIS` dans
  `infra/endpoint` pour que le nœud s'enregistre directement en fronting (D93).
- **Lien de la communauté WhatsApp/Telegram** de la marque de test : non fourni
  (`communityWhatsappUrl` vide), la rangée et le bouton restent masqués.
- **Récompense du parrainage** (D95) : montant, plafond, anti-abus.

## O22 — Attribution manuelle d'un forfait par l'owner

Le besoin est confirmé le 2026-10-29 : l'owner doit pouvoir aider un utilisateur
dont l'accès n'a pas été activé. Deux opérations différentes ne doivent pas être
confondues :

1. **reprendre un paiement déjà confirmé** en réconciliant la commande sans
   modifier le montant ni créer une seconde commission ;
2. **offrir/prolonger un accès sans paiement**, ce qui exige de décider comment
   représenter la source, la durée, la commande éventuelle et l'absence de
   commission dans l'audit et les chiffres de vente.

État vérifié : aucune route admin ne réalise l'une ou l'autre ;
`subscriptions.order_id` est actuellement obligatoire. Décision nécessaire :
autoriser seulement la reprise d'activation, ou aussi les accès gratuits avec
un motif obligatoire et une trace d'audit.

- **Builds sur R2** (D100) : non implémenté ; `builds.ts` vise encore Vercel Blob.
- ~~Sous-domaine Cloudflare~~ : réglé par D101 (`api`, `dl`, `node1`, `node2`).
- ~~`cloud-run-url`~~ : réglé — `entrypoint.sh` déduit l'URL des métadonnées
  Cloud Run quand `PUBLIC_HOST` est absent (2026-10-24).
