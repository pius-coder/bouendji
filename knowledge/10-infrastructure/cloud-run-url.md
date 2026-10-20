---
id: cloud-run-url
title: Découvrir l'URL publique d'un conteneur Cloud Run
tags: [gcp, cloud-run, url, host, sni]
status: open
updated: 2026-10-20
related: [cloud-run, open-questions]
---

## Le problème

Cloud Run n'injecte pas l'URL du service dans le conteneur. Or l'endpoint a
besoin de son `host` exact pour construire la configuration VLESS (`host`,
`sni`, `port 443`, `security tls`). Un mauvais host enregistre un nœud
injoignable qui pollue le pool et que l'app va tester en vain.

## L'idée proposée

« J'ouvre le lien dans une page et je récupère `window.location` ».

Ce que ça fait réellement : la page connaît **sa propre** URL. Elle ne la
transmet au conteneur que si elle fait un appel same-origin — et dans ce cas,
c'est l'en-tête `Host` de la requête qui porte l'information, pas
`window.location`. Donc l'idée fonctionne, mais pour une raison différente :
**toute requête entrante porte déjà le `Host` public**.

## Trois stratégies

1. **Variable `PUBLIC_HOST` obligatoire** au déploiement. Refus de démarrer si
   absente. Fiable, explicite, fonctionne avec un domaine personnalisé.
2. **Apprentissage au premier `Host` reçu** : le conteneur démarre sans
   enregistrer, la première requête HTTP lui donne son host, il enregistre
   alors. Défaut : le nœud n'entre dans le pool qu'après un premier contact, et
   une sonde de santé avec un mauvais `Host` peut l'empoisonner.
3. **Déduction** depuis `K_SERVICE` / `PROJECT_NUMBER` / `REGION`. Fragile : le
   format d'URL a changé, et un domaine personnalisé casse tout.

## Recommandation

`PUBLIC_HOST` obligatoire (1), avec (3) en secours et un avertissement au
démarrage si les deux divergent. (2) seulement si l'utilisateur refuse de saisir
la variable.

## Reste à trancher

Voir `open-questions` O5 : accepte-t-on de saisir `PUBLIC_HOST` à chaque
déploiement, ou préfère-t-on l'apprentissage paresseux ?
