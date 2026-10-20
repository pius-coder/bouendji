---
id: gcp-v2ray-repo
title: Dépôt AnimeHolic/gcp-v2ray — à réécrire
tags: [github, gcp, v2ray, deploiement, ingestion]
status: decided
updated: 2026-10-20
related: [endpoint-lifecycle, ingest-auth]
---

## État du dépôt distant

`https://github.com/AnimeHolic/gcp-v2ray` — pas un fork, auteur Ragnar
(`t.me/not_ragnar`), licence MIT. Trois fichiers : `Dockerfile`, `README.md`,
`config.json`.

- `FROM teddysun/v2ray:latest`
- UUID codé en dur, chemin WS codé en dur
- le README annonce `/t.me/ragnarservers`, le `config.json` contient
  `/TG-@Not_Ragnar` — les deux ne sont pas d'accord
- aucune notion de `$PORT`, d'expiration, d'enregistrement, de santé

## Décision

**Réécriture complète**, pas un patch. Le conteneur doit : s'enregistrer,
recevoir son identité, écrire sa config, démarrer, signaler `ready`, battre le
cœur, et mourir sans se désinscrire.

## Séquence cible

```
boot
 → POST /v1/internal/endpoints/register  {deployment_key, public_host, ...}
   ← {uuid, ws_path, expires_at, status}
 → écrire /etc/xray/config.json depuis la réponse (jq -n, pas de template)
 → lancer xray sur $PORT
 → boucle de vérification locale (le port répond)
 → POST /v1/internal/endpoints/ready
 → heartbeat toutes les 30-60 s (last_seen_at + latence mesurée)
 → SIGTERM : sortir SANS désinscrire
```

## Contraintes de déploiement

- L'utilisateur n'a accès qu'à **l'interface Cloud Run** : il peut déployer et
  poser des variables d'environnement, rien d'autre (pas de Secret Manager, pas
  de réglage IAM fin).
- Il déploie **manuellement** plusieurs nœuds, à n'importe quel moment. Chaque
  déploiement ajoute une ligne en base.
- Rien n'est cloné sur cette machine. Les fichiers seront produits dans
  `infra/endpoint/` puis poussés (le droit de push n'est pas confirmé).

## Pièges connus

- Une image tierce peut ignorer `$PORT`.
- Un restart ne doit pas prolonger la vie du nœud (le TTL est fixé à la
  création).
- Un scale-out crée plusieurs instances pour la même révision : elles doivent
  toutes obtenir le **même** UUID via `deployment_key`.
- Le conteneur ne peut pas se désinscrire proprement à la mort : c'est le
  balayage côté API qui fait expirer.
