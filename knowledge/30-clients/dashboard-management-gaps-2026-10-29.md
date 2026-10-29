---
id: dashboard-management-gaps-2026-10-29
title: Écarts de gestion owner — accès utilisateur, communautés et APK
tags: [dashboard, owner, subscriptions, communities, builds, audit]
status: verified
updated: 2026-10-29
related: [dashboard-launch-audit-2026-10-29, refonte-admin-artifact, livraison-apk-2026-10-26, open-questions]
---

## Verdict

Le dashboard ne permet pas encore à l'owner de « tout gérer ».

## Attribution manuelle d'un accès

- Aucune route admin ni Server Action ne crée, prolonge ou remplace un
  abonnement.
- L'unique `INSERT INTO subscriptions` est dans
  `apps/api/src/services/payments.ts` et suit la confirmation d'un paiement.
- `subscriptions.order_id` est obligatoire et référence une commande : un don
  d'accès ne peut pas être ajouté proprement sans décider sa représentation
  comptable et son audit.
- L'abonné peut demander une réconciliation de sa propre commande par
  `GET /v1/orders/:orderId?refresh=1`; l'owner n'a aucun contrôle équivalent
  dans le tiroir de commande.

Conséquence : si le paiement est réellement confirmé mais l'activation a
échoué, le client peut déclencher la reprise depuis l'app. L'owner ne peut ni
forcer cette réconciliation, ni attribuer gratuitement un forfait depuis le
dashboard.

## Gestion d'une communauté

La page owner `/communities` fournit : liste, création, modification du nom,
commission et contacts WhatsApp, suspension/reprise, ainsi que la file globale
des builds. Elle n'est pas le poste complet demandé par la refonte v2 : pas de
vue synthétique abonnés/ventes/application, pas de navigation de gestion
contextuelle complète et pas d'attribution d'accès à un utilisateur.

La vue communautaire par identifiant fournit bien les onglets Équipe,
Réglages WhatsApp et Journal, mais reste répartie sur les anciennes routes.

## Parcours APK

Le chemin de code est cohérent :

1. community_admin demande un build (`requested`) ;
2. owner approuve ou refuse ; l'approbation passe à `queued` ;
3. l'API déclenche `android-brand.yml` avec une spécification validée ;
4. GitHub Actions injecte la marque, compile et signe ;
5. le callback interne met à jour statut, SHA-256 et URL APK ;
6. le dashboard affiche le résultat et le lien de partage.

Ce chemin est testé côté API et dashboard, mais n'est pas déclaré vérifié de
bout en bout dans cette session. L'historique vérifié du 2026-10-26 montre des
APK compilés et signés, avec publication R2 alors bloquée par l'absence des
secrets R2. L'état actuel des secrets et d'un run réel doit être recontrôlé
avant d'affirmer que le lien final est livré automatiquement.

Vérification fraîche :
`node --test --import tsx test/builds.test.ts test/brand.test.ts` réussit
**35/35** le 2026-10-29. Sont couverts : permissions, demande, approbation,
refus, dispatch unique, échec GitHub, manifeste de marque et callback
idempotent. Ce test utilise des doubles pour GitHub/R2 et ne remplace pas un run
réel de production.

## Audit fonctionnel exhaustif en cours

Méthode retenue : pour chaque écran, suivre la chaîne complète
`contrôle visible -> Server Action -> service dashboard -> route API -> écriture
ou lecture réelle -> permission -> test`. Un bouton ou un test de schéma isolé
ne vaut pas une fonction de gestion terminée.

Premier inventaire relu le 2026-10-29 :

- 19 pages Next.js sont présentes : authentification, compte, accueil,
  administrateurs, communautés, tarifs, onboarding, versements, réseau et
  neuf vues rattachées à une communauté ;
- les actions d'écriture visibles couvrent comptes admin, communautés,
  membres, forfaits, builds, appareils/fichiers hors ligne, versements,
  tarification, onboarding et exploitation réseau ;
- aucune action dashboard ne couvre les abonnements ni la reprise owner d'une
  commande payée non activée ;
- la navigation appelle bien les sections v2, mais conserve plusieurs pages
  techniques séparées : la conformité au principe « une page par sujet »
  doit donc être jugée sur les parcours réels, pas sur les seuls libellés ;
- les comptes administrateurs n'exposent actuellement que l'invitation et la
  réinitialisation du mot de passe : suspension, réactivation ou retrait d'un
  compte plateforme ne figurent ni dans les Server Actions ni dans les routes
  `/v1/admin/admins` inventoriées.

## Correction intégrée : reprise owner d'une activation payée

Le parcours sûr, distinct d'un don d'accès, est maintenant branché :

- `POST /v1/admin/orders/:id/reconcile` recharge la commande et son périmètre ;
- seuls l'owner et le `community_admin` de la communauté peuvent l'appeler ;
- une commande `paid` non activée reprend directement l'activation idempotente ;
- une commande `created` ou `pending` réinterroge le fournisseur avant toute
  activation ;
- l'action est auditée sous `order.reconcile` ;
- le tiroir Commande affiche « Vérifier le paiement » uniquement pour ces
  états et ces rôles, avec retour de succès ou d'erreur.

Preuve fraîche : le test API public `adminDetails.test.ts` passe **17/17** et le
test dashboard ciblé passe **6/6** le 2026-10-29. Le typecheck dashboard passe.
Le typecheck API a d'abord trouvé une propriété d'audit mal nommée (`target` au
lieu de `targetId`) ; elle a été corrigée et doit être rejouée avant verdict
final.

## Correction intégrée : suspension d'un administrateur

L'owner peut maintenant suspendre ou réactiver un compte depuis
`/admins`. La suspension :

- bascule `admin_users.active` à faux ;
- révoque toutes les sessions actives du compte dans la même transaction ;
- est refusée aux non-owner et sur son propre compte ;
- refuse de suspendre le dernier owner actif ;
- écrit `admin.suspend` ou `admin.reactivate` dans l'audit ;
- passe par une confirmation explicite dans le dashboard.

Preuve ciblée : le test public API « owner : suspendre un compte révoque ses
sessions, puis le réactiver » passe. Les typechecks API et dashboard passent
sans sortie après les corrections d'audit.

## Correction intégrée : retrait du Réseau legacy visible

La page `/network` affichait encore les blocs « créneaux de nuit » et leur
historique, en contradiction avec D140 et l'écran Réseau v2 : le trafic de nuit
utilise le même pool illimité, pas une seconde infrastructure artificielle.
Ces deux blocs ont été retirés de la page visible. La page se concentre
désormais sur les serveurs 3x-ui, le pool VLESS et l'exploitation Telegram.
Les anciennes routes et actions de créneaux ne sont pas supprimées dans cette
correction afin de ne pas détruire un historique ou un contrat backend sans
décision explicite.

## Matrice finale de la passe

La matrice écran par écran est écrite dans
`docs/dashboard-audit-fonctionnel-2026-10-29.md`. Verdict consolidé :

- opérables localement : connexion, mot de passe forcé, appareils, fichiers de
  secours, forfaits, commissions en lecture, journal, tarifs, compte ;
- partiels : accueil, abonnés, commandes, versements, communauté/équipe,
  communautés owner, administrateurs, réseau ;
- code APK cohérent mais livraison GitHub/R2 actuelle non vérifiée en réel ;
- absents : attribution gratuite modélisée, présence SSE, équipe plateforme
  et rôles plateforme cumulables complets.

## Vérification finale fraîche

Exécutée le 2026-10-29 après toutes les modifications de cette passe :

- API : `npm test` -> **356/356**, 0 échec ;
- dashboard : `npm test` -> **147/147**, 0 échec ;
- typecheck API et dashboard -> sans erreur ;
- lint dashboard -> code 0, aucune sortie d'erreur ;
- build Next.js -> compilation réussie et **22/22** pages générées ;
- OpenAPI régénéré ; les chemins
  `/v1/admin/orders/{id}/reconcile` et `/v1/admin/admins/{adminId}` y figurent.

Ces résultats valident le code local et les corrections ajoutées. Ils ne
changent pas le verdict produit : les fonctions listées comme absentes ou
partielles restent absentes ou partielles.

## Audit des redirections du parcours v2

Relecture du document `docs/refonte-admin/parcours-admin-bouendji-v2.md` et du
code dashboard le 2026-10-29. Verdict : les gardes de session et de mot de
passe sont cohérentes, mais le cycle onboarding/guide ne respecte pas le flux
spécifié.

Conforme dans le code :

- une route protégée sans cookie redirige vers `/login?next=...` ;
- `next` est borné à un chemin interne par `safeNextPath` ;
- une connexion avec mot de passe temporaire redirige vers `/mot-de-passe` ;
- l'API bloque les autres routes avec `PASSWORD_CHANGE_REQUIRED` et le
  dashboard redirige cette erreur vers `/mot-de-passe` ;
- une session absente ou expirée redirige vers `/login`.

Écarts vérifiés par lecture :

- après le changement forcé, `PasswordChangeForm` fait toujours
  `router.replace("/")` ; il ne choisit pas `/onboarding` pour un nouvel admin,
  contrairement à `MotDePasse -> Onboarding` dans le document ;
- une connexion ultérieure avec onboarding incomplet retourne aussi sur `/`
  (sauf `next` explicite) ; l'accueil montre seulement un bandeau « Reprendre
  l'assistant », il n'y a pas de redirection vers l'étape enregistrée ;
- après la demande de build, le wizard reste sur place : aucune redirection
  vers le guide puis l'accueil, et le guide est fermé par défaut ;
- décalage de contrat : le schéma dashboard/API accepte `step` jusqu'à 5,
  mais `submitStep5` tente d'enregistrer `step: 6`, ignore l'échec puis affiche
  l'étape 6 localement. Après rechargement, l'utilisateur revient à l'étape
  persistée 5 ;
- les tests actuels couvrent les helpers de garde et les endpoints onboarding,
  pas le parcours navigateur complet de redirection.

Statut de cette analyse : `reviewed` par lecture de
`proxy.ts`, `auth.action.ts`, `context.ts`, `password-change-form.tsx`,
`onboarding-wizard.tsx` et des schémas/routes onboarding. Aucun changement de
code effectué dans cette passe d'audit.
