# Audit de lancement du dashboard — 29 octobre 2026

Statut : code corrigé et vérifications automatisées exécutées. Les parcours
authentifiés en navigateur et les intégrations externes restent à valider avant
mise en ligne.

## A. Inventaire fonctionnel

| Module | Route / composants | Backend et stockage | État initial | Correction / résultat | Vérification |
|---|---|---|---|---|---|
| Connexion | `/login`, `login-form.tsx` | `POST /v1/admin/auth/login`, `admin_users`, `admin_sessions` | Présent | Email/WhatsApp, erreur uniforme, JWT en cookie `httpOnly`, retour `next` interne | tests dashboard + API ; navigateur mobile |
| Mot de passe forcé | `/mot-de-passe`, `password-change-form.tsx` | `POST /v1/admin/me/password` | Tests et OpenAPI encore à 12 caractères, code volontairement passé à non vide | Tests, aide et contrat alignés sur le commit `4793e8d`; sessions révoquées après succès | 145 tests dashboard ; test API compte |
| Mon compte | `/compte`, `account/*` | `GET/PATCH /me`, sessions GET/DELETE | Présent | Profil, mot de passe, apparence, révocation d'une session ou des autres | tests `admin-auth`, `account-ui`, `adminAccount` |
| Accueil | `/`, `home/*` | résumés, commandes, abonnés, pool, audit, builds | Certaines pannes devenaient des listes vides | Suppression des replis trompeurs ; erreurs remontées aux frontières existantes | typecheck, tests, build |
| Abonnés | `/:communityId/subscribers` | users/list/detail/search | Présent | Recherche, filtres, pagination, tiroir détail ; périmètre serveur | tests dashboard et `adminDetails` |
| Appareils | `/:communityId/devices` | devices/detail/revoke, offline bundles | Présent | Révocation et émission `.bvpn` réelles via Server Actions | tests dashboard + API offline/admin |
| Commandes | `/:communityId/orders` | orders/list/detail | Présent | Filtres, pagination et détail ; montants masqués au support par l'API | tests dashboard + API permissions/details |
| Forfaits | `/:communityId/plans`, `plans/*` | apps/plans/custom-offer, tables `plans` | Prix indisponible silencieusement accepté dans l'UI | Une panne du tarif plateforme bloque désormais le bloc au lieu d'afficher un calcul incomplet | tests plans/refonte v2, build |
| Application / builds | `/:communityId/builds`, file globale dans `/communities` | build requests, approve/reject, callback CI | Une panne pouvait afficher « aucun build » | Les erreurs de lecture ne sont plus transformées en liste vide | tests dashboard + API builds |
| Communautés | `/communities`, tiroir communauté | communities create/update/status/summary | Présent | Création, édition, suspension/reprise reliées à l'API | tests communautés/onboarding/permissions |
| Équipe | `/:communityId/members` | memberships POST/PATCH/DELETE | Présent | Ajout, rôle, réactivation, retrait ; dernier admin protégé en 409 | tests plans-members + API permissions |
| Administrateurs | `/admins`, `admins/*` | admins list/create/reset | Présent | Invitation WhatsApp/email et réinitialisation temporaire, owner seulement | tests admin auth/reset/onboarding |
| Argent | `/payouts`, `/:communityId/commissions` | commissions, payouts state machine | Une panne pouvait afficher des montants à zéro | Les erreurs financières remontent maintenant au lieu de produire de faux totaux | tests payouts + suite API |
| Réseau | `/network`, `network/*` | pool, endpoints, 3x-ui, slots, Telegram | Pannes des créneaux présentées comme listes vides ; contrats D45 obsolètes | Erreurs visibles ; D141 enregistrée : gratuit borné, payant/VIP accès aux deux pools | test ciblé API 8/8 ; dashboard tests/build |
| Journal | `/:communityId/audit`, accueil activité | `audit_log` append-only | Les événements sans fiche donnaient un faux lien `#` | Ligne informative non cliquable, sans chevron | typecheck, lint, tests, build |
| Tarifs plateforme | `/pricing`, `pricing-settings-form.tsx` | GET/PUT pricing | Présent | Validation zod et écriture owner via Server Action | tests refonte v2 + API R6 |
| Onboarding | `/onboarding`, `onboarding-wizard.tsx` | onboarding, community, app, logo, plans, builds | Pannes apps/plans/builds interprétées comme absence de données | Les erreurs remontent à `DataBoundary`; aucune création trompeuse | typecheck, tests, build |
| BFF lecture | `/api/bff/[...path]` | relais GET admin | Présent | Liste blanche, query bornée, même origine, `private, no-store`; aucune mutation | tests BFF/drawers |

## B. Matrice des actions administrateur

Toutes les mutations passent par une Server Action, valident l'entrée avec zod,
puis appellent l'API qui refait l'authentification, le contrôle de rôle et le
périmètre de communauté. Les erreurs attendues reviennent par champ ou par code ;
un 401 redirige vers `/login`.

| Action / point d'entrée | Permission | Destination | Opération backend | Succès / échec et edge cases |
|---|---|---|---|---|
| Se connecter (`/login`) | clé console + compte actif | accueil ou mot de passe forcé | `POST /auth/login` | cookie `httpOnly`; identifiant invalide local, 401 uniforme, 429 conservé |
| Modifier profil / mot de passe / sessions (`/compte`) | compte courant | onglets compte | `PATCH /me`, `POST /me/password`, `DELETE /me/sessions*` | toast et relecture ; mot de passe différent/non vide ; sessions étrangères 404 |
| Créer / modifier / suspendre une communauté (`/communities`) | owner | feuille/détail | `POST/PATCH /communities` | relecture ; slug/commission/WhatsApp validés, conflit 409 |
| Inviter / réinitialiser un admin (`/admins`) | owner | feuilles de confirmation | `POST /admins`, `POST /admins/:id/reset-password` | secret temporaire montré une fois ; auto-réinitialisation refusée |
| Exécuter l'onboarding (`/onboarding`) | admin concerné / owner | assistant 6 étapes | onboarding, communauté, app, logo | chaque étape persistée ; doublon communauté/app refusé |
| Créer / éditer / activer un forfait (`…/plans`) | owner ou community_admin local | feuille forfait | `POST /apps/:id/plans`, `PATCH /plans/:id` | prix/famille/quota bornés ; plancher vérifié par l'API ; 409 code dupliqué |
| Enregistrer l'offre sur mesure (`…/plans`) | gestionnaire local | feuille offre | `PUT /apps/:id/custom-offer` | bornes cohérentes et relecture |
| Demander un build (`…/builds`) | community_admin / owner | page application | `POST /apps/:id/build-requests` | état `requested`, double demande gérée par l'API |
| Approuver / rejeter / lancer un build | owner | tiroir build / file globale | approve, reject, trigger | dispatch CI après approbation ; motif requis au rejet ; échec fournisseur visible |
| Révoquer un appareil (`…/devices`) | support/admin local | confirmation | `POST /devices/:id/revoke` | sessions révoquées ; appareil hors périmètre refusé |
| Émettre un secours `.bvpn` | support/admin local | tiroir appareil | `POST /devices/:id/offline-bundles` | TTL 1–72 h ; appareil révoqué refusé ; contenu jamais journalisé |
| Ajouter / changer / retirer un membre (`…/members`) | owner/community_admin local | feuille et menu ligne | memberships POST/PATCH/DELETE | dernier community_admin protégé, rôle strict, réactivation disponible |
| Préparer / approuver / payer / confirmer / résoudre un versement (`/payouts`) | finance/admin/owner selon étape | feuille/confirmation | endpoints payouts dédiés | auto-approbation 409, double action idempotente/conflit, échec fournisseur vers revue |
| Ajouter / piloter / supprimer un endpoint (`/network`) | owner | feuilles et confirmations | endpoints manual/health/status/delete/purge | URI VLESS analysée en mémoire ; UUID non renvoyé ; endpoint actif protégé selon API |
| Créer / tester / supprimer 3x-ui (`/network`) | owner | feuille serveur | xui servers POST/test/DELETE | jeton scellé ; message de test nettoyé ; clients actifs empêchent suppression |
| Prendre un créneau / émettre une clé | owner ou réseau | section nuit | claim/deploy-key | un opérateur à la fois ; clé montrée une fois ; clé liée non réémise |
| Tester Telegram | owner | actions réseau/communautés | `POST /telegram/test` | 409 si désactivé ; aucun secret dans la réponse |
| Se déconnecter | tout compte | menu utilisateur | `POST /auth/logout` | cookie supprimé même si l'API est injoignable |

## C. Rapport de lancement

### Défauts corrigés

- P1 contrat : politique de mot de passe récente non propagée aux tests, à
  l'OpenAPI et aux textes.
- P1 données : erreurs API masquées par des `catch(() => [])`/`null` sur les
  montants, builds, onboarding, réseau, forfaits et blocs d'accueil.
- P1 navigation : activité sans détail rendue comme faux lien `#`.
- P1 contrat réseau : tests et documentation D45 non alignés sur les commits
  `f4757e7` et `ee12984`; D141 ajoutée.
- OpenAPI régénéré depuis les contrats actuellement enregistrés (27 464 lignes,
  contre 20 766 auparavant).

### Commandes exécutées

| Commande | Résultat |
|---|---|
| `bun run typecheck` (`apps/dashboard`) | réussite, aucune sortie |
| `bun run lint` (`apps/dashboard`) | réussite, aucune sortie après correction |
| `bun run test` (`apps/dashboard`) | 145/145, 39 suites |
| `bun run build` (`apps/dashboard`) | réussite Next 16.4.2, 22 pages générées |
| `bun run typecheck` (`apps/api`) | réussite, aucune sortie |
| `bun run test` (`apps/api`) | 354/354 après alignement D141, 0 échec, 189,8 s |
| `node --test --import tsx test/endpointsTier.test.ts` | 8/8 après D141 |
| `bun run openapi` | réussite, `apps/api/openapi.json` régénéré |
| `bun audit` | 23 avis : 8 élevés, 11 modérés, 4 faibles |
| Playwright CLI, Chrome, `localhost:3000` | login, validation, redirection profonde et mobile 390×844 vérifiés |
| `git diff --check` | aucune erreur d'espace ; avertissements CRLF Windows uniquement |

### Sécurité et dépendances

- Aucun fichier de clé privée ou credential n'est suivi ; seuls les
  `.env.example` sont versionnés. Les correspondances « secret/token » relues
  utilisent des variables d'environnement ou `secrets.*` GitHub.
- `bun audit` signale notamment Zod 3.25.76 (correction annoncée en majeure 4),
  et des transitifs anciens de `@vercel/node` (`undici`, `@fastify/busboy`,
  `path-to-regexp`). `bun outdated` ne propose aucune mise à jour compatible.
  Une migration majeure juste avant lancement n'a pas été tentée.
- Le choix produit du commit `4793e8d` autorise un nouveau mot de passe d'un
  seul caractère. Le code, les tests et le contrat sont maintenant cohérents,
  mais le risque de mot de passe faible reste une décision produit à reconsidérer.

### Refonte visuelle — reprise demandée

La première livraison corrigeait les parcours mais laissait une apparence trop
proche du legacy. Une seconde passe a donc remplacé les fondations visuelles
partagées, sans changer les routes ni les actions métier :

- palette et surfaces globales, sidebar sombre, shell desktop et navigation par
  onglets ;
- titres de page, sections, KPI, tableaux, listes et bandes de statistiques ;
- boutons, champs et sélecteurs avec états focus/hover/pressed cohérents ;
- connexion recomposée en vue scindée desktop et formulaire mobile concentré.

Vérification réelle dans Chrome via Playwright CLI : 1440×960 en thèmes clair
et sombre, 390×844 sans débordement horizontal, aucune erreur console. Les
captures temporaires restent ignorées par `.gitignore` sous `.playwright-cli/`.
Les écrans authentifiés n'ont pas été parcourus visuellement faute de session de
staging ; leurs primitives partagées sont couvertes par le build et les tests,
pas par une affirmation de validation visuelle page par page.

### Blocages et vérifications manuelles obligatoires

1. Tester les parcours authentifiés owner, community_admin, support, finance et
   réseau sur un environnement de staging : le serveur Next local existant
   occupe le port 3000 et l'API locale existante sur 8080 répond 503 (« clé de
   sonde non configurée »). Ils n'ont pas été arrêtés ni reconfigurés.
2. Vérifier réellement Fapshi, Telegram, GitHub Actions/R2, PostgreSQL de
   production et un panneau 3x-ui ; les tests automatisés utilisent des doubles
   ou PGlite.
3. Tester au clavier les feuilles destructives et les confirmations sur Chrome
   Android/Pixel 8, puis vérifier les rôles insuffisants par appel API direct.
4. Planifier la migration des dépendances vulnérables, avec tests de charge sur
   les corps JSON/multipart et validation zod.
5. Supprimer après inspection le répertoire PGlite ignoré
   `data/audit-browser-20261029` (environ 30 Mo) : sa suppression automatisée a
   été refusée par la politique d'exécution, aucun contournement n'a été tenté.
6. Réparer séparément le front matter du fichier utilisateur non suivi
   `knowledge/10-infrastructure/codex-cli-daemon-windows.md` pour que
   `node knowledge/cli.mjs check` redevienne vert ; l'audit ne l'a pas modifié.

### Fichiers modifiés

Voir `git diff --stat`. Les changements fonctionnels concernent les contrats et
tests de mot de passe/réseau, les lectures dashboard qui masquaient des erreurs,
`HomeRow`, l'OpenAPI, les README et la documentation/mémoire associée. Aucun secret, fichier
d'environnement ou configuration de déploiement n'a été modifié.
