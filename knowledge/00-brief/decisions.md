---
id: decisions
title: Décisions tranchées
tags: [brief, decisions, journal]
status: decided
updated: 2026-10-20
related: [open-questions, roles-and-commissions]
---

Chaque décision est datée. Une décision contredite plus tard doit être modifiée
ici, pas laissée en double.

## Architecture

- **D1** (2026-10-19) — Moteur : **sing-box**, rebrandé. Pas de fork d'UI
  existant : interface Compose entièrement écrite.
- **D2** (2026-10-19) — Un seul code source pour toutes les marques. Thème
  injecté **au build** (tokens), jamais tiré au hasard au lancement.
- **D3** (2026-10-19) — Backend Node 24 + Fastify 5 + TypeScript + Zod +
  `jose`. PGlite en dev/test, Postgres via `DATABASE_URL`, un seul `schema.ts`.
- **D4** (2026-10-19) — Auth : scrypt ; enrôlement d'appareil avec deux clés
  EC P-256 Keystore (SIGN + AGREE) ; signature par requête
  `METHOD\nPATH\nsha256(body)\ntimestamp\nnonce` ; JWT 15 min + refresh opaque
  rotatif.

## Distribution des configurations

- **D5** (2026-10-19) — ECDH P-256 → HKDF-SHA256
  (`vpn-bundle-v1|deviceId|revision`) → enveloppe AES-256-GCM.
- **D6** (2026-10-19) — L'API renvoie un **tableau** de configurations, jamais
  une seule. Aucune n'est affichable ni copiable dans l'app.
- **D7** (2026-10-19) — Sélection et bascule **côté client**, pour fonctionner
  même si l'API est inaccessible.
- **D8** (2026-10-20) — Les endpoints sont du **stock global**, pas rattachés à
  une communauté. `deployment_key` unique et idempotent.
- **D9** (2026-10-20) — `deployment_key = K_SERVICE:K_REVISION` : stable sur un
  restart, unique par révision. Un redéploiement crée donc un nouvel endpoint.
- **D10** (2026-10-20) — Heartbeat = `last_seen_at` + latence, **jamais**
  d'extension de `expires_at`, **jamais** de bump de révision du pool.
- **D11** (2026-10-20) — Drain par défaut 900 s avant expiration.
- **D12** (2026-10-20) — `identity_mode` ∈ `shared` | `per_device`. Cloud Run
  en `shared`, VPS permanent en `per_device`.

## Argent

- **D13** (2026-10-19) — Fapshi, deux services distincts : encaissement et
  décaissement. Un service activé pour les versements ne peut plus encaisser.
- **D14** (2026-10-19) — Le webhook Fapshi n'est jamais cru sur parole : statut
  re-vérifié par l'API (`FAPSHI_VERIFY_WITH_API=true`). Mock par défaut en dev.
- **D15** (2026-10-19) — La commission est **attachée à la commande**, pas à un
  UTM. Les UTM ne servent qu'au suivi de campagne.

## Rôles

- **D16** (2026-10-20) — Pas de rôle global `super_admin`. Un seul
  `platform_role = owner`, plus des `community_memberships` avec
  `community_admin` | `support` | `finance`. Le `community_id` vient toujours
  de la session, jamais du corps de requête.
- **D17** (2026-10-20) — Deux audiences de jeton : `vpn-mobile` et
  `vpn-admin`. Croisement interdit.

## Expérience

- **D18** (2026-10-20) — Le choix manuel d'une configuration est une
  **préférence** ; l'automatisme est **obligatoire**. Bascule après échecs
  répétés, avec bandeau non bloquant.
- **D19** (2026-10-20) — Si plus rien ne fonctionne : écran « aucune connexion
  disponible » + contact direct de l'administrateur de la marque, et reprise
  automatique avec backoff.
- **D20** (2026-10-20) — Fichier hors-ligne destiné au cas « l'app n'arrive pas
  à récupérer la liste (timeout / API bloquée) », pas au cas « zéro réseau ».
  Usage unique, lié à l'appareil, détruit par l'app après import.

## Réseau (après analyse, 2026-10-20)

- **D21** (2026-10-20) — Durée de vie par défaut d'un endpoint : **4 h 30
  (16 200 s)**, drain 900 s → 4 h 15 de service utile. Ce n'est pas un choix
  produit : la durée de vie du projet qui héberge les nœuds est elle-même de
  4 h 30. `ENDPOINT_DEFAULT_TTL` porte cette valeur.
- **D22** (2026-10-20) — 3x-ui **par nœud VPS**, panneau strictement en
  loopback, jeton Bearer scopé, `restartXrayOnClientDisable=false`, un client
  par appareil (`email = "d-<devices.id>"`). 3x-ui n'a pas sa place dans un
  conteneur Cloud Run éphémère.
- **D23** (2026-10-20) — Aucune promesse de révocation instantanée. La
  formulation vendable est « identifiant révoqué en moins de 5 s ; la session
  en cours s'éteint à la prochaine reconnexion, ou immédiatement si un
  bannissement IP est appliqué ». Sur GCP : pas de révocation du tout, seule
  l'expiration compte.
- **D24** (2026-10-20) — `last_seen_at` ne retire **jamais** un endpoint du
  pool. Avec la facturation à la requête, le CPU est bridé hors requête : un
  nœud sans trafic n'est pas mort, il est endormi. Seule `expires_at` fait foi.
- **D25** (2026-10-20) — Chaque endpoint transporte `max_session_seconds` dans
  son bundle ; le client se reconnecte à `max_session_seconds − 60`. La valeur
  vient du timeout de requête réel du nœud (3 600 s recommandé), jamais d'une
  constante dans l'app.

## Exploitation (2026-10-20)

- **D26** — Le canal d'exploitation est **Telegram**, derrière
  `TELEGRAM_ENABLED`. Un message ne transporte **jamais** de configuration, ni
  UUID, ni chemin WS, ni jeton : `services/telegram.ts` les masque avant envoi
  (`scrub`), y compris pour un message écrit à la hâte. Un échec d'envoi
  renvoie `false`, il ne lève jamais dans la requête qui l'a déclenché.
- **D27** — Le rappel « déployer un nouveau nœud » est émis par **l'API**, pas
  par le conteneur : un conteneur mourant ne peut pas annoncer sa propre mort.
  Il porte sur le nœud **le plus jeune** (`max(expires_at)` parmi
  `active`/`draining`), se répète au plus toutes les 15 min, et se déclenche à
  `DEPLOY_WARN_MINUTES` (30 par défaut). Il tourne dans le même tick que le
  balayage du pool, jamais sur un pool périmé.
- **D28** — Le seed est **idempotent** et ne réinitialise jamais un mot de
  passe existant. Il refuse de créer un compte si `SEED_ADMIN_PASSWORD` est
  vide ou fait moins de 12 caractères. Les prix qu'il insère sont provisoires
  et affichés comme tels (voir O12).

## Fichier hors-ligne et marque (2026-10-20)

- **D29** — Le fichier hors-ligne est signé en **Ed25519** sur une chaîne
  textuelle (`vpn-offline-v1\n…`), jamais sur du JSON : une canonicalisation qui
  change d'un langage à l'autre casserait la vérification sans prévenir. La clé
  **publique est épinglée dans l'APK** au build (`BrandTokens.offlineBundleSigningKeyB64`) :
  la rotation est donc une nouvelle version de l'application, pas un réglage
  serveur. Le contenu est scellé pour la clé ACORD de l'appareil, et la validité
  par défaut est de **60 min** (`OFFLINE_BUNDLE_TTL_MINUTES`, borné à 24 h).
  L'application marque la consommation **localement avant** d'écrire la liste :
  une coupure entre les deux laisse un fichier consommé sans configurations —
  jamais un fichier réutilisable.
- **D30** — Une marque est un **fichier source réécrit avant compilation**, pas
  un thème chargé à l'exécution. `tools/inject-brand.mjs` valide le manifeste
  (thème, package, URL https sans chemin, appId, contact) et réécrit
  `BrandTokens.kt` + `brand.properties` ; il relit ce qu'il vient d'écrire et
  sort en **78** si une constante n'a pas été remplacée. Le workflow
  `.github/workflows/android-brand.yml` compile, signe (ou signale l'absence de
  keystore) et publie l'empreinte SHA-256. Aucun APK non signé n'est présenté
  comme publiable.

## Interface d'administration (2026-10-20)

- **D31** — Le dashboard est écrit avec **Next.js** (App Router, TypeScript),
  exporté en statique (`output: "export"`, `basePath: "/admin"`,
  `trailingSlash: true`) et servi par l'API sous `/admin/`. Il n'y a **pas** de
  second service : une origine, pas de CORS, pas de CDN. Conséquence assumée :
  `apps/admin/out` n'est pas commité, donc `pnpm --filter @vpn/admin build` doit
  tourner avant de servir ; sans export, l'API répond `/admin/` en 503 avec la
  commande à lancer, jamais un 404 ambigu.
  La version précédente, écrite en JavaScript sans build, est conservée dans
  `apps/admin-legacy/` à titre de référence (comportements et libellés), et
  n'est plus servie.
