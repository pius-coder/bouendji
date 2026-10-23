---
id: decisions
title: Décisions tranchées
tags: [brief, decisions, journal]
status: decided
updated: 2026-10-23
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

## Travail à deux et leurre (2026-10-22)

- **D42** — **Monorepo à deux : Android = @pius-coder, API + admin = @mani-iks.**
  Branches `android/*` / `api/*` / `admin/*`, PR squash, review du propriétaire
  via `.github/CODEOWNERS`. `CONTRIBUTING.md` fait foi. Deux projets Vercel sur
  le même repo : `bouendji-api` (Root `apps/api`, domaine
  `bouendji.numzer0.store`), `bouendji-admin` (Root `apps/admin`, à recréer
  D32/D33). `DECOY_URL` en variable Vercel (Preview = test, Production = vrai
  site SMS). Répond à O9 (qui construit quoi).
- **D43** — **Rideau anti-curieux, pas une sécurité.** Le domaine API est
  visible après reverse (inévitable). Navigateur sans `X-App-Id` (+ UA
  `vpn-android`) → `302` vers `DECOY_URL` (placeholder
  `https://example-sms.com` en attendant le vrai site SMS). Client JSON sans
  métadonnées → JSON d'erreur normal, jamais 302 (sinon tests/dashboard
  cassés). Bypass : `/healthz`, `/readyz`, `/v1/payments/webhook/*` (D14).
  Une seule couche : `apps/api/src/lib/decoy.ts` (Fastify, vérifié par 5 tests).
  Le `middleware.ts` Edge a été supprimé le 2026-10-23 (D71) : il importait
  `next/server`, qui n'est pas une dépendance, et ne compilait donc pas. La
  sécurité réelle reste D4/D5.

## Production — liste vivante, argent et marques (2026-10-23)

Issues de l'audit des six couches et de l'arène de conception. Chaque décision
ferme une question ouverte ou un défaut vérifié dans le code.

- **D45** — **Deux natures de nœuds, jamais mélangées.** `endpoints.tier ∈
  {free-labs, paid-gcp}`, `plans.endpoint_tier`, `servedEndpoints(tier)` filtre.
  Un forfait d'un tier n'est créable que si ≥ 1 nœud de ce tier est actif et non
  `down` (422 sinon). Les labs gratuits assurent la continuité par le nombre ;
  le nœud GCP facturé est persistant et seul à pouvoir mesurer la consommation
  par appareil. Ferme : le nœud de lab qui sert un forfait payant, et le forfait
  vendu sans nœud.
- **D46** — **`ENDPOINT_AUTO_APPROVE=true` en production.** En production, un
  `ready` laissait le nœud `pending` et `servedEndpoints` filtre `active` : le
  pool était vide par construction. Le secret d'ingestion reste la frontière ;
  un nœud forgé se coupe depuis la console (`POST /v1/admin/endpoints/:id/health`).
- **D47** — **La santé décide de la présence, pas l'horloge.** Le heartbeat et
  `ready` ne peuvent **pas** lever un `down`
  (`health = CASE WHEN health='down' THEN 'down' ELSE COALESCE($3, health) END`).
  Un nœud vivant dont le tunnel est mort est exactement le cas à voir.
- **D48** — **Une transition de santé bumpe `pool_state.revision`**, un
  heartbeat non. L'ETag du bundle dépend des configs servies, donc une liste qui
  change produit un nouvel ETag.
- **D49** — **`expiresAt` de l'enveloppe = `min(fin des droits, max(expirations
  des configs))`.** Le `min` faisait mourir le bundle avec le nœud le plus
  faible. Le 304 est refusé si l'enveloppe calculée est expirée.
- **D50** — **Verdict `down` à deux chemins** : 3 appareils distincts en échec
  sur 10 min, **ou** 1 témoin différentiel (2 échecs consécutifs sur ce nœud +
  ≥ 1 succès sur un autre dans la fenêtre). Retour : 3 succès, ou 30 min de
  probation. Ferme le nœud mort indétectable quand un seul appareil existe.
- **D51** — **Pas de cron, pas de vérificateur serveur 24/7.** Entretien
  paresseux : hook `onRequest`, au plus une exécution par 60 s et par instance.
  Ferme O15 sans plan Pro ni déclencheur externe.
- **D52** — **Consommation à deux sources nommées** : `device` (compteurs du
  moteur) et `node` (mesure du nœud payant). `usage_daily.source` est affiché.
  Un chiffre qu'on n'a pas lu n'est pas écrit.
- **D53** — **Compte par marque** : `UNIQUE (app_id, lower(email))`, `phone`
  obligatoire, `appId` obligatoire au login. Un même email peut exister sur deux
  marques ; les erreurs de connexion restent indiscernables.
- **D54** — **`DASHBOARD_ACCESS_KEY` exigée (`X-Access-Key`) sur tous les
  `/v1/admin/*`**, login et inscription compris. Pas de table d'invitations.
- **D55** — **Refus de démarrer en production** si `PAYMENT_PROVIDER ≠ fapshi`,
  ou si `MASTER_KEY` / `JWT_SECRET` / `DATABASE_URL` Postgres /
  `ENDPOINT_INGEST_SECRET` / `DASHBOARD_ACCESS_KEY` / `BUILD_CALLBACK_SECRET`
  manquent. Ferme l'abonnement gratuit par `/pay/mock/:ref/confirm`.
- **D56** — **Ingestion : bearer + `X-Ingest-Timestamp` (±120 s). Pas de HMAC.**
  Le jeton est déjà la frontière ; HMAC ne protège que d'une requête capturée,
  ce que TLS empêche. Ferme O4.
- **D57** — **Retraits : `finance`, `owner` et `community_admin` approuvent,
  jamais leur propre demande**, transition conditionnelle. La rémunération de
  `finance` se prend sur les 70 % du propriétaire, hors système. **Amende D38.**
- **D58** — **Un `202` Fapshi n'est pas un versement.** `approved` = autorisé,
  `processing` = envoyé, `paid` = confirmé, `needs_review` après 10 min sans
  référence, `/resolve` clôt.
- **D59** — **Forfaits libres** : prix + durée en jours, autant que l'admin veut.
  **Aucun forfait au seed.** Ferme O12.
- **D60** — **La bascule reste celle de sing-box** (`selector` + `urltest`) ;
  on ajoute la mesure à travers le tunnel, le rapport, le re-fetch et le bandeau.
- **D61** — **`NO_CONNECTION` = bandeau, jamais un écran plein.** Un bundle vide
  n'écrase pas la liste locale.
- **D62** — **APK : Vercel Blob + lien dans la console** ; la CI télécharge
  `libbox.aar` depuis une Release GitHub. Remplace D44 pour le premier jour.
- **D63** — **Témoin différentiel** (voir D50) : la bascule du client fournit la
  preuve gratuitement.
- **D64** — **Télémétrie en lots de 20**, réinjection plafonnée à 200, 4xx
  (≠408/429) = lot abandonné, réseau/5xx = reprise avec backoff.
- **D65** — **Machine à états des retraits** : `pending → approved →
  processing → paid|failed`, `needs_review` + `/resolve`, `attempts ≤ 3`,
  réclamation atomique **avant** l'appel réseau.
- **D66** — **Le manifeste de marque est un contrat d'API**, validé à la
  création (422, mêmes règles qu'`inject-brand.mjs`), stocké dans `apps.brand`
  et `builds.spec`, déclenché par `workflow_dispatch`, clos par
  `POST /v1/internal/builds/:id/callback`.
- **D67** — **Deux échéances côté appareil** : `rightsExpiresAtMs` seule
  provoque « expiré » ; `nextConfigExpiryMs` déclenche un rafraîchissement sans
  vider le coffre.
- **D68** — **`tier` et `identity_mode` traversent les schémas zod** d'ingestion.
  Sans ça, `z.object` jette les clés et le nœud retombe sur `shared`/`free-labs`.
- **D69** — **Nœud `paid-gcp` : `per_device`, pool de 200 UUID**, `config_grants`
  écrit au bundle, statistiques par UUID lues dans le heartbeat. Lot séparé avec
  porte ; repli déclaré (`source='device'`).
- **D70** — **Le rapport a un producteur** : boucle de 60 s qui lit la sortie
  active et mesure chaque sortie via l'API Clash (vrai handshake + requête HTTP),
  puis force `selectOutbound` après 2 échecs consécutifs. Backoff 30 s → 2 min
  → 10 min.
- **D71** — **`middleware.ts` supprimé.** Une seule couche de leurre, côté
  Fastify. Voir D43.
- **D72** — **Documentation code-first** : `@fastify/swagger` (OpenAPI 3.1.0) lit
  les schémas des routes, Scalar sert `/reference`, `/openapi.json` est versionné
  et régénéré par `pnpm --filter @vpn/api openapi`. **`/reference` et
  `/openapi.json` sont exemptés du rideau** : un navigateur envoyant
  `Accept: text/html` était redirigé vers le site leurre, rendant l'interface
  inutilisable là où elle sert. Le document ne décrit que des routes que `curl`
  énumère déjà ; le rideau n'est pas une sécurité (D43).
- **D73** — **`dev` est la seule porte d'entrée de `master`.** Aucun commit
  direct sur `master`, aucune PR qui la vise : branche → PR vers `dev` → CI →
  review → squash, puis PR `dev` → `master`.
- **D74** (2026-10-23) — **Journal piloté par l'environnement, pas par un
  drapeau.** `production` garde le JSON brut de Pino (Cloud Run et les
  collecteurs lisent des champs) ; partout ailleurs, `server.ts` passe un
  `transport` vers `pino-pretty`. `buildApp` accepte donc
  `FastifyServerOptions["logger"]` au lieu d'un booléen ; tests et fonction
  Vercel continuent de passer `false`. `pino-pretty` est une **devDependency**
  et n'est jamais importé en production.

- **D75** (2026-10-23) — **La référence OpenAPI doit être enrichie à partir des
  routes réelles et Scalar doit charger cette même spécification** : source
  centralisée dans `apps/api/src/http/contracts.ts`, appliquée via le
  `transform` documentaire de Swagger et jamais comme validateur Fastify.
  Chaque opération publiée doit avoir résumé, description et réponses ; les
  statuts et médias HTML sont explicités. Voir D76 pour les premiers compteurs
  vérifiés.
- **D76** (2026-10-23) — **Contrat OpenAPI enrichi et vérifié statiquement** :
  64 opérations avec résumés, descriptions et réponses ; 27 corps JSON ;
  53 exigences de sécurité ; HTML explicite pour les trois routes navigateur.
  `typecheck` et génération `openapi` réussissent. Le Playground est utilisable
  pour construire des appels, mais les flux réels nécessitent serveur, base et
  secrets ; la génération seule ne prouve pas leur exécution.
- **D77** (2026-10-23) — **Toutes les routes déclarent leur frontière d'accès,
  y compris les sondes.** `/healthz` et `/readyz` utilisent la clé dédiée
  `HEALTHCHECK_KEY` dans `X-Health-Check-Key`, obligatoire en production. Le
  contrat OpenAPI la propose au Playground. Les routes mobiles pré-session
  gardent leurs preuves dédiées ; le webhook exige `FAPSHI_WEBHOOK_SECRET` en
  production et revérifie le statut fournisseur ; le paiement mock reste hors
  production. Inventaire et diagrammes :
  `20-backend/admin-access-flows`.
- **D78** (2026-10-23) — **Dashboard en deux niveaux d'authentification.** Le
  navigateur s'authentifie auprès du serveur Next.js ; Next.js s'authentifie
  auprès de l'API. Les clés API et secrets restent côté serveur Next.js/API et
  ne sont jamais envoyés au navigateur. Fastify reste l'autorité des jetons,
  rôles et périmètres. Détails du BFF dans `20-backend/admin-access-flows`.

