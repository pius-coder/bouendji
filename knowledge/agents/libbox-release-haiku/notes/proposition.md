# Proposition de mise à jour — libbox-1.14.3 et D102 (à intégrer par l'orchestrateur)

Statut au 2026-10-25 : l'asset n'est PAS publié. La Release existe
(https://github.com/pius-coder/bouendji/releases/tag/libbox-1.14.3) mais elle
a 0 asset. L'envoi de `libbox.aar` a été refusé par le garde-fou de publication
publique ; il reste à obtenir une permission explicite de l'utilisateur.

Pour la passation (handoff-2026-10-24, point 1 « libbox.aar pour la CI ») :
- Remplacer « publication refusée faute d'accord explicite » par : la Release
  libbox-1.14.3 existe (notes avec GPL-3.0), l'asset `libbox.aar` reste à envoyer
  (permission utilisateur à redemander).
- Fichier : apps/android/app/libs/libbox.aar, 28839325 octets,
  SHA-256 749de4e7bb5f21c9f5fc734c58a3ea93c9352183461af40ab8c1d565cb9f450c
  (vérifié localement par sha256sum le 2026-10-25 ; NON vérifié après téléchargement
  depuis la Release, puisque l'asset n'existe pas).

Pour D102 (étape « Moteur libbox ») :
- `.github/workflows/android-brand.yml` (non committé) : `LIBBOX_SHA256` ajouté
  dans `env:`, l'étape est renommée « Moteur libbox (Release GitHub, D102) » ;
  elle télécharge avec 3 tentatives, vérifie le SHA-256 (`sha256sum -c`) et
  contrôle la présence de `jni/arm64-v8a/libbox.so`.
- Validation YAML : `yaml ok` (PyYAML, safe_load).
- Conséquence : tant que l'asset n'est pas publié, le job CI échoue à cette étape
  (comportement voulu : pas de build sans moteur vérifié).
- Ordre : permission utilisateur -> upload (`gh release upload libbox-1.14.3
  apps/android/app/libs/libbox.aar -R pius-coder/bouendji --clobber`) -> téléchargement
  de contrôle et SHA-256 -> seulement alors premier build CI.
