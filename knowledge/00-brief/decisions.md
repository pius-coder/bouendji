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

## Hébergement et réécriture (2026-10-20, soirée)

- **D32** — **Vercel**, pas Cloud Run, pour le **dashboard et l'API**. Cloud Run
  est abandonné : l'accès était limité à son interface, l'endpoint ne pouvait de
  toute façon pas y vivre avec notre contenu, et le compte ne permettait ni
  Secret Manager ni IAM fin. Conséquence directe : l'API Fastify tourne en
  **fonction serverless** (un adaptateur, un seul point d'entrée) et la base
  devient **Postgres managé** — PGlite n'a pas de disque persistant là-bas.
  `D31` est **remplacé** : l'API ne sert plus `/admin/`, le dashboard vit sur sa
  propre origine. Voir `10-infrastructure/vercel.md` pour les limites relevées.
- **D33** — Le dashboard **et** la couche d'interface Android sont **supprimés**
  et réécrits entièrement : le rendu précédent a été rejeté, sur le visuel comme
  sur le code. Retirés : `apps/admin/`, `apps/admin-legacy/`,
  `apps/android/app/src/main/java/cm/bouendji/vpn/ui/` (19 fichiers), le
  `Dockerfile` et `.dockerignore` de la racine, `dist/`.
  **Conservés** : l'API et ses 94 tests, `packages/contract`, le socle Android
  (Keystore, ApiClient, VpnService, socle crypto), `infra/endpoint/`, `tools/`,
  `knowledge/` et l'historique git. `MainActivity.kt` n'est plus qu'un point
  d'entrée vide : il existe pour que le manifeste ne pointe pas sur une classe
  fantôme, et doit être remplacé par la nouvelle vague UI.
- **D34** — L'**endpoint** (xray/VLESS) ne peut pas être sur Vercel : la
  plateforme sert du HTTP serverless, elle n'ouvre aucun port brut. Il reste sur
  un VPS ou dans un conteneur, et c'est toujours lui qui s'enregistre auprès de
  l'API.

## Prix et partage (2026-10-21)

- **D35** — **Prix fixé par la communauté ; enveloppe de 30 % répartie à la
  performance.** Le client paie le prix de sa communauté sur le lien Fapshi de
  la plateforme, qui encaisse **100 %**. Sur le chiffre d'affaires encaissé,
  **30 % constituent l'enveloppe des commissions** ; **70 % restent le revenu
  plateforme** (`owner`). L'enveloppe est répartie entre les communautés **au
  prorata de ce qu'elles ont généré** : une communauté qui n'a rien vendu
  touche **0**.
  - Exemple : 1 000 000 XAF générés par 5 communautés (500k / 300k / 150k /
    50k / 0) → enveloppe 300 000, répartie 150k / 90k / 45k / 15k / 0.
  - Quand **tout** le CA est généré par les communautés et que la répartition
    est strictement proportionnelle, le résultat est **identique à 30 % par
    commande**. L'enveloppe n'est donc pas un second calcul : c'est la même
    arithmetic vue au mois.
  - Le revendeur ne reverse jamais d'argent : la plateforme encaisse et doit.
  - Le taux de référence et le plafond sont **30 %**
    (`commission_bps <= 3000`) ; l'`owner` peut accorder moins, jamais plus.
  - Conséquence assumée : deux communautés peuvent vendre le même forfait à des
    prix différents.
  - `plans` est déjà indexé par `app_id`, et `apps.community_id` rattache
    chaque marque à une communauté : **le prix est donc déjà propre à une
    marque**. Il manque les routes admin de gestion des forfaits et un endpoint
    public par app, pas une nouvelle table.
  - **Remplace** la lecture « prix global, commission par communauté » de
    `40-money/roles-and-commissions`.
  - **Périmètre confirmé (2026-10-21)** : l'enveloppe porte sur le **seul CA
    généré par les communautés**. Une vente directe reste à 100 % à la
    plateforme et ne finance aucune commission.
  - **Performance confirmée** : le CA généré, pas le nombre de ventes ni la
    marge.
  - **Répartition confirmée** : strictement proportionnelle au CA généré. Donc
    `commission_i = 30 % × CA_i`, ce qui rend l'accrual par commande équivalent
    à la clôture mensuelle. L'enveloppe est un affichage comptable, pas un
    second calcul.
  - **Calcul confirmé (2026-10-21)** : assiette **brute** (la plateforme absorbe
    les frais Fapshi sur ses 70 %), arrondi **`floor`** (jamais plus de 30 %),
    **aucun plafond de prix** (le white label fait porter le risque tarifaire à
    la marque de l'administrateur, pas à la plateforme).
  - Implémenté : `MAX_COMMISSION_BPS = 3000`, contrainte SQL 0..3000, routes
    admin de gestion des forfaits et catalogue public par app. Vérifié par
    `tsc --noEmit` et 100 tests.

- **D36** — **Aucun remboursement, y compris si le service ne fonctionne pas.**
  Le produit vend un accès à durée déterminée ; l'échec côté client (appareil
  incompatible, réseau, configuration) n'ouvre pas droit à un remboursement.
  - L'API n'expose **aucune** route de remboursement. `refundOrder()` reste un
    service interne, appelé par aucun `app.*` : il sert à une correction
    exceptionnelle (double débit avéré), pas à une politique commerciale.
  - Les conditions d'utilisation doivent l'écrire noir sur blanc avant l'achat.
  - Limite hors de notre contrôle : un client peut ouvrir un litige auprès de
    son opérateur ou de Fapshi. Le remboursement subi n'est pas une décision
    produit ; il doit être saisi comme une annulation exceptionnelle.

- **D37** — **Un appareil par compte est la norme ; la version desktop passera
  par le partage de connexion du téléphone.** Le forfait standard ouvre **un**
  appareil (`plans.device_limit = 1` par défaut). Une version desktop est
  prévue plus tard, mais elle **ne consomme pas un second slot** : elle se
  connecte à travers le partage de connexion du téléphone, comme un client
  desktop derrière le proxy du mobile.
  - Une offre multi-appareils reste possible techniquement
    (`device_limit > 1`), mais n'est pas la norme commerciale.

- **D38** — **Versement des commissions : demande par `finance`, validation par
  `owner`, décaissement asynchrone.** `finance` prépare la demande
  (`POST /communities/:id/payouts`) ; le montant est la **somme des commissions
  `available` non rattachées**, jamais un montant fourni par le client.
  `owner` approuve (`POST /payouts/:id/approve`) ; `finance` ne peut pas
  s'auto-approuver. Le décaissement réel est une opération **asynchrone** vers
  Fapshi : `approved` n'est pas `paid`.
  - États : `pending` → `approved` → `paid` / `failed`.
  - **Bug corrigé le 2026-10-21** : l'activation insère les commissions en
    `available`, mais la demande de versement filtrait `pending` — aucune
    demande n'était donc créable sur une vraie vente. La requête filtre
    désormais `available` ; le test d'administration utilise ce même état.
  - **Reste non câblé** : `fapshi.payout()` n'a aucun appelant ; `approved` ne
    déclenche encore aucun décaissement, et les commissions rattachées ne
    passent pas à `paid`.

- **D39** — **UUID partagé au lancement ; UUID par appareil plus tard ; pas de
  `cloudflared`.** Le premier déploiement garde **un seul UUID par endpoint**
  (`email: "shared"`), partagé par tous les clients du nœud. Aucun client par
  utilisateur n'est créé, donc :
  - **pas de consommation par utilisateur** (seuls des totaux par nœud sont
    possibles) ;
  - **pas de révocation individuelle au niveau du nœud** : la coupure reste
    l'expiration du bundle et la session courte ;
  - **pas de liste de clients à synchroniser** : le heartbeat reste un simple
    battement, sans `clients_revision`.
  - **`cloudflared` est écarté** : le nœud reste strictement sortant, l'API ne
    l'appelle jamais. Conséquence : sur un VPS, le panneau 3x-ui n'est pas
    piloté à distance par l'API.
  - Le passage à l'UUID par appareil (stats + révocation) est **reporté**. Il
    faudra alors l'état désiré décrit dans `10-infrastructure/node-control` et
    accepter un court `pending` à l'activation.


- **D40** — **Le revendeur n'encaisse pas : modèle A (2026-10-21).** Décision de
  l'utilisateur, après exposé des trois modèles possibles.
  - Le client paie **toujours** par un lien de paiement Fapshi rattaché à une
    commande créée par l'API. L'argent ne transite **jamais** par le revendeur.
  - Le revendeur est rémunéré par la **commission déjà attachée à la commande**
    (D15). Donc : aucun reversement, aucune caisse à rapprocher, aucun solde à
    suivre manuellement.
  - **Conséquence interface** : l'écran « code d'accès » (`nji`) du prototype
    partenaire est **supprimé**. Aucun système de génération ni de consommation
    de codes n'est construit côté serveur. L'activation passe uniquement par un
    paiement confirmé, dont le statut est revérifié auprès de Fapshi (D14) :
    payer crédite automatiquement, l'utilisateur ne saisit rien.
  - **Écarté maintenant, pas pour toujours** : le modèle « crédits prépayés +
    codes » (modèle C, usage telecom). Il exigerait un portefeuille revendeur,
    un ledger, des codes à usage unique et une protection anti-rejeu. À rouvrir
    seulement si des revendeurs à volume réel sont signés.
  - **Écarté définitivement** : le revendeur qui encaisse en espèces puis
    reverse (modèle B) — dépendance à sa bonne volonté, commissions
    invérifiables, surface de fraude. S'il encaisse malgré tout, il paie un lien
    pour la commande ; il ne « rend pas plus tard ».

- **D41** — **Le build Bouendji doit reprendre l'identité Halo v2 sur tout le
  parcours mobile (2026-10-21).** La référence visuelle est
  `../Atelier-identites-VPN-v2.html`, direction Halo. Elle ne sert pas de
  contrat métier : les textes, données et transitions restent ceux des routes
  et décisions du dépôt. Le parcours livré comprend connexion/inscription,
  accueil VPN, forfaits/paiement, compte/appareils, réglages et aide, ainsi que
  les états bloquants. Les écrans `nji` et invitation restent exclus (D40).
  L'identité reste injectée au build (D2/D30), jamais choisie au lancement.

