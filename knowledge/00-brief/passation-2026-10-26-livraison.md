---
id: passation-2026-10-26-livraison
title: Passation — livraison des APK, forfait sur mesure, 8 identités, dashboard Vercel
tags: [passation, apk, pipeline, forfait, paiement, identites, dashboard, prod]
status: verified
updated: 2026-10-26
related: [dashboard-plan, handoff-2026-10-24, livraison-apk-2026-10-26, passation-2026-10-26-fusion]
---

# Passation — livraison (2026-10-26, soir)

Détail complet : `00-brief/livraison-apk-2026-10-26.md`. Décisions D126-D128.
Branche `api/prod-hardening`, dernier commit `a7dd049`, poussé. Refonte du
dashboard (vague 2) **suspendue** (D126) ; travail sans sous-agent.

## Fait et vérifié

- **Forfait sur mesure** (D127, Go + jours au curseur, prix serveur) : API
  (migration `090`, `services/customOffer.ts`, `/quote`, `/custom-offer`) ;
  `node --test` API **350/350**, dashboard **135/135**, tsc sans sortie.
- **Prod** (`vpn-api`, aura-vps) : sauvegarde `~/backups/vpn-db-2026-10-26-avant-v2.dump`,
  migrations testées sur la copie `vpn-db-staging` puis déployées (25 lignes
  `schema_migrations`, données intactes). `PAYMENT_PROVIDER=fapshi`,
  `/pay/mock/x` → 404.
- **Pipeline** : workflow `libbox.yml` (aar + `.sha256` dans la Release) ;
  `android-brand.yml` génère logo/illustration (`tools/make-logo.mjs` →
  `rsvg-convert` → `make-icons.py`) et publie l'APK en artefact.
- **8 apps** (1 par communauté, créées en base prod, 1 identité unique chacune) :
  Bouendji billet, Teste halo, GoatVpn vector, James Pro mono, Gregor44 otaku,
  dalas npv sahel, Saitrix nebula, NevVPN glacier. Run `40386713188` : **8 APK
  compilées et signées** (seule l'étape R2 échoue).
- **Offres sur mesure** : 8 lignes `plans` `custom` en prod, **`active=false`**
  (150/400 F par Go, 1-50 Go, 1-30 j, nuit 200/200/350).
- **Dashboard** déployé sur Vercel (`freeteam5/vpn-dashboard`) :
  https://vpn-dashboard-seven.vercel.app, `/login` → 200.
- **Téléphones** : Pixel 8 (beta.3, lancée) ; Redmi 2409BRN2CA (USB) :
  dalas npv 1.1.1 lancée, identité sahel visible.

## Fait mais non vérifié

- Écrans des 7 autres apps, connexion au compte, curseurs, tunnel, paiement réel.
- Connexion au dashboard Vercel et pages après connexion.
- Section « Serveurs 3x-ui » du dashboard jamais ouverte dans un navigateur.
- Police manuscrite vue sur le Redmi : supposée venir de la police système.

## Bloqué ou en attente de l'utilisateur

- **Serveur 3x-ui** à ajouter (page Réseau) puis « Tester » OK ; ensuite seulement :
  `UPDATE plans SET active = true WHERE family = 'custom';` (0 serveur en prod).
- Installer à la main les 7 APK copiées dans `/sdcard/Download` du Redmi
  (`adb install` refusé : « Installer via USB » désactivé).
- Secrets GitHub `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `BUILD_CALLBACK_TOKEN`.
- `FAPSHI_WEBHOOK_SECRET`, `BUILD_CALLBACK_SECRET` pour passer `NODE_ENV=production`.
- Logos réels des communautés (sinon logos générés).

## Prochaines étapes

1. Vérifier la connexion au dashboard Vercel (plus d'erreur `adminId`).
2. Ajouter le serveur 3x-ui, tester, activer les 8 offres sur mesure.
3. Faire installer les 7 APK sur le Redmi, capturer chaque écran d'accueil.
4. Petit paiement Fapshi réel + tunnel sur un téléphone.
5. Secrets R2 → publication des APK sur `apps.numzer0.store`.
6. Rotation des secrets exposés (ci-dessous), puis `NODE_ENV=production`.
7. Supprimer `vpn-api-staging` et `vpn-db-staging` sur aura-vps.
8. Reprendre la vague 2 du dashboard (D126 suspendu).

## Points de sécurité

- **Incident** : une erreur `dokku config:export` a affiché en clair dans la
  session les valeurs de `vpn-api`. À faire tourner : `FAPSHI_API_KEY`,
  `FAPSHI_API_USER`, `JWT_SECRET`, `ENDPOINT_INGEST_SECRET`, `HEALTHCHECK_KEY`,
  `DASHBOARD_ACCESS_KEY`. `MASTER_KEY` et `OFFLINE_BUNDLE_SIGNING_KEY` : rotation
  à planifier (données scellées existantes).
- Prod en **paiement réel** mais `NODE_ENV=development` ; webhook Fapshi sans
  secret (revérification API active). Le secret est accepté en `?key=`.
- Une seule clé de signature pour toutes les marques (D128) : ancienne APK
  Bouendji (debug) à désinstaller une fois.
- Session Vercel (`pneumapath1-2167`) et `.env.local` (jeton OIDC) sur ce PC,
  ignorés par git. Lien `wa.me` d'invitation : mot de passe temporaire dans l'URL.
