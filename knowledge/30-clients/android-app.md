---
id: android-app
title: Application Android — architecture
tags: [android, kotlin, compose, vpnservice, keystore]
status: decided
updated: 2026-10-20
related: [singbox-engine, failover-client, ui-identities]
---

## Socle

Kotlin, Compose, `VpnService`, moteur `libbox` (sing-box) en processus
séparé ou en service lié. Un seul module `app` + un module `branding` généré au
build.

## Identité de l'appareil

Pas de HWID, pas d'IMEI, pas de numéro de série. Deux paires de clés EC P-256
dans **Android Keystore** (séparées par usage : signature de requête et accord
ECDH). Elles ne sortent jamais du Keystore.

- Enrôlement : l'app envoie la clé publique + une preuve de possession.
- Chaque requête est signée :
  `METHOD\nPATH\nsha256(body)\ntimestamp\nnonce`.
- Play Integrity en complément, jamais comme unique défense.

## Stockage

- Bundle chiffré, déchiffré uniquement en mémoire au moment de construire la
  configuration sing-box.
- Aucun `vless://` en clair sur disque.
- Aucune action « copier » ou « exporter » dans l'interface.
- Écran de debug absent des builds de production, ou protégé.

## Service VPN

- Notification permanente (obligatoire), avec durée et débit.
- Redémarrage au boot si l'utilisateur l'a demandé.
- Toujours-actif (always-on) proposé, pas imposé : sinon l'appareil peut perdre
  tout réseau si le tunnel échoue.
- Bascule sans redémarrer le service quand c'est possible (changement de
  `selector` plutôt que recréation du tunnel).

## États visibles

`Arrêté` · `Connexion` · `Connecté` · `Reconnexion` · `Aucune connexion
disponible` · `Abonnement expiré` · `Appareil révoqué`.

Chaque état doit dire la vérité : ne jamais afficher « protégé » quand le tunnel
ne passe pas.

## Contraintes d'environnement

Aucun JDK, Android SDK, Gradle ni `adb` sur cette machine. L'app ne peut pas
être compilée ni testée ici. Tout ce qui est écrit doit être relu avec cette
limite en tête, et la vérification réelle reste à faire ailleurs.
