---
id: ingest-auth
title: Authentification de l'ingestion d'endpoints
tags: [backend, securite, webhook, auth, cloud-run]
status: open
updated: 2026-10-20
related: [open-questions, cloud-run, gcp-v2ray-repo]
---

## Enjeu réel

Ce n'est pas de l'hygiène. Un endpoint forgé, c'est du **trafic utilisateur
détourné** : l'attaquant enregistre son propre serveur, connaît l'UUID qu'il
vient de recevoir, et se place au milieu. Il n'a même pas besoin de casser TLS
puisqu'il est le point de sortie.

## État du code

Un seul jeton porteur, `ENDPOINT_INGEST_SECRET`. S'il est vide,
l'enregistrement est **refusé** (503) plutôt que laissé ouvert.

## Contrainte nouvelle (2026-10-20)

L'utilisateur n'a accès qu'à **l'interface Cloud Run**. Il peut déployer et
définir des variables d'environnement. Il n'a pas Secret Manager ni la gestion
fine des IAM. Cette contrainte élimine les solutions « propres » qui demandent
une console supplémentaire.

## Options compatibles

| Option | Faisable avec accès limité | Faiblesse |
|---|---|---|
| Jeton statique en variable d'env | oui | lisible par quiconque voit le service ; jamais rotatif en pratique |
| Jeton + HMAC(secret, corps + horodatage + nonce) | oui | rejoue impossible dans la fenêtre, mais le secret reste statique |
| Jeton OIDC Google + `aud` | oui (metadata server) | vérifier l'e-mail du service account demande des droits IAM ; `aud` seul est plus faible |
| Approbation manuelle | oui | dépend d'une action humaine |

## Recommandation

**Jeton statique de 32 octets + HMAC** sur
`timestamp\nnonce\nsha256(body)`, fenêtre de 120 s, nonce mémorisé (table ou
cache) pour bloquer le rejeu, **plus approbation manuelle par défaut**.

L'OIDC reste un bonus si l'utilisateur obtient un jour les droits : il ne coûte
que la vérification JWKS côté API.

## Reste à trancher

O4 : (a) statique + HMAC, (b) OIDC `aud` seul, (c) les deux. Et : qui approuve —
le bot ou le dashboard ?
