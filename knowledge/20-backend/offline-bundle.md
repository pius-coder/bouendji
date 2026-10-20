---
id: offline-bundle
title: Fichier de secours hors-ligne (bundle)
tags: [backend, offline, crypto, support, admin]
status: decided
updated: 2026-10-20
related: [open-questions, revocation, schema]
---

## Cas visé

L'utilisateur a du réseau, mais **l'application n'arrive pas à récupérer la
liste** : API bloquée, timeout, panne côté serveur. Il n'a donc aucune
configuration utilisable. L'admin lui fournit alors un fichier à usage unique.

Ce n'est **pas** le cas « zéro réseau » : sans connectivité, aucun fichier ne
crée un accès Internet.

## Deux cas très différents

**A. L'appareil est déjà enrôlé.** Le serveur possède déjà sa clé publique.
L'admin génère le bundle depuis le dashboard en choisissant utilisateur +
appareil. Aucun échange de code. C'est le cas normal, et le plus simple.

**B. L'appareil n'a jamais été enrôlé.** Là seulement il faut récupérer sa clé
publique : QR code affiché par l'app (une clé P-256 compressée fait ~33 octets,
soit ~53 caractères en base32). Un code court ne suffit pas : une empreinte
permet d'identifier une clé, pas de chiffrer pour elle.

## Format

```
{
  v: 1,
  bundle_id: uuid,
  community_id,
  device_id,
  issued_at, not_after,
  configs: [ ... ],
  sig: Ed25519(payload)      // clé publique épinglée dans l'APK
}
```

Puis chiffré pour l'appareil : ECDH → HKDF → AES-256-GCM.

## Cycle de vie

1. Génération côté serveur, `offline_bundles.status = 'issued'`.
2. Livraison : fichier, ou QR si ≤ ~2,9 Ko (version 40, ECC L) — soit environ
   5 configurations.
3. Import : l'app vérifie la signature **hors ligne**, déchiffre, écrit la liste
   dans son stockage Keystore.
4. L'app supprime sa copie et note le `bundle_id` comme consommé.
5. À la première synchronisation, elle signale la consommation → `consumed_at`.
6. `not_after` dépassé ou bundle consommé → refus d'import.

## Honnêteté sur « auto-détruit »

L'app peut supprimer **sa** copie et refuser de réutiliser un bundle. Elle ne
peut **pas** supprimer le fichier reçu par WhatsApp ou enregistré dans
Téléchargements. La protection réelle est : signature, chiffrement par appareil,
usage unique côté serveur, `not_after` court, et mort des UUID contenus.

## Risque résiduel

Un appareil rooté peut extraire les configurations après import. Elles restent
limitées par leur `expires_at` et par la révocation du nœud.
# Implémentation (2026-10-20)

Vérifiée par `apps/api/test/offline.test.ts` — **7 tests, 0 échec** :

| Ce qui est contrôlé | Comment |
|---|---|
| signature Ed25519 | reconstruite par le test avec la clé publique, `verify(null, …)` |
| scellement par appareil | ouverture avec la clé privée ACORD de l'appareil, échec avec une clé étrangère |
| anti-rejeu d'identifiant | `bundleId` modifié ⇒ signature invalide |
| périmètre admin | un `community_admin` d'une autre communauté reçoit 403 |
| appareil révoqué | 403 `DEVICE_REVOKED` |
| vue admin | ni `ciphertext`, ni `vless://` dans la réponse |
| corps strict | champ inconnu refusé, `ttlMinutes` borné à 24 h |

Fichiers : `apps/api/src/services/offlineBundles.ts`,
`apps/api/src/routes/offline.ts`, `apps/api/test/offline.test.ts`,
`tools/offline-keygen.mjs`.

Le marquage de consommation existe côté serveur
(`POST /v1/offline-bundles/:bundleId/consumed`, preuve d'appareil exigée) mais
**l'application ne l'appelle pas encore** : elle marque localement avant
d'écrire la liste. Tant que ce n'est pas câblé, `consumed_at` reste vide dans la
vue admin — c'est un défaut d'observation, pas de sécurité.
