1. Cadre
2. [Ce qui change](#principes)
3. [Rôles et droits](#roles)
4. [Données et liens](#entites)
5. Parcours admin
6. [Cycle de vie d'un admin](#cycle)
7. [Mot de passe forcé](#motdepasse)
8. [Onboarding et marque](#onboarding)
9. [Prix plancher](#prix)
10. [Guide par rôle](#guide)
11. [Demande d'application](#build)
12. [Aider un abonné](#support)
13. [Argent](#argent)
14. [Présence (owner)](#presence)
15. Parcours abonné
16. [Paiement et forfait limité](#paiement)
17. [Illimité de nuit et Telegram](#nuit)
18. [Écrans de l'app](#appli)
19. Écrans
20. [Navigation entre écrans](#navigation)
21. [Charpente](#shell)
22. [Écran par écran](#ecrans)
23. Technique
24. [Cache et temps réel](#cache)
25. [Changements d'API](#api)
26. [Questions ouvertes](#questions)

Refonte du dashboard · version à valider · 26 octobre 2026

# Parcours admin Bouendji

Chaque admin de communauté crée lui-même sa marque pendant son onboarding et demande son application. L'owner valide, la pipeline construit l'APK et le dépose sur R2. Ce document décrit toutes les actions, de quel écran elles partent, quel composant les porte et quelle route API elles appellent.

**Règles de conception**

- Une page par sujet, jamais une page par route API. Le détail s'ouvre en tiroir, les actions en dialogue.
- Tout nom affiché (abonné, appareil, commande, forfait, versement) est cliquable et ouvre sa fiche. On passe d'une donnée à l'autre sans revenir en arrière.
- L'état d'un tiroir est dans l'URL (`?abonne=…`) : le bouton Retour le ferme et le lien peut être partagé.
- Pas d'email. Le contact passe par WhatsApp (groupe et numéro de l'admin).
- Une page déjà visitée s'affiche tout de suite depuis le cache. Les changements arrivent par un flux d'événements, sans polling.

Sheet composant shadcn déjà dans le kitStepper composant à ajouterGET /v1/… route API

## Rôles et droits

Relevé dans `permitted()` de `apps/api/src/routes/admin.ts`, avec les ajouts demandés (marque en libre-service, validation des builds par l'owner).

| Action | Owner | Réseau nouveau | Admin de communauté | Support | Finance |
| --- | --- | --- | --- | --- | --- |
| Inviter un admin de communauté | oui | non | non | non | non |
| Attribuer les rôles plateforme (owner, réseau) | oui | non | non | non | non |
| Fixer le coût de base du Go et les marges | oui nouveau | non | non | non | non |
| Créer sa communauté et son application (onboarding) | oui | non | oui, une seule nouveau | non | non |
| Modifier WhatsApp, nom, couleur, logo | oui | non | oui | non | non |
| Demander un build | oui | non | oui nouveau | non | non |
| Valider ou refuser un build | oui nouveau | non | non | non | non |
| Créer et modifier les forfaits (au-dessus du prix plancher) | oui | non | oui | non | non |
| Gérer l'équipe (support, finance) | oui | non | oui | non | non |
| Voir abonnés et appareils | oui | non | oui | oui | non |
| Révoquer un appareil, émettre un fichier de secours | oui | non | oui | oui | non |
| Voir commandes et commissions | oui | non | oui | non | oui |
| Préparer un versement | oui | non | oui | non | oui |
| Approuver, payer, confirmer un versement | oui | non | non | non | non |
| Recevoir les rappels Telegram de déploiement | oui | oui | non | non | non |
| Déployer les serveurs de nuit, déclarer un nœud | oui | oui | non | non | non |
| VM 3x-ui du jour, santé des nœuds | oui | oui | non | non | non |
| Voir qui est connecté | oui nouveau | non | son équipe | non | non |
| Changer son mot de passe, ses sessions | oui | oui | oui | oui | oui |

Les rôles plateforme se cumulent : une même personne peut être owner et réseau. Le rôle Réseau ne voit ni l'argent ni les abonnés ; il n'a que l'espace Réseau.

## Données et liens

Chaque flèche est un lien cliquable dans le dashboard. Exemple : dans le tiroir d'une commande, le nom de l'abonné ouvre son tiroir, et le forfait ouvre le tiroir du forfait.

```
flowchart LR
  C["Communauté"] --> A["Application"]
  C --> T["Équipe"]
  C --> J["Journal"]
  A --> P["Forfaits"]
  A --> B["Builds APK"]
  P --> O["Commandes"]
  O --> U["Abonné"]
  U --> S["Abonnement"]
  S --> X["Client 3x-ui"]
  U --> D["Appareils"]
  D --> F["Fichiers de secours"]
  O --> K["Commissions"]
  K --> V["Versements"]
  U --> O
  
```

| Donnée | Ce qu'on voit | S'ouvre en | Liens vers |
| --- | --- | --- | --- |
| Communauté | nom, lien du groupe WhatsApp, numéro WhatsApp, commission, statut | page Communauté | application, équipe, journal |
| Application | nom, couleur, logo, aperçu téléphone, version, lien d'installation, QR code | onglet Offres › Application | builds, forfaits |
| Forfait | famille (Limité / Limité + nuit), quota, durée, appareils, prix par plage, ventes | Sheet tiroir Forfait | commandes de ce forfait |
| Abonné | nom, téléphone, forfait, data consommée et restante, échéance, plage de nuit | Sheet tiroir Abonné | appareils, commandes, fichiers de secours |
| Appareil | modèle, version de l'app, dernière activité, statut, dernier serveur | Sheet tiroir Appareil | abonné, fichiers de secours |
| Commande | montant, forfait, option de nuit, statut Fapshi, commission | Sheet tiroir Commande | abonné, forfait, commission |
| Versement | montant, commissions incluses, état, historique des étapes | Sheet tiroir Versement | commissions, commandes |
| Demande de build | manifeste, aperçu, demandeur, état, motif de refus | Sheet tiroir Build | application, communauté |

## Cycle de vie d'un admin de communauté

```
stateDiagram-v2
  [*] --> Invite: l'owner crée le compte
  Invite --> MotDePasse: première connexion
  MotDePasse --> Onboarding: mot de passe changé
  Onboarding --> Onboarding: étape enregistrée, reprise possible
  Onboarding --> Guide: application créée et build demandé
  Guide --> Actif: guide terminé ou passé
  Actif --> Guide: rouvre le guide depuis le menu Aide
  Actif --> Actif: gère sa communauté
  Actif --> Suspendu: l'owner suspend
  Suspendu --> Actif: l'owner réactive
  
```

Un admin qui quitte l'onboarding en cours route le retrouve à sa prochaine connexion, à l'étape où il s'est arrêté.

## Mot de passe forcé

Concerne tous les admins créés avec un mot de passe temporaire, y compris ceux déjà connectés en production : à leur prochaine requête, ils sont redirigés.

```
sequenceDiagram
  autonumber
  actor Ad as Admin
  participant N as Dashboard Next.js
  participant API as API Fastify
  participant DB as Postgres
  Ad->>N: ouvre le dashboard, session déjà ouverte
  N->>API: GET /v1/admin/me
  API->>DB: lit must_change_password
  API-->>N: mustChangePassword vrai
  N-->>Ad: redirection vers Changer le mot de passe, toute autre page bloquée
  Ad->>N: actuel, nouveau, confirmation
  N->>N: 12 caractères minimum, confirmation identique, différent de l'actuel
  N->>API: POST /v1/admin/me/password
  API->>DB: vérifie l'actuel, enregistre le nouveau hash
  API->>DB: indicateur levé, toutes les autres sessions révoquées
  API-->>N: nouveau jeton de session
  N-->>Ad: toast Mot de passe changé, puis onboarding ou accueil
  
```

| Zone | Composant | Comportement |
| --- | --- | --- |
| Page plein écran | Card | pas de barre de navigation : rien d'autre n'est accessible |
| Trois champs | Field InputGroup | bouton œil pour afficher, jauge de force sous « nouveau », erreur sous le champ fautif |
| Bouton Enregistrer | Button Spinner | désactivé tant que la confirmation diffère ; mot de passe actuel faux : erreur sur le premier champ |
| Confirmation | Sonner | toast « Mot de passe changé. Tes autres sessions ont été déconnectées. » |

## Onboarding et création de la marque

L'owner ne fait qu'inviter. Tout le reste est fait par l'admin de communauté, dans un assistant en six étapes. Chaque étape est enregistrée dès qu'on clique sur Continuer. Un admin a une seule application. La page de paiement que verront les abonnés est dans l'app, au thème choisi ici.

```
sequenceDiagram
  autonumber
  actor Ow as Owner
  actor Ad as Admin de communauté
  participant N as Dashboard
  participant API as API
  participant W as WhatsApp
  Ow->>N: Plateforme, Admins, bouton Inviter
  N->>API: POST /v1/admin/admins, nom et identifiant
  API-->>N: mot de passe temporaire, affiché une seule fois
  Ow->>W: bouton Envoyer sur WhatsApp, identifiants et lien du dashboard
  Ad->>N: connexion par email ou numéro WhatsApp, puis mot de passe forcé
  N-->>Ad: assistant Bienvenue, étape 1 sur 6
  Ad->>N: 1 Profil, numéro WhatsApp facultatif, cartes qui expliquent son usage
  N->>API: PATCH /v1/admin/me
  Ad->>N: 2 Communauté, nom, lien du groupe WhatsApp, numéro de contact
  N->>API: POST /v1/admin/onboarding/community
  Ad->>N: 3 Application, nom, couleur, logo, aperçu du téléphone en direct
  N->>API: POST /v1/admin/apps
  Ad->>N: 4 Forfaits à partir des modèles
  N->>API: GET /v1/admin/pricing/floor
  API-->>N: prix plancher par Go et par plage de nuit
  N-->>Ad: indicateur de prix, coût, marge, gain par vente
  N->>API: POST /v1/admin/apps/:appId/plans, un appel par forfait
  Ad->>N: 5 Équipe, facultatif, support et finance
  N->>API: POST /v1/admin/communities/:id/memberships
  Ad->>N: 6 Récapitulatif puis Demander mon application
  N->>API: POST /v1/admin/apps/:appId/build-requests
  API-->>N: demande en attente de validation
  N-->>Ad: guide de prise en main, puis accueil avec la carte Ton application est en attente
  
```

| Étape | Composants | Ce que l'admin fait | Contrôles |
| --- | --- | --- | --- |
| Cadre | Stepper Card Button | avance, recule, quitte (« Continuer plus tard ») | étape suivante bloquée tant que l'étape est invalide |
| 1 · Profil | Card InputGroup Button | numéro WhatsApp, facultatif ; trois cartes expliquent à quoi il sert : se connecter sans email, être contacté par ses abonnés, recevoir le lien de son application | numéro à 9 chiffres après +237 ; bouton Passer |
| 2 · Communauté | Field Input InputGroup | nom ; lien du groupe WhatsApp ; numéro de contact affiché dans l'app (prérempli avec celui du profil) | lien en `chat.whatsapp.com/…` ; bouton Tester qui ouvre le lien |
| 3 · Application | Input ToggleGroup Dropzone PhonePreview | nom affiché, couleur parmi les thèmes, logo ; l'aperçu du téléphone change en direct | logo carré, PNG ou SVG, 1 Mo maximum ; identifiant de paquet calculé et affiché, non modifiable |
| 4 · Forfaits | Item Sheet Switch Select PriceIndicator | part de deux modèles (Limité, Limité + nuit), ajuste quota, durée, appareils, prix de chaque plage ; l'indicateur montre en direct le prix plancher, sa marge et son gain par vente | au moins un forfait actif ; prix en FCFA, entier, jamais sous le plancher |
| 5 · Équipe | Item Dialog Select | ajoute un support ou une finance, ou passe | facultatif |
| 6 · Récapitulatif | Card PhonePreview AlertDialog | relit tout, chaque bloc a un lien Modifier qui ramène à son étape ; envoie la demande | confirmation : « Ta demande part chez l'administrateur de la plateforme. » |

## Prix plancher et indicateur de prix

La plateforme achète la data. L'owner saisit le coût de base d'un Go, le coût d'une plage de nuit et la marge de la plateforme. Il en sort un prix plancher. L'admin de communauté fixe ses prix au-dessus, aidé par l'indicateur.

```
flowchart LR
  CG["Coût de base du Go, fixé par l'owner"] --> PL["Prix plancher du forfait"]
  CN["Coût d'une plage de nuit, fixé par l'owner"] --> PL
  MG["Marge plateforme, fixée par l'owner"] --> PL
  QT["Quota et plage choisis par l'admin"] --> PL
  PL --> IND["Indicateur de prix"]
  PA["Prix saisi par l'admin"] --> IND
  IND --> OK{"Prix au-dessus du plancher ?"}
  OK -->|"oui"| GN["Affiche le gain par vente et par mois estimé"]
  OK -->|"non"| ER["Bloque l'enregistrement et propose le plancher"]
  
```

| Zone | Composants | Ce qui s'affiche | Interaction |
| --- | --- | --- | --- |
| Côté owner : Plateforme › Tarifs | Field InputGroup AlertDialog | coût du Go, coût par plage de nuit, marge plateforme, date d'effet | Enregistrer ; confirmation qui indique combien de forfaits passent sous le nouveau plancher |
| Côté admin : tiroir Forfait | PriceIndicator Tooltip | barre : coût, marge plateforme, sa part ; prix plancher ; gain par vente | se met à jour à chaque frappe ; bouton « Utiliser le plancher » ; info-bulles qui expliquent chaque montant |
| Forfait sous le plancher après un changement de tarif | Alert Badge | forfait marqué « sous le plancher », masqué dans l'app jusqu'à correction | lien Corriger qui ouvre le tiroir |

## Guide par rôle

Après l'onboarding, puis à tout moment depuis le menu Aide. Chaque étape met en surbrillance la vraie zone de l'écran et explique un cas réel tiré de `knowledge/`.

```
flowchart TB
  G["Guide, ouvert après l'onboarding ou depuis Aide"] --> R{"Rôle de la personne"}
  R -->|"Admin de communauté"| A1["Partager le lien de l'application"]
  A1 --> A2["Lire l'accueil et la liste À traiter"]
  A2 --> A3["Retrouver un abonné avec Ctrl K"]
  A3 --> A4["Quota épuisé, que voit l'abonné"]
  A4 --> A5["Aucun serveur ne passe, émettre un fichier de secours"]
  A5 --> A6["Changer un prix sans casser les ventes"]
  A6 --> A7["Préparer un versement"]
  R -->|"Support"| S1["Retrouver un abonné"]
  S1 --> S2["Révoquer un appareil perdu"]
  S2 --> S3["Émettre un fichier de secours"]
  R -->|"Finance"| F1["Lire les commissions"]
  F1 --> F2["Préparer un versement et suivre ses états"]
  R -->|"Réseau"| N1["Répondre au rappel Telegram"]
  N1 --> N2["Déployer un nœud de nuit"]
  N2 --> N3["Vérifier qu'il est actif"]
  R -->|"Owner"| O1["Valider une demande d'application"]
  O1 --> O2["Régler les tarifs"]
  O2 --> O3["Approuver et payer un versement"]
  
```

| Élément | Composants | Comportement |
| --- | --- | --- |
| Bulle d'étape | Tour Card | pointe la zone réelle ; Suivant, Précédent, Passer ; progression « 3 sur 7 » |
| Centre d'aide | Sheet Item Collapsible | liste des cas par rôle, chaque cas se rejoue ; recherche |
| Reprise | Badge | étape mémorisée côté serveur, reprise sur un autre appareil |

## Demande d'application et pipeline

```
stateDiagram-v2
  [*] --> Brouillon
  Brouillon --> Demande: l'admin envoie la demande
  Demande --> Refuse: l'owner refuse avec un motif
  Refuse --> Brouillon: l'admin corrige
  Demande --> EnCours: l'owner valide, pipeline lancée
  EnCours --> Publie: callback CI, APK sur R2
  EnCours --> Echec: callback CI en erreur
  Echec --> EnCours: l'owner relance
  Publie --> Demande: nouvelle version demandée
  
```

```
sequenceDiagram
  autonumber
  actor Ad as Admin
  participant API as API
  participant TG as Telegram
  actor Ow as Owner
  participant GH as GitHub Actions
  participant R2 as Cloudflare R2
  Ad->>API: demande de build avec le manifeste de la marque
  API->>TG: alerte Nouvelle demande pour la marque
  API-->>Ow: ligne dans Accueil, À traiter
  Ow->>API: ouvre le tiroir de la demande, manifeste et aperçu
  alt refus
    Ow->>API: refuse avec un motif
    API-->>Ad: notification et motif, retour en brouillon
  else validation
    Ow->>API: valide
    API->>GH: workflow_dispatch android-brand avec spec et callback
    GH->>GH: réécrit BrandTokens, compile, signe
    GH->>R2: dépose l'APK sous brands, package
    GH->>API: POST /v1/internal/builds/:id/callback
    API-->>Ad: APK prêt, lien d'installation et QR code
  end
  
```

La pipeline `.github/workflows/android-brand.yml` existe mais n'a jamais été lancée de bout en bout. Le bouton Valider ne sera branché qu'après un premier build réussi à la main.

## Aider un abonné

```
sequenceDiagram
  autonumber
  actor U as Abonné
  participant App as App Android
  participant W as WhatsApp
  actor S as Admin ou support
  participant N as Dashboard
  participant API as API
  U->>App: aucun serveur ne répond au ping
  App-->>U: bouton Demander de l'aide, ouvre le WhatsApp de l'admin
  U->>W: message avec le code d'appareil copié par l'app
  S->>N: Ctrl K, colle le code ou le numéro
  N-->>S: tiroir Abonné, forfait, conso, appareils, commandes
  S->>N: clic sur l'appareil, tiroir Appareil
  S->>N: Émettre un fichier de secours, confirmation
  N->>API: POST /v1/admin/devices/:id/offline-bundles
  API-->>N: fichier scellé pour cet appareil seulement
  S->>W: envoie le fichier
  U->>App: ouvre le fichier
  App->>App: vérifie signature, appareil, date, usage unique
  App->>API: POST /v1/offline-bundles/:id/consumed
  
```

**Pourquoi ce fichier ne se lit pas comme un fichier NPV Tunnel**

Un fichier NPV Tunnel est chiffré avec une clé cachée dans l'app : qui extrait la clé lit tous les fichiers. Ici, le contenu est chiffré pour la clé de l'appareil destinataire, qui ne sort jamais du Keystore Android. Il est signé, valable peu de temps et utilisable une fois. Sans le téléphone de l'abonné, il ne s'ouvre pas. Risque restant : un téléphone rooté pendant la connexion. Vérifié en lisant le code ; pas encore testé sur un téléphone.

## Argent : commissions et versements

```
stateDiagram-v2
  [*] --> Prepare: l'admin ou la finance prépare
  Prepare --> Approuve: l'owner approuve
  Approuve --> Envoye: l'owner exécute le virement Fapshi
  Envoye --> Confirme: l'admin confirme la réception
  Envoye --> Ambigu: statut Fapshi incertain
  Ambigu --> Confirme: l'owner tranche
  Ambigu --> Annule: l'owner tranche
  Confirme --> [*]
  
```

Le montant d'un versement est toujours la somme des commissions disponibles ; personne ne le saisit. Le virement réel (`fapshi.payout()`) n'est pas encore branché.

## Présence : qui est connecté

```
sequenceDiagram
  participant B1 as Navigateur admin
  participant API as API
  participant B2 as Navigateur owner
  B1->>API: ouvre le flux d'événements
  API->>API: marque l'admin en ligne
  API-->>B2: événement présence, admin en ligne
  B1--xAPI: onglet fermé, flux coupé
  API->>API: hors ligne après 60 s sans flux
  API-->>B2: événement présence, vu à 14 h 32
  
```

Dans Plateforme › Admins, chaque ligne a une pastille (en ligne, hors ligne) et « vu il y a… ». La même pastille apparaît sur les membres de l'équipe d'une communauté.

## Paiement et forfait limité

```
sequenceDiagram
  autonumber
  actor U as Abonné
  participant App as App Android
  participant API as API
  participant F as Fapshi
  participant X as 3x-ui sur VM GCP
  U->>App: Forfaits, choisit Limité 10 Go et la plage 20h-4h
  App->>API: GET /v1/apps/:appId/plans
  App-->>U: page de paiement, récapitulatif et prix total
  U->>App: Payer
  App->>API: POST /v1/orders avec forfait, révision et plage
  API-->>App: lien de paiement
  App->>F: paiement mobile money
  F->>API: webhook, revérifié chez Fapshi
  API->>X: crée le client dédié, quota et échéance
  API->>API: abonnement actif, commission figée
  App->>API: GET /v1/configuration-bundles/current
  API-->>App: bundle scellé, client dédié et serveurs de nuit
  loop toutes les 10 minutes, côté serveur
    API->>X: lit le trafic du client
    API->>API: enregistre consommé et restant
  end
  X->>X: quota atteint, client désactivé
  App->>API: GET /v1/me/subscription
  API-->>App: quota épuisé
  App-->>U: écran Data épuisée et bouton Racheter
  
```

## Illimité de nuit

Un serveur illimité vit 4 h. Un déploiement à 20 h, un second à minuit. L'abonné choisit 20 h-24 h, 24 h-4 h ou 20 h-4 h au moment du paiement. Le déploiement est fait à la main sur Google Cloud par un owner ou un membre Réseau, sur rappel du bot Telegram envoyé à chacun d'eux.

```
sequenceDiagram
  participant API as API
  participant TG as Bot Telegram
  actor R as Owner ou membre Réseau
  participant GC as Google Cloud Run
  participant CR as Nœud illimité
  participant App as App
  Note over API,App: 19 h 45
  API->>TG: rappel, déployer le nœud de 20 h
  TG-->>R: message aux deux owners et aux membres Réseau
  R->>GC: déploie le service
  GC->>CR: démarre le nœud A, nom généré au hasard
  CR->>API: register puis ready
  API->>TG: nœud A actif, merci
  API->>API: pool de nuit égal à A
  App->>API: synchronise le bundle, plages 20h-24h et 20h-4h
  Note over API,App: 23 h 45
  API->>TG: rappel, déployer le nœud de minuit
  R->>GC: déploie le service
  GC->>CR: démarre le nœud B
  CR->>API: register puis ready
  API->>API: pool de nuit égal à B, A expire à minuit
  App->>API: synchronise le bundle, plages 24h-4h et 20h-4h
  Note over API,App: 4 h
  API-->>App: plus de serveur de nuit, retour au quota de jour
  
```

```
stateDiagram-v2
  [*] --> APrevoir: créneau du soir
  APrevoir --> Rappele: rappel Telegram 15 min avant
  Rappele --> Deploye: un membre déploie
  Rappele --> EnRetard: aucun nœud à l'heure
  EnRetard --> Deploye: un membre déploie
  EnRetard --> EnRetard: relance Telegram toutes les 5 min
  Deploye --> Actif: register et ready reçus
  Actif --> Expire: 4 h écoulées
  Expire --> [*]
  
```

Le bot existe déjà dans l'API (`services/telegram.ts`), mais n'envoie qu'à un seul destinataire. Il faut accepter plusieurs ID, puis le tester de bout en bout avec ton jeton de bot et les ID des owners et des membres Réseau.

## Écrans de l'app Android touchés

| Écran | Ce qui s'affiche | Actions |
| --- | --- | --- |
| Pop-up de bienvenue | « Bienvenue sur \<nom de l'app> », logo de la marque, au premier lancement | Rejoindre le groupe WhatsApp ; Écrire à l'admin ; Plus tard |
| Accueil | bouton de connexion ; forfait limité : jauge consommé / restant et échéance ; plage de nuit active ou prochaine | Se connecter ; bouton Activité ; Racheter si épuisé |
| Feuille Activité | débit en direct (graphe download et upload), data reçue et envoyée de la session, durée, data restante | glisser pour fermer |
| Forfaits | familles Limité et Limité + nuit, quota, durée, appareils | Choisir |
| Page de paiement | récapitulatif ; choix de la plage (20 h-24 h, 24 h-4 h, 20 h-4 h) ; prix qui se met à jour | Payer |
| Serveurs | serveurs de jour et de nuit avec ping, serveur en cours | Choisir ; Tester ; Demander de l'aide (WhatsApp) si aucun ne répond |
| Data épuisée | quota consommé, date de fin | Racheter un forfait |

## Navigation entre écrans

Les rectangles sont des pages, les formes arrondies des tiroirs, les losanges des dialogues de confirmation.

```
flowchart TB
  H["Accueil"] -->|"ligne À traiter"| TB(["Tiroir Build"])
  H -->|"ligne À traiter"| TC(["Tiroir Commande"])
  H -->|"chiffre Abonnés actifs"| AB["Abonnés"]
  H -->|"carte onboarding"| WZ["Assistant"]
  AB -->|"clic sur une ligne"| TU(["Tiroir Abonné"])
  AB -->|"onglet Appareils"| TD(["Tiroir Appareil"])
  AB -->|"onglet Commandes"| TC
  TU -->|"appareil"| TD
  TU -->|"commande"| TC
  TC -->|"abonné"| TU
  TC -->|"forfait"| TP(["Tiroir Forfait"])
  TD -->|"Révoquer"| R{"Confirmer la révocation"}
  TD -->|"Émettre"| E{"Fichier de secours"}
  OF["Offres"] -->|"clic forfait"| TP
  OF -->|"onglet Application"| AP["Application et builds"]
  AP -->|"Demander une version"| TB
  AR["Argent"] -->|"commission"| TC
  AR -->|"versement"| TV(["Tiroir Versement"])
  TV -->|"Approuver ou Payer"| PV{"Confirmer le versement"}
  CK["Recherche Ctrl K"] --> TU
  CK --> TD
  CK --> TC
  
```

## Charpente

| Zone | Desktop | Mobile | Composants |
| --- | --- | --- | --- |
| Navigation | barre latérale : Accueil, Abonnés, Offres, Argent, Communauté ; groupe Plateforme et Réseau pour l'owner ; le rôle Réseau seul ne voit que Réseau et Mon compte | barre basse à 5 entrées : Accueil, Abonnés, Offres, Argent, Plus ; pour le rôle Réseau seul : Ce soir, Jour, Historique, Compte | Sidebar BottomBar |
| Plus (mobile) | — | feuille avec deux groupes : Communauté (réglages, équipe, journal) et Plateforme (owner) | Drawer Item |
| En-tête | titre de la page, recherche, sélecteur de communauté (owner), menu du compte | titre, icône recherche, avatar ; ne répète jamais la barre basse | Breadcrumb Command DropdownMenu Avatar |
| Onglets de page | sous le titre | sous le titre, défilant horizontalement | Tabs |
| Tiroirs | panneau à droite, 480 px | feuille par le bas, 90 % de la hauteur | Sheet Drawer |
| Confirmations | toute action irréversible (révoquer, émettre, valider, payer) | AlertDialog |  |
| Retour d'action | toast avec le résultat et, si utile, « Annuler » ou « Voir » | Sonner |  |
| États vides | phrase qui dit quoi faire et bouton d'action | Empty |  |

## Écran par écran

### Accueil

tous les rôles, contenu selon le rôle

| Bloc | Composants | Contenu | Clic | API |
| --- | --- | --- | --- | --- |
| Carte onboarding | Card Item | étapes restantes ou état de la demande d'application | ouvre l'assistant à la bonne étape | GET /v1/admin/onboarding |
| Chiffres du jour | Card | ventes, abonnés actifs, data consommée, commissions disponibles | chaque chiffre ouvre la liste filtrée | GET /v1/admin/communities/:id/summary |
| À traiter | Item Badge | paiements en attente, demandes de build (owner), versements à approuver, appareils en échec | ouvre le tiroir de la ligne | même résumé |
| Activité récente | Item | dernières commandes, inscriptions, révocations | ouvre le tiroir concerné | GET /v1/admin/audit-log |
| Partager l'app | Card Button | lien d'installation et QR code | copier ; envoyer sur WhatsApp | GET /v1/admin/apps/:id/builds |

### Abonnés

admin, support · onglets Abonnés · Appareils · Commandes · Secours

| Bloc | Composants | Contenu | Clic | API |
| --- | --- | --- | --- | --- |
| Barre d'outils | InputGroup ToggleGroup DropdownMenu | recherche ; filtres actif, expiré, quota épuisé ; famille de forfait | filtre la liste, filtres gardés dans l'URL | — |
| Liste des abonnés | Table (cartes en mobile) | nom, téléphone, forfait, jauge de data, échéance, nombre d'appareils | ligne : tiroir Abonné | GET …/users |
| Tiroir Abonné | Sheet Tabs | Résumé (forfait, jauge, plage de nuit) · Appareils · Commandes · Secours | chaque ligne ouvre son tiroir ; bouton WhatsApp | GET /v1/admin/users/:id |
| Tiroir Appareil | Sheet AlertDialog | modèle, version, dernière activité, dernier serveur, statut | Révoquer ; Émettre un fichier de secours ; lien vers l'abonné | POST …/revoke POST …/offline-bundles |
| Tiroir Commande | Sheet | montant, forfait, plage, statut Fapshi, commission, chronologie | Vérifier le paiement ; liens abonné et forfait | GET /v1/admin/orders/:id |
| Onglet Secours | Table | fichiers émis, par qui, consommé ou non, expiration | ligne : tiroir Appareil | GET /v1/admin/offline-bundles |

### Offres

admin · onglets Forfaits · Application

| Bloc | Composants | Contenu | Clic | API |
| --- | --- | --- | --- | --- |
| Liste des forfaits | Item Switch Badge | famille, quota, durée, prix, ventes du mois, actif | ligne : tiroir Forfait ; interrupteur : activer ou désactiver | GET/POST …/plans |
| Tiroir Forfait | Sheet Field Select ToggleGroup | nom, famille, quota en Go, durée, appareils, prix de jour, prix de chaque plage de nuit, badge | Enregistrer ; Dupliquer ; Désactiver | PATCH /v1/admin/plans/:id |
| Application | Card PhonePreview | nom, couleur, logo, aperçu, version publiée, lien et QR code | Modifier la marque ; Demander une nouvelle version | GET/POST …/builds |
| Historique des builds | Table Badge | version, état, date, motif de refus | ligne : tiroir Build | idem |

### Argent

admin, finance, owner · onglets Commissions · Versements

| Bloc | Composants | Contenu | Clic | API |
| --- | --- | --- | --- | --- |
| Solde | Card | disponible, en attente, déjà versé | Préparer un versement | GET …/commissions |
| Commissions | Table | commande, montant, taux, état | ligne : tiroir Commande | idem |
| Versements | Table Badge | montant, état, date | ligne : tiroir Versement | GET /v1/admin/payouts |
| Tiroir Versement | Sheet AlertDialog | étapes horodatées, commissions incluses | Approuver, Payer, Confirmer, Trancher selon rôle et état | POST …/approve …/pay …/confirm …/resolve |

### Communauté

admin · onglets Réglages · Équipe · Journal

| Bloc | Composants | Contenu | Clic | API |
| --- | --- | --- | --- | --- |
| Réglages | Field InputGroup | nom, lien du groupe WhatsApp, numéro WhatsApp, numéro de versement | Enregistrer ; Tester le lien | PATCH /v1/admin/communities/:id |
| Équipe | Item Avatar Dialog | membres, rôle, pastille en ligne | Ajouter ; changer le rôle ; Retirer | …/memberships |
| Journal | Table | qui a fait quoi, quand | ligne : tiroir de l'objet concerné | GET /v1/admin/audit-log |

### Plateforme

owner · onglets Admins · Communautés · Demandes de build · Tarifs · Équipe plateforme

| Bloc | Composants | Contenu | Clic | API |
| --- | --- | --- | --- | --- |
| Admins | Table Avatar Badge | nom, communauté, en ligne ou vu il y a…, onboarding terminé ou étape | Inviter (Dialog) ; Réinitialiser le mot de passe ; Suspendre | GET/POST /v1/admin/admins |
| Communautés | Table | marque, abonnés, ventes du mois, état de l'app | ligne : ouvre la communauté avec le sélecteur | GET /v1/admin/communities |
| Demandes de build | Table Sheet AlertDialog | marque, demandeur, date, état | tiroir : Valider ; Refuser avec motif ; Relancer | POST …/build-requests/:id/approve |
| Tarifs | Field AlertDialog | coût du Go, coût par plage de nuit, marge plateforme | voir « Prix plancher » | GET/PUT /v1/admin/pricing/floor |
| Équipe plateforme | Table Checkbox Dialog | owners et membres Réseau, rôles cumulés, ID Telegram, pastille en ligne | Ajouter ; cocher les rôles ; Envoyer un message de test Telegram | …/platform-staff |

### Réseau

owner, membre Réseau · seul espace visible pour le rôle Réseau · gestion unifiée de l'infrastructure (D140 : les connexions de nuit utilisent les mêmes serveurs illimités, aucune infrastructure distincte artificielle)

| Bloc | Composants | Contenu | Clic | API |
| --- | --- | --- | --- | --- |
| Serveurs 3x-ui | Table Sheet Badge | VM 3x-ui permanentes (forfaits à quota) : hôte, port, capacité, abonnés assignés, état actif/inactif | Ajouter un serveur ; Modifier le panneau ; Activer / Désactiver ; Tester la connexion | GET/POST/PATCH /v1/admin/xui/servers POST …/:id/test |
| Nœuds du pool | Table Sheet Badge ToggleGroup | Nœuds VLESS (forfaits illimités et trafic de nuit) : séparation Actifs / Expirés, région, statut, santé, occupation, latence | Ligne : tiroir du nœud (Forcer la santé, Vidanger, Retirer) ; Bouton « Nettoyer les expirés » | GET /v1/admin/pool POST …/health POST …/purge-expired |
| Ajouter un nœud | Dialog Textarea Field | Lien VLESS collé : hôte, port, chemin, SNI remplis tout seuls en lecture seule ; sélection du tier (illimité ou relais) ; nom généré automatiquement | Ajouter | POST /v1/admin/endpoints/manual |
| Exploitation | Card Button | État global du réseau, révision du pool, diffusion Telegram de test | Tester Telegram | POST /v1/admin/telegram/test |

### Mon compte

tous · menu du compte

| Bloc | Composants | Contenu | Clic | API |
| --- | --- | --- | --- | --- |
| Profil | Field Avatar | nom, email, numéro WhatsApp (sert aussi à se connecter), ID Telegram pour les rôles plateforme, rôles | Enregistrer | PATCH /v1/admin/me |
| Mot de passe | Field InputGroup | actuel, nouveau, confirmation | Changer | POST /v1/admin/me/password |
| Sessions | Item AlertDialog | appareil, navigateur, dernière activité, session actuelle | Déconnecter une session ; toutes sauf celle-ci | GET/DELETE /v1/admin/me/sessions |
| Apparence | ToggleGroup | clair, sombre, système | applique tout de suite | — |

## Cache et temps réel

```
sequenceDiagram
  participant B as Navigateur et son cache
  participant N as Next.js sur Vercel
  participant API as API sur le VPS
  participant DB as Postgres
  B->>N: première visite de Commandes
  N->>API: GET orders
  API-->>B: données, gardées en cache
  B->>N: demande un ticket de flux
  N-->>B: ticket signé valable 60 s
  B->>API: ouvre le flux SSE avec le ticket
  Note over B: revisite de Commandes, affichage immédiat, aucun skeleton
  DB-->>API: NOTIFY commande payée, communauté X
  API-->>B: événement orders modifié
  B->>N: recharge uniquement la liste Commandes
  
```

- Le flux va directement à l'API, sur le VPS, parce que Vercel coupe les connexions longues.
- Un événement dit seulement ce qui a changé, jamais les données. Le navigateur recharge la liste concernée par la voie habituelle, avec les droits habituels.
- Le skeleton ne s'affiche qu'à la toute première visite d'une page.
- Le même flux porte la présence : c'est lui qui dit à l'owner qui est connecté.

## Changements d'API nécessaires

| Sujet | Changement |
| --- | --- |
| Mot de passe | colonne `must_change_password` (vraie pour les admins existants) ; table des sessions admin pour pouvoir les révoquer ; `POST /me/password`, `GET/DELETE /me/sessions`, `PATCH /me` |
| Connexion | colonne `whatsapp_number` unique sur `admin_users` ; le login accepte un email ou un numéro |
| Libre-service | un admin sans communauté peut en créer une, une seule, avec une seule application ; il en devient community_admin ; avancement de l'onboarding et du guide stocké côté serveur |
| Rôles plateforme | rôles cumulables (owner, réseau) au lieu d'un seul `platform_role` ; ID Telegram par personne |
| Telegram | plusieurs destinataires au lieu d'un `TELEGRAM_CHAT_ID` ; message de test ; rappels 15 min avant chaque créneau et relance en cas de retard |
| Créneaux de nuit | table des créneaux (20 h, minuit) avec état, déployeur et nœud rattaché |
| Tarifs | coût du Go, coût par plage, marge ; contrôle du plancher à la création et à la modification d'un forfait |
| WhatsApp | colonnes `whatsapp_group_url` et `whatsapp_number` sur la communauté, exposées à l'app pour le pop-up de bienvenue |
| Builds | états brouillon, demandé, refusé (motif), en cours, publié, échec ; routes approve et reject réservées à l'owner |
| Forfaits | famille, quota en octets, prix par plage de nuit ; plage choisie portée par la commande et l'abonnement |
| 3x-ui | client par abonnement limité : création au paiement, lecture du trafic côté serveur, désactivation à l'épuisement |
| Fiches | `GET /users/:id`, `GET /orders/:id`, résumé de l'accueil, recherche globale |
| Temps réel | flux SSE avec ticket, déclenché par `LISTEN/NOTIFY` ; présence des admins |

## Questions ouvertes

**Prix des plages de nuit**

Dans l'app, la plage s'affiche-t-elle comme un supplément ajouté au forfait (par exemple +500 FCFA pour 20 h-24 h), ou comme un prix total par combinaison ? Le plancher se calcule de la même façon dans les deux cas.

**À fournir pour tester le bot**

Le jeton du bot Telegram, ton ID, celui du deuxième owner et celui du membre Réseau. Le jeton se pose sur le serveur, jamais dans une note ni dans le dépôt.

**Réglé le 26 octobre**

Connexion par email ou numéro WhatsApp. Serveurs de nuit déployés à la main sur rappel Telegram. Une seule application par admin. Prix plancher fixé par la plateforme.