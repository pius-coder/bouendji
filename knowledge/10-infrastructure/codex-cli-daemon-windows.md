# Codex CLI (OpenAI) sous Windows — daemon app-server

## Repli de l'ACL du daemon (piège résolu)

Sur Windows, le daemon (`codex app-server daemon`) exige que
`~\.codex\app-server-daemon` (et `~\.codex\app-server-control`) aient :

- owner = utilisateur courant ;
- **DACL protégée** (pas d'héritage) ;
- **exactement une seule ACE** : utilisateur courant en FullControl.

L'ACL Windows par défaut (3 ACE héritées : Système + BUILTIN\Administrateurs
+ utilisateur suffit) est **rejetée** avec :
`socket directory is not private to the current user`.
Références : openai/codex #56794 (correctif ACL reproductible), #49284
(régression sandbox réglée en 0.161.0).

Correctif appliqué le 2026-10-29 (utile depuis Git Bash, les flags `icacls`
sont sinon mangés par MSYS) :

```
icacls "$d" /grant "*<SID utilisateur>:(OI)(CI)F"
icacls "$d" /inheritance:r
```

Vérifié via `Get-Acl` : `Protected=True Rules=1`, ACE unique lenovo
FullControl. L'installation de Codex CLI 0.165.0 (`doctor` : 15 ok, 0 fail,
auth chatgpt OK) n'est plus bloquée sur `codex app-server daemon start` par
l'erreur ACL.

## Reste ouvert

- ~~Le paquet du daemon n'est **pas vendu** par l'installateur standalone 0.165.0~~
  **Résolu** : ce n'était pas un bug d'upstream. Voir ci-dessous la cause racine.
- `codex` n'est reconnu que dans les **nouvelles** fenêtres PowerShell (PATH
  utilisateur déjà à jour : `%LOCALAPPDATA%\Programs\OpenAI\Codex\bin`).

## Cause racine « daemon executable not found » et correctif (résolu)

L'erreur `daemon executable not found at
~\.codex\packages\app-server-daemon\current\bin\codex.exe` avait une cause
locale, pas un bug de l'installateur : dans
`codex-rs/app-server-daemon/src/prepare_install.rs`, la branche
`InstallMode::Missing` court-circuite l'installation si l'un des 4 fichiers
`daemon.pid`, `daemon.stderr.log`, `daemon-updater.pid`,
`daemon-updater.stderr.log` existe encore dans `~\.codex\app-server-daemon`
(croyance à une installation précédente). L'erreur vient ensuite de
`ensure_managed_codex_bin()` dans `lib.rs`.

L'état `~\.codex\app-server-daemon` contenait des artefacts d'un daemon du
8–10 octobre (`daemon-updater.pid`, `daemon.stderr.log`, etc.) de l'ère
Codex Desktop. Correctif appliqué le 2026-10-29 :

1. Les artefacts rances **déplacés** (pas supprimés) vers
   `~\.codex\app-server-daemon-stale-backup-2026-10-29\`.
2. `codex app-server daemon start` → installation complète du paquet puis
   démarrage : `{"status":"started","managedCodexVersion":"0.165.0","appServerVersion":"0.165.0"}`
3. Vérifié : `codex app-server daemon version` → `{"status":"running", ...}` ;
   jonction `packages/app-server-daemon/current →
   releases/0.165.0-x86_64-pc-windows-msvc` créée, marqueur
   `auto-update-version` posé.

Leçon : avant de reconstruire un layout à la main, supprimer/déplacer les
artefacts pid/log rances de `app-server-daemon` ; le self-install du CLI
devient alors fonctionnel. Message circulaire connu signalé en amont
(openai/codex #49284-notes, non vérifié) mais non nécessaire ici.

## Relevé `doctor` (non bloquant, à traiter un jour)

- MCP `node_repl`, `golab`, `chrome-devtools` pointent vers `C:\Users\HP\…`
  (ancien profil machine) → non résolubles. Reconfigurer les serveurs MCP de
  `~\.codex\config.toml` pour le profil `lenovo`.
- 98 lignes de la state DB référencent des rollouts manquants (dont des
  chemins `C:\Users\HP\…`).
- Codex suggère une exclusion Microsoft Defender pour `codex.exe` et ses
  helpers.
