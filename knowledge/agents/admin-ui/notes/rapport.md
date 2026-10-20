# Rapport — admin-ui

## Verdict

La console d'administration est écrite et alignée sur les routes réellement
livrées par `api-admin` dans `apps/api/src/routes/admin.ts`. Les vérifications
statiques et les exercices navigateur à réponses simulées passent.

**Elle n'est pas utilisable en production pour une raison extérieure à son
code : l'API n'expose aucune route de connexion administrateur.** Aucun jeton
admin ne peut être obtenu par un formulaire aujourd'hui. C'est le point
bloquant n° 1 ci-dessous, pas un défaut de l'interface.

## Ce qui a changé en cours de route

La première version visait un contrat inventé (`/v1/admin/overview`,
`/v1/admin/network`, `/v1/admin/members`, `/v1/admin/orders`, `/v1/admin/audit`,
`/v1/admin/bundles`). `api-admin` a livré un contrat différent, scopé par
communauté. Le client a été réécrit contre le code réel :

- `/me` pour l'identité et les rôles ;
- `/communities` et `/communities/:id` ;
- `/communities/:id/memberships`, `/memberships/:id` ;
- `/communities/:id/orders`, `/commissions`, `/devices` ;
- `/devices/:id/offline-bundles`, `/devices/:id/revoke` ;
- `/pool`, `/audit-log`.

Aucun appel de l'interface ne vise une route qui n'existe pas, à l'exception
documentée de `POST /v1/admin/auth/login` (voir plus bas).

## Fichiers écrits

- `apps/admin/public/index.html` — coquille, navigation, chargement module ou
  script classique selon `file://`.
- `apps/admin/public/app.js` — routeur, session, sept écrans, appels API.
- `apps/admin/public/styles.css` — feuille unique, thèmes clair/sombre.
- `apps/admin/README.md` — service par Fastify, contrat, rôles, vérifications,
  limites.
- `knowledge/agents/admin-ui/notes/rapport.md` — ce rapport.

## Écrans et routes

| Écran | Routes réellement appelées |
|---|---|
| Connexion | `POST /v1/admin/auth/login` (**absente**), puis `GET /v1/admin/me` |
| Vue d'ensemble | `GET /communities`, `GET /pool` si le rôle y a droit |
| Communautés | `GET/POST /communities`, `PATCH /communities/:id` |
| Membres | `GET/POST /communities/:id/memberships`, `PATCH/DELETE /memberships/:id`, `POST /admins` |
| Commandes et commissions | `GET /communities/:id/orders` (`limit`, `status`, `cursor`), `GET /communities/:id/commissions` (`limit`, `status`) |
| Réseau | `GET /pool` |
| Bundles hors-ligne | `GET /communities/:id/devices`, `POST /devices/:id/offline-bundles`, `POST /devices/:id/revoke` |
| Journal d'audit | `GET /audit-log` (`community_id`, `limit`) |

Routes existantes mais volontairement non exposées : `GET /communities/:id`,
`GET /communities/:id/users`, `POST /payouts`, `POST /payouts/:id/approve`.

## Ce qui est vérifié

### Statique (cité)

```
node --check public/app.js        → aucune sortie, code 0
fetch(                            → 1 occurrence (request(), l. 459)
localStorage|sessionStorage|cookie|indexedDB → 0
http://|https://|localhost|8080   → 0
innerHTML|insertAdjacentHTML|eval( → 0
```

Toute requête authentifiée teste `state.token` **avant** `fetch` et pose
`Authorization: Bearer`. La connexion est la seule requête `auth: false`.

### Navigateur — réponses simulées

L'API ne pouvant pas délivrer de jeton admin, les tests navigateur utilisent un
`fetch` simulé qui renvoie les DTO de `routes/admin.ts`. Exécuté dans Chrome,
sur `file://`, avec un jeton factice.

- Connexion : `POST /auth/login` sans en-tête, puis `GET /me` et
  `GET /communities` avec `Bearer`.
- 12 appels authentifiés ensuite (vue d'ensemble, membres, commandes,
  commissions, réseau, bundles, audit) : tous portent `Bearer`, aucun sans.
- Les sept écrans rendent un `h1` et aucun panneau d'erreur.
- Fuites : `ENDPOINT-ID`, `203.0.113.10`, `198.51.100.7`, `8443`, `vless`,
  `UUID-MUST-NOT-APPEAR`, `/WS-PATH`, `CREDENTIAL` et le jeton sont absents du
  DOM de l'écran réseau et du texte de la page.
- Stockage : 0 entrée `localStorage`/`sessionStorage`.
- Rôle `support` : « Membres » et « Audit » masqués ; accès direct à
  `#/members` → panneau « Accès refusé » ; montants des commandes « masqué » ;
  commissions inaccessibles.
- `403` sur `/pool` : bandeau « Accès refusé » + panneau
  « HTTP 403 · FORBIDDEN », écran non vide.
- `401` sur `/communities/c1/orders` : retour à `#/login`, bandeau
  « Session expirée », formulaire présent, navigation masquée.
- `404` sur la connexion : message explicite renvoyant au README.
- Écritures : corps observés conformes — `{role}`, `{name,slug,commissionBps}`,
  `{status}`, `{ttlHours:6}`.
- Structure : un `h1` par écran, aucun id dupliqué, aucun contrôle sans
  libellé, aucun bouton vide, toutes les tables avec légende, un seul
  `aria-current`.
- `360 × 800` : aucun débordement horizontal du document ; tableaux et
  navigation défilent dans leur conteneur.
- Contrastes (jetons inchangés) : 16,17:1 et 16,14:1 pour le texte principal,
  8,08:1 pour le texte atténué, accent 9,67:1, succès 7,6:1, avertissement
  7,91:1, danger 8,0:1.

### Non vérifié

- **Aucun test de bout en bout contre l'API réelle** : pas de route de
  connexion admin, pas de PostgreSQL/API lancés sur cette machine.
- Les écritures sont vérifiées par la requête émise et une réponse simulée,
  pas par un effet en base.
- Android, Docker, paiements : hors périmètre.

## Points ouverts

1. **Bloquant — connexion admin.** `issueAdminToken()` existe et `seed.ts` crée
   un compte, mais aucune route ne vérifie le mot de passe. L'interface vise
   `POST /v1/admin/auth/login` et affiche un 404 explicite. Contrat attendu
   documenté dans le README.
2. **Pas d'agrégat global.** Aucune route ne fournit abonnés, revenus 30 jours,
   commandes 30 jours. La vue d'ensemble n'affiche que des chiffres exacts
   calculés sur les listes accessibles (communautés, pool, alertes). Elle
   n'invente ni revenu ni abonné ; un vrai agrégat demande une route dédiée.
3. **`finance` et le périmètre.** La matrice dit « toutes les communautés » pour
   `order.read`/`commission.read`, mais `scopedCommunity()` exige une
   appartenance pour toute route `:communityId`. L'interface n'offre que les
   communautés listées ; le jour où `finance` doit sortir de son périmètre, il
   faudra une route globale.
4. **Pas d'annuaire admin.** Ajouter un membre exige `adminUserId`. Seul le
   propriétaire peut créer un compte (`POST /admins`) et récupérer l'id ; un
   `community_admin` doit le connaître par un autre canal. Un `GET /admins`
   serait utile.
5. **Pas d'historique des bundles.** Seule l'émission existe. L'interface garde
   une liste en mémoire, étiquetée « cette session ».
6. **Versements non exposés.** `POST /payouts` et `POST /payouts/:id/approve`
   existent mais ne font pas partie de cette vague d'écrans.

## Décisions d'interface

- **Rôles** : `platformRole` (`owner|none`) + `memberships[]` locaux, lus depuis
  `/me`. L'ancien `AdminRole = platform|partner` n'est pas utilisé et `partner`
  n'est jamais traduit en `community_admin` par devinette.
- **Pool** : liste blanche stricte. `endpointId`, hôte, port, protocole,
  transport, sécurité, UUID, chemin WS, SNI et credential ne sont jamais lus.
- **Bundles** : la réponse ne contient qu'un droit daté ; l'écran n'affiche que
  l'appareil, les dates et une référence opaque.
- **Audit** : ni IP ni états avant/après dans le DOM.
- **Jeton** : uniquement en mémoire ; pas de déconnexion réseau, inexistante
  côté API.

## Sources lues

- `apps/api/src/routes/admin.ts` (911 lignes, routes l. 415–1005)
- `apps/api/src/lib/auth.ts` (`AdminContext`, `issueAdminToken`,
  `requireAdmin`, `scopedCommunity`)
- `apps/api/src/app.ts` (statique `/admin/`, montage des routes)
- `apps/api/src/schema.ts` (tables et statuts)
- `apps/api/test/admin.test.ts` (15 tests, 64/64 toutes suites selon la
  clôture d'`api-admin`)
- `knowledge/40-money/roles-and-commissions.md` (D16)
- `knowledge/20-backend/api-routes.md`
