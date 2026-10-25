---
id: cloud-run-deploy-form
title: Formulaire Cloud Run — valeurs exactes à saisir
tags: [gcp, cloud-run, deploiement, formulaire, timeout]
status: verified
updated: 2026-10-24
related: [cloud-run, cloud-run-url, gcp-v2ray-repo]
---

Constats tirés des captures du formulaire « Create service » (2026-10-20).

## Valeurs

| Champ | Valeur | Pourquoi |
|---|---|---|
| Deploy one revision from an existing container image | oui | image poussée avant |
| Container image URL | **`ghcr.io/pius-coder/vpn-endpoint:latest`** | notre image (D96), publique ; Cloud Run tire les images publiques ghcr.io directement |
| Service name | `node-01`, `node-02`… | entre dans l'URL, **immuable** |
| Region | `us-central1` (seule proposée) | latence vers l'Afrique de l'Ouest ≈ 150-200 ms |
| Authentication | **Allow public access** | sinon aucun client VPN ne passe |
| Billing | **Request-based** | CPU facturé pendant les requêtes |
| Minimum instances | **0** | sinon CPU facturé 24 h/24 |
| Maximum instances | **2** (explicite) | borne le coût d'un pic |
| Ingress | **All** | obligatoire pour un service public |
| Container port | **8080** (ou `$PORT`) | Cloud Run route dessus |
| Memory | 512 MiB | suffisant pour Xray |
| CPU | 1 | minimum |
| **Request timeout** | **3600** | voir piège n°1 |
| Execution environment | Second generation | débit réseau |
| Startup CPU boost | coché | cold start plus court |
| Session affinity | décoché | une WS = une connexion |
| HTTP/2 end-to-end | décoché | VLESS-WS vit en HTTP/1.1 |
| Health check | startup probe TCP sur `$PORT` | ne pas exiger d'auth |
| Ephemeral disk / GPU / Cloud SQL | non | inutiles |

Variables d'environnement (mise à jour 2026-10-24) :

| Variable | Valeur | Note |
|---|---|---|
| `API_URL` | `https://api.numzer0.store` | **https** : le http répond 301 et le script ne suit pas |
| `ENDPOINT_INGEST_SECRET` | secret de `vpn-api` | l'utilisateur le lit lui-même : `ssh aura-vps "dokku config:get vpn-api ENDPOINT_INGEST_SECRET"` ; jamais recopié dans le chat ni dans `knowledge/` |
| `PUBLIC_HOST` | `<service>-<numéro de projet>.<région>.run.app` | l'URL Cloud Run est déterministe (ex. `vpn-node-513999018169.us-west1.run.app`) |
| `ENDPOINT_FRONT_ADDRESS` | `192.179.18.100` | frontal Google (D93) |
| `ENDPOINT_FRONT_SNIS` | `crashlyticsreports-pa.googleapis.com,play-fe.googleapis.com,android.googleapis.com,youtubei.googleapis.com,lens-pa.googleapis.com,t2.gstatic.com,beacons.gcp.gvt2.com,play.google.com` | une sortie par SNI |
| `ENDPOINT_LABEL` / `ENDPOINT_REGION` | ex. `Oregon` / `us` | nom et pays affichés dans l'app |
| `ENDPOINT_TTL` | durée de vie du projet de lab en secondes | ex. `16200` (4 h 30, D21) |

Vérifié le 2026-10-24 : workflow `endpoint-image` (GitHub Actions) → `success` ;
manifeste `latest` lisible **sans authentification** (HTTP 200) ; l'image tirée de
GHCR démarre sur `vpn-node2` → `enregistré` puis `ready : status=active`.

## Piège 1 — le timeout par défaut est 300 s

Le formulaire propose **300 secondes** (5 minutes), alors que le maximum est
3 600. Laissé à 300, **le tunnel tombe toutes les 5 minutes** : l'app devra se
reconnecter 12 fois par heure. Ce n'est pas un réglage cosmétique.

Conséquence de conception : chaque endpoint doit annoncer
`max_session_seconds` dans son bundle, et le client doit tourner à
`max_session_seconds − 60`. Une valeur codée en dur dans l'app serait fausse dès
qu'un nœud est déployé avec un autre timeout.

## Piège 2 — facturation à la requête = CPU bridé entre deux requêtes

« Request-based : CPU is limited outside of requests. » Un tunnel WS actif est
une requête, donc CPU alloué. Mais **sans client, il n'y a plus de CPU** : une
boucle de heartbeat toutes les 60 s dérive, parfois de plusieurs minutes.

Donc `last_seen_at` ne doit **jamais** servir à retirer un nœud du pool. Seule
`expires_at` fait foi. Un nœud sans trafic n'est pas mort, il est endormi — et
il se réveille au premier paquet.

## URL

Le placeholder affiché confirme le format déterministe :

```
https://<service>-<numéro-de-projet>.<région>.run.app
```

Donc l'URL est **déductible** depuis `K_SERVICE` + l'identifiant numérique du
projet (metadata server) + la région. `PUBLIC_HOST` reste préférable : il
survit à un changement de format et à un domaine personnalisé.

## Conséquences pour le pool

- Ne pas purger sur heartbeat — voir piège 2.
- `min-instances=0` : le premier paquet paie 1 à 3 s. Le client doit accorder
  une seconde chance avant de classer le nœud mauvais.
- Avec 2 instances maximum et 80 requêtes concurrentes par instance, un même
  service peut porter ~160 tunnels sous la même URL et le même UUID.

## Service réellement déployé le 2026-10-20

Relevé sur la console (`bouendji-illimiter`, révision `00001-dwt`) :

| Réglage | Valeur constatée | Verdict |
|---|---|---|
| Request timeout | **300 s** | à passer à 3 600 — sinon coupure toutes les 5 min |
| Billing | Request-based | conforme |
| Startup CPU boost | Enabled | conforme |
| Concurrency | 80 | conforme |
| Execution environment | **Default** | passer en *Second generation* (débit réseau) |
| Port | 8080 | conforme |
| CPU / Memory | 1 / 512 MiB | conforme |
| Environment variables | **0** | à remplir quand notre conteneur arrive |
| Maximum instances | **vide** | défaut plateforme = 100 : à borner à 2 |
| Image | `mirror.gcr.io/labkingfreesurf/…` | image tierce : UUID figé, ni TTL, ni révocation, ni stats |
| Déployé par | `student-04-…@qwiklabs.net` | compte de lab |

Mesures : 2 instances au pic, CPU ≈ 12 %, mémoire ≈ 30 %, sortie ≈ 500 Ko/s.

L'image tierce explique pourquoi « ça marche » sans notre architecture : elle
proxy, mais elle ne s'enregistre pas, n'annonce pas d'expiration et ne permet
ni révocation ni comptage. `deployment_key` ne prend son sens qu'avec notre
conteneur.

