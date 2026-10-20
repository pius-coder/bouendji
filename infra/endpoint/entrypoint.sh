#!/bin/sh
# ---------------------------------------------------------------------------
# Endpoint VPN (Xray / VLESS-over-WebSocket) pour Cloud Run.
#
#   env -> register -> /etc/xray/config.json -> xray -test -> xray
#       -> attente réelle du port -> ready -> heartbeat -> SIGTERM sans
#       désinscription.
#
# Le contrat d'ingestion est celui de apps/api/src/routes/internal.ts :
# aucun champ n'est envoyé ni lu s'il n'y figure pas.
#
# POSIX strict (dash / busybox ash) : set -eu, pas de bashisme.
# Règle absolue : ne jamais écrire l'UUID, le chemin WS complet ni le jeton
# dans un log, une erreur ou un fichier lisible.
# ---------------------------------------------------------------------------
set -eu

umask 077

CONFIG_PATH=${XRAY_CONFIG:-/etc/xray/config.json}
READY_TIMEOUT_SECONDS=${ENDPOINT_READY_TIMEOUT:-60}
HEARTBEAT_SECONDS=${ENDPOINT_HEARTBEAT_SECONDS:-45}
TICK_SECONDS=5
AGENT_VERSION_DEFAULT="endpoint/1.0"

BODY_FILE="/tmp/register-response.json"
RESP_FILE="/tmp/endpoint-response.json"
TEST_LOG="/tmp/xray-test.log"

XRAY_PID=""

# --------------------------------------------------------------------- logs

log() {
    printf '%s endpoint: %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2
}

# exit 78 = EX_CONFIG (configuration d'environnement à corriger).
# exit 70 = EX_SOFTWARE (image ou réponse de l'API inexploitable).
die() {
    code=$1
    shift
    log "ERREUR: $*"
    exit "$code"
}

# Masque les deux secrets de fait avant d'afficher la sortie de xray.
redact() {
    sed -e "s/$UUID/<uuid>/g" -e "s|$WS_PATH|<ws_path>|g"
}

# ------------------------------------------------------------- environnment

PUBLIC_HOST=${PUBLIC_HOST:-}
API_URL=${API_URL:-}
ENDPOINT_INGEST_SECRET=${ENDPOINT_INGEST_SECRET:-}
PORT=${PORT:-8080}
PUBLIC_PORT=${PUBLIC_PORT:-443}
ENDPOINT_REGION=${ENDPOINT_REGION:-}
ENDPOINT_LABEL=${ENDPOINT_LABEL:-}
ENDPOINT_CAPACITY=${ENDPOINT_CAPACITY:-0}
ENDPOINT_TTL=${ENDPOINT_TTL:-0}
AGENT_VERSION=${ENDPOINT_AGENT_VERSION:-$AGENT_VERSION_DEFAULT}

[ -n "$PUBLIC_HOST" ] || die 78 "PUBLIC_HOST manquant : nom d'hôte public du service (ex: node-01-xxxx.us-central1.run.app)."
[ -n "$API_URL" ] || die 78 "API_URL manquant : URL de base de l'API (ex: https://api.example.com)."
[ -n "$ENDPOINT_INGEST_SECRET" ] || die 78 "ENDPOINT_INGEST_SECRET manquant : jeton d'ingestion partagé avec l'API."

PUBLIC_HOST=$(printf '%s' "$PUBLIC_HOST" | tr 'A-Z' 'a-z')
case "$PUBLIC_HOST" in
    *://*) die 78 "PUBLIC_HOST ne doit pas contenir de schéma (https://...). Donnez uniquement le nom d'hôte." ;;
    */*) die 78 "PUBLIC_HOST ne doit pas contenir de chemin. Donnez uniquement le nom d'hôte." ;;
    *" "*) die 78 "PUBLIC_HOST ne doit pas contenir d'espace." ;;
esac
[ "${#PUBLIC_HOST}" -le 253 ] || die 78 "PUBLIC_HOST dépasse 253 caractères."

case "$API_URL" in
    http://*|https://*) ;;
    *) die 78 "API_URL doit commencer par http:// ou https://." ;;
esac
API_BASE=${API_URL%/}

case "$PORT" in
    ''|*[!0-9]*) die 78 "PORT doit être un entier (Cloud Run injecte PORT, 8080 par défaut)." ;;
esac
if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
    die 78 "PORT hors bornes (1-65535) : $PORT."
fi

case "$PUBLIC_PORT" in
    ''|*[!0-9]*) die 78 "PUBLIC_PORT doit être un entier (port que le client dial, 443 derrière Cloud Run)." ;;
esac
if [ "$PUBLIC_PORT" -lt 1 ] || [ "$PUBLIC_PORT" -gt 65535 ]; then
    die 78 "PUBLIC_PORT hors bornes (1-65535) : $PUBLIC_PORT."
fi

case "$ENDPOINT_CAPACITY" in
    ''|*[!0-9]*) die 78 "ENDPOINT_CAPACITY doit être un entier." ;;
esac
if [ "$ENDPOINT_CAPACITY" -gt 10000 ]; then
    die 78 "ENDPOINT_CAPACITY dépasse 10000 (borne du contrat d'ingestion)."
fi

case "$ENDPOINT_TTL" in
    ''|*[!0-9]*) die 78 "ENDPOINT_TTL doit être un entier de secondes." ;;
esac

if [ -n "$ENDPOINT_REGION" ] && [ "${#ENDPOINT_REGION}" -gt 24 ]; then
    die 78 "ENDPOINT_REGION dépasse 24 caractères."
fi

if [ -n "$ENDPOINT_LABEL" ] && [ "${#ENDPOINT_LABEL}" -lt 2 ]; then
    die 78 "ENDPOINT_LABEL doit faire au moins 2 caractères (ou être absent)."
fi

# deployment_key : stable pour une révision, donc partagée par toutes les
# instances d'un scale-out, et différente à chaque redéploiement.
K_SERVICE=${K_SERVICE:-}
K_REVISION=${K_REVISION:-}
if [ -n "$K_SERVICE" ] && [ -n "$K_REVISION" ]; then
    DEPLOYMENT_KEY="$K_SERVICE:$K_REVISION"
    KEY_SOURCE="K_SERVICE:K_REVISION"
else
    DEPLOYMENT_KEY=$(hostname 2>/dev/null || uname -n)
    KEY_SOURCE="hostname"
fi
if [ "${#DEPLOYMENT_KEY}" -lt 3 ] || [ "${#DEPLOYMENT_KEY}" -gt 190 ]; then
    die 78 "clé de déploiement invalide (3 à 190 caractères) : source $KEY_SOURCE."
fi

command -v jq >/dev/null 2>&1 || die 70 "jq introuvable dans l'image."
command -v curl >/dev/null 2>&1 || die 70 "curl introuvable dans l'image."
# Le binaire fourni par l'image de base teddysun/xray est /usr/bin/xray.
XRAY_BIN=$(command -v xray) || die 70 "binaire xray introuvable (attendu : /usr/bin/xray)."

# ---------------------------------------------------------------- transport

# POST JSON. Écrit le corps dans $1 et imprime le code HTTP.
# 000 = pas de réponse HTTP (DNS, TLS, connexion, timeout).
post_json() {
    body_out=$1
    url=$2
    payload=$3
    code=$(curl -sS \
        --connect-timeout 5 --max-time 10 \
        -H "Authorization: Bearer $ENDPOINT_INGEST_SECRET" \
        -H 'Content-Type: application/json' \
        -H 'Accept: application/json' \
        -o "$body_out" -w '%{http_code}' \
        --data "$payload" \
        "$url" 2>/dev/null) || code=000
    case "$code" in
        ''|*[!0-9]*) code=000 ;;
    esac
    printf '%s' "$code"
}

# Message d'erreur de l'API, sur une ligne, borné. Jamais le jeton.
api_message() {
    msg=$(jq -r '.error.message // empty' < "$1" 2>/dev/null || true)
    if [ -z "$msg" ]; then
        msg="(aucun message)"
    fi
    printf '%s' "$msg" | tr '\n\r\t' '   ' | cut -c1-200
}

# ------------------------------------------------------------------ payload

CAPACITY_JSON=$ENDPOINT_CAPACITY
TTL_JSON=$ENDPOINT_TTL

REGISTER_PAYLOAD=$(jq -n \
    --arg deployment_key "$DEPLOYMENT_KEY" \
    --arg public_host "$PUBLIC_HOST" \
    --arg agent_version "$AGENT_VERSION" \
    --arg region "$ENDPOINT_REGION" \
    --arg label "$ENDPOINT_LABEL" \
    --argjson port "$PUBLIC_PORT" \
    --argjson capacity "$CAPACITY_JSON" \
    --argjson ttl_seconds "$TTL_JSON" \
    '{deployment_key: $deployment_key,
      public_host: $public_host,
      port: $port,
      agent_version: $agent_version}
     + (if $region == "" then {} else {region: $region} end)
     + (if $label == "" then {} else {label: $label} end)
     + (if $capacity == 0 then {} else {capacity: $capacity} end)
     + (if $ttl_seconds == 0 then {} else {ttl_seconds: $ttl_seconds} end)') \
    || die 70 "construction du corps d'enregistrement impossible (jq)."

KEY_PAYLOAD=$(jq -n --arg deployment_key "$DEPLOYMENT_KEY" '{deployment_key: $deployment_key}') \
    || die 70 "construction du corps ready/heartbeat impossible (jq)."

# ------------------------------------------------------------------ SIGTERM

# Un SIGTERM n'est pas une fin de vie : scale-to-zero ou recyclage d'instance.
# On ne prévient PAS l'API, le nœud reste 'active' jusqu'à expires_at.
on_term() {
    log "SIGTERM reçu : arrêt du processus local. Aucune désinscription envoyée, l'endpoint reste actif jusqu'à expires_at."
    if [ -n "$XRAY_PID" ] && kill -0 "$XRAY_PID" 2>/dev/null; then
        kill -TERM "$XRAY_PID" 2>/dev/null || true
        i=0
        while [ "$i" -lt 5 ] && kill -0 "$XRAY_PID" 2>/dev/null; do
            sleep 1
            i=$((i + 1))
        done
        kill -KILL "$XRAY_PID" 2>/dev/null || true
    fi
    exit 0
}
trap on_term TERM INT

# ----------------------------------------------------------------- register

log "démarrage (clé de déploiement issue de $KEY_SOURCE, port local $PORT, port public $PUBLIC_PORT)"

code=""
delay=2
while :; do
    code=$(post_json "$BODY_FILE" "$API_BASE/v1/internal/endpoints/register" "$REGISTER_PAYLOAD")

    case "$code" in
        2??) break ;;
        409) die 78 "déploiement expiré, nouvelle révision requise (cette clé a déjà expiré côté API)." ;;
        401|403) die 78 "jeton d'ingestion refusé par l'API : vérifiez ENDPOINT_INGEST_SECRET." ;;
        400|422) die 78 "enregistrement refusé par l'API : $(api_message "$BODY_FILE")" ;;
        404) die 78 "route d'enregistrement absente : vérifiez API_URL ($API_BASE)." ;;
        000) log "API injoignable : nouvelle tentative dans ${delay}s." ;;
        *) log "enregistrement : HTTP $code : $(api_message "$BODY_FILE") : nouvelle tentative dans ${delay}s." ;;
    esac

    sleep "$delay"
    delay=$((delay * 2))
    if [ "$delay" -gt 30 ]; then
        delay=30
    fi
done

UUID=$(jq -r '.uuid // empty' < "$BODY_FILE" 2>/dev/null || true)
WS_PATH=$(jq -r '.ws_path // empty' < "$BODY_FILE" 2>/dev/null || true)
EXPIRES_AT=$(jq -r '.expires_at // empty' < "$BODY_FILE" 2>/dev/null || true)
ENDPOINT_ID=$(jq -r '.endpoint_id // empty' < "$BODY_FILE" 2>/dev/null || true)
POOL_REVISION=$(jq -r '.pool_revision // empty' < "$BODY_FILE" 2>/dev/null || true)
REGISTERED_STATUS=$(jq -r '.status // empty' < "$BODY_FILE" 2>/dev/null || true)

case "$UUID" in
    "") die 70 "réponse d'enregistrement sans uuid." ;;
    *[!0-9a-fA-F-]*) die 70 "uuid reçu malformé." ;;
esac
[ "${#UUID}" -eq 36 ] || die 70 "uuid reçu de longueur inattendue."
case "$WS_PATH" in
    /*) ;;
    *) die 70 "chemin WS reçu invalide (doit commencer par /)." ;;
esac

# Le chemin et l'UUID ne sortent jamais d'ici en clair.
rm -f "$BODY_FILE"
log "enregistré : endpoint_id=$ENDPOINT_ID status=$REGISTERED_STATUS expires_at=$EXPIRES_AT pool_revision=$POOL_REVISION"

# ------------------------------------------------------------------- config

# jq -n : aucune valeur n'est interpolée dans un gabarit texte.
mkdir -p "$(dirname "$CONFIG_PATH")"
jq -n \
    --arg uuid "$UUID" \
    --arg path "$WS_PATH" \
    --argjson port "$PORT" \
    '{
       log: {access: "none", loglevel: "warning"},
       inbounds: [
         {
           tag: "vless-ws",
           listen: "0.0.0.0",
           port: $port,
           protocol: "vless",
           settings: {
             decryption: "none",
             clients: [{id: $uuid, email: "shared"}]
           },
           streamSettings: {
             network: "ws",
             security: "none",
             wsSettings: {path: $path}
           }
         }
       ],
       outbounds: [
         {tag: "direct", protocol: "freedom"},
         {tag: "blocked", protocol: "blackhole"}
       ],
       routing: {
         domainStrategy: "AsIs",
         rules: [
           {
             type: "field",
             outboundTag: "blocked",
             ip: [
               "127.0.0.0/8",
               "10.0.0.0/8",
               "172.16.0.0/12",
               "192.168.0.0/16",
               "169.254.0.0/16",
               "::1/128",
               "fc00::/7",
               "fe80::/10"
             ]
           }
         ]
       }
     }' > "$CONFIG_PATH" \
    || die 70 "écriture de $CONFIG_PATH impossible."
chmod 600 "$CONFIG_PATH"

if ! "$XRAY_BIN" run -test -c "$CONFIG_PATH" > "$TEST_LOG" 2>&1; then
    log "xray a refusé la configuration générée :"
    redact < "$TEST_LOG" | sed -e 's/^/    /' >&2 || true
    rm -f "$TEST_LOG"
    die 70 "configuration Xray invalide (xray run -test)."
fi
rm -f "$TEST_LOG"
log "configuration écrite et validée (xray run -test OK)"

# -------------------------------------------------------------------- start

"$XRAY_BIN" run -c "$CONFIG_PATH" &
XRAY_PID=$!
log "xray démarré (pid $XRAY_PID)"

# On attend que le port réponde vraiment : un GET sans Upgrade sur un inbound
# WS renvoie une erreur HTTP immédiate (400), ce qui prouve que le listener
# est ouvert et sert. Aucun sleep fixe ne prouve cela.
waited=0
listening=0
while [ "$waited" -lt "$READY_TIMEOUT_SECONDS" ]; do
    if ! kill -0 "$XRAY_PID" 2>/dev/null; then
        die 70 "xray s'est arrêté avant d'écouter sur le port $PORT."
    fi
    http_code=$(curl -sS -o /dev/null -w '%{http_code}' \
        --connect-timeout 2 --max-time 2 \
        "http://127.0.0.1:$PORT/" 2>/dev/null) || http_code=000
    case "$http_code" in
        000|'') ;;
        *) listening=1; break ;;
    esac
    sleep 1
    waited=$((waited + 1))
done
[ "$listening" -eq 1 ] || die 70 "xray n'écoute pas sur le port $PORT après ${READY_TIMEOUT_SECONDS}s."

log "xray écoute sur 0.0.0.0:$PORT"

# --------------------------------------------------------------------- ready

delay=2
while :; do
    code=$(post_json "$RESP_FILE" "$API_BASE/v1/internal/endpoints/ready" "$KEY_PAYLOAD")

    case "$code" in
        2??)
            READY_STATUS=$(jq -r '.status // empty' < "$RESP_FILE" 2>/dev/null || true)
            READY_REVISION=$(jq -r '.pool_revision // empty' < "$RESP_FILE" 2>/dev/null || true)
            rm -f "$RESP_FILE"
            log "ready : status=$READY_STATUS pool_revision=$READY_REVISION"
            break
            ;;
        409) die 78 "déploiement expiré, nouvelle révision requise (ready refusé par l'API)." ;;
        401|403) die 78 "jeton d'ingestion refusé par l'API : vérifiez ENDPOINT_INGEST_SECRET." ;;
        404) die 78 "route ready absente : vérifiez API_URL ($API_BASE)." ;;
        000) log "API injoignable (ready) : nouvelle tentative dans ${delay}s." ;;
        *) log "ready : HTTP $code : $(api_message "$RESP_FILE") : nouvelle tentative dans ${delay}s." ;;
    esac

    sleep "$delay"
    delay=$((delay * 2))
    if [ "$delay" -gt 30 ]; then
        delay=30
    fi
done

# ----------------------------------------------------------------- heartbeat

log "heartbeat toutes les ${HEARTBEAT_SECONDS}s"

elapsed=0
while :; do
    sleep "$TICK_SECONDS"

    if ! kill -0 "$XRAY_PID" 2>/dev/null; then
        log "ERREUR: xray s'est arrêté : arrêt du conteneur."
        exit 70
    fi

    elapsed=$((elapsed + TICK_SECONDS))
    if [ "$elapsed" -ge "$HEARTBEAT_SECONDS" ]; then
        elapsed=0
        hb_code=$(post_json "$RESP_FILE" "$API_BASE/v1/internal/endpoints/heartbeat" "$KEY_PAYLOAD")
        case "$hb_code" in
            2??) log "heartbeat ok" ;;
            000) log "heartbeat : API injoignable (le nœud continue de servir)." ;;
            *) log "heartbeat : HTTP $hb_code (le nœud continue de servir)." ;;
        esac
    fi
done
