#!/bin/sh
# Vérifications réelles de infra/endpoint/entrypoint.sh, sans Docker.
# Usage : sh run-tests.sh
set -u

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../../../.." && pwd)
script="$root/infra/endpoint/entrypoint.sh"
work="$here/tmp"
rm -rf "$work"
mkdir -p "$work"

pass=0
fail=0

ok()   { pass=$((pass + 1)); printf 'PASS  %s\n' "$1"; }
bad()  { fail=$((fail + 1)); printf 'FAIL  %s\n' "$1"; }
check_exit() { # $1 label, $2 attendu, $3 obtenu
    if [ "$2" = "$3" ]; then ok "$1 (exit $3)"; else bad "$1 (attendu $2, obtenu $3)"; fi
}

export FAKE_UUID="deadbeef-cafe-4bad-8eef-001122334455"
export FAKE_WS_PATH="/ws/SECRETPATH"
export FAKE_EXPIRES="2026-10-20T19:30:00.000Z"

# ---------------------------------------------------------------- 1. syntaxe
if sh -n "$script" 2>"$work/syntax.err"; then
    ok "sh -n entrypoint.sh"
else
    bad "sh -n entrypoint.sh"
    cat "$work/syntax.err"
fi

# ------------------------------------------------------------ 2. bashismes
if grep -nE '(^|[^[:alnum:]_])\[\[|\]\]|^[[:space:]]*local[[:space:]]|;[[:space:]]*local[[:space:]]|=\(|\$RANDOM|function[[:space:]]+[A-Za-z_]' "$script" > "$work/bashisms.txt"; then
    bad "bashisme détecté"
    cat "$work/bashisms.txt"
else
    ok "aucun bashisme ([[ ]], local, tableaux, \$RANDOM, function, source)"
fi

# ------------------------------------------------- 3. variables manquantes
out=$(PUBLIC_HOST= API_URL= ENDPOINT_INGEST_SECRET= sh "$script" 2>&1); code=$?
check_exit "PUBLIC_HOST absent" 78 "$code"
case "$out" in
    *"PUBLIC_HOST manquant"*) ok "message clair pour PUBLIC_HOST" ;;
    *) bad "message PUBLIC_HOST"; printf '%s\n' "$out" ;;
esac

out=$(PUBLIC_HOST=node-01.example.run.app API_URL= ENDPOINT_INGEST_SECRET= sh "$script" 2>&1); code=$?
check_exit "API_URL absent" 78 "$code"
case "$out" in
    *"API_URL manquant"*) ok "message clair pour API_URL" ;;
    *) bad "message API_URL"; printf '%s\n' "$out" ;;
esac

out=$(PUBLIC_HOST=node-01.example.run.app API_URL=https://api.example.com ENDPOINT_INGEST_SECRET= sh "$script" 2>&1); code=$?
check_exit "ENDPOINT_INGEST_SECRET absent" 78 "$code"
case "$out" in
    *"ENDPOINT_INGEST_SECRET manquant"*) ok "message clair pour ENDPOINT_INGEST_SECRET" ;;
    *) bad "message ENDPOINT_INGEST_SECRET"; printf '%s\n' "$out" ;;
esac

out=$(PUBLIC_HOST="https://node-01.example.com" API_URL=https://api.example.com ENDPOINT_INGEST_SECRET=s sh "$script" 2>&1); code=$?
check_exit "PUBLIC_HOST avec schéma refusé" 78 "$code"

out=$(PUBLIC_HOST=node-01.example.com API_URL=https://api.example.com ENDPOINT_INGEST_SECRET=s PORT=abc sh "$script" 2>&1); code=$?
check_exit "PORT non numérique refusé" 78 "$code"

out=$(PUBLIC_HOST=node-01.example.com API_URL=api.example.com ENDPOINT_INGEST_SECRET=s sh "$script" 2>&1); code=$?
check_exit "API_URL sans schéma refusé" 78 "$code"

# ------------------------------------------------------- 4. parcours complet
calls="$work/calls.log"
: > "$calls"
config="$work/config.json"
rm -f "$config"

PATH="$here/fakebin:$PATH" \
PUBLIC_HOST=node-01-abc123.us-central1.run.app \
API_URL=http://127.0.0.1:9999 \
ENDPOINT_INGEST_SECRET=TOKEN-SECRET-XYZ \
K_SERVICE=node-01 \
K_REVISION=node-01-00002-abc \
PORT=8081 \
PUBLIC_PORT=443 \
XRAY_CONFIG="$config" \
ENDPOINT_HEARTBEAT_SECONDS=3 \
ENDPOINT_READY_TIMEOUT=5 \
FAKE_CALLS="$calls" \
sh "$script" > "$work/run.log" 2>&1 &
pid=$!
sleep 8
kill -TERM "$pid" 2>/dev/null
wait "$pid"
code=$?

check_exit "parcours complet puis SIGTERM" 0 "$code"

if [ "$code" -ne 0 ]; then
    printf '\n--- run.log ---\n'
    cat "$work/run.log"
    printf '\n--- calls.log ---\n'
    cat "$calls"
    printf '\n---------------\n'
fi

for needle in "enregistré : endpoint_id=ep_TEST" "configuration écrite et validée" "xray écoute sur 0.0.0.0:8081" "ready : status=active" "heartbeat ok" "SIGTERM reçu"; do
    if grep -q "$needle" "$work/run.log"; then
        ok "log attendu : $needle"
    else
        bad "log manquant : $needle"
    fi
done

# ------------------------------------------------- 5. aucun secret en clair
if grep -q "deadbeef-cafe" "$work/run.log"; then
    bad "l'UUID apparaît dans les logs"
else
    ok "UUID absent des logs"
fi
if grep -q "SECRETPATH" "$work/run.log"; then
    bad "le chemin WS apparaît dans les logs"
else
    ok "chemin WS absent des logs"
fi
if grep -q "TOKEN-SECRET-XYZ" "$work/run.log"; then
    bad "le jeton apparaît dans les logs"
else
    ok "jeton absent des logs"
fi

# --------------------------------------- 6. aucun appel de désinscription
if grep -qiE 'unregister|deregister|DELETE' "$calls"; then
    bad "un appel de désinscription a été émis"
    cat "$calls"
else
    ok "aucun appel de désinscription (register/ready/heartbeat seulement)"
fi

# ------------------------------- 7. aucun secret dans une ligne de log (statique)
if grep -nE '^[[:space:]]*log .*(UUID|WS_PATH|ENDPOINT_INGEST_SECRET)' "$script" > "$work/log-secrets.txt"; then
    bad "une ligne de log référence un secret"
    cat "$work/log-secrets.txt"
else
    ok "aucune ligne de log ne référence UUID / chemin WS / jeton"
fi

# ------------------------------------- 8. invariant de la config générée
if node "$here/check-config.mjs" > "$work/config-check.log" 2>&1; then
    ok "config.example.json conforme au contrat inbound ($(grep -c PASS "$work/config-check.log") invariants)"
else
    bad "config.example.json non conforme"
    cat "$work/config-check.log"
fi

printf '\n%d PASS, %d FAIL\n' "$pass" "$fail"
[ "$fail" -eq 0 ] || exit 1
