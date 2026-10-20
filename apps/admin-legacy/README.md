# Console d'administration

SPA statique pour la plateforme VPN : aucune étape de build, aucune dépendance
npm, aucun CDN, aucune police distante. Trois fichiers suffisent :

```
apps/admin/
├── public/
│   ├── index.html   coquille, navigation, chargement de app.js
│   ├── app.js       routeur, écrans, appels API
│   └── styles.css   unique feuille de style (thèmes clair et sombre)
└── README.md
```

## Comment c'est servi

L'API Fastify sert ce dossier en statique sous `/admin/` :

```ts
// apps/api/src/app.ts
await app.register(fastifyStatic, {
  root: fileURLToPath(new URL("../../admin/public", import.meta.url)),
  prefix: "/admin/",
});
```

- `http://<api>/admin/` → `public/index.html`
- `http://<api>/admin/app.js` → le script
- `/admin` sans barre finale redirige vers `/admin/` (déclaré dans `app.ts`).

**Tous les appels sont relatifs à l'origine.** `API_BASE` vaut la chaîne vide et
les chemins commencent par `/v1/admin/...` : la console fonctionne à l'identique
sur `http://localhost:8080/admin/`, sur un domaine de production ou derrière un
proxy. Aucun `http://localhost:8080` n'est codé en dur.

`app.js` n'utilise ni `import` ni `export` : `index.html` le charge en module ES
quand la page est servie, en script classique quand elle est ouverte en
`file://` (un module y serait refusé, origine `null`). Le même fichier est
valide dans les deux modes.

### Inspection locale

Ouvrir `public/index.html` dans un navigateur affiche toute l'interface. En
revanche, les appels relatifs pointent vers le disque local : aucune requête
réseau ne peut aboutir. L'écran de connexion le dit explicitement. Pour tester
réellement, servir le dossier par l'API.

## Écrans

| Écran | Contenu | Actions |
|---|---|---|
| Connexion | email + mot de passe | ouvre une session en mémoire |
| Vue d'ensemble | communautés, endpoints actifs, alertes, révision du pool | rafraîchir |
| Communautés | nom, slug, statut, commission, date | créer, suspendre/reprendre, changer la commission (propriétaire) |
| Membres | personnel de la communauté sélectionnée | ajouter, changer le rôle, désactiver/réactiver, créer un compte admin (propriétaire) |
| Commandes et commissions | commandes paginées, commissions, filtres de statut | charger plus, filtrer |
| Réseau | libellé, région, statut, santé, charge, latence, expiration | rafraîchir |
| Bundles hors-ligne | appareils de la communauté | émettre un bundle (1–72 h), révoquer l'appareil |
| Journal d'audit | action, rôle exercé, cible, communauté, date | lecture seule |

Chaque écran a un état vide explicite, un état d'erreur avec le statut HTTP, et
un indicateur `aria-busy` pendant le chargement. Aucun écran ne reste blanc.

## Routes consommées

Toutes les routes ci-dessous existent dans `apps/api/src/routes/admin.ts`
(références de ligne au 20 octobre 2026). Les réponses sont lues champ par
champ ; tout champ inconnu est ignoré.

| Méthode et chemin | Ligne | Usage dans l'interface |
|---|---|---|
| `GET /v1/admin/me` | 415 | identité, `platformRole`, `memberships` après connexion |
| `GET /v1/admin/communities` | 428 | sélecteur de communauté, vue d'ensemble, liste |
| `POST /v1/admin/communities` | 443 | création (propriétaire) |
| `PATCH /v1/admin/communities/:id` | 479 | suspension/reprise, commission |
| `GET /v1/admin/communities/:id/memberships` | 516 | table des membres |
| `POST /v1/admin/communities/:id/memberships` | 527 | ajout d'un membre |
| `PATCH /v1/admin/memberships/:id` | 568 | rôle ou réactivation |
| `DELETE /v1/admin/memberships/:id` | 609 | désactivation logique |
| `POST /v1/admin/admins` | 642 | création d'un compte admin (propriétaire) |
| `GET /v1/admin/communities/:id/orders` | 804 | commandes, `limit`, `status`, `cursor` |
| `GET /v1/admin/communities/:id/commissions` | 845 | commissions, `limit`, `status` |
| `GET /v1/admin/communities/:id/devices` | 698 | appareils pour les bundles |
| `POST /v1/admin/devices/:id/revoke` | 725 | révocation d'un appareil |
| `POST /v1/admin/devices/:id/offline-bundles` | 760 | émission d'un bundle (`ttlHours`) |
| `GET /v1/admin/pool` | 967 | état du pool |
| `GET /v1/admin/audit-log` | 983 | journal, `community_id`, `limit` |

Routes écrites mais **non exposées par cette interface** : `GET /communities/:id`
(détail), `GET /communities/:id/users`, `POST /payouts`,
`POST /payouts/:id/approve`. Les versements et l'approbation restent donc à
faire dans un autre écran.

Contraintes réelles de l'API reprises dans l'interface :

- communautés : 200 maximum, les plus récentes ;
- appareils : 100 maximum par communauté ;
- commandes : 20 par page, curseur opaque ;
- commissions : 100 maximum, pas de curseur ;
- audit : 200 lignes maximum, pas de curseur ;
- bundles : TTL de 1 à 72 heures, aucune liste de bundles n'existe côté API.

## Connexion : route manquante (blocage)

**La route de connexion existe** : `POST /v1/admin/auth/login`
(`apps/api/src/routes/adminAuth.ts`). Elle vérifie le mot de passe scrypt, refuse
un compte désactivé, trace la connexion dans `audit_log`, et délivre un jeton de
8 h. Elle est limitée à 20 essais par IP et 8 par compte sur 15 minutes.

```
POST /v1/admin/auth/login
{ "email": "...", "password": "..." }

200 { "accessToken": "...", "token": "...", "accessExpiresAt": "...",
      "admin": { "id", "email", "name", "platformRole", "memberships": [] } }
401 { "error": { "code": "INVALID_CREDENTIALS", ... } }   // inconnu ou mauvais mot de passe
403 { "error": { "code": "FORBIDDEN", ... } }             // compte désactivé
429 { "error": { "code": "RATE_LIMITED", "retryAfter": 900 } }
```

Le jeton (8 h) vit en mémoire de l'onglet. Après réception, l'interface appelle
`GET /v1/admin/me` : l'identité et les rôles viennent de cette route réelle,
jamais du corps de connexion.

Il n'existe pas non plus de route de déconnexion administrateur : le bouton
« Fermer la session » oublie le jeton en mémoire, sans appel réseau. C'est
suffisant puisque le jeton n'est jamais persisté.

## Rôles et capacités

L'interface réplique la matrice de `routes/admin.ts` (lignes 141–193) :

| Capacité | owner | community_admin | support | finance |
|---|---|---|---|---|
| Gérer les communautés | oui | non | non | non |
| Lire les membres / écrire | oui | sa communauté | non | non |
| Lire les abonnés et appareils | oui | sa communauté | sa communauté | non |
| Lire les commandes | oui | sa communauté | sa communauté | sa communauté |
| Voir les montants | oui | sa communauté | non | sa communauté |
| Lire les commissions | oui | sa communauté | non | sa communauté |
| Lire le pool | oui | oui | oui | non |
| Révoquer / émettre un bundle | oui | sa communauté | sa communauté | non |
| Lire l'audit | oui | sa communauté | non | non |

`platformRole` vaut `owner` ou `none` (D16). Les rôles `community_admin`,
`support` et `finance` sont **locaux** : une personne peut avoir un rôle
différent dans chaque communauté. L'ancien `AdminRole = platform | partner`
n'est pas utilisé : `partner` ne dit pas lequel des trois rôles locaux
s'applique, et l'interface ne le devine pas.

## Sécurité

- Le jeton ne vit que dans la closure de `app.js` : aucun `localStorage`,
  `sessionStorage`, cookie, `indexedDB` ni paramètre d'URL.
- Un seul `fetch()` dans tout le fichier, dans `request()`. Toute requête
  authentifiée vérifie la présence du jeton **avant** l'appel, puis envoie
  `Authorization: Bearer`. La connexion est la seule exception explicite
  (`auth: false`).
- `401` : le jeton est oublié, retour à `#/login`, bandeau « Session expirée ».
- `403` : bandeau « Accès refusé » et panneau d'erreur dans l'écran, jamais un
  écran vide.
- `cache: 'no-store'`, `credentials: 'omit'`.
- Aucun `innerHTML`, `insertAdjacentHTML` ni `eval` : tout contenu serveur passe
  par `textContent`.
- Le pool est filtré par une liste blanche (`normalizeEndpoint`) : seuls
  libellé, région, capacité, charge, statut, santé, latence et dates entrent
  dans le DOM. `endpointId`, `host`, `port`, `protocol`, `transport`,
  `security`, `uuid`, `wsPath`, `sni` et `credential` ne sont jamais lus.
- Les bundles n'affichent que l'appareil, les dates et une référence opaque ;
  aucune configuration, aucun UUID, aucun chemin WebSocket.
- Le journal d'audit n'affiche ni adresse IP ni états avant/après.

## Vérifications effectuées

Exécutées le 20 octobre 2026 depuis `apps/admin`.

### Statique

```
node --check public/app.js          → aucune sortie (succès)
```

- `fetch(` : **1** occurrence, dans `request()`.
- `authorization` : présent pour toute requête authentifiée ; `auth: false`
  uniquement pour la connexion.
- `http://`, `https://`, `localhost`, `8080` : **0** occurrence.
- `localStorage|sessionStorage|document.cookie|indexedDB` : **0**.
- `innerHTML|insertAdjacentHTML|eval(` : **0**.

### Navigateur, réponses simulées

L'API réelle ne peut pas délivrer de jeton admin (voir plus haut). Les écrans
ont donc été exercés dans Chrome avec un `fetch` simulé, sur `file://`, en
injectant des réponses conformes aux DTO de `routes/admin.ts`.

- Connexion : `POST /v1/admin/auth/login` **sans** en-tête d'autorisation, puis
  `GET /v1/admin/me` et `GET /v1/admin/communities` **avec**
  `Bearer <jeton>`.
- Les 12 appels suivants (vue d'ensemble, membres, commandes, commissions,
  réseau, bundles, audit) portent tous `Authorization: Bearer`. Aucun appel
  authentifié sans en-tête.
- Les 7 écrans rendent un `h1`, sans panneau d'erreur.
- Fuites : `ENDPOINT-ID`, `203.0.113.10`, `198.51.100.7`, `8443`, `vless`,
  `UUID-MUST-NOT-APPEAR`, `/WS-PATH` et le jeton sont **absents** du DOM et du
  texte de la page réseau.
- Stockage : 0 entrée dans `localStorage` et `sessionStorage`.
- Rôle `support` : « Membres » et « Audit » masqués dans la navigation ;
  accès direct à `#/members` → panneau « Accès refusé » ; commandes sans
  montants (« masqué ») ; commissions annoncées inaccessibles.
- `403` sur `/pool` : bandeau + panneau « Chargement impossible · HTTP 403 ·
  FORBIDDEN », écran non vide.
- `401` sur `/communities/c1/orders` : retour à `#/login`, bandeau
  « Session expirée », formulaire présent, navigation masquée.
- `404` sur la connexion : message explicite renvoyant à la section
  « Connexion ».
- Écritures vérifiées par les corps envoyés : `PATCH /memberships/:id`
  `{role}`, `POST /communities` `{name,slug,commissionBps}`,
  `PATCH /communities/:id` `{status}`, `POST /offline-bundles` `{ttlHours:6}`.
- Structure : un seul `h1` par écran, aucun id dupliqué, aucun contrôle sans
  libellé, aucun bouton vide, toutes les tables ont une légende, un seul
  `aria-current`, aucun débordement horizontal du document.
- Mobile `360 × 800` : aucun débordement du document ; les tableaux et la
  navigation défilent dans leur conteneur.
- Contrastes mesurés sur les jetons du thème : texte principal 16,17:1 (sombre)
  et 16,14:1 (clair), texte atténué 8,08:1, accent 9,67:1, succès 7,6:1,
  avertissement 7,91:1, danger 8,0:1. Tous au-delà de 4,5:1.

### Non vérifié

- **Aucun test de bout en bout contre l'API réelle** : la route de connexion
  admin manque, et aucun serveur/PostgreSQL n'est lancé sur cette machine.
- Les écritures ont été vérifiées par leurs requêtes et des réponses simulées,
  pas par un effet réel en base.
- Android, Docker et les fournisseurs de paiement restent hors périmètre.

## Points à trancher

1. **Route de connexion admin** : à écrire (`POST /v1/admin/auth/login`), avec
   limitation de débit, vérification de `admin_users.active`, hachage
   `verifyPassword` et émission par `issueAdminToken`. Sans elle, la console
   reste inutilisable en production.
2. **Agrégat global** : il n'existe ni `/overview`, ni compte d'abonnés global,
   ni revenu agrégé. La vue d'ensemble n'affiche donc que des chiffres exacts
   calculés sur les listes accessibles (communautés, pool, alertes), jamais une
   estimation de revenus ou d'abonnés. Un vrai agrégat demanderait une route
   dédiée.
3. **`finance` voit « toutes » les communautés** dans la matrice, mais
   `scopedCommunity()` exige une appartenance pour toute route paramétrée par
   `:communityId`. L'interface n'offre que les communautés listées par
   `/communities` ; le jour où `finance` doit sortir de son périmètre, il
   faudra une route globale (ou assouplir `scopedCommunity`).
4. **Pas d'annuaire des comptes admin** : ajouter un membre exige un
   `adminUserId` connu. Seul le propriétaire peut créer un compte via
   `POST /admins` et récupérer cet identifiant. Un `GET /admins` serait utile.
5. **Pas d'historique des bundles hors-ligne** : l'API ne fournit que
   l'émission. L'interface garde une liste en mémoire, clairement étiquetée
   « cette session ».
6. **Versements** : les routes `POST /payouts` et `POST /payouts/:id/approve`
   existent mais ne sont pas dans cette vague d'écrans.

## Fichiers

- `apps/admin/public/index.html`
- `apps/admin/public/app.js`
- `apps/admin/public/styles.css`
- `apps/admin/README.md` (ce fichier)
