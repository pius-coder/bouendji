---
id: livraison-apk-2026-10-29
title: Livraison APK du 29/10 — 8 marques sur R2, DB prod, pages de téléchargement
tags: [apk, r2, marque, prod, download]
status: verified
updated: 2026-10-29
related: [brand-build, decisions, flux-serveurs-app]
---

# Livraison APK du 29/10

## Versions vérifiées (lu dans le binaire via `read-apk-version.mjs`, range HTTP)

| Marque | Package | Version | latest.apk |
|---|---|---|---|
| Bouendji VPN | `com.bouendji.vpn` | 1.0.0-beta.7 (7) | vérifié |
| dalas npv | `cm.bouendji.dalasnpv` | 1.1.3 (5) | vérifié |
| Gregor44 vpn | `cm.bouendji.gregor44` | 1.1.3 (5) | vérifié |
| James Pro | `cm.bouendji.jamespro` | 1.1.3 (5) | vérifié |
| NevVPN | `cm.bouendji.nevpn` | 1.1.3 (5) | vérifié |
| Teste | `cm.bouendji.test` | 1.1.3 (5) | vérifié |
| Saitrix | `cm.bouendji.saitrix` | 1.1.4 (6) | vérifié |
| Goat VPN | `cm.bouendji.goatvpn` | 1.1.4 (6) | vérifié |

- Commit `4168691` (6 manifestes) → run CI `40897030328`. Le job `test` a échoué
  **deux fois** sur l'upload R2 (`InvalidPart` sur `CompleteMultipartUpload`,
  jamais sur la compilation) ; le 3e essai est passé. Les autres jobs ont
  réussi du premier coup. Si ça revient : relancer `gh run rerun <id> --failed`,
  et envisager `--cli-read-timeout 0` ou un upload non multipart dans le workflow.
- Nouveaux APK ~242 Mo (libbox universel), anciens ~83 Mo (arm64 seul).

## Base prod (vpn-db, écrit et relu le 29/10)

- `apps.store_url` rempli pour les 8 apps (APK versionné, pas `latest`).
- `apps.theme` de Bouendji corrigé `halo` → `billet` (aligné sur le manifeste).
- 7 lignes `builds` insérées (`b1-bouendji-beta7-7`, `b1-dalasnpv-113-5`,
  `b1-goatvpn-114-6`, `b1-gregor44-113-5`, `b1-jamespro-113-5`, `b1-nevpn-113-5`,
  `b1-test-113-5`), statut `succeeded`.

## Pages de téléchargement (D144)

- `/` et `/bouendji/` : Bouendji beta.7 ; sous-pages par slug de communauté pour
  les 7 autres. 9 URLs vérifiées en 200 ; chaque page ne référence que son APK.

## Reste à faire

- Intégrer les mascottes du téléphone (Goat bouclier, robot Saitrix dans
  `C:\Users\lenovo\AppData\Local\Temp\opencode\phone-icons\`), bump 1.1.5 (7),
  rebuild → refaire DB + pages pour ces deux marques.
- `com.bouendji.vpn` n'existait pas sur R2 avant ce lot (404) : première
  livraison du thème billet.
