---
id: open-questions
title: Questions non tranchées
tags: [brief, questions, blocage]
status: open
updated: 2026-10-20
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


