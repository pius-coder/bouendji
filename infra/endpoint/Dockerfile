# Endpoint VPN — Xray VLESS-over-WebSocket pour Cloud Run.
#
# L'image de base fournit le binaire /usr/bin/xray (cf. Cmd de l'image
# teddysun/xray:latest). On ajoute seulement curl (appels d'ingestion) et jq
# (génération de config.json, lecture des réponses) : rien d'autre n'est requis.
FROM teddysun/xray:latest

LABEL org.opencontainers.image.title="vpn-endpoint" \
      org.opencontainers.image.description="Endpoint Xray VLESS-WS auto-enregistré pour Cloud Run" \
      org.opencontainers.image.source="infra/endpoint"

RUN apk add --no-cache curl jq

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
COPY config.example.json /opt/endpoint/config.example.json

RUN chmod 0755 /usr/local/bin/entrypoint.sh

# Repli local : Cloud Run injecte toujours PORT lui-même.
ENV PORT=8080 \
    XRAY_CONFIG=/etc/xray/config.json

EXPOSE 8080

# Le CMD hérité de l'image de base (« /usr/bin/xray -config /etc/xray/config.json »)
# devient un simple argument de l'entrypoint, qui l'ignore : c'est l'entrypoint
# qui génère la configuration à partir de l'enregistrement, puis lance xray.
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
