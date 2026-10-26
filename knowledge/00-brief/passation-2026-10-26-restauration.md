---
id: passation-2026-10-26-restauration
title: Passation â€” restauration du PC, VPN, production, Android
tags: [passation, restauration, vpn, production, android, dashboard]
status: verified
updated: 2026-10-26
related: [dashboard-plan, handoff-2026-10-24, brand-build, vercel]
---

# Passation â€” 2026-10-26

Note rÃ©digÃ©e avant un `/clear`. Pour reprendre : `node knowledge/cli.mjs context`, puis cette note.

## Fait et vÃ©rifiÃ©

- **Outils** : Git 2.56.0, GitHub CLI 2.103.2, 7-Zip, PostgreSQL 17.11 (binaires EnterpriseDB dans `%LOCALAPPDATA%\PostgreSQL`), runtime Visual C++.
- **PostgreSQL local** : serveur sur `localhost:5432`, en `trust` (sans mot de passe, poste personnel). 41 bases restaurÃ©es, noms identiques aux dumps.
- **Fichiers personnels** : SSH (`~\.ssh`), GnuPG, `.gitconfig` restaurÃ©s. Configs d'agents copiÃ©es sans Ã©craser l'existant. Les identifiants `.credentials.json` et `auth.json` ne sont pas copiÃ©s.
- **GitHub** : connectÃ© aux comptes `pius-coder` et `pneumapath1-dot`.
- **DÃ©pÃ´ts** dans `%USERPROFILE%\Projects` : 17 dÃ©pÃ´ts `pius-coder` clonÃ©s avec leur historique. `stack` clonÃ© depuis le bundle de la clÃ© et poussÃ© vers `pius-coder/stack-local` (commit `2e446df`, identique au local).
- **VPN (`bouendji`)** : branche `api/prod-hardening`, commit `2e53a5e` prÃ©sent. `bun install --frozen-lockfile` rÃ©ussi (1240 paquets). `bun run typecheck` rÃ©ussi aprÃ¨s `next typegen` dans `apps/dashboard`.
- **Fichiers `.env`** replacÃ©s (API, dashboard VPN, sociolink, aura_stack). IgnorÃ©s par git.
- **Android** : JDK 17.0.20.1 et Gradle 8.7 copiÃ©s depuis la clÃ© et fonctionnels. SDK extrait dans `%LOCALAPPDATA%\Android\Sdk` : `platforms\android-35`, `platform-tools`, `build-tools\35.0.0`, `ndk\28.2.13676358`. Variables `JAVA_HOME` et `ANDROID_HOME` dÃ©finies au niveau utilisateur. `apps\android\local.properties` Ã©crit.
- **Production (lecture seule)** : API sur `https://api.numzer0.store`. `/readyz` rÃ©pond 401 sans clÃ©, comportement attendu. Applications Dokku sur le VPS : `vpn-api`, `vpn-node1`, `vpn-node2`, `vpn-dl`, `aura-worker`.

## Fait mais non vÃ©rifiÃ©

- Le build Android n'a pas Ã©tÃ© lancÃ©.
- La configuration de production n'a Ã©tÃ© lue que pour quelques clÃ©s non secrÃ¨tes.
- Les Ã©crans du dashboard sont prÃ©sents dans `apps\dashboard\src\app`, mais la plupart sont partiels (voir `dashboard-plan`). Aucun dÃ©ploiement Vercel vÃ©rifiÃ©.

## BloquÃ© ou refusÃ©

- **Installation de la CLI Vercel** : refusÃ©e par l'utilisateur. Non installÃ©e.
- **Build Android** : en attente d'accord, car Gradle et Maven tÃ©lÃ©chargent des dÃ©pendances (forfait mobile limitÃ©).
- **VÃ©rification de la sauvegarde** : impossible, `docs\MANIFEST.sha256` de la clÃ© est vide. `verify.ps1` ne contrÃ´le rien.

## Prochaines Ã©tapes

1. **DÃ©cider de la configuration de production** : `NODE_ENV=development` et `PAYMENT_PROVIDER=mock` sur `vpn-api`. Une prod avec paiement simulÃ© n'encaisse rien. Changer ces valeurs relÃ¨ve de l'utilisateur.
2. Lancer le build Android une fois l'accord donnÃ©.
3. Installer la CLI Vercel si besoin, puis `vercel login` par l'utilisateur.
4. Extraire `shadowvpn` (archive `secrets\shadowvpn-recherche.7z`) si nÃ©cessaire.
5. Cloner les dÃ©pÃ´ts historiques `pneumapath1-dot` (chariow, henshin, sigp) si nÃ©cessaire.
6. Supprimer Ã  la main `%USERPROFILE%\Downloads\restaure-installers-2` (environ 400 Mo).

## Points de sÃ©curitÃ©

- `shadowvpn` contient des identifiants rÃ©coltÃ©s auprÃ¨s de tiers. Risque juridique et de vie privÃ©e : Ã  dÃ©cider avant toute extraction.
- Le mot de passe des archives 7z est Ã©crit en clair dans `RESTAURATION.md` sur la clÃ©. Le chiffrement protÃ¨ge donc peu si la clÃ© est perdue.
- `vpn_db_PROD-vps` est une copie de la base de production, restaurÃ©e localement. Ne pas pointer l'API locale dessus.
- Le fichier `opencode.json` a Ã©tÃ© corrigÃ© ; l'ancienne version est dans `%USERPROFILE%\.config\opencode\opencode.json.bak-restauration`.
- Les valeurs des variables sensibles restent masquÃ©es dans les notes : ne jamais les recopier ici.

