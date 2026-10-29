# Skill `apex` (melvynx/aiblueprint) sous Windows

Installé le 2026-10-29, global (utilisateur), pour OpenCode.

## Ce qui a été installé

- Source : `https://github.com/melvynx/aiblueprint`, skill `apex` uniquement
  (le dépôt en contient 15). Page : `skills.sh/melvynx/aiblueprint/apex`.
  Audits affichés : Gen Agent Trust Hub / Socket / Snyk → Pass.
- Commande : `npx skills add https://github.com/melvynx/aiblueprint --skill apex -g -a opencode -y`
- Emplacement : `~/.agents/skills/apex` (c'est là que vivent les 240 skills
  visibles par OpenCode ; `~/.config/opencode/skills` ne contient que les
  skills `gstack`). Entrée dans `~/.agents/.skill-lock.json`, donc
  `npx skills update apex -g` fonctionne.
- Le skill est **volontairement non auto-invoquable** :
  `disable-model-invocation: true` + `opencode/autoinvoke: "false"`.
  Il s'appelle à la main : `/apex <tâche>`.

## Prérequis : Python 3 (absent au départ)

Le skill persiste son état avec `scripts/apex-state.py`. La machine n'avait
que les stubs Microsoft Store (`WindowsApps\python.exe` → « Python est
introuvable »).

- Installé : `winget install --id Python.Python.3.13 -e --scope user`
  → `Python 3.13.15` dans
  `C:\Users\lenovo\AppData\Local\Programs\Python\Python313\`.
- L'installeur a bien ajouté `Python313\`, `Python313\Scripts\` et
  `Python\Launcher\` en tête du PATH **utilisateur**.
- Les étapes du skill appellent `python3`, que Windows n'installe pas.
  Créé un **hardlink** `python3.exe` → `python.exe` dans le dossier Python313
  (`New-Item -ItemType HardLink`). Vérifié : `python3 --version` → 3.13.15.
- Le PATH du processus OpenCode en cours ne se recharge pas : dans la session
  qui a fait l'installation, préfixer
  `export PATH="/c/Users/lenovo/AppData/Local/Programs/Python/Python313:/usr/bin:/bin:$PATH"`.
  Les sessions suivantes héritent du PATH correct.

## Correctifs Windows appliqués à `scripts/apex-state.py`

Le script d'origine est POSIX-only (`fcntl`, `os.fchmod`, fsync de dossier).
Trois modifications locales, à **réappliquer après chaque `skills update`** :

1. Import : `fcntl` devient optionnel.
   ```python
   try:
       import fcntl
   except ImportError:
       fcntl = None
       import msvcrt
   ```
2. `fsync_directory()` : retour immédiat si `os.name == "nt"` (impossible
   d'ouvrir un dossier avec `os.open` sous Windows).
3. Helper `private_mode(fd)` : `os.fchmod` seulement s'il existe
   (`hasattr(os, "fchmod")`), utilisé dans `write_json`, `append_journal`
   et `run_lock`. Sous Windows le verrou de run utilise
   `msvcrt.locking(fd, msvcrt.LK_LOCK, 1)` / `LK_UNLCK`.

Vérification : `python3 scripts/test_apex_state.py` → **12/14**. Les 2 échecs
restants sont des limites de la machine, pas du script :

- `test_rejects_symlinked_state_root` : créer un symlink exige le privilège
  `SeCreateSymbolicLinkPrivilege` (mode développeur ou admin).
- `test_redacts_secrets_and_uses_private_modes` : NTFS n'a pas de modes POSIX
  (`0700`), `os.chmod` ne règle que l'attribut lecture seule.

Test manuel réel : `apex-state.py init` puis `status` sur un dépôt git de
test → `run.json`, `tasks.json`, `evidence.json`, `journal.jsonl` créés,
`EXIT=0`.

## Piège

`setup-templates.sh` (wrapper historique) appelle `python3` : il échoue tant
que le hardlink n'existe pas, avec le message trompeur du stub Microsoft
Store. Ce n'est pas une erreur du skill.
