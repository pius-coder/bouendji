---
id: ui-v2-html-audit
title: Audit du HTML v2 des identités VPN
tags: [ux,html,android,identites,audit]
status: verified
updated: 2026-10-21
related: [ui-identities, android-ui, android-app, ui-restructure-plan, threat-model]
---

## Question

Le fichier autonome `../Atelier-identites-VPN-v2.html` peut-il servir de
référence directe à la réécriture Android ?

## Faits

- Audit statique et rendu navigateur effectués le 2026-10-21. Le fichier fait
  1 719 lignes / 86 809 caractères et se charge sans erreur visible dans le
  navigateur intégré.
- C'est un **atelier d'identités**, pas un parcours d'application : quatre
  écrans d'accueil simultanés (Halo, Mono, Vector, Otaku), des contrôles de
  démonstration et des données fictives. La page le dit elle-même aux lignes
  1416-1423.
- Points solides : quatre directions réellement différentes ; minuteur dans la
  commande principale ; structure 1 + 3 ; apparence auto/claire/sombre ;
  adaptation 4/2/1 colonnes ; préférence `prefers-reduced-motion` ; libellés
  visibles en plus de la couleur ; SVG/CSS seulement.
- La machine d'état ne correspond plus au contrat Android. Le HTML expose
  `connected`, `reconnecting`, `offline`, `expired` (l. 959-964, 1445-1469),
  alors que la commande officielle porte `Idle`, `Connecting`, `Connected`,
  `Degraded` et que `NO_CONNECTION`, `SUBSCRIPTION_EXPIRED`, `DEVICE_REVOKED`
  remplacent l'écran (`android-ui`).
- Les quatre boutons « État du tunnel » n'ont aucun gestionnaire de clic : un
  clic sur « Expiré » ne change ni `aria-pressed`, ni les téléphones. Vérifié
  dans le navigateur et confirmé par l'absence de `addEventListener` associé à
  `[data-set-state]`; ce sélecteur ne sert qu'à repeindre l'état (l. 1514-1517).
- Le bouton connecté, pourtant libellé « Déconnecter », ne déconnecte jamais :
  il passe en reconnexion puis revient connecté (l. 1544-1563). Il n'existe
  aucun état arrêté dans le script.
- `setState()` ne met à jour que les éléments `data-slot` et le minuteur
  (l. 1509-1532). Les statistiques, journaux, échéances et attributs
  `aria-label` restent donc ceux de l'état connecté quand l'écran affiche
  hors-ligne ou expiré.
- Les actions de barre supérieure et les onglets bas sont des boutons sans
  gestionnaire. Seules les commandes `data-connect` et les contrôles de
  l'atelier sont interactifs. Cela contredit la règle « trois actions réelles ».
- Plusieurs données sont inventées ou non branchées : débit `86 Mb/s`, quota
  `1 / 3`, nombres de configurations `03 / 07` et `4`, rotation `12 min`, test
  de fuite DNS « clean », latence/perte, journal de bascule. La page les signale
  globalement comme fictives (l. 1422), mais elles ressemblent à de la
  télémétrie réelle dans les téléphones.
- Le texte Halo « trafic chiffré de bout en bout » (l. 1068, 1447) est une
  promesse techniquement fausse pour un VPN : le tunnel chiffre jusqu'au point
  de sortie, pas nécessairement jusqu'à la destination. « Zéro log » et
  « dns leak test · clean » ne sont pas prouvés par le code actuel.
- Vector affiche des détails internes (`SE-01`, `VLESS`, numéros de config,
  `HWID`) aux lignes 1175-1179 et 1244-1277. `HWID` contredit explicitement
  `android-app` (identité par clés Keystore, aucun identifiant matériel) ; les
  noms/tags internes ne doivent pas être montrés selon `android-ui`.
- La note l. 1420 dit que le thème doit être décidé côté serveur, mais la
  décision actuelle est une identité injectée **au build** (`BrandTokens`), pas
  un réglage serveur runtime.

## Recommandation

Conserver v2 comme référence de matière visuelle seulement. Ne pas porter son
état, ses textes ou sa navigation tels quels. La réécriture doit repartir de la
structure actuelle de `ui-restructure-plan` et réutiliser uniquement les
tokens, rendus de commande et signatures typographiques des quatre identités.

## Écart avec l'APK Android observé le 2026-10-21

- La capture émulateur et le code Compose actuel correspondent à
  `preview/identites.html`, pas à `Atelier-identites-VPN-v2.html` : même titre
  « Hors ligne », même diagnostic, même carte Interface, même adresse/MTU/DNS,
  même nom de moteur et même promesse de pied de page.
- La cause est structurelle dans `ui/HomeScreen.kt` : l'écran appelle
  `StatusHeadline`, `PowerControl`, `HonestStatus`, `FactsCard` puis `Footer`
  (l. 112-142). `FactsCard` écrit directement l'adresse, le MTU et les DNS
  (l. 587-601). Le v2 Halo attendu utilise à la place puce d'état, titre et
  sous-titre centrés, orbe 210 px, trois statistiques, carte d'abonnement et
  navigation basse (`Atelier-identites-VPN-v2.html`, l. 1060-1114).
- Les jetons Halo sont proches (`#0A7CFF`, rayon 28, contrôle 268 dp), mais le
  fond, la hiérarchie, le contenu et le rendu de l'orbe divergent. Ce n'est donc
  pas un simple problème de couleur ou de densité d'écran.
- L'UI Compose a été recréée comme fichiers non suivis après le commit
  `d01c43f` qui l'avait supprimée. Les fichiers `Identity.kt`, `Atmosphere.kt`
  et `HomeScreen.kt` ont été modifiés vers 17:18-17:21 ; l'APK debug a été
  construit à 17:22. L'émulateur porte `cm.bouendji.vpn` 0.1.0, mis à jour à
  16:22:29 selon `dumpsys` (horloge émulateur décalée), donc la capture est
  cohérente avec ce build récent, pas un vieux cache d'APK.
- Verdict : l'APK implémente fidèlement la mauvaise maquette de départ. Pour
  correspondre au v2, il faut remplacer la composition de `VpnHome`, pas
  seulement retoucher `Identity.kt`.

## Sources

- `C:/Users/HP/Documents/Codex/2026-10-19/es/outputs/Atelier-identites-VPN-v2.html`
- `knowledge/30-clients/ui-identities.md`
- `knowledge/30-clients/android-ui.md`
- `knowledge/30-clients/android-app.md`
- `knowledge/30-clients/ui-restructure-plan.md`
- `apps/android/app/src/main/java/cm/bouendji/vpn/ui/HomeScreen.kt`
- `apps/android/app/src/main/java/cm/bouendji/vpn/ui/theme/Identity.kt`
- `apps/android/app/src/main/java/cm/bouendji/vpn/ui/Atmosphere.kt`
- Capture utilisateur `codex-clipboard-858f701f-736b-40d0-af26-9e21551efee0.png`.
- Rendu local : `http://127.0.0.1:8765/Atelier-identites-VPN-v2.html`, navigateur
  intégré, 2026-10-21.
