# Audit — pipeline de build APK de marque (lecture seule, 2026-10-26)

## 1. Verdict

La chaîne est **écrite de bout en bout mais jamais aboutie**. Le seul run `android-brand` connu (2026-10-25, push sur `api/prod-hardening`, run 40170654991) échoue pour les deux marques à l'étape « Moteur libbox » : la Release `libbox-1.14.3` ne contient **aucun asset** (`gh release view`). Les secrets R2 et le secret de callback côté GitHub manquent. Le déclenchement depuis l'API a deux pièges (ref par défaut `main`, absente du dépôt) et le callback ne rapporte que le succès. La validation de marque (`inject-brand.mjs`) et la vérification d'empreinte sont solides. Le modèle de droits est en écart avec le plan : un `community_admin` déclenche directement, sans validation owner.

## Réponses aux 5 questions

**1. Chaîne complète**
- Déclenchement A : l'API `POST /v1/admin/apps/:appId/builds` insère une ligne `builds` (statut `queued`, versionCode = max+1 calculé sous verrou, `builds.ts:241-266`) puis appelle `POST https://api.github.com/repos/{GITHUB_REPO}/actions/workflows/{GITHUB_WORKFLOW}/dispatches` avec `ref`, `inputs.spec` (JSON du manifeste) et `inputs.build_callback_url` (`builds.ts:179-218`, URL en `:202`). Jeton : `GITHUB_TOKEN` de l'API, envoyé en `Bearer` (`builds.ts:190`). Pas de jeton GitHub dans le dépôt. Le jeton doit avoir le droit d'actions en écriture sur le dépôt (non vérifié : aucune config réelle lue).
- Déclenchement B : `push` sur `tools/brands/*.json` ou sur le workflow lui-même (`android-brand.yml:24-27`). Ce chemin ne crée aucune ligne `builds`.
- Étapes (`android-brand.yml`) : `specs` (liste des manifestes, `:42-65`) ; `build` par manifeste : lecture et contrôle du nom de fichier (`:91-113`), injection `inject-brand.mjs` (`:115-118`), icônes Pillow via `tools/make-icons.py` (`:120-129`), téléchargement `libbox.aar` depuis la Release GitHub + SHA-256 (`:131-144`), `gradle wrapper` puis `./gradlew :app:assembleRelease` (`:146-154`), zipalign + apksigner (`:156-180`), empreinte (`:182-190`), envoi R2 `brands/<pkg>/<pkg>-<version>-<code>.apk` et `latest.apk` (`:192-219`), callback (`:221-233`).
- Signature : keystore base64 dans le secret `ANDROID_KEYSTORE_B64`, décodé dans `$RUNNER_TEMP` (`:166-168`), signé par `apksigner` avec les secrets d'alias et de mots de passe (`:173-178`). `app/build.gradle.kts` ne référence aucun `signingConfig` (grep vide) : l'APK sort non signé puis est signé à la main. D102 dit que le keystore vit aussi sur le VPS (`/root/android-release/`, cité par `knowledge/decisions` D102, non vérifié).
- R2 : secrets `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` ; variables `R2_ACCOUNT_ID`, `R2_BUCKET` ; endpoint `https://<account>.r2.cloudflarestorage.com` (`:195-206`). Lien public : `R2_PUBLIC_BASE` = `https://apps.numzer0.store` (`:39`, non vérifié : domaine R2 non testé).
- Callback : `POST` vers `build_callback_url`, `Bearer ${secrets.BUILD_CALLBACK_TOKEN}`, corps `{status:"succeeded", sha256, apkUrl, runId}` (`:221-233`). Côté API : `requireCallbackSecret` compare à `BUILD_CALLBACK_SECRET` à temps constant, 503 si vide (`builds.ts:117-126`, `sameSecret` `:100-108`), puis `UPDATE builds` (`:316-339`).

**2. Déjà tourné avec succès ?** Non. `gh run list --workflow android-brand.yml --limit 10` ne donne qu'**un** run : `40170654991`, `failure`, push, 2026-10-25T06:52:21Z. Les jobs `build (aura-test.json)` et `build (bouendji.json)` échouent à l'étape « Moteur libbox » (`gh run view`). Aucun succès connu. Aucun run `workflow_dispatch` depuis l'API n'apparaît.

**3. Secrets et variables GitHub (noms seulement)**
- Présents, secrets : `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
- Présents, variables : `R2_ACCOUNT_ID`, `R2_BUCKET`.
- **Manquants, secrets** : `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (`android-brand.yml:195-196`), `BUILD_CALLBACK_TOKEN` (`:226`).
- Automatique : `github.token` pour `gh release download` (`:133`).
- Côté API (variables d'environnement, `apps/api/src/config.ts:86-94`) : `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_WORKFLOW` (défaut `android-brand.yml`), `GITHUB_REF` (défaut **`main`**), `BUILD_CALLBACK_SECRET` (doit être identique à `BUILD_CALLBACK_TOKEN`), `MOCK_BUILDS`, `PUBLIC_BASE_URL` (`:59`, base des URLs de callback et du `apiBaseUrl` de l'APK). `BUILDS_BASE_URL` (`:92`) n'est lu nulle part dans `builds.ts` : configuration morte.

**4. Manifeste de marque**
- Champs lus par `inject-brand.mjs` : `theme` (5 valeurs, `:25`, `:64-67`), `appName` 2-40 car. (`:69-71`), `packageName` (`:73-85`, refuse `cm.bouendji.vpn` sans `allowDefaultPackage`), `apiBaseUrl` https sans chemin (`:87-98`), `appId` UUID ou ULID (`:100-104`), `supportUrl` **requis** https/mailto/tel (`:106-120`), `accent` `#RRGGBB` ou null (`:122-128`), `offlineBundleSigningKeyB64` (clé publique, `:130-135`), `memberWord` (`:137-140`), `communityWhatsappUrl` et `communityTelegramUrl` https facultatifs (`:142-157`), `defaultLocale` (`:159-161`), `versionCode`, `versionName` (`:163-174`).
- Pour le plan, la **couleur** est `accent` (déjà présent), le **numéro de contact** est déjà `supportUrl` (ex. `https://wa.me/...`), le **lien du groupe WhatsApp** existe dans `inject-brand.mjs` (`communityWhatsappUrl`, `:143`) mais **n'est jamais transmis** : `buildBrandSpec` ne produit ni `communityWhatsappUrl`, ni `communityTelegramUrl`, ni `memberWord` (`apps/api/src/lib/brand.ts:273-296`). `BrandManifest` (`lib/brand.ts`, champs vers `:37-38`) ne les déclare pas.
- **Logo** : la colonne `apps.logo_url` existe (`apps/api/src/schema.ts:26`), mais aucune route de `apps/api/src` ne l'écrit (grep `logo` : seulement `schema.ts:26` côté API). Pas d'upload trouvé ; la CI n'a donc aucun endroit où le récupérer. Côté dashboard : non vérifié (hors tranche).
- Le manifeste de build est fabriqué par l'API depuis la ligne `apps` (`builds.ts:15-17`, `lib/brand.ts:273-296`) : `apiBaseUrl` vient de `PUBLIC_BASE_URL`, jamais du corps.

**5. Ce qui manque pour le flux demande → validation → lancement → R2 → lien/QR**
- Validation owner : absente. `POST` déclenche directement (`builds.ts:271`), et `requireBuildAdmin` accepte aussi `community_admin` (`builds.ts:140-144`). Pas d'états `brouillon`, `demandé`, `refusé`, pas de motif de refus (schéma `builds`, `schema.ts:340-354` et `ALTER` `:536-540`).
- Statut `running` et échec : la CI ne rapporte que le succès (`android-brand.yml:221-233`). Un build qui échoue reste `queued` à jamais. Seul le rejet de dispatch passe en `failed` (`builds.ts:272-278`).
- Lien d'installation et QR : aucun QR dans `apps/api/src` ni `apps/dashboard/src` (grep vide). Le lien `latest.apk` est écrit dans le résumé du job (`:216-218`) et dans `apkUrl`, mais l'API ne le restitue au dashboard que via `GET /apps/:appId/builds` (`builds.ts:286-300`).
- Fin de la chaîne non prouvée : libbox, R2, callback, ref.

## 2. Inventaire

| Fichier | Rôle | Taille | État |
|---|---|---|---|
| `.github/workflows/android-brand.yml` | Pipeline de build, signature, R2, callback | 233 lignes | partiel (échoue à libbox ; callback succès seul) |
| `.github/workflows/endpoint-image.yml` | Image GHCR de l'endpoint, hors APK | 45 lignes | solide (3 runs `success`) — hors plan |
| `tools/inject-brand.mjs` | Validation + réécriture de `BrandTokens.kt` et `brand.properties` | 263 lignes | solide (`:61-177` validation, `:229-241` relecture) |
| `tools/brands/_example.json` | Modèle de manifeste | 14 lignes | solide |
| `tools/brands/bouendji.json` | Manifeste réel, `versionCode` 2 | 17 lignes | solide ; contient une adresse e-mail d'owner dans `_comment` (`:2`), fichier suivi par git |
| `tools/brands/aura-test.json` | Manifeste de test, `versionCode` 4 | 17 lignes | solide ; déclenche aussi un push-build |
| `tools/brands/<nom>/icon.png`, `mascot.png` | Visuels (non lus, hors périmètre) | — | présents pour bouendji et aura-test |
| `tools/build-apk.ps1` | Build APK debug local en boucle | 93 lignes | solide pour le local ; hors CI (chemins `C:\Users\HP\...` `:20-21`, non portable) |
| `apps/android/app/src/main/java/cm/bouendji/vpn/brand/BrandTokens.kt` | Cible de l'injection | présent | — |
| `apps/android/brand.properties` | Généré par `inject-brand.mjs` (`:250`) | absent du dépôt | normal (généré) |
| `apps/api/src/routes/builds.ts` | Déclenchement, lecture, callback | 346 lignes | partiel (voir §6) |
| `apps/api/src/config.ts:86-95` | Config GitHub et callback | — | partiel (`ref` défaut `main` ; `BUILDS_BASE_URL` mort) |

## 3. Ce qui sert le plan

- Validation stricte avant build, avec sortie 78 nommant le champ : `tools/inject-brand.mjs:61-177`. Un manifeste invalide ne produit pas d'APK.
- Relecture après écriture : `tools/inject-brand.mjs:229-241`.
- Contrôle du nom de fichier avant usage : `android-brand.yml:111`.
- Manifeste construit côté serveur, `appId` et `apiBaseUrl` forcés : `apps/api/src/routes/builds.ts:15-17` et `lib/brand.ts:295`.
- Version calculée sous verrou (`SELECT ... FOR UPDATE`, `builds.ts:242`, max+1 en `:245-250`).
- Callback à secret distinct, comparaison à temps constant, 503 si secret vide : `builds.ts:100-126`.
- Dépôt à version figée + `latest.apk` : `android-brand.yml:209-213`.
- Icônes générées depuis `icon.png` et `mascot.png` : `android-brand.yml:120-129`, `tools/make-icons.py`.
- Concurrence par ref et événement : `android-brand.yml:32-34`.
- Clé de signature jamais écrite en clair : décodage dans `$RUNNER_TEMP` avec `umask 077` et suppression (`:167-180`).

## 4. Écarts avec le plan

- **Point 2, validation owner** : absent. `builds.ts:271` déclenche directement ; `builds.ts:140-144` autorise `community_admin`. Le plan veut `owner` valide ou refuse avec motif.
- **Point 2, états du build** : le plan prévoit brouillon, demandé, refusé, en cours, publié, échec. Le code a `queued`, `running`, `succeeded`, `failed`, `cancelled` (`builds.ts:68`). Aucun `refusé` ni `brouillon`. `running` jamais émis par la CI.
- **Point 2, un admin = une application** : non vérifié dans cette tranche (`mustApp` `builds.ts:147`, pas de contrainte visible).
- **Point 2, lien du groupe WhatsApp et contact** : le contact existe (`supportUrl`, `lib/brand.ts:281-282`). Le lien WhatsApp n'a pas de colonne dans `apps` (`schema.ts:14-30`) et n'est pas transmis (`lib/brand.ts:273-296`).
- **Point 2, logo** : pas d'upload ni de stockage repérable (`schema.ts:26` seul). À définir : stockage R2 (bucket `vpn-apps`, préfixe `brands/<pkg>/`) ou table d'assets.
- **Point 2, dépôt R2 et lien** : secrets R2 manquants ; `ref` par défaut inexistant ; pas de test de bout en bout (dernier run en échec à libbox).
- **Point 2, callback d'échec** : absent (`android-brand.yml:221-233`).
- **Point 7 (dashboard), QR et lien d'installation** : aucun QR ; le lien n'est pas exposé autrement que via `apkUrl` (`builds.ts:164`).
- **Point 9 (app), bouton WhatsApp et pop-up** : dépendent de `communityWhatsappUrl`, non transmis (voir point 2).

## 5. Structure de code proposée

Fichiers à **modifier** (aucun écrit, proposition seulement) :

- `apps/api/src/lib/brand.ts` : ajouter à `BrandManifest` `memberWord?`, `communityWhatsappUrl?`, `communityTelegramUrl?` ; les lire depuis `apps` (`whatsapp_group_url`, `contact_phone`) puis les renvoyer dans `buildBrandSpec` (`:273-296`).
- `apps/api/src/schema.ts` : ajouter à `apps` `community_whatsapp_url text`, `contact_whatsapp text`, `logo_key text` (clé R2 du logo, pas l'URL) ; supprimer la dépendance `apps.brand` (jsonb) si elle n'est plus lue.
- `apps/api/src/schema.ts` (`builds`) : ajouter `status` valeurs `draft`, `requested`, `rejected`, `running`, `published`, `failed` via `CHECK` ; ajouter `requested_at timestamptz`, `decided_at timestamptz`, `decided_by text`, `reject_reason text`, `apk_key text` (clé R2 du fichier publié).
- `apps/api/src/routes/builds.ts` :
  - `requireBuildAdmin` (`:140`) : garder le `community_admin` pour la **demande** seulement ; n'autoriser la **validation** qu'à `platformRole === 'owner'`.
  - Nouvelles routes : `POST /v1/admin/apps/:appId/builds` (demande, statut `requested`) ; `POST /v1/owner/builds/:id/approve` (passe à `queued` puis appelle `dispatchBuild`) ; `POST /v1/owner/builds/:id/reject` (`reason` obligatoire).
  - `callbackSchema` (`:70-88`) : accepter `status` `running` et `failed` avec `reason` ; corriger le commentaire Vercel Blob (`:78`).
- `apps/api/src/config.ts:91` : `ref` par défaut à `master` (ou obligatoire) ; supprimer `builds.publicBaseUrl` (`:92`) si toujours inutilisé.
- `.github/workflows/android-brand.yml` :
  - Ajouter un job `notify-failure` (`if: failure()`) qui appelle le callback avec `status:"failed"`.
  - Ajouter un callback `running` avant la compilation (`:76`).
  - Ne plus déclencher sur le push du workflow lui-même : retirer `android-brand.yml` des `paths` (`:27`) et, si `CHANGED` est vide, sortir sans build (`:63`).
  - Ajouter une garde : refuser le `--clobber` d'une version déjà publiée (`s3 head-object` avant `cp`, `:209`).
  - Retirer `continue-on-error` du callback (`:223`) ou le rejouer (3 essais).
- `tools/inject-brand.mjs` : rien à changer dans la validation ; `communityWhatsappUrl` et `memberWord` sont déjà acceptés (`:137-157`).
- Fichier à créer côté CI (si la Release libbox reste privée) : rien dans ce dépôt, il faut publier `libbox.aar` ou changer de source (voir §7).

Routes et contrats : suivre `apps/api/src/http/contracts.ts` (pas lu, hors tranche).

## 6. Bugs et risques

1. **Pipeline bloquée à libbox** — `android-brand.yml:138-142` : la Release `libbox-1.14.3` n'a aucun asset (`gh release view`, `assets: []`). Scénario : toute demande de build échoue, et le build reste `queued` (pas de callback d'échec).
2. **`GITHUB_REF` défaut `main`** — `config.ts:91` ; le dépôt n'a que `master` (`git branch -a`). Scénario : si l'env de prod n'override pas, GitHub refuse le dispatch (422, non vérifié) ; l'API met `failed` et répond 502 (`builds.ts:271-279`).
3. **Callback d'échec absent** — `android-brand.yml:221-233`. Scénario : build en échec → ligne `queued` pour toujours, le dashboard attend.
4. **Callback silencieux** — `android-brand.yml:223` `continue-on-error: true`. Scénario : `BUILD_CALLBACK_TOKEN` absent ou mauvais → 401 ignoré, build réussi mais jamais marqué `succeeded`.
5. **Push du workflow déclenche un build de `bouendji.json`** — `android-brand.yml:27` et `:63` (repli sur `bouendji.json` si rien n'a changé). Scénario : modifier le workflow publie une APK de production `com.bouendji.vpn` et écrase `latest.apk`.
6. **Écrasement du fichier publié** — `android-brand.yml:209-213` ; le commentaire `:208` dit « jamais écrasée », le code ne l'empêche pas. Scénario : rejouer un push sans changer `versionCode` réécrit `brands/<pkg>/<pkg>-<ver>-<code>.apk`.
7. **Deux sources de `versionCode`** — DB `max+1` (`builds.ts:245-250`) et fichier JSON (`bouendji.json:15` = 2, `aura-test.json:12` = 4). Scénario : le push-build ne crée pas de ligne `builds` ; un dispatch ultérieur peut reprendre le même numéro, Android refuse la mise à jour et R2 collisionne.
8. **Push multi-commits** — `android-brand.yml:62` ne compare que `HEAD~1..HEAD` (`fetch-depth: 2`, `:49`). Scénario : un manifeste modifié dans un commit antérieur d'un push n'est pas construit.
9. **Callback commenté Vercel Blob** — `builds.ts:78` ; le code et le plan parlent de R2 (D100). Risque : confusion lors de la reprise.
10. **`BUILDS_BASE_URL` mort** — `config.ts:92`. Risque : fausse impression de configuration.
11. **Autorisation trop large** — `builds.ts:140-144` : un `community_admin` lance un build et consomme la clé de signature sans validation owner.
12. **Clé de signature et mots de passe** — secrets GitHub, pas de valeur lue ici. Risque : pas de sauvegarde vérifiable (`/root/android-release/` cité par D102, non vérifié).
13. **Adresse e-mail dans un fichier suivi** — `tools/brands/bouendji.json:2` (commentaire) ; à retirer ou à déplacer.
14. **`tools/build-apk.ps1`** — chemins en dur `C:\Users\HP\...` (`:20-21`) ; hors CI, ne tourne pas tel quel sur ce poste (non vérifié).

## 7. Dépendances hors tranche

- Dashboard : où sont saisis la communauté, le lien WhatsApp, le contact et le logo (étape 2 de l'onboarding), et comment le logo est envoyé.
- `apps/api/src/routes/admin.ts` ou équivalent : écriture de `apps` (`logo_url`, `support_url`) ; aucune route de logo trouvée dans `apps/api/src`.
- `apps/api/src/http/contracts.ts` : contrat des routes `builds` (non lu).
- Production : valeurs réelles de `GITHUB_TOKEN`, `GITHUB_REPO`, `GITHUB_REF`, `BUILD_CALLBACK_SECRET`, `PUBLIC_BASE_URL` (non lues ; seul leur nom est vérifié).
- Dépôt libbox : Release `libbox-1.14.3` sans asset. Décision D102 : publication publique refusée sans accord explicite. Il faut soit publier l'asset, soit le déposer sur R2 et adapter la CI.
- Domaine `apps.numzer0.store` et bucket `vpn-apps` : non testés.
- Keystore `bouendji` : présence sur le VPS (`/root/android-release/`) non vérifiée.

## 8. Non vérifié

- Le jeton `GITHUB_TOKEN` de l'API : portée réelle (droit d'actions en écriture) et son existence en production.
- La valeur effective de `GITHUB_REF` et des autres variables en production (seuls les défauts du code sont lus).
- Que les secrets `ANDROID_*` correspondent à la clé de signature de D102.
- Que `R2_PUBLIC_BASE` (`apps.numzer0.store`) serve bien le bucket.
- Limite de taille de l'entrée `workflow_dispatch` (`inputs.spec` contient le manifeste complet) : non vérifiée.
- `ANDROID_HOME` défini sur `ubuntu-latest` (utilisé par `android-brand.yml:171`) : non vérifié.
- `apps.brand` (jsonb) : contenu réel et usage ; non lu.
- Aucune compilation ni exécution de workflow n'a été faite (consigne).
