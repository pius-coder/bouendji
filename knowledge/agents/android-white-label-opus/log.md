# Journal — android-white-label-opus

## 2026-10-24T03:26:15Z · Création
- fait: charte créée
- portée: Implementer l application Android white label complete dans apps/android : parcours, logique, UI, tunnel, stockage, telemetrie, bundle, marque, compatibilite appareils (ABI, minSdk). Propose les changements de noeuds partages, ne les applique pas.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-24T03:26:15Z · Lecture du contexte

- fait: context, decisions D2-D84 (copie non commitee du checkout principal), audit-manques + plan-minimal (audit-app-opus), code apps/android. Worktree fusionne avec api/prod-hardening (37f9702). design-rules-opus/notes/design-rules.md absent : repli sur dashboard-ux + Halo v2.
- etat: ok
- suite: ABI/minSdk puis manques M15-M20

## 2026-10-24T03:39:46Z · libbox 4 ABI compile

- fait: build-libbox.ps1 -FullAbi : libbox.aar 119354738 o (arm64-v8a, armeabi-v7a, x86, x86_64) et libbox-legacy.aar 99355195 o (memes 4 ABI, androidapi 21). Pieges : gomobile panique 'malformed env var =C:' (lance via ProcessStartInfo qui reconstruit l environnement) ; dossier build/ residuel de gomobile ('file exists') a supprimer. legacy copie dans app/libs/libbox.aar.
- etat: ok
- suite: code compat (crypto repli, IsoTime, B64), puis build

## 2026-10-24T07:24:31Z · Reprise : etat verifie

- fait: git status : 15 modifies + 14 non suivis sous apps/android (dont crypto/B64, Ed25519, DeviceEnvelope, net/TrustRoots, util/IsoTime, res/raw ISRG). minSdk=23 deja dans libs.versions.toml, splits ABI + universel deja dans build.gradle.kts, app/libs/libbox.aar = legacy 99355195 o. Aucun dossier app/src/test : les tests cites (Ed25519Test, IsoTimeTest, DeviceEnvelopeTest) n'existent pas.
- etat: ok
- suite: compiler assembleDebug, puis ecrire les tests JVM
