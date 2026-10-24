# AGENTS.md — plateforme VPN marque blanche

Ce dépôt contient l'API, le dashboard, le conteneur d'endpoint et l'application
Android. Le travail est long, interrompu par des compactions : **la mémoire
écrite prime sur le souvenir**.

## À faire au début de chaque session, et après CHAQUE compaction

```bash
node knowledge/cli.mjs context   # objectif, questions ouvertes, état
node knowledge/cli.mjs report    # ce que les sous-agents ont produit
```

Ne jamais répondre « je ne sais plus où on en était ». C'est écrit dans
`knowledge/`.

## Règle de persistance

Après **toute** analyse, tout chiffre vérifié, toute décision, tout piège
découvert : écrire dans `knowledge/` avant de continuer.

- un sujet = un nœud (`knowledge/<domaine>/<sujet>.md`) ;
- décision → `00-brief/decisions.md`, datée ;
- question non tranchée → `00-brief/open-questions.md` ;
- fait non vérifié → marqué `(non vérifié)` et statut `assumption`.

Un travail non écrit est un travail perdu.

## Sous-agents

Chaque sous-agent a `knowledge/agents/<slug>/` : `charter.md`, `log.md`,
`notes/`.

1. Le brief d'un sous-agent commence par : « lis ta charte, lis les nœuds
   `<ids>`, journalise chaque étape avec
   `node knowledge/cli.mjs agent log <slug> "<titre>" --fait "..." --etat ok --suite "..."` ».
2. Un sous-agent n'écrit que dans son dossier (sauf `owns:` explicite).
3. Il **propose** les modifications de nœuds partagés ; l'orchestrateur intègre.
4. Un sous-agent sans entrée de journal est considéré comme n'ayant rien fait.
5. Entre deux vagues : `node knowledge/cli.mjs report --write`, puis synthèse
   dans le nœud concerné.

## Communiquer un résultat

Un rapport de sous-agent doit contenir :

- le verdict (pas la liste des liens visités) ;
- ce qui est **vérifié** et comment (fichier + ligne, doc, test) ;
- ce qui reste **incertain** ;
- les fichiers écrits.

## Interdits

- Inventer une limite d'API, un prix, un nom de fichier, un endpoint.
- Écrire un `vless://` en clair dans l'app, un log, ou un fichier de test.
- Modifier `knowledge/` pour faire plaisir : le statut `verified` se mérite.
- Générer des images. HTML/CSS/SVG uniquement.

## État du code

- `apps/api` : `config.ts`, `schema.ts`, `db.ts`, `lib/*`, `services/*`,
  `routes/{internal,auth,devices,bundle,me,orders,payments,admin,adminAuth,
  offline}.ts`, `app.ts`, `server.ts`, `seed.ts` écrits. Tests :
  `test/*.test.ts` — unitaires (ingest, auth, bundle, payments, admin) **et un
  parcours E2E sur vrai HTTP** (`test/e2e.test.ts` : inscription → commande →
  paiement simulé → webhook → abonnement → bundle chiffré → déchiffrement).
- `infra/endpoint/` : conteneur d'endpoint (register → config → xray → ready →
  heartbeat).
- `apps/admin/` : **supprimé** (D33). Le dashboard est à réécrire et vivra sur
  Vercel (D32).
- `apps/android` : socle Gradle + VpnService + Keystore + client signé, UI
  Compose v2 (`ui/`) et moteur `libbox` (sing-box). `assembleDebug` **réussit**
  depuis le 2026-10-21 (voir `30-clients/android-toolchain`) ; pas de wrapper
  Gradle versionné, le build passe par `tools/build-apk.ps1`.

## Ce que « vérifié » veut dire ici

- **Vérifié** : `tsc --noEmit` sans sortie, ou test exécuté dont la sortie est
  citée dans un rapport.
- **Relu** : code écrit mais non exécutable sur cette machine (Android, Docker,
  Postgres réel). Doit être marqué comme tel dans le rapport.
- Ne jamais écrire « ça marche » sans l'un des deux ci-dessus.

## Limites de la machine

Le réseau coupe les gros transferts (`EOF`, `SSL unexpected eof`, `(35)
schannel`, `(56) Send failure`, `Remote host terminated the handshake`) — y
compris les poignées de main TLS de Gradle vers `dl.google.com` et Maven
Central. Tout est fait **sous Windows**, WSL n'est plus utilisé.

- Téléchargement : `tools/fetch-segmented.ps1` (plages parallèles, reprise sur
  le `.part` existant, **vérification du zip** avant mise en place). Une taille
  correcte ne prouve rien : un transfert interrompu plusieurs fois donne une
  archive de bonne taille et illisible.
- Installation Android : `tools/install-android-toolchain.ps1`. Le SDK s'installe
  avec le nouveau CLI, qui veut des noms en `/` (`platforms/android-35`) alors
  que `avdmanager -k` veut des `;` — voir `30-clients/android-toolchain`.
- Compilation : `tools/build-apk.ps1` (reprises multiples ; Gradle conserve son
  cache, donc chaque tentative progresse). Voir `30-clients/android-toolchain`.
- Docker tourne **dans WSL**, pas via Docker Desktop.
- Hébergement : Vercel (D32), pas Cloud Run. Aucun `gcloud` n'est nécessaire.
- Appareil de test : Pixel 8 en USB, API 37, autorisé (`adb devices` → `device`).

**Vérifié** veut dire : compilation réellement lancée (`assembleDebug` + APK
présent, ou `tsc --noEmit` sans sortie), ou test exécuté dont la sortie est
citée. Un écran qui s'ouvre ne prouve pas le tunnel : `libbox.aar` est
arm64-v8a seulement, donc l'émulateur x86_64 ne peut pas le charger.
