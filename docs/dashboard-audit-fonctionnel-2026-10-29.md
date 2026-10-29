# Audit fonctionnel complet du dashboard — 29 octobre 2026

## Verdict

Le dashboard n'est pas entièrement conforme à la refonte v2 et ne permet pas
encore de tout gérer. Le socle est large et plusieurs parcours sont réellement
opérables, mais des fonctions promises restent absentes ou partielles.

Méthode : une fonction est dite opérable uniquement si la chaîne
`contrôle visible -> Server Action -> service -> route API -> effet réel ->
permission -> test` existe. Un composant visuel ou un schéma isolé ne suffit pas.

## Matrice des écrans

| Écran | Statut | Ce qui fonctionne | Ce qui manque ou reste incertain |
| --- | --- | --- | --- |
| Connexion | Opérable | email ou WhatsApp, session admin, redirection mot de passe | aucun blocage trouvé dans l'audit local |
| Mot de passe forcé | Opérable | changement, rotation de session, autres sessions révoquées | aucun blocage trouvé dans l'audit local |
| Accueil | Partiel | statistiques, file à traiter, activité, application, communautés | les cartes statistiques ne mènent pas toutes aux listes filtrées ; pas de flux temps réel |
| Abonnés | Partiel | recherche, fiche, abonnement actif, consommation, appareils, commandes, secours | pas de filtres actif/expiré/quota/famille ; liste centrée sur les comptes ; pas de bouton WhatsApp ; pas d'attribution gratuite |
| Appareils | Opérable | liste, fiche, révocation, émission d'un fichier `.bvpn` | tunnel réel non prouvé par ces tests dashboard |
| Commandes | Partiel corrigé | liste, fiche, chronologie, liens croisés, nouvelle reprise de paiement/activation | pas de remboursement owner dans le dashboard ; accès gratuit volontaire non modélisé |
| Fichiers de secours | Opérable | historique, état, expiration, lien appareil | ouverture réelle sur Pixel hors de cet audit dashboard |
| Forfaits | Opérable | création, modification, duplication, activation, familles, nuits, illimité, plancher | ventes mensuelles par forfait non affichées dans la liste |
| Application / builds | Code opérable, livraison externe non vérifiée | marque, aperçu, QR/lien, demande, validation/refus owner, historique | dernier état vérifié : publication R2 bloquée sans secrets ; aucun run réel courant prouvé |
| Commissions | Opérable | soldes et liste, liens commande | pas de temps réel |
| Versements | Partiel | préparer, approuver, payer, confirmer, trancher, audit d'état | virement Fapshi réel non branché selon le document v2 |
| Communauté · Équipe/Réglages | Partiel | ajouter, changer le rôle, retirer/réactiver, nom et WhatsApp | pas de présence réelle ; numéro de versement absent ; écrans encore dispersés |
| Communauté · Journal | Opérable en lecture | liste filtrable des actions | navigation universelle vers chaque type de cible non prouvée pour toutes les actions |
| Plateforme · Communautés | Partiel | créer, modifier, suspendre, reprendre, entrer dans la communauté, file builds | tableau sans abonnés actifs, ventes du mois ni état synthétique de l'app |
| Plateforme · Administrateurs | Partiel corrigé | inviter, mot de passe provisoire, réinitialiser, suspendre/réactiver avec révocation de sessions | présence affichée fictivement sauf soi ; pas de rôles plateforme cumulables owner/réseau ; pas d'équipe plateforme |
| Plateforme · Tarifs | Opérable | coûts, marges, plafonds, calculs de plancher | confirmation de l'impact sur les forfaits à revalider en navigateur |
| Onboarding | Code opérable | profil, communauté, marque, logo, forfait, récapitulatif, demande APK, reprise d'étape | livraison APK finale dépend du pipeline externe non prouvé |
| Réseau | Partiel, legacy visible retiré | pool VLESS, santé/statut/retrait, ajout manuel, purge, 3x-ui ajout/test/suppression, Telegram | modification/activation d'un serveur 3x-ui non complète ; anciens blocs de créneaux retirés selon D140 |
| Mon compte | Opérable | profil, mot de passe, sessions, apparence | aucun blocage trouvé dans l'audit local |

## Fonctions owner ajoutées pendant cette revue

### Reprendre un paiement ou une activation

Le tiroir Commande propose désormais **Vérifier le paiement** pour une
commande `created`, `pending`, ou `paid` non activée. Le backend :

- recharge la commande et sa communauté depuis la base ;
- autorise uniquement l'owner ou le `community_admin` concerné ;
- interroge le fournisseur avant d'activer une commande en attente ;
- reprend directement l'activation idempotente d'une commande déjà payée ;
- journalise `order.reconcile`.

Cette fonction ne crée pas un forfait gratuit.

### Suspendre ou réactiver un administrateur

La page Administrateurs permet maintenant de suspendre et réactiver un compte.
La suspension révoque toutes ses sessions dans la même transaction. L'API
interdit l'auto-suspension et la suspension du dernier owner actif, puis écrit
`admin.suspend` ou `admin.reactivate` dans l'audit.

### Retrait du Réseau legacy

Les blocs visibles « créneaux de nuit » et « historique des créneaux » ont
été retirés de `/network`. Ils contredisaient D140 : le trafic nocturne
utilise le même pool illimité. Les routes historiques n'ont pas été détruites.

## Manques prioritaires restants

1. Décider et implémenter l'accès manuel gratuit : source comptable, durée,
   commande ou motif, commission, audit et renouvellement.
2. Remplacer la fausse présence par le flux SSE prévu et les vrais
   `lastSeenAt`.
3. Terminer l'équipe plateforme et les rôles cumulables owner/réseau.
4. Ajouter les filtres métier des abonnés et le bouton WhatsApp.
5. Transformer `/communities` en poste owner synthétique avec abonnés, ventes
   du mois et état de l'application.
6. Vérifier un run GitHub Actions + publication R2 réel avant d'annoncer que
   le parcours APK est terminé.
7. Brancher le virement Fapshi réel ou afficher clairement qu'il s'agit d'une
   transition manuelle.

## Preuves locales de cette passe

- API `adminDetails.test.ts` : **17/17** après ajout de la reprise d'activation.
- Dashboard `orders-subscribers.test.ts` : **6/6**.
- Test ciblé suspension/réactivation admin : **1/1**.
- Typecheck API et dashboard : sans erreur après correction.
- Suites complètes finales : API **356/356**, dashboard **147/147**.
- ESLint dashboard : code 0.
- Build Next.js : compilation réussie, **22/22** pages générées.
- OpenAPI régénéré avec les deux nouvelles routes d'administration.

Ces preuves ne remplacent ni un test navigateur de tous les rôles ni un run
externe GitHub/R2/Fapshi.
