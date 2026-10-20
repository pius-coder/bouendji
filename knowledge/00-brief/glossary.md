---
id: glossary
title: Glossaire
tags: [brief, vocabulaire]
status: decided
updated: 2026-10-20
related: [objective]
---

- **VLESS** — protocole proxy sans état, sans chiffrement propre (il repose sur
  TLS). Identifié par un UUID.
- **WS / WebSocket** — transport utilisé pour passer dans Cloud Run, qui
  n'accepte que HTTP. Le tunnel vit dans une seule requête HTTP longue.
- **sing-box** — moteur VPN (Go), exposé sur Android via `libbox`. Licence
  GPL-3.0 : distribuer un binaire dérivé implique de fournir les sources.
- **Endpoint** — un serveur VPN déployé, décrit en base (hôte, port, SNI,
  chemin WS, identifiant chiffré, statut, expiration).
- **Pool** — l'ensemble des endpoints `active` servis par l'API.
- **Révision du pool** — compteur incrémenté quand la composition du pool
  change. Sert de clé de cache et de sel HKDF pour le bundle.
- **Bundle** — enveloppe chiffrée contenant N configurations pour un appareil,
  liée à la révision du pool.
- **Drain** — période avant expiration pendant laquelle un endpoint n'est plus
  proposé aux nouveaux clients mais reste vivant pour les clients en cours.
- **`deployment_key`** — clé d'idempotence d'un déploiement
  (`K_SERVICE:K_REVISION`). Un restart réutilise le même UUID et le même
  chemin WS.
- **`identity_mode`** — `shared` (un UUID pour tout le déploiement) ou
  `per_device` (un identifiant par appareil, révocable individuellement).
- **Cold start** — démarrage d'une instance Cloud Run à la première requête.
