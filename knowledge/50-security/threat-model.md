---
id: threat-model
title: Modèle de menace
tags: [securite, menace, config, mitm, extraction]
status: decided
updated: 2026-10-20
related: [revocation, roles-and-commissions, offline-bundle, 3x-ui]
---

## Actifs

1. Les configurations VLESS (utilisables par un tiers).
2. Les comptes et les appareils enrôlés.
3. L'argent (commandes, commissions, versements).
4. L'infrastructure (endpoints, jetons d'ingestion).

## Menaces principales

**Endpoint forgé.** Quiconque peut enregistrer un endpoint place son serveur
dans le pool et devient le point de sortie du trafic utilisateur. Il connaît
l'UUID puisqu'il l'a reçu. Défense : authentification forte de l'ingestion +
approbation humaine.

**Extraction de configuration.** Sur un appareil rooté, la configuration est
forcément déchiffrée en mémoire. On ne peut pas l'empêcher. On peut la rendre
inutilisable : durée de vie courte, révocation, identifiant propre à l'appareil.

**Rejeu de requête.** Signature par requête + horodatage + nonce. Le corps brut
doit être conservé pour que la signature soit vérifiable.

**Partage d'un bundle hors-ligne.** Un fichier transmis est partageable. Défense :
chiffrement pour la clé de l'appareil, usage unique côté serveur, `not_after`.

**Élévation via le dashboard.** Un admin de communauté ne doit jamais pouvoir
lire hors de son périmètre, ni changer son taux, ni déclencher un versement.

**Fuite par les journaux.** Ne jamais journaliser un UUID, un chemin WS, un
jeton, un corps de bundle.

## Ce qui n'est pas défendable

- Empêcher un utilisateur rooté d'extraire une configuration active.
- Empêcher la revente d'un accès tant que l'identifiant reste valide.
- Garantir la suppression d'un fichier déjà reçu et copié.

Ces limites doivent être dites, pas masquées.
