#!/bin/sh
# Parcours réel avec le VRAI jq : seuls curl et xray sont simulés.
# Le config.json produit est ensuite revalidé par le vrai binaire xray.
#   usage : sh run-real-jq.sh /chemin/vers/jq.exe /chemin/vers/xray.exe
set -u

here=$(cd "$(dirname "$0")" && pwd)
root=$(cd "$here/../../../../.." && pwd)
script="$root/infra/endpoint/entrypoint.sh"
real_jq=${1:?chemin de jq}
real_xray=${2:?chemin de xray}

work="$here/tmp-real"
rm -rf "$work"
mkdir -p "$work/bin"

# jq réel exposé sous le nom « jq » dans un répertoire prioritaire.
cp "$real_jq" "$work/bin/jq"
chmod +x "$work/bin/jq"
cp "$here/fakebin/curl" "$work/bin/curl"
cp "$here/fakebin/xray" "$work/bin/xray"
chmod +x "$work/bin/curl" "$work/bin/xray"

export FAKE_UUID="deadbeef-cafe-4bad-8eef-001122334455"
export FAKE_WS_PATH="/ws/AbC-123_xyz"
export FAKE_EXPIRES="2026-10-20T19:30:00.000Z"

# Windows/MSYS réécrit les arguments qui ressemblent à des chemins absolus
# lorsqu'ils sont passés à un binaire natif : ce n'est PAS le comportement du
# conteneur Linux, on le désactive pour tester le vrai programme jq.
export MSYS_NO_PATHCONV=1
export MSYS2_ARG_CONV_EXCL="*"

config="$work/config.json"
calls="$work/calls.log"
: > "$calls"

PATH="$work/bin:$PATH" \
PUBLIC_HOST=node-01-abc123.us-central1.run.app \
API_URL=http://127.0.0.1:9999 \
ENDPOINT_INGEST_SECRET=TOKEN-SECRET-XYZ \
K_SERVICE=node-01 \
K_REVISION=node-01-00002-abc \
PORT=18081 \
PUBLIC_PORT=443 \
ENDPOINT_REGION=us-central1 \
ENDPOINT_CAPACITY=80 \
ENDPOINT_TTL=16200 \
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

echo "entrypoint exit=$code (attendu 0)"

if [ ! -s "$config" ]; then
    echo "ECHEC : aucune configuration générée"
    cat "$work/run.log"
    exit 1
fi

echo "---- configuration réellement produite par jq ----"
cat "$config"
echo "--------------------------------------------------"

fail=0
grep -q "deadbeef-cafe" "$work/run.log" && { echo "ECHEC : uuid dans les logs"; fail=1; }
grep -q "AbC-123_xyz" "$work/run.log" && { echo "ECHEC : chemin WS dans les logs"; fail=1; }
grep -q "TOKEN-SECRET-XYZ" "$work/run.log" && { echo "ECHEC : jeton dans les logs"; fail=1; }

echo "---- validation par le vrai binaire xray ----"
# Le binaire Windows n'ouvre pas les chemins POSIX de MSYS : conversion locale.
cfg_for_xray="$config"
if command -v cygpath >/dev/null 2>&1; then
    cfg_for_xray=$(cygpath -w "$config")
fi
"$real_xray" run -test -c "$cfg_for_xray"
xcode=$?
echo "xray -test exit=$xcode (attendu 0)"
[ "$xcode" -eq 0 ] || fail=1

[ "$code" -eq 0 ] || fail=1

exit "$fail"
