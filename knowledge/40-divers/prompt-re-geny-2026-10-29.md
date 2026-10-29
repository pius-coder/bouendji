# PROMPT D'AMORÇAGE — RE de Geny.ver.1.3.5fix.build.50.apk (session dédiée)

> À coller tel quel au début de la future session. Tout est vérifié sauf
> mention contraire ; la passation complète de la méthode est dans
> `knowledge/40-divers/passation-re-simonfree-2026-10-29.md` (mêmes outils,
> mêmes pièges — la LIRE en premier).

---

Texte du prompt :

```
Objectif : reverse de l'APK « Geny » — C:\Users\lenovo\Downloads\Geny.ver.1.3.5fix.build.50.apk
(11,4 Mo, déjà présent). C'est le même type de chantier que le mod SimonFree
déjà terminé : décompiler, comprendre le protocole client/serveur, puis modder
(au besoin) et rebuilder un APK signé installable. La méthode complète, les
pièges réellement rencontrés et la chaîne de rebuild sont documentés dans
knowledge/40-divers/passation-re-simonfree-2026-10-29.md — LA LIRE D'ABORD.

Outils (tous vérifiés, tous sous Windows, pas de WSL) :
- jadx 1.5.6 (décompilation, lecture)      : re-simonfree/jadx/bin/jadx.bat
- apktool 3.0.3 (décodage + rebuild)       : re-simonfree/apktool.jar
- baksmali 3.0.10 fat                      : re-simonfree/baksmali-fat.jar
- d8 / zipalign / apksigner (build-tools)  : %LOCALAPPDATA%\Android\Sdk\build-tools\35.0.0\
- JDK 17                                   : C:\Users\lenovo\android-toolchain\jdk17
- adb / platform-tools                     : %LOCALAPPDATA%\Android\Sdk\platform-tools\
- Téléphone de test : Pixel 8 en USB (39141FDJH00GAV), `adb devices` → device

Démarrage :
1. java -jar re-simonfree/apktool.jar d -o scratch_apk/geny-out "<apk>" (ou
   un dossier re-simonfree-geny/ à créer) — NE JAMAIS réutiliser un apktool-out
   d'un autre projet.
2. jadx pour lecture des sources : re-simonfree/jadx/bin/jadx.bat -d geny-src "<apk>"
3. Chercher en priorité : URLs/hôtes codés en dur, jetons/API, chiffrement
   (AES/RSA, modèles d'enveloppe), headers custom — mêmes réflexes que pour
   SimonFree (voir nœud 40-divers/re-simonfree-apk.md pour la méthode d'analyse).

Pièges (tous rencontrés, voir passation SimonFree) :
- apktool v3 cache apktool-out/build/ → dex PÉRIMÉ : rm -rf build avant `apktool b`.
- smali : registres iget/iput limités à v0-v15 ; élargir `.locals` est sûr.
- Classes internes Java (Foobar$1) : toutes à copier en smali.
- uiautomator ne peut pas dumper l'UI Compose ; piloter à la main ou via logcat.
- `adb forward` se casse silencieusement : le refaire en cas de connection refused.
- Le réseau coupe les gros transferts : tools/fetch-segmented.ps1 si téléchargement.

Signature : créer un keystore DÉDIÉ à Geny (ne pas réutiliser re-simonfree/
mod.keystore qui signe le mod SimonFree), ex. geny.keystore via keytool du JDK17.

Règle de session : après chaque découverte vérifiée, l'écrire dans knowledge/
(un sujet = un nœud, ex. 40-divers/re-geny-*.md) avant de continuer.
```
