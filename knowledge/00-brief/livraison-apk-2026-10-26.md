---
id: livraison-apk-2026-10-26
title: Livraison des APK — forfait sur mesure, paiement réel, pipeline GitHub (2026-10-26)
tags: [livraison, apk, pipeline, paiement, fapshi, forfait, prod, incident]
status: verified
updated: 2026-10-26
related: [decisions, passation-2026-10-26-fusion, passation-2026-10-26-android, android-toolchain]
---

# Livraison des APK (2026-10-26, soir)

Décisions : D126 (priorité APK, dashboard v2 suspendu, pas de sous-agent),
D127 (forfait sur mesure), D128 (build GitHub, une clé de signature).

## Fait et vérifié

- **API, forfait sur mesure** (commit `9777397`) : migration `090_custom_offer`,
  `services/customOffer.ts` (prix = Go × prix/Go(jours), droite 1 j → 30 j,
  arrondi au multiple de 50 FCFA supérieur), devis public
  `GET /v1/apps/:appId/plans/:planId/quote`, `POST /v1/orders` accepte
  `custom: { gb, days }`, routes `GET/PUT /v1/admin/apps/:appId/custom-offer`.
  Tests : `test/customOffer.test.ts` 7/7 ; suite complète **350/350** ; tsc sans sortie.
- **Webhook Fapshi** (commit `b82fbc4`) : le secret est aussi accepté en `?key=`
  (Fapshi n'envoie pas d'en-tête, non vérifié chez Fapshi). `payments.test.ts` 17/17.
- **Dashboard** : carte + tiroir « Forfait sur mesure » dans la page Forfaits
  (aperçu à curseurs). tsc (hors `.next`), lint, tests 135/135. **Non déployé sur Vercel.**
- **Prod** (`vpn-api` sur aura-vps) :
  - sauvegarde `~/backups/vpn-db-2026-10-26-avant-v2.dump` (VPS) ;
  - copie `vpn-db-staging` + app `vpn-api-staging` (secrets jetables) : les
    25 migrations passent sur un vrai Postgres, données intactes ;
  - déploiement prod par `git push dokku@…:vpn-api master` d'un dépôt réduit
    (package.json, bun.lock, packages/contract, apps/api, Dockerfile à la racine) ;
  - prod : `schema_migrations` = 25 lignes, 17 commandes, 6 utilisateurs ;
  - **`PAYMENT_PROVIDER=fapshi`** ; `/pay/mock/x` → 404.
- **Pipeline** : la Release `libbox-1.14.3` n'avait **aucun fichier** (cause de
  l'échec du 2026-10-25). Nouveau workflow `libbox.yml` : compilé sur GitHub
  (run `40364525962`, succès), dépose `libbox.aar` + `libbox.aar.sha256` ;
  `android-brand.yml` vérifie cette empreinte et publie l'APK en artefact du run.

## Fait, non vérifié

- **Android** (relu, non compilé localement) : DTO (`family`, `nightOptions`,
  `custom`, quota), curseurs data/validité, plage de nuit, prix en direct,
  « Data épuisée » à l'accueil. Le build CI fait foi.
- Aucun paiement Fapshi réel encore passé. `FAPSHI_BASE_URL` absent → live par défaut.
- Prod reste en `NODE_ENV=development` : le passage en `production` exige
  `BUILD_CALLBACK_SECRET` et `FAPSHI_WEBHOOK_SECRET` (à poser par l'utilisateur).

## Constats prod

- 8 communautés ; **une seule a une application** (Bouendji, `com.bouendji.vpn`,
  appId `f3d5ee21-…`). Les 7 autres (Teste, GoatVpn, James Pro, Gregor44 vpn,
  dalas npv, Saitrix, NevVPN) n'ont ni app ni paquet : rien à compiler tant que
  leur marque n'est pas créée (nom, identifiant de paquet, logo).
- Secrets GitHub présents : keystore (4). **Absents** : `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `BUILD_CALLBACK_TOKEN`.

## Incident de sécurité

Une commande `dokku config:export | xargs dokku config:set` a échoué et son
message d'erreur a affiché en clair, dans le journal de session, les valeurs de
config de `vpn-api` : `FAPSHI_API_KEY`, `FAPSHI_API_USER`, `JWT_SECRET`,
`MASTER_KEY`, `ENDPOINT_INGEST_SECRET`, `HEALTHCHECK_KEY`,
`OFFLINE_BUNDLE_SIGNING_KEY`, et une clé de tableau de bord. Aucune valeur
recopiée dans `knowledge/` ni dans le dépôt. **À faire tourner** (par
l'utilisateur) : clé Fapshi, `JWT_SECRET` (déconnecte tout le monde),
`ENDPOINT_INGEST_SECRET` (nœuds à reconfigurer), `HEALTHCHECK_KEY`,
`DASHBOARD_ACCESS_KEY`. `MASTER_KEY` et la clé de signature hors-ligne
chiffrent/signent des données existantes : rotation à planifier, pas à chaud.
Leçon : ne jamais faire transiter une config par une commande dont l'erreur
peut renvoyer l'entrée.

## Build et installation (suite, même soir)

- Run `android-brand` `40367067857` : compilation, signature, artefact
  `com.bouendji.vpn-1.0.0-beta.3-3.apk` (84 Mo) **réussis** ; seule l'étape R2
  échoue (secrets R2 absents). Le code Android modifié aujourd'hui compile donc.
- Téléchargement de l'artefact : `gh run download` meurt sans rien écrire sur
  ce réseau ; `curl -C -` en boucle (URL de redirection redemandée à chaque
  essai) termine en 10 essais. `fetch-segmented.ps1` refusé (ExecutionPolicy Bypass).
- Pixel 8 en **ADB Wi-Fi** : appairage `adb pair <ip>:<port-pairing> <code>`
  puis `adb connect <ip>:<port-connect>` (ports lus par `adb mdns services`).
- La beta.2 du téléphone avait une **autre signature** (build debug) :
  désinstallée avec l'accord de l'utilisateur, beta.3 installée, lancement sans
  plantage (écran d'accueil vu). Tout utilisateur d'une ancienne APK devra
  désinstaller une fois.
- Non testé : connexion au compte, écran Forfaits avec curseurs (aucune offre
  sur mesure en prod : prix à fournir, D125), paiement Fapshi réel, tunnel.

## Les 7 autres communautés (même soir)

- Demande de l'utilisateur : nom de l'app = nom de la communauté, thème au hasard.
- **Apps créées en base de prod** (SQL, une par communauté, `support_url`
  `mailto:support@henshins.online`, paquet `cm.bouendji.<nom>`) :
  Teste (otaku) `cb6dbc5e-…`, GoatVpn (vector) `bc625882-…`, James Pro (otaku)
  `d73f4abe-…`, Gregor44 vpn (mono) `e01f7a55-…`, dalas npv (otaku) `32a037c3-…`,
  Saitrix (mono) `da24b189-…`, NevVPN (vector) `ce57954c-…`.
- Manifestes `tools/brands/<slug>.json` validés par `inject-brand.mjs`.
- Run `android-brand` `40374332072` : **7 APK compilées et signées** (artefacts
  du run, ~30 Mo zippées) ; étape R2 en échec (secrets R2 absents).
- Pas de logo : les APK portent l'icône par défaut du dépôt (fantôme Bouendji).
- Aucune de ces apps n'a de forfait : elles affichent « Aucun forfait ».
- **Curseur invisible** : aucune offre sur mesure en prod. Prix d'exemple acceptés
  par l'utilisateur (1 j = 150 F/Go, 30 j = 400 F/Go, 1-50 Go, 1-30 j, nuit
  200/200/350 F) mais **non appliqués** : la prod a **0 serveur 3x-ui**, donc un
  forfait à quota vendu ne donnerait aucune connexion. Bloqué en attente de
  l'utilisateur.

## Offres sur mesure préparées, serveur 3x-ui attendu

- Décision utilisateur : il ajoute d'abord un serveur 3x-ui, puis l'offre sur
  mesure s'active avec les prix d'exemple sur les 8 apps.
- Prod : 8 lignes `plans` famille `custom` (code `sur-mesure`, `paid-gcp`,
  **`active = false`**), termes 150 / 400 F par Go, 1-50 Go pas 1, 1-30 j,
  nuit 20-24 = 200, 24-04 = 200, 20-04 = 350. Vérifié par SELECT.
- Dashboard (commit `3bf56e0`) : section « Serveurs 3x-ui » dans la page Réseau
  (owner) : liste, ajout (jeton en champ mot de passe, scellé par l'API), Tester.
  tsc, lint, tests 135/135. Non vu dans le navigateur.
- Activation prévue après un « Tester » réussi :
  `UPDATE plans SET active = true WHERE family = 'custom';`
