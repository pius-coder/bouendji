---
id: traffic-stats
title: Consommation par utilisateur — ce que Xray peut dire
tags: [infrastructure,xray,stats,consommation]
status: decided
updated: 2026-10-21
related: [endpoint-lifecycle, pool-and-failover, journeys, open-questions, node-control]
---

## Décision (D39, 2026-10-21)

**Rien à implémenter au lancement.** L'UUID est partagé, donc la consommation
**par utilisateur** est impossible, et c'est accepté. Aucune table d'usage,
aucun push de stats, aucune synchronisation de clients. Seuls des **totaux par
nœud** resteraient possibles plus tard (option A), sans changer l'identité.

L'analyse ci-dessous sert de référence pour le jour où l'UUID par appareil
arrivera (offre au Go, fair-use, ou révocation immédiate).

## Question

Peut-on connaître la consommation de **chaque utilisateur** grâce au conteneur
Xray ? Le conteneur GCP sert-il à **émettre** ces données ? Sinon, comment ?

## Fait vérifié le 2026-10-21

**Non, pas par utilisateur aujourd'hui.**

- `infra/endpoint/entrypoint.sh` ~278 génère **un seul client** :
  `clients: [{id: $uuid, email: "shared"}]`. L'UUID vient de `register` et il
  est partagé par tous les appareils servis par ce nœud.
- `services/endpoints.ts` ~159 écrit `identity_mode = 'shared'` en dur. Le type
  prévoit `per_device`, `endpointToConfig(row, identity)` sait le lire, mais
  aucun code ne fournit d'identité et rien ne stocke un UUID par appareil.
- Le conteneur n'appelle que `register`, `ready` et `heartbeat` : il **ne pousse
  aucune donnée de trafic**.
- Le schéma n'a aucune table de consommation.

Conséquence : le maximum disponible aujourd'hui est un **total par endpoint**,
pas une ligne par utilisateur.

## Ce que Xray sait faire

Xray expose un service gRPC `StatsService` (API interne). Quand la configuration
active les compteurs, il sait produire :

```
user>>>alice@example.com>>>traffic>>>uplink
user>>>alice@example.com>>>traffic>>>downlink
inbound>>>vless-ws>>>traffic>>>uplink
```

Pour cela il faut, dans `config.json` :

1. un bloc `stats: {}` ;
2. un bloc `policy.system` avec `statsUserUplink`, `statsUserDownlink`,
   `statsInboundUplink`, `statsInboundDownlink` à `true` ;
3. un bloc `api` avec `services: ["StatsService"]`, écoute sur `127.0.0.1` ;
4. des `clients` avec un `email` **distinct par utilisateur**.

Le point 4 est le verrou : sans identité distincte, tous les octets sont
attribués à `shared`.

## Option A — totaux par endpoint (immédiat)

- Activer `stats` + `policy` + `api` dans le `config.json` généré.
- Le conteneur interroge ses propres compteurs toutes les N minutes et pousse
  `up/down` à l'API.
- L'API stocke `usage_counters(endpoint_id, day, up_bytes, down_bytes)`.
- Ce qu'on obtient : charge par nœud, détection de saturation, capacité.
- Ce qu'on n'obtient pas : « qui consomme ». Un utilisateur qui sature un nœud
  reste invisible.

## Option B — consommation par utilisateur (si offre au Go ou fair-use)

Chaîne complète :

1. **Identité** : un UUID VLESS par utilisateur (ou par appareil), pas par nœud.
   Table `endpoint_clients(endpoint_id, user_id, uuid, email, status)` ou
   `devices.xray_uuid`.
2. **Distribution** : le bundle scellé porte l'UUID de l'utilisateur. C'est un
   secret d'accès au nœud ; il reste dans l'enveloppe chiffrée pour la clé
   AGREE, donc il ne sort jamais en clair.
3. **Liste de clients côté nœud** : le conteneur **tire** la liste depuis l'API
   (`GET /v1/internal/endpoints/clients`, authentifié par la clé de
   déploiement), réécrit `config.json`, teste, puis redémarre Xray. Xray n'a pas
   de rechargement de configuration à chaud garanti : le redémarrage coupe les
   sessions en cours, donc à faire par lots et hors pointe.
4. **Remontée** : le conteneur interroge `StatsService`, pousse les deltas à
   `POST /v1/internal/endpoints/usage` (même secret d'ingestion). L'API agrège
   par `(user_id, day)`.
5. **Affichage** : dashboard admin, par utilisateur et par jour ; agrégat
   mensuel pour la marque.

Contraintes :

- Les compteurs Xray sont **en mémoire** : un redémarrage remet à zéro. Il faut
  pousser les deltas avant l'arrêt, ou détecter la remise à zéro par
  comparaison.
- Un utilisateur peut recevoir des UUID différents selon le nœud : l'agrégat se
  fait par `user_id`, jamais par UUID.
- La donnée de consommation devient une **règle commerciale** dès qu'elle est
  affichée : quota, bridage, suspension. Ce n'est pas qu'un graphe.

## Option C — un conteneur par utilisateur

Isolation parfaite et statistiques triviales, mais coût et complexité
disproportionnés pour un forfait à durée. À écarter.

## Recommandation

**A maintenant, B seulement si une offre au Go ou une politique de fair-use est
vendue.** Le produit vend du temps, pas des octets : la consommation par
utilisateur n'a de valeur que si elle déclenche une décision commerciale.

## Sources

- `infra/endpoint/entrypoint.sh` ~278 (`clients: [{id: $uuid, email: "shared"}]`).
- `apps/api/src/services/endpoints.ts` ~24, ~159, ~331 (`identity_mode`,
  `endpointToConfig`).
- `apps/api/src/routes/internal.ts` ~124-162 (register / ready / heartbeat).
- `00-brief/open-questions.md` O19.
