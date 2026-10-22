---
id: node-control
title: Piloter un nœud — pull, tunnel ou serveur de contrôle
tags: [infrastructure,controle,cloudflared,heartbeat,xray]
status: decided
updated: 2026-10-21
related: [traffic-stats, revocation, endpoint-lifecycle, cloud-run, open-questions]
---

## Décision (D39, 2026-10-21)

**UUID partagé au lancement, pas de `cloudflared`.** Le nœud reste strictement
sortant ; l'API ne l'appelle jamais. Il n'y a donc **ni liste de clients à
synchroniser, ni commande dans le heartbeat** pour l'instant. Les options
ci-dessous restent la référence pour le jour où l'UUID par appareil arrivera.

## Question

Peut-on créer un utilisateur sur un nœud en profitant du heartbeat — le serveur
renvoyant une liste d'actions — plutôt que d'ouvrir un canal entrant ? Et si on
ajoutait `cloudflared` ?

## État actuel (vérifié)

- Le conteneur Cloud Run **n'ouvre aucun serveur de contrôle** : Xray écoute sur
  `$PORT` en VLESS/WebSocket, TLS terminé par Cloud Run. Il n'y a pas de route
  HTTP `/control`.
- Le conteneur n'appelle l'API que par `register`, `ready`, `heartbeat`
  (`internal.ts` ~124-162) : **sortant uniquement**.
- `heartbeat` met à jour `last_seen_at`/latence et renvoie
  `{status, expires_at}`. Il n'y a ni commande, ni révision de clients.
- L'API **ne peut pas joindre** l'intérieur du conteneur (voir
  `50-security/revocation`).

Donc aujourd'hui : aucun moyen de pousser une action à un nœud. Seul le nœud
parle.

## Option 1 — état désiré tiré par le nœud (recommandé)

Le heartbeat devient un **point de synchronisation**, pas un simple battement :

```
POST /v1/internal/endpoints/heartbeat
  <- { status, expires_at, clients_revision: 42 }

si clients_revision > revision_appliquée :
GET /v1/internal/endpoints/clients?since=41
  <- { revision: 42, added: [...], removed: [...] }

appliquer, redémarrer ou AlterInbound, puis
POST /heartbeat  { applied_revision: 42 }
```

Pourquoi un **état désiré** et pas une liste d'actions :

1. **Rejouable.** Un ajout rejoué est un no-op si `email` est unique ; une
   commande impérative rejouée après un crash peut créer un doublon.
2. **Convergent.** Le nœud peut manquer un battement, redémarrer, perdre son
   `config.json` : au prochain heartbeat il se réaligne sur la révision.
3. **Vérifiable.** `applied_revision` prouve que le nœud a bien la liste, ce qui
   permet de n'ouvrir l'accès qu'après application.

Coût : la latence est celle du heartbeat. À 45 s, un nouvel achat attend jusqu'à
45 s. Deux réglages possibles :

- heartbeat à **5-10 s** tant qu'une révision est en attente, sinon 30-45 s ;
- ou l'app attend un bundle `202 / activation en cours` jusqu'à
  `applied_revision >= revision` — c'est déjà la sémantique
  `activationStatus = pending`.

Aucun composant nouveau, aucun port entrant. **C'est l'option qui colle à Cloud
Run.**

## Option 2 — `cloudflared` (tunnel sortant)

`cloudflared` ouvre un tunnel sortant vers Cloudflare et donne au nœud un
hostname HTTPS stable, sans ouvrir de port ni rendre le service public.

```
API (Vercel) --HTTPS--> Cloudflare --tunnel--> cloudflared --HTTP--> contrôle local
```

Ce que ça apporte :

- l'API peut **appeler** le nœud : révocation immédiate, ajout de client poussé,
  lecture de stats à la demande ;
- plus besoin de connaître ou de stocker l'URL Cloud Run ;
- aucun port entrant, aucun `--allow-unauthenticated`.

Ce que ça coûte :

- un **troisième acteur** dans le chemin de contrôle (Cloudflare) : panne,
  latence, conditions d'utilisation ;
- un **secret de tunnel par nœud**, à provisionner et à révoquer ;
- **min instances = 1** sur Cloud Run, sinon le tunnel meurt avec l'instance ;
- un processus de plus dans le conteneur, donc un point de défaillance de plus ;
- le plan de données reste sur Cloud Run ; seul le contrôle passe par le tunnel.

Verdict : **utile, pas nécessaire**. À prendre quand la révocation doit être
immédiate ou quand le nœud tourne sur un VPS dont le panneau doit rester fermé.

## Option 3 — serveur de contrôle sur `$PORT`

Un petit serveur HTTP sur `$PORT` :

- `/control/*` → processus de contrôle local, authentifié par la clé de
  déploiement ;
- tout le reste → proxy WebSocket vers Xray sur `127.0.0.1:8081`.

Avantage : on utilise l'URL Cloud Run déjà connue, sans Cloudflare. Coût : un
composant de plus, du proxy WS à maintenir, des timeouts à régler. Plus lourd
que l'option 1 pour le même résultat fonctionnel.

## Cas VPS + 3x-ui

Sur un VPS, le panneau 3x-ui est **déjà** joignable en local et sait :

- un client par appareil (`email = "d-<devices.id>"`) ;
- le trafic **par client** toutes les 5 s ;
- la révocation par `POST /panel/api/clients/bulkDisable` (effet à la
  reconnexion, pas sur la session en cours).

Le problème est le même qu'ailleurs : l'API sur Vercel ne peut pas joindre
`127.0.0.1`. C'est **là** que `cloudflared` est le plus pertinent : exposer le
panneau à l'API sans ouvrir de port, avec un jeton de service. Le panneau reste
fermé au public.

Attention : le panneau est une surface d'administration à haute valeur. Tunnel
+ authentification forte + restriction d'origine, jamais un panneau nu.

## Matrice de décision

| Besoin | Cloud Run | VPS + 3x-ui |
|---|---|---|
| Ajouter un client | Option 1 (pull) | Push via panneau (tunnel) |
| Révoguer à < 5 s | Option 1 + heartbeat court, ou option 2 | Panneau via tunnel |
| Stats par client | Option 1 + UUID par client (`traffic-stats`) | Déjà fourni par le panneau |
| Zéro dépendance externe | Oui | Non si tunnel |

## Recommandation

1. **Cloud Run** : option 1 maintenant. Pas de `cloudflared`, pas de serveur de
   contrôle.
2. **VPS** : garder le panneau en `127.0.0.1`, et si l'API doit le piloter,
   passer par `cloudflared` avec un jeton de service — pas par un port public.
3. **Stats** : le nœud peut les pousser lui-même (sortant), donc **aucun tunnel
   n'est nécessaire pour la consommation**. Le tunnel ne sert qu'au **contrôle
   entrant**.

**Décision D39** : pour le lancement, on ne prend ni l'option 2 ni l'option 3.
L'option 1 est elle aussi sans objet tant que l'UUID est partagé — il n'y a
aucune liste à synchroniser. Le heartbeat reste un simple battement.

## Impact sur l'UUID par utilisateur

Un UUID par utilisateur impose que le nœud ait la liste **avant** la première
connexion. Avec l'option 1, l'app doit accepter un court `pending` le temps que
`applied_revision` rattrape. C'est le prix de la statistique par utilisateur et
de la révocation individuelle. L'UUID partagé supprime ce délai, mais interdit
les deux.

## Question ouverte

O20 est **résolu** (D39) : UUID partagé au lancement. L'UUID par appareil revient
quand une offre au Go, un fair-use ou une révocation immédiate l'exigent.
