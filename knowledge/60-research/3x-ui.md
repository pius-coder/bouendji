---
id: 3x-ui
title: 3x-ui — ce que le moteur permet réellement
tags: [3x-ui, xray, panel, api, revocation, trafic]
status: decided
updated: 2026-10-20
related: [revocation, threat-model, endpoint-lifecycle]
---

Analysé : 3x-ui **v3.10.2** (release du 2026-10-14) et `main` au 2026-10-20.
`main` est une réécriture v3 (Go, `internal/*`) : les clients sont une table
normalisée, plus du JSON dans `inbounds.settings` comme en 2.x.

Vérifié sur source réelle, chemins cités dans
`knowledge/agents/xray-ops/notes/3x-ui-verdict.md`.

## Réponses aux cinq questions

1. **Désactivation à chaud : oui, avec `restartXrayOnClientDisable=false`.**
   `RemoveUser` (gRPC `AlterInbound`) s'applique immédiatement et ne touche que
   ce client. Mais il ne coupe **pas** une session établie, et le réglage vaut
   `true` par défaut : dans ce cas le panneau programme un redémarrage de Xray
   (`@every 30s`) qui **coupe tous les clients du nœud**. Le même chemin
   s'applique au quota : par défaut, un client qui l'atteint redémarre le nœud.

2. **Trafic par client : oui, fiable à 5 s.** Compteurs
   `user>>>email>>>traffic>>>uplink|downlink`, `QueryStats(Reset=false)` toutes
   les 5 s, deltas additionnés dans `client_traffics` (`email` unique). SQLite
   `/etc/x-ui/x-ui.db` par défaut, Postgres via `XUI_DB_TYPE`/`XUI_DB_DSN`.
   Trou connu : un arrêt du **panneau** perd la fenêtre en cours (base de
   référence en RAM).

3. **Inbound par API au démarrage : oui, à chaud.**
   `POST /panel/api/inbounds/add` → `AddInbound` gRPC, sans redémarrage. Le
   coût réel est l'amorçage du jeton :
   `x-ui setting -getApiToken true -tokenScope admin` (affiché une fois).

4. **Panneau non exposé + piloté par API : oui.** `webListen=127.0.0.1`, port
   non publié, `Authorization: Bearer` (exempté de CSRF), scopes
   `admin`/`monitor`/`node-sync`, `openapi.json` disponible.

5. **API Xray directe :** suffisante techniquement
   (`HandlerService.AlterInbound` + `StatsService.QueryStats`) mais on rachète
   quotas, expiration, persistance et génération de config — et **on garde le
   même problème de session vivante**. Retenue seulement en remplacement complet
   du panneau, jamais en plus.

## Modèle de données

- `clients` + `client_inbounds` (N-N) + `client_traffics` (`email` unique).
- `email` est la clé de corrélation avec `devices.id` **et** la clé des
  compteurs. Un `email` partagé = compteurs fusionnés, donc quota faux.
- Quota et expiration sont **par client** (`total`, `expiryTime`,
  `trafficReset`, `trafficResetDay`).

## Pièges d'intégration

- `POST /panel/api/clients/update/:email` **remplace** l'entrée : un corps
  partiel efface `totalGB`, `expiryTime`, `limitIp`. Lire avant d'écrire, ou
  utiliser `/clients/bulkDisable` qui ne touche qu'à `enable`.
- `GetUsersStats` ne liste que les utilisateurs **en ligne** : inutilisable pour
  un relevé de quota.
- Le redémarrage est global au processus, jamais par inbound.
- Le panneau admin tourne en root (CVE-2026-55477, corrigée en 3.3.1) ;
  l'auto-update doit être désactivé (DLSEC-2025-1).

## Architecture retenue

Un conteneur 3x-ui **par nœud VPS**, panneau strictement en loopback, jeton
Bearer scopé, `restartXrayOnClientDisable=false`, un client par appareil avec
`email = "d-<devices.id>"`.

Écarté : 3x-ui dans un conteneur Cloud Run éphémère (état SQLite + secret +
compteurs disparaissent), et doubler le gRPC Xray à côté du panneau (dérive de
configuration).

## Reste non vérifié

- Latence réelle d'application d'une désactivation (bornée par un timeout gRPC
  de 5 s) : **non mesurée**.
- Effet de `RemoveUser` sur les sessions mux/XHTTP/QUIC : **non vérifié**.
- `RoutingService.AddRule` sur des flux en cours : **non vérifié**.
- Inventaire CVE exhaustif : **non fait**.
