# Proposition — dash-devices-haiku (2026-10-25)

Non intégrée : ces points touchent des fichiers hors de ma charte (`apps/api`,
nœuds partagés). L'orchestrateur décide.

## 1. Date d'émission dans la liste des fichiers (API)

- Constat : `apps/api/src/services/offlineBundles.ts`, `bundleState`, renvoie
  `id, deviceId, userId, notAfter, consumedAt, expired`. Pas de date d'émission.
- La requête de `apps/api/src/routes/offline.ts` trie pourtant sur `b.created_at`,
  donc la colonne existe en base (vérifié par lecture du SQL, non exécuté).
- Effet : la page `/offline` n'affiche pas « émis le » (colonne retirée, pas
  inventée).
- Proposition : ajouter `issuedAt: row.created_at` (ISO) à `bundleState`, puis
  dans `offlineBundleState` de `devices.schema.ts` et une colonne « Émis le »
  dans `offline-columns.tsx`.

## 2. Contrôle de droit sur la liste (API, à vérifier)

- Constat : `GET /v1/admin/offline-bundles` appelle `requireAdmin` et
  `scopedCommunity`, mais aucun contrôle de capacité `offline_bundle.issue`
  (le tableau `permitted()` n'a pas été relu).
- Effet côté dashboard : la page et l'entrée de menu sont masquées par
  `can(me, "devices.offline", …)`, mais l'API laisse passer toute session admin
  dans son périmètre (finance inclus, si `scopedCommunity` le permet).
- Proposition : relire `permitted()` dans `routes/admin.ts` ; si la liste n'est
  pas réservée, appliquer le même contrôle que l'émission.

## 3. Lectures par appareil (coût)

- Le tableau des appareils lit `listOfflineBundles({ deviceId })` pour chaque
  ligne affichée (jusqu'à 100 appels par chargement). Pas de lecture globale :
  `listOfflineBundles({})` ne renvoie que les 50 plus récents, toutes
  communautés confondues.
- Proposition si c'est trop lourd : un paramètre `deviceIds=` (liste) sur
  `GET /v1/admin/offline-bundles`, ou une lecture différée à l'ouverture du tiroir
  (action serveur dédiée).

## 4. Périmètre de la page /offline pour le propriétaire

- Le propriétaire de plateforme voit les fichiers de toutes les communautés sur
  chaque page `/<communityId>/offline` (l'API ne reçoit pas de communauté).
  Décision produit à confirmer.
