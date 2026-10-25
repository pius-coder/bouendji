# Propositions pour les nœuds partagés (2026-10-25)

Ce fichier ne modifie aucun nœud. L'orchestrateur intègre (charte, interdit 2).

## 1. `10-infrastructure/cloud-run-deploy-form` — PUBLIC_HOST

Remplacer la ligne du tableau « Variables d'environnement » :

> | `PUBLIC_HOST` | `<service>-<numéro de projet>.<région>.run.app` | l'URL Cloud Run est déterministe (ex. `vpn-node-513999018169.us-west1.run.app`) |

par :

> | `PUBLIC_HOST` | **ne pas saisir** sur Cloud Run | déduit par `entrypoint.sh` (lignes 73-83) à partir de `K_SERVICE`, du numéro de projet et de la région (serveur de métadonnées). À poser seulement pour un domaine personnalisé ou hors Cloud Run. |

Remplacer la ligne `ENDPOINT_TTL` par :

> | `ENDPOINT_TTL` | durée de vie du projet de lab en secondes | ex. `16200` (4 h 30, D21). **Minimum 3 600 s** : l'API relève toute valeur plus courte (`apps/api/src/config.ts:170`, `services/endpoints.ts:213`) |

Vérifié : `config.ts:170` (`ENDPOINT_MIN_TTL` défaut 3 600). Relu : le relèvement dans `services/endpoints.ts:213-216`.

## 2. `10-infrastructure/cloud-run-url` (statut `open`)

Ce nœud recommande `PUBLIC_HOST` obligatoire (stratégie 1) et écarte la déduction (stratégie 3). Le commit 4105b82 retient la déduction comme chemin par défaut, `PUBLIC_HOST` restant une surcharge. Proposition : ajouter une section « Décision 2026-10-25 » qui dit cela, et laisser la question ouverte sur un point : le format `<service>-<numéro>.<région>.run.app` n'a pas été constaté sur un service Cloud Run réel dans cette session (**non vérifié**). Le nœud garde son avertissement « le format a changé » tant qu'il n'est pas constaté.

## 3. `10-infrastructure/aura-vps-dokku-test` — smoke test de l'image publique (2026-10-25)

Ajouter, à la suite de « Mise à jour 2026-10-24 » :

- Conteneur jetable `vpn-endpoint-smoke` sur aura-vps, image `ghcr.io/pius-coder/vpn-endpoint:latest` (digest `sha256:a82d1d49…`), contre `https://api.numzer0.store`, sans port publié.
- Vérifié (logs cités) : `register` 200 à 05:26:21.83Z, `ready` 200 à 05:26:23.18Z (status `active`), `heartbeat` 200 à 05:27:08.25Z et 05:27:53.29Z ; `xray run -test` OK ; xray écoute sur 8080.
- **Piège** : `ENDPOINT_TTL=900` n'est pas respecté. L'API relève à `ENDPOINT_MIN_TTL` = 3 600 s : `expires_at` = register + 1 h.
- **Conséquence** : le nœud `smoke.invalid` reste dans la liste servie jusqu'à environ 06:26:21Z, même conteneur arrêté. La désinscription n'existe pas et le heartbeat ne purge rien. Décision requise avant toute autre action sur ce nœud (voir `00-brief/open-questions.md`, proposition ci-dessous).
- Non vérifié : présence dans le pool admin (aucun identifiant admin lu).
- Nettoyage fait : conteneur supprimé (`docker ps -a` vide), `/root/smoke.env` supprimé juste après `docker run`.

## 4. `00-brief/open-questions.md` — deux questions à ouvrir

- **Nœud smoke résiduel** : faut-il retirer `smoke.invalid` de la liste servie avant 06:26Z (action admin à définir, ou attendre l'expiration) ? Action admin non réalisée : elle exige l'accord de l'utilisateur.
- **WebSocket déprécié** : l'image tirée (Xray 26.10.21, `teddysun/xray:latest`) affiche au démarrage `The feature WebSocket transport ... is deprecated ... Please migrate to XHTTP H2 & H3`. Trancher : rester sur WS (avertissement seul) ou planifier XHTTP. Le README de l'endpoint indique le binaire validé en 26.3.27 (Windows) ; la version de l'image est plus récente.

## 5. `infra/endpoint/README.md` — modifications faites (fichier possédé)

- tableau des variables : `PUBLIC_HOST` non obligatoire sur Cloud Run, `ENDPOINT_TTL` borné à 3 600 s minimum ;
- piège 6 : l'URL se déduit, rien à saisir avant le premier déploiement ;
- dépannage : `PUBLIC_HOST manquant` distingue hors Cloud Run et déduction échouée ;
- section « Vérifié » : déduction simulée avec un `curl` factice (`us-west1`), sortie 78 sans métadonnées. Marquée comme simulation.

## 6. `infra/endpoint/cloudrun.env` — aucune modification

Vérification par clés seulement : le fichier ne contient pas `PUBLIC_HOST` (clés : API_URL, ENDPOINT_INGEST_SECRET, ENDPOINT_FRONT_ADDRESS, ENDPOINT_FRONT_SNIS, ENDPOINT_LABEL, ENDPOINT_REGION, ENDPOINT_TTL). Rien à retirer. La valeur de ENDPOINT_INGEST_SECRET n'a pas été lue.
