---
id: revocation
title: Révocation d'un accès — ce qui est possible, ce qui est vendable
tags: [securite, revocation, xray, 3x-ui, identite]
status: open
updated: 2026-10-20
related: [3x-ui, threat-model, endpoint-lifecycle, open-questions]
---

## Le problème topologique

Le backend **ne peut pas joindre l'intérieur d'un conteneur Cloud Run**. Donc
sur GCP, la révocation n'existe pas : la seule arme est l'expiration courte
(4 h 30 aujourd'hui, voir D21). Sur un VPS, le panneau est joignable, donc le
backend peut agir.

## Ce que le moteur permet (vérifié)

3x-ui v3.10.2 sait retirer un client à chaud (`AlterInbound/RemoveUser`, gRPC
local) et lire son trafic par client toutes les 5 s. Deux limites physiques :

1. **L'API Xray ne tue pas une session établie.** Le code du panneau le dit :
   « The core's RemoveUser clears its validator: a session already up keeps
   running » (`internal/web/job/check_client_ip_job.go`). Seuls un redémarrage
   du processus (tous les clients) ou un bannissement IP (iptables/fail2ban)
   coupent un flux en cours.
2. **Le redémarrage est global.** Par défaut
   (`restartXrayOnClientDisable=true`), désactiver un client — ou le voir
   atteindre son quota — programme un redémarrage de Xray sous 30 s, qui coupe
   **tous** les clients du nœud.

## Modes

| Mode | Identifiant | Révocation individuelle |
|---|---|---|
| `shared` | 1 UUID par endpoint | impossible — tuer le nœud ou attendre |
| `per_device` | 1 UUID par appareil | oui, via 3x-ui, effet à la reconnexion |

## Option retenue pour les VPS

- Un client 3x-ui par appareil, `email = "d-<devices.id>"`, jamais partagé :
  c'est la clé unique du compteur **et** de la révocation.
- Révocation par `POST /panel/api/clients/bulkDisable` (immédiat, ne touche
  qu'à `enable`). Ne jamais passer par `/clients/update/:email` avec un objet
  partiel : cela efface quota et expiration.
- `restartXrayOnClientDisable = false` est **obligatoire**, pas une
  optimisation : sinon un impayé coupe le nœud entier.
- Panneau en `127.0.0.1`, piloté par jeton Bearer, jamais publié.

## Formulation honnête à vendre

Ne jamais promettre une coupure immédiate de la session en cours. Le maximum
défendable est :

> « identifiant révoqué en moins de 5 secondes ; la session en cours s'éteint
> au plus tard à la prochaine reconnexion du client, ou immédiatement si un
> bannissement IP est appliqué. »

Sur GCP : aucune révocation, seulement l'expiration.

## Ce qui reste à trancher

Par où passe l'ordre de révocation vers un VPS : appel direct du backend au
panneau (simple, mais le panneau doit être joignable depuis l'API), ou heartbeat
descendant appliqué par un agent local (le panneau reste en loopback strict) ?
