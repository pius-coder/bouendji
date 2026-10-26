# Audit : composants metier du dashboard (tranche audit-dash-domain-haiku)

Chemins relatifs a `apps/dashboard/src/components/` sauf mention. Lecture seule.
Profondeur : lus en entier = network/manual-endpoint-sheet, plans/plan-sheet, plans/plans-section, admins/*, communities/create-community-sheet, members/add-member-*, network/endpoint-drawer, force-health-button, builds/build-trigger, builds-section. Les autres fichiers sont vus par grep (services, actions, imports, cles) et non lus en entier : leur etat est marque (survole).

## 1. Verdict

- Les 15 dossiers sont branches sur l'API reelle (services + actions), sauf `kit` (fixtures, 64 appareils generes).
- Le socle est solide : tableaux serveur, tiroirs, formulaires react-hook-form avec le meme schema zod que l'action (`plans`, `communities`, `network`).
- Trois points bloquants pour le plan : (a) le champ VLESS est casse (Entree soumet le formulaire, UUID affiche en clair, tout reste editable) ; (b) la page Forfaits peut echouer en prod, cause non confirmee sans l'erreur ; (c) creer un admin puis le rattacher exige 3 pages, sans WhatsApp ni onboarding.
- Le flux de build est direct (« Construire l'APK ») : aucun etat (brouillon, demande, refuse, en cours, publie, echec) ni validation owner.
- Le champ VLESS et la page Forfaits sont les deux cas demandes ; detail en sections 3 et 4.

## 2. Inventaire

| Dossier | Fichiers (lignes approx.) | Role | Etat |
|---|---|---|---|
| admins | admins-table.tsx (51), create-admin-sheet.tsx (97) | liste des comptes (owner) ; creation via useState, sans zod (create-admin-sheet.tsx:26, 31-44) | solide, partiel sur le plan |
| audit | audit-table.tsx (58), audit-drawer.tsx (86), audit-diff.ts (73), audit-filters.tsx (26), audit-options.ts (4) | journal, lecture serveur `audit.listAuditEntries` (audit-table.tsx:30) | solide (survole) |
| auth | login-form.tsx (80), login-form-section.tsx (7) | connexion par email + mot de passe (login-form.tsx:20, champ email :32) | partiel : pas de WhatsApp (plan 1) |
| builds | build-trigger.tsx (66), builds-section.tsx (66), builds-columns.tsx (42), builds-format.ts (40), copy-link-button.tsx (30) | build direct `triggerBuildAction` (build-trigger.tsx:90), liste `builds.listBuilds` (builds-section.tsx:57) | partiel : aucun etat de validation |
| commissions | commissions-table.tsx (54) | commissions des 100 dernieres (`orders.listCommissions`, :26), lecture seule | solide |
| communities | communities-table.tsx (54), community-drawer.tsx (125), create-community-sheet.tsx (124) | liste owner, edition/suspension (`updateCommunityAction`, `setCommunityStatusAction`), creation (`createCommunityAction`) | solide ; creation sans admin ni onboarding |
| devices | devices-table.tsx, device-drawer.tsx (174), devices-columns.tsx (50), devices-filters.tsx (23), offline-bundle-section.tsx (75) | appareils, revocation (`revokeDeviceAction`, device-drawer.tsx:52), fichiers de secours (`issueOfflineBundleAction`, offline-bundle-section.tsx:49) | solide (survole) |
| members | members-table.tsx (36), member-actions.tsx (107), members-columns.tsx (43), members-filters.tsx (23), add-member-section.tsx (22), add-member-sheet.tsx (130) | membres, changement de role, retrait, reactivation, ajout (`addMemberAction`) | solide ; ajout limite aux comptes deja crees |
| network | network-table.tsx (30), network-columns.tsx (35), endpoint-drawer.tsx (94), force-health-button.tsx (70), manual-endpoint-action.tsx (9), manual-endpoint-sheet.tsx (246) | pool de noeuds ; ajout manuel VLESS ; forcer hors service (`setEndpointHealthAction`) | VLESS = bug ; pool = solide |
| offline | offline-table.tsx (59), offline-columns.tsx (37), offline-status-badge.tsx (24), offline-status.ts (27) | fichiers de secours (`devices.listOfflineBundles`, offline-table.tsx:29) | solide (survole) |
| orders | orders-table.tsx (94), order-drawer.tsx (84), orders-columns.tsx (51), orders-filters.tsx (27) | commandes (`orders.listOrders`) | solide (survole) |
| payouts | payouts-table.tsx (33), payout-drawer.tsx (168), payouts-columns.tsx (26), payouts-filters.tsx (23), payouts-options.ts (12), prepare-payout-sheet.tsx (78), prepare-payout-action.tsx (10) | versements : approuver, payer, confirmer, resoudre ; preparer (`preparePayoutAction`) | solide (survole) |
| plans | plans-section.tsx (62), app-plans-table.tsx (18), plans-columns.tsx (35), plan-sheet.tsx (218) | forfaits par marque ; creation/edition | a verifier en prod (section 4) |
| subscribers | subscribers-table.tsx (63), subscriber-drawer.tsx (126), subscribers-columns.tsx (42), subscribers-filters.tsx (23), subscriber-groups.ts (16) | abonnes, `listSubscribers` via `getSubscribers` (context.ts:29) | solide (survole) |
| kit | kit-controls.tsx (159), kit-devices-section.tsx (56), kit-devices-table.tsx (93) | vitrine de composants ; donnees fictives `KIT_DEVICES` (server/query/kit.params.ts:30-38, 64 entrees generees) | statique/factice : a jeter de la prod |

Donnees codees en dur ou factices : seul `kit` (fixtures). Les libelles `placeholder` de kit-controls.tsx (lignes 66, 76-77, 141-142) sont des exemples de format, pas des donnees.

## 3. Ce qui sert le plan

- Tableaux serveur sans JS : `components/page/table.tsx:92` `TableRows` (server, cells en fonction) ; reutilisable tel quel pour les listes.
- Tiroirs : `network/endpoint-drawer.tsx:18-68` (Sheet, sections `DrawerSection` :71) ; modele a generaliser pour le plan 7 (Sheet desktop, Drawer mobile).
- Formulaires zod partages client/action : `plans/plan-sheet.tsx:76`, `plans.schema.ts:80-92` (`planFormSchema`), `network/network.schema.ts:96-123`, `communities/create-community-sheet.tsx:25`. Ce modele est a garder.
- Erreurs par champ : `plans/plan-sheet.tsx:86-94`, `network/manual-endpoint-sheet.tsx:111-124` (details API vers `form.setError`).
- Actions : `server/actions/action-result.ts:14-31` (`runAction`) convertit ApiError et ZodError.
- Garder quasi tel quel : `commissions`, `offline-status.ts` (fonction pure, test), `audit-diff.ts` (fonction pure), `members-table.tsx:14-31` (controle de role + filtre actif/desactive), `force-health-button.tsx` (confirmation + raison).
- Creation de communaute : `communities/create-community-sheet.tsx` reutilisable comme etape 1 de l'onboarding (nom, identifiant, commission).

## 4. Ecarts avec le plan

Plan 1 (mot de passe force, connexion email ou WhatsApp, « Mon compte ») :
- Connexion email seulement : `auth/login-form.tsx:20` (« email + mot de passe ») et champ `email` :32. Pas de champ WhatsApp.
- Creation d'admin : `admins/create-admin-sheet.tsx:76` demande un email obligatoire et un mot de passe provisoire saisi par l'owner (:77), avec la mention « canal sur » (:72). Le plan veut un mot de passe envoye sur WhatsApp et aucun email.
- Aucun ecran « Mon compte », aucune detection de mot de passe temporaire dans la tranche (grep `provisoire|mustChange|changer le mot` : seuls les lignes ci-dessus).

Plan 2 (libre-service, onboarding 6 etapes, build valide par owner) :
- Aucun onboarding : `communities/create-community-sheet.tsx` cree une communaute (3 champs). Pas de profil, communaute WhatsApp, application, forfaits, equipe, recapitulatif.
- Build direct : `builds/build-trigger.tsx:88-96` appelle `triggerBuildAction(appId, versionName)` ; le bouton n'est actif que si `brandReady` (:115). Aucun etat (brouillon, demande, refuse, en cours, publie, echec) ni motif de refus dans la tranche (grep vide). `builds/builds-format.ts` ne gere que la version et le SHA.
- Un admin = une application : non verifie dans la tranche (plans-section.tsx:30 filtre les marques par communaute, donc une communaute peut avoir plusieurs marques).

Plan 3 (guide par role) : absent de la tranche (grep vide).

Plan 4 (forfaits deux familles) : `plans/plan-sheet.tsx:25` expose `free-labs` (« Illimite ») et `paid-gcp` (« Limite ») via `SegmentedControl` (:175-180). Pas de plages de nuit (20h-24h, 24h-4h, 20h-4h) ni de choix de plage au paiement. Concept de « nuit illimitee » absent (grep `nuit|night|plage` non trouve, non verifie ailleurs).

Plan 5 (prix plancher, cout du Go, marge) : absent de la tranche. `plans-section.tsx` et `plan-sheet.tsx` ne montrent aucun indicateur de prix ni de cout.

Plan 6 (Telegram) : absent de la tranche (non verifie dans le reste du dashboard).

Plan 7 (5 sections, onglets, tiroirs, URL, Ctrl K, cache, SSE, presence) : tiroirs presents (`endpoint-drawer.tsx`, `community-drawer.tsx`, `device-drawer.tsx`, `payout-drawer.tsx`) mais pas dans l'URL (non verifie, hors tranche : l'etat d'ouverture est en `useState`, `endpoint-drawer.tsx:19`). Pas de SSE ni de presence dans la tranche.

Plan 8 (reseau : noms generiques aleatoires, ajout par lien VLESS, champs remplis en lecture seule) : voir section 5 ; aucun generateur de nom dans la tranche ni dans `apps/api/src/routes/admin.ts` (grep `random|NAMES` : aucun resultat pertinent, non verifie partout).

## 5. Champ VLESS (network) : formulaire actuel et defaut

Fichier principal : `network/manual-endpoint-sheet.tsx`. Le formulaire est un seul `<form>` (:172) contenant :
1. Le champ « Lien VLESS » (`VlessPaste`, :45-84), un `<Input>` simple (`ui/input.tsx`, pas de gestion de touche) en tete du formulaire.
2. Neuf champs en dessous : Groupe, Nom affiche, Region, Adresse, Port, SNI (textarea), Host WebSocket, Chemin WebSocket, UUID, Duree, Nature (:189-234).

Comportement reel :
- Coller (`onPaste`, :73-76) : `preventDefault`, analyse via `parseVlessLink` (`lib/vless-link.ts:21-53`), puis `onFields` (:174-188) remplit label, address, port, snis, hostHeader, wsPath, uuid par `form.reset` (les autres restent). Le texte colle est efface seulement si l'analyse reussit (:55-56).
- Taper a la main : `onChange` ne fait que `setDraft` (:72). `onBlur` (:77) lance `apply(draft)` : un lien incomplet affiche immediatement une erreur « Le lien doit commencer par vless:// » (:23) ou « Transport ... non pris en charge » (:34).
- Entree dans ce champ : aucun `onKeyDown`, donc le navigateur soumet le formulaire parent (`onSubmit={form.handleSubmit(submit)}`, :172). Le formulaire part avec les champs vides et affiche les erreurs de validation (Groupe, Nom, Region, etc.). C'est le defaut signale par l'utilisateur : il ne comprend pas comment enregistrer le lien ET remplir le reste.
- Le champ UUID est un `text()` (:217) : il reste en clair apres remplissage et son hint dit « Chiffre en base, jamais reaffiche ». Contradiction avec le plan (« ne choisir que le type »).
- Tous les champs restent editables apres remplissage (pas de lecture seule).
- Le groupe, la region, le nom sont toujours a saisir (:189-191) ; pas de nom genere.
- Le lien est dit « Facultatif » (:80) alors que les champs qu'il remplit sont obligatoires : deux parcours mélangés dans un seul formulaire.
- Le choix de nature est un `SegmentedControl` « Illimite / Limite » (:219-234), avec `free-labs` par defaut (:38). Le plan veut « jour ou nuit » (plage) : le modele de donnees (`tier`, `network.schema.ts:70`) ne connait pas la nuit.

Le plan demande : coller le lien, champs remplis en lecture seule, choix du type (jour/nuit), nom genere. Ecart total sur les trois points.

## 6. Page Forfaits : causes probables d'erreur en production

Le code ne montre aucune exception certaine. Causes plausibles, par ordre de vraisemblance (non verifie : l'erreur n'est pas fournie) :

1. Echec de validation de la reponse (`BAD_RESPONSE`). `server/api/base-service.ts:157-167` valide chaque reponse avec son schema ; `plans/plans-section.tsx:30` lit `listApps` (`plans.schema.ts:5-13`, `brandApp` exige `name`, `packageName`, `theme`, `brandReady`, `brandMissing`). Un seul enregistrement mal forme sur toute la plateforme (la liste n'est pas filtree avant parse) casse la page entiere pour toutes les communautes. Probabilite moyenne : en base `apps.theme` et `package_name` sont NOT NULL (`schema.ts:22-23`), mais `brand` est jsonb sans contrainte (`schema.ts:485`).
2. Echec de validation des forfaits (`app-plans-table.tsx:9` -> `plans.schema.ts:21-36`). `revision` (:35) et `description` (:26) doivent etre des chaines ; l'API les fournit (`routes/admin.ts:485-511`, `planDto`). Pas de cause trouvee, mais un ancien deploiement d'API sans `revision` casserait la page.
3. Erreur propagee sans filet : `withSession` (`server/context.ts:19-26`) relance toute erreur non 401 ; `plans/page.tsx` n'a pas de `try/catch` ; `error.tsx` affiche l'erreur. Tout 5xx ou 403 de `GET /v1/admin/apps` devient « erreur ». Le 403 est peu probable : `routes/admin.ts:289` et `dashboard lib/roles.ts:56-57` appliquent la meme regle (une communaute ou une appartenance).
4. Contrat divergent (documentation, pas runtime) : `apps/api/src/http/contracts.ts:729` decrit `GET /v1/admin/apps` sans `brandMissing`, et `contracts.ts:732-739` decrit les forfaits sans `endpointTier`, `revision`, `name`. Si un test de contrat ou une doc generee sert de reference, la divergence est reelle.
5. Chemin : `plans/plans-section.tsx:30` filtre `a.communityId === communityId` : une marque sans `communityId` renvoie une section vide (pas une erreur).
6. Edition (`plan-sheet.tsx:52-65`) : `initialValues` convertit `priceXaf` et autres en chaines (`String(p.priceXaf)`). Si la valeur est `undefined` (API en retard), le champ est vide, sans erreur.
7. Mise a jour : `plan-sheet.tsx:79` appelle `updatePlanAction` ; le schema d'edition (`plans.action.ts:21`) retire `code`. `PATCH` (`routes/admin.ts:897-935`) renvoie le forfait complet ; si l'API renvoie 422 (tier sans noeud actif, comme dans `contracts.ts:764`), le toast `result.message` est affiche.

Verification a faire en prod : le message exact de l'erreur, la route (`GET /v1/admin/apps` ou `.../plans`), et le role de l'utilisateur.

## 7. Creation admin / communaute / membre : parcours actuel

Pour donner un acces a une personne a une communaute, il faut aujourd'hui 3 pages :
1. Page Admins (owner) : `admins/create-admin-sheet.tsx` cree le compte (nom, email, mot de passe provisoire, portee). Message : « Ajoutez-le a une communaute depuis Membres » (:35).
2. Page Membres de la communaute : `members/add-member-sheet.tsx` choisit le compte dans une liste (owner : `admins.listAdmins`, `add-member-section.tsx:15-20`) ou saisit son identifiant a la main (community_admin, `add-member-sheet.tsx:89`). Role : community_admin, support, finance.
3. Communaute (si besoin) : page Communautes (owner) `communities/create-community-sheet.tsx`, qui ne cree pas d'admin.
Donc : pour un community_admin, il faut connaitre l'identifiant d'un compte qu'il ne voit pas (le commentaire `add-member-sheet.tsx:28-29` le dit : question ouverte 11).

Cible du plan : l'owner invite un admin (WhatsApp), l'admin fait l'onboarding, et une seule page suffit. Aucune de ces etapes n'existe dans la tranche.

## 8. A garder, a adapter, a jeter

| Composant | Decision | Raison |
|---|---|---|
| components/page/table.tsx (TableRows, TableCard) | garder | socle serveur |
| network/endpoint-drawer.tsx et autres tiroirs | adapter vers tiroir (Sheet/Drawer, URL) | plan 7 |
| network/manual-endpoint-sheet.tsx | adapter fortement (VLESS en tete, champs lecture seule, type jour/nuit, nom genere) | section 5 |
| network/network-table.tsx, network-columns.tsx, force-health-button.tsx | garder | pool + actions |
| plans/plan-sheet.tsx et plans.schema.ts | adapter (ajout plage nuit, prix plancher, indicateur) | plan 4-5 |
| plans/plans-section.tsx | adapter : diagnostiquer l'erreur avant tout | section 6 |
| admins/create-admin-sheet.tsx | adapter : invitation WhatsApp, sans email, sans mot de passe saisi | plan 1-2 |
| auth/login-form.tsx | adapter : email ou WhatsApp | plan 1 |
| builds/build-trigger.tsx, builds-section.tsx | adapter : etats, demande, validation owner | plan 2 |
| communities/create-community-sheet.tsx | garder comme etape 1 de l'onboarding | plan 2 |
| members/add-member-sheet.tsx | adapter : inviter, pas seulement lier | plan 2 |
| commissions, audit, offline, orders, payouts, subscribers, devices | garder (survoles) | donnees reelles |
| kit/* | jeter de la prod (fixtures) | pas de donnees |

## 9. Bugs et risques

- B1 (VLESS, network/manual-endpoint-sheet.tsx:73-77 et :172) : Entree dans le champ lien soumet tout le formulaire, avec erreurs de validation. Scenario : l'admin colle le lien puis appuie sur Entree.
- B2 (VLESS, :77) : `onBlur` avec un lien partiel affiche une erreur au lieu d'attendre. Scenario : l'admin tape `vless://` puis clique ailleurs.
- B3 (VLESS, :217) : UUID affiche en clair apres remplissage. Contradiction avec le hint « jamais reaffiche ».
- B4 (VLESS, :80) : lien « Facultatif » mais ses champs obligatoires. Confusion d'usage (l'utilisateur a deja signale).
- B5 (plans, plans-section.tsx:30 + plans.schema.ts:5-13) : parse global de la liste des marques. Une marque mal formee casse toutes les communautes (voir section 6, point 1).
- B6 (admin creation, create-admin-sheet.tsx:31-44) : pas de validation zod cote client ; erreurs posees sur `details` seulement ; le mot de passe est en clair dans l'etat React (:26). Non grave, mais contraire au plan (WhatsApp).
- B7 (builds, build-trigger.tsx:88-96) : build lance sans validation owner ; un community_admin peut lancer une construction (le controle est `plans.manage`, builds-section.tsx:22).
- B8 (kit) : `KIT_DEVICES` est exporte depuis un module de requete (`server/query/kit.params.ts:30`) ; une route de test peut la rendre publique si la page reste deployee.

## 10. Dependances hors tranche

- `lib/vless-link.ts` (parseur) : tests ? (non verifie).
- `apps/api/src/routes/admin.ts:289` et `apps/api/src/http/contracts.ts:729-774` : contrat des forfaits et des marques.
- `apps/api/src/routes/admin.ts:1750-1806` : POST des noeuds manuels (ligne 1758-1806) (generation de nom, non verifiee).
- Plages de nuit : aucun modele dans la tranche ; a chercher dans `apps/api` (non verifie).
- Telegram, SSE, presence, Ctrl K : hors tranche (non verifie).
- `components/common/detail-panel.tsx`, `common/app-sheet.tsx` : composants de tiroir communs (non lus).

## 11. Non verifie

- Le message d'erreur Forfaits en production (non fourni) : section 6 reste une liste de causes.
- Etat exact de chaque fichier marque « survole » (subscribers, devices, orders, payouts, offline, audit) : seule la presence d'appels serveur a ete verifiee.
- Route `/[communityId]/plans` et ses droits effectifs pour community_admin : non testes en navigateur.
- Presence de tests unitaires du parseur VLESS : non verifie.
- Absence de generateur de nom aleatoire et de plages de nuit : verifie seulement dans la tranche et `routes/admin.ts`.
