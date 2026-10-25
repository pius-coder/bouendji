# Propositions de dash-builds-haiku (à intégrer par l'orchestrateur)

Fichiers partagés non modifiés (interdits à ce sous-agent). Diffs proposés :

## 1. `apps/dashboard/src/components/common/status-badge.tsx` : libellés des statuts de build

Statuts réels de l'API (`apps/api/src/routes/builds.ts`, `BUILD_STATUSES`) : `queued`, `running`,
`succeeded`, `failed`, `cancelled`. Aucun n'est dans `STATUS` aujourd'hui, sauf `failed`.

Ajouter dans `STATUS` :

```ts
queued: { label: "En file", tone: "info" },
running: { label: "En cours de build", tone: "info" },
succeeded: { label: "Réussi", tone: "success" },
cancelled: { label: "Annulé", tone: "neutral" },
```

Point à trancher (non tranché, pas de modification proposée) :
- `failed` est déjà libellé « Échouée » (versements). Pour un build, « Échoué » serait plus juste.
  Une clé séparée (ex. `build_failed`) évite le conflit, ou un libellé neutre « Échec ».
- `cancelled` (builds) et `canceled` (commandes, déjà présent) coexistent : les deux orthographes sont
  dans l'API. Ne pas les fusionner sans vérifier les deux routes.

## 2. Pourquoi le lien APK reste vide (état actuel de l'API, D100)

- `apkUrl` et `sha256` ne sont écrits que par le callback CI (`POST /v1/internal/builds/:id/callback`),
  qui n'accepte que des URL `https://`. Aucune autre voie.
- Le commentaire de `routes/builds.ts` dit « Vercel Blob (D62) ». Le handoff 2026-10-24 demande R2
  (`apps.numzer0.store`). L'URL acceptée par le callback n'impose pas d'hôte : le passage à R2 est donc
  côté workflow CI, sans changement de schéma API. À confirmer côté API (commentaire à corriger).
- Tant que le callback n'a pas renseigné `apkUrl` : la colonne « Lien » affiche un tiret avec le titre
  « Le lien apparaît quand le build est terminé. ». Aucun bouton « Copier le lien », aucune empreinte.
  Le statut reste `queued` (ou `failed` si GitHub a refusé le déclenchement, 502).
- En mode mock (`env.builds.mock`, nom de variable non relu), la ligne reste `queued` sans jamais changer : c'est voulu
  pour le local, mais la page ne peut pas le distinguer d'un vrai build en file.

## 3. Pour la page (informations, pas de modification demandée)

- Le déclenchement répond 202 `{buildId, status: "queued"}` ; la liste est relue par `refreshAfter`
  (`BaseService` -> `afterMutation` -> `refresh()`), donc pas de `router.refresh()` côté client.
- Le champ « Nom de version » est facultatif (40 car. max). Vide : l'API prend `1.0.0` (`routes/builds.ts`).
  Le `versionCode` est calculé par l'API : le dashboard ne l'envoie jamais.
