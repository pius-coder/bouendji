# Journal — libbox-release-haiku

## 2026-10-25T05:03:04Z · Création
- fait: charte créée
- portée: Publier libbox.aar dans la Release libbox-1.14.3 (autorisée par l'utilisateur le 2026-10-25), vérifier son SHA-256 après téléchargement, adapter l'étape « Moteur libbox » de android-brand.yml (vérification d'empreinte). Ne touche à rien d'autre.
- etat: actif
- suite: lecture des nœuds liés

## 2026-10-25T05:04:11Z · Envoi de l'asset refusé par le garde-fou

- fait: gh release upload libbox-1.14.3 (apps/android/app/libs/libbox.aar, --clobber) refusé par le classifieur de permissions (action de publication publique). Aucune tentative de contournement. État de l'asset avant : 0 asset dans la Release.
- etat: bloque
- suite: Demander à l'utilisateur une permission explicite pour l'upload public ; ensuite reprendre étapes 1 et 2.

## 2026-10-25T05:04:32Z · Étape CI adaptée et validée

- fait: LIBBOX_SHA256 ajouté au bloc env ; étape Moteur libbox réécrite (D102) avec 3 tentatives, sha256sum -c, contrôle jni/arm64-v8a/libbox.so. YAML valide (python yaml.safe_load). Non committé.
- etat: ok
- suite: Attendre la permission d'upload puis vérifier l'asset et le téléchargement.

## 2026-10-25T05:04:33Z · Proposition écrite

- fait: notes/proposition.md : texte de passation et D102 à intégrer par l'orchestrateur.
- etat: partiel
- suite: Intégration par l'orchestrateur après publication de l'asset.

## 2026-10-25T05:04:33Z · CLÔTURE
BLOQUÉ : upload de l'asset refusé (garde-fou publication publique) ; étape CI adaptée et YAML valide ; asset non publié, rien vérifié depuis la Release.
