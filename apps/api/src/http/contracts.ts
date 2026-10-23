/**
 * Contrats OpenAPI, en un seul endroit.
 *
 * Pourquoi une table plutôt qu'un `schema` sur chaque route : un `schema` de
 * route est aussi un **validateur** Fastify. Y déclarer `body` ou `response`
 * ajouterait une seconde validation et une sérialisation qui supprime les
 * champs non déclarés — un changement de comportement pour de la documentation.
 *
 * Cette table est lue par `registerOpenApi` au moment où le document est
 * généré (`transform`), donc **après** l'enregistrement des routes : elle ne
 * touche ni la validation ni la réponse.
 *
 * Règle d'écriture : chaque objet de réponse porte `additionalProperties: true`,
 * parce que `jsonResponse`/`errorResponse` sont aussi la forme sérialisée si un
 * jour une route les adopte. Une réponse ne doit jamais perdre un champ.
 */
import { ADMIN_SECURITY, COMMON_ERRORS, DEVICE_SECURITY, INGEST_SECURITY, errorResponse, jsonResponse } from "./schemas.js";

/** Minimal local JSON Schema shape used only to describe the OpenAPI contract. */
type JSONSchema7 = Record<string, unknown>;

export interface RouteDoc {
  summary: string;
  description?: string;
  tags?: string[];
  security?: readonly Readonly<Record<string, readonly string[]>>[];
  body?: JSONSchema7;
  params?: JSONSchema7;
  querystring?: JSONSchema7;
  headers?: JSONSchema7;
  response?: Record<string, JSONSchema7 & { description?: string }>;
}

/* ------------------------------------------------------------ petits outils */

function str(description: string, extra: JSONSchema7 = {}): JSONSchema7 {
  return { type: "string", description, ...extra };
}

function int(description: string, extra: JSONSchema7 = {}): JSONSchema7 {
  return { type: "integer", description, ...extra };
}

/** Objet de réponse : jamais fermé, sinon la documentation tronque le JSON. */
function shape(props: Record<string, JSONSchema7>, required?: string[]): JSONSchema7 {
  return { type: "object", additionalProperties: true, ...(required ? { required } : {}), properties: props };
}

function arrayOf(items: JSONSchema7, description: string): JSONSchema7 {
  return { type: "array", description, items };
}

const PARAM_APP_ID: JSONSchema7 = { type: "object", required: ["appId"], properties: { appId: str("Identifiant de la marque.") } };
const PARAM_ORDER_ID: JSONSchema7 = { type: "object", required: ["orderId"], properties: { orderId: str("Identifiant de la commande.") } };
const PARAM_DEVICE_ID: JSONSchema7 = { type: "object", required: ["deviceId"], properties: { deviceId: str("Identifiant de l'appareil.") } };
const PARAM_COMMUNITY_ID: JSONSchema7 = {
  type: "object",
  required: ["communityId"],
  properties: { communityId: str("Identifiant de la communauté. Le corps n'est jamais lu pour ce champ.") },
};
const PARAM_PAYOUT_ID: JSONSchema7 = { type: "object", required: ["payoutId"], properties: { payoutId: str("Identifiant du retrait.") } };

const ERROR_4XX = { ...COMMON_ERRORS } as const;
const DEVICE_PROOF_HEADERS: JSONSchema7 = {
  type: "object",
  required: ["x-device-timestamp", "x-device-nonce", "x-device-signature"],
  properties: {
    "x-device-timestamp": str("Horodatage Unix en millisecondes (`Date.now`), tolérance serveur ±120 secondes.", { pattern: "^[0-9]{13}$" }),
    "x-device-nonce": str("Nonce unique reçu dans le challenge ou utilisé pour cette requête."),
    "x-device-signature": str("Signature ECDSA P-256 base64 de METHOD, PATH, SHA-256 du corps brut, timestamp et nonce, séparés par LF."),
    "x-device-token": str("Jeton d'appareil obtenu à l'enrôlement, requis après création de l'appareil."),
  },
};
const ENROLLMENT_PROOF_HEADERS: JSONSchema7 = {
  type: "object",
  required: ["x-device-timestamp", "x-device-nonce", "x-device-signature"],
  properties: {
    "x-device-timestamp": str("Horodatage Unix en millisecondes (`Date.now`), tolérance serveur ±120 secondes.", { pattern: "^[0-9]{13}$" }),
    "x-device-nonce": str("Nonce à usage unique fourni par le challenge."),
    "x-device-signature": str("Signature de la clé publique incluse dans le corps, encodée en base64."),
  },
};

function withErrors(success: Record<string, JSONSchema7 & { description?: string }>): Record<string, JSONSchema7 & { description?: string }> {
  return { ...success, ...ERROR_4XX };
}

/* --------------------------------------------------------------- la table */

export const ROUTE_DOCS: Record<string, RouteDoc> = {
  /* -------------------------------------------------------------- sondes */

  "GET /healthz": {
    summary: "Liveness",
    description: "Sonde de vie du processus. Ne consulte pas la base. Réservée aux contrôles d'exploitation : fournir `X-Health-Check-Key` (secret `HEALTHCHECK_KEY`).",
    tags: ["sondes"],
    security: [{ healthCheck: [] }],
    headers: { type: "object", required: ["x-health-check-key"], properties: { "x-health-check-key": str("Clé d'exploitation `HEALTHCHECK_KEY`; ne pas exposer dans un client public.") } },
    response: { 200: jsonResponse("Le processus répond.", { properties: { status: str("Toujours `ok`."), uptime: int("Secondes depuis le démarrage.") } }) },
  },

  "GET /readyz": {
    summary: "Readiness",
    description: "Sonde de disponibilité. Vérifie que la base répond. Réservée aux contrôles d'exploitation : fournir `X-Health-Check-Key` (secret `HEALTHCHECK_KEY`). Un échec renvoie 503 : l'instance ne doit pas recevoir de trafic.",
    tags: ["sondes"],
    security: [{ healthCheck: [] }],
    headers: { type: "object", required: ["x-health-check-key"], properties: { "x-health-check-key": str("Clé d'exploitation `HEALTHCHECK_KEY`; ne pas exposer dans un client public.") } },
    response: {
      200: jsonResponse("Base joignable.", { properties: { status: str("`ready`.") } }),
      503: errorResponse("Base injoignable."),
    },
  },

  /* ------------------------------------------------------------ appareils */

  "POST /v1/devices/challenges": {
    summary: "Demander un challenge d'appareil",
    description:
      "Ouvre une preuve à usage unique pour l'enrôlement, la connexion ou le rafraîchissement. " +
      "Le nonce renvoyé est celui que l'appareil signe à l'étape suivante ; il expire en 60 secondes.",
    tags: ["appareils"],
    security: [],
    body: {
      type: "object",
      additionalProperties: false,
      required: ["installationId", "purpose"],
      properties: {
        installationId: str("Identifiant d'installation, stable tant que l'app n'est pas réinstallée.", { example: "inst-7f3c…" }),
        purpose: { type: "string", enum: ["enroll", "login", "refresh"], description: "Usage prévu de la preuve." },
      },
    },
    response: withErrors({
      200: jsonResponse("Challenge émis.", {
        properties: {
          challengeId: str("Identifiant du challenge."),
          nonce: str("Nonce à signer."),
          expiresAt: str("Expiration ISO 8601.", { format: "date-time" }),
          serverTime: str("Heure serveur, pour corriger l'horloge du téléphone.", { format: "date-time" }),
        },
      }),
    }),
  },

  "POST /v1/devices/enroll": {
    summary: "Enrôler un appareil",
    description:
      "Enregistre deux clés publiques EC P-256 (signature et accord ECDH) et rend un jeton d'appareil. " +
      "Une clé d'un autre type est refusée avant toute écriture. Le challenge est consommé.",
    tags: ["appareils"],
    security: [{ enrollmentProof: [] }],
    headers: ENROLLMENT_PROOF_HEADERS,
    body: {
      type: "object",
      additionalProperties: false,
      required: ["challengeId", "installationId", "deviceName", "signingKey", "agreementKey"],
      properties: {
        challengeId: str("Challenge obtenu à l'étape précédente."),
        installationId: str("Doit correspondre à celui du challenge."),
        deviceName: str("Nom lisible de l'appareil.", { example: "Pixel 8" }),
        platform: str("Plateforme déclarée.", { enum: ["android"], default: "android" }),
        signingKey: str("Clé publique de signature, SPKI base64."),
        agreementKey: str("Clé publique d'accord ECDH, SPKI base64."),
        appVersion: str("Version de l'application.", { example: "1.0.0" }),
        androidVersion: int("Niveau d'API Android.", { example: 34 }),
        integrityToken: str("Jeton Play Integrity, stocké sans être vérifié aujourd'hui."),
      },
    },
    response: withErrors({
      201: jsonResponse("Appareil enrôlé.", {
        properties: {
          deviceId: str("Identifiant de l'appareil."),
          deviceToken: str("Jeton à présenter ensuite dans `X-Device-Token`."),
          serverTime: str("Heure serveur.", { format: "date-time" }),
          status: str("`enrolled`."),
        },
      }),
      409: errorResponse("Appareil déjà rattaché à un compte."),
    }),
  },

  "GET /v1/me/devices": {
    summary: "Lister ses appareils",
    description: "Renvoie les appareils du compte, avec leur statut et le quota du forfait.",
    tags: ["appareils"],
    security: DEVICE_SECURITY,
    response: withErrors({
      200: jsonResponse("Appareils du compte.", {
        properties: { items: arrayOf(shape({ id: str("Identifiant."), name: str("Nom."), status: str("`active`, `revoked` ou `pending`.") }), "Appareils.") },
      }),
    }),
  },

  "DELETE /v1/me/devices/:deviceId": {
    summary: "Révoquer un appareil",
    description: "Révoque l'appareil et coupe ses sessions. Le tunnel déjà établi s'éteint à la reconnexion suivante.",
    tags: ["appareils"],
    security: DEVICE_SECURITY,
    params: PARAM_DEVICE_ID,
    response: withErrors({ 204: { description: "Appareil révoqué." } }),
  },

  "POST /v1/me/devices/current/activate": {
    summary: "Activer l'appareil courant",
    description: "Promène l'appareil courant dans le quota du forfait, en remplaçant l'appareil actif s'il est plein.",
    tags: ["appareils"],
    security: DEVICE_SECURITY,
    response: withErrors({ 200: jsonResponse("Appareil activé.", { properties: { deviceId: str("Identifiant."), status: str("`active`.") } }) }),
  },

  /* -------------------------------------------------------------- comptes */

  "POST /v1/auth/register": {
    summary: "Créer un compte",
    description:
      "Crée le compte de la marque `appId` et rattache l'appareil enrôlé. Le numéro de téléphone est obligatoire et " +
      "unique par marque. Un même email peut exister sur deux marques, jamais deux fois sur la même.",
    tags: ["comptes"],
    security: [{ deviceProof: [] }],
    headers: DEVICE_PROOF_HEADERS,
    body: {
      type: "object",
      additionalProperties: false,
      required: ["appId", "email", "password", "name", "phone"],
      properties: {
        appId: str("Marque du compte."),
        email: str("Email du compte.", { format: "email", example: "client@example.com" }),
        password: str("Mot de passe.", { minLength: 8, example: "mot-de-passe-solide" }),
        name: str("Nom affiché.", { example: "Awa" }),
        phone: str("Numéro obligatoire, normalisé sans espaces.", { example: "+237612345678" }),
        locale: str("Langue préférée.", { example: "fr" }),
      },
    },
    response: withErrors({
      201: jsonResponse("Compte créé, session ouverte.", {
        properties: {
          accessToken: str("Jeton d'accès, 15 minutes."),
          refreshToken: str("Jeton de rafraîchissement opaque."),
          refreshExpiresAt: str("Échéance absolue du rafraîchissement.", { format: "date-time" }),
          user: shape({ id: str("Identifiant."), email: str("Email."), name: str("Nom.") }),
          device: shape({ id: str("Identifiant."), status: str("Statut.") }),
        },
      }),
      409: errorResponse("Email déjà pris sur cette marque, ou appareil déjà rattaché."),
    }),
  },

  "POST /v1/auth/login": {
    summary: "Se connecter",
    description:
      "Ouvre une session pour un compte de la marque `appId`. Email inconnu, mauvaise marque et mot de passe faux " +
      "renvoient le même message : la réponse ne dit jamais si un compte existe.",
    tags: ["comptes"],
    security: [{ deviceProof: [] }],
    headers: DEVICE_PROOF_HEADERS,
    body: {
      type: "object",
      additionalProperties: false,
      required: ["appId", "email", "password"],
      properties: {
        appId: str("Marque du compte."),
        email: str("Email.", { format: "email" }),
        password: str("Mot de passe."),
      },
    },
    response: withErrors({
      200: jsonResponse("Session ouverte.", { properties: { accessToken: str("Jeton."), refreshToken: str("Rafraîchissement.") } }),
      401: errorResponse("Identifiants invalides. Message identique dans tous les cas."),
      409: errorResponse("Appareil rattaché à un autre compte."),
    }),
  },

  "POST /v1/auth/refresh": {
    summary: "Rafraîchir une session",
    description: "Fait tourner le jeton de rafraîchissement. L'ancien meurt ; le rejouer depuis un autre appareil révoque la chaîne.",
    tags: ["comptes"],
    security: [{ deviceProof: [] }],
    headers: DEVICE_PROOF_HEADERS,
    body: { type: "object", additionalProperties: false, required: ["refreshToken"], properties: { refreshToken: str("Jeton à faire tourner.") } },
    response: withErrors({
      200: jsonResponse("Nouvelle paire.", { properties: { accessToken: str("Jeton."), refreshToken: str("Nouveau rafraîchissement.") } }),
    }),
  },

  "POST /v1/auth/logout": {
    summary: "Se déconnecter",
    description: "Révoque la session courante côté serveur, pas seulement côté client.",
    tags: ["comptes"],
    security: DEVICE_SECURITY,
    response: withErrors({ 204: { description: "Session révoquée." } }),
  },

  /* ------------------------------------------------------------- abonnement */

  "GET /v1/me": {
    summary: "Lire son profil",
    description: "Profil, communauté, droits en cours, appareil courant et quota d'appareils.",
    tags: ["abonnement"],
    security: DEVICE_SECURITY,
    response: withErrors({ 200: jsonResponse("Profil complet.", { properties: { user: shape({}), community: shape({}), entitlement: shape({}), device: shape({}), devicesUsed: int("Places utilisées.") } }) }),
  },

  "PATCH /v1/me": {
    summary: "Modifier son profil",
    description: "Seuls `name` et `locale` sont modifiables. Un autre champ est refusé, pas ignoré.",
    tags: ["abonnement"],
    security: DEVICE_SECURITY,
    body: { type: "object", additionalProperties: false, properties: { name: str("Nom affiché."), locale: str("Langue.", { example: "fr" }) } },
    response: withErrors({ 200: jsonResponse("Profil mis à jour.", { properties: { name: str("Nom."), locale: str("Langue.") } }) }),
  },

  "GET /v1/me/subscription": {
    summary: "Lire son abonnement",
    description: "Droits (`active`, `planCode`, `daysRemaining`, `deviceLimit`, `activationPending`) et détail de l'abonnement.",
    tags: ["abonnement"],
    security: DEVICE_SECURITY,
    response: withErrors({ 200: jsonResponse("Droits et abonnement.", { properties: { entitlement: shape({ active: { type: "boolean" } }), subscription: shape({}) } }) }),
  },

  /* ---------------------------------------------------------------- bundle */

  "GET /v1/configuration-bundles/current": {
    summary: "Récupérer la liste de configurations",
    description:
      "Renvoie une enveloppe **chiffrée** : aucun hôte, aucun UUID, aucun `vless://` en clair. " +
      "Le client l'ouvre en mémoire avec sa clé d'accord. Un `If-None-Match` à jour reçoit 304, sauf si l'enveloppe en cache est expirée.",
    tags: ["bundle"],
    security: DEVICE_SECURITY,
    headers: { type: "object", properties: { "if-none-match": str("ETag du bundle précédent.") } },
    response: withErrors({
      200: jsonResponse("Enveloppe scellée.", {
        properties: {
          revision: int("Révision du pool."),
          issuedAt: str("Émission.", { format: "date-time" }),
          expiresAt: str("Fin de validité de l'enveloppe.", { format: "date-time" }),
          configCount: int("Nombre de configurations scellées."),
          envelope: shape({ version: str("Version d'enveloppe."), ephemeralKey: str("Clé éphémère."), salt: str("Sel HKDF."), iv: str("IV AES-GCM."), ciphertext: str("Clair chiffré."), tag: str("Tag GCM."), digest: str("Empreinte du clair.") }),
        },
      }),
      304: { description: "Rien n'a changé, et l'enveloppe en cache est encore valide." },
      402: errorResponse("Abonnement requis ou expiré."),
      403: errorResponse("Appareil révoqué, ou appartenant à un autre compte."),
    }),
  },

  /* ------------------------------------------------------------- catalogue */

  "GET /v1/apps/:appId/plans": {
    summary: "Lister les offres d'une marque",
    description: "Offres actives de la marque, avec la révision que la commande doit renvoyer. Route publique.",
    tags: ["catalogue"],
    security: [],
    params: PARAM_APP_ID,
    response: withErrors({
      200: jsonResponse("Catalogue de la marque.", {
        properties: {
          app: shape({ id: str("Marque."), name: str("Nom.") }),
          items: arrayOf(
            shape({
              id: str("Forfait."),
              code: str("Code stable."),
              name: str("Nom."),
              priceXaf: int("Prix en XAF."),
              durationDays: int("Durée en jours."),
              deviceLimit: int("Appareils inclus."),
              revision: str("Révision à renvoyer à la commande."),
            }),
            "Offres actives.",
          ),
        },
      }),
      404: errorResponse("Marque inconnue."),
    }),
  },

  /* ------------------------------------------------------------- commandes */

  "POST /v1/orders": {
    summary: "Créer une commande",
    description:
      "Le prix et la commission sont lus en base, jamais dans le corps. Une révision périmée renvoie 409 sans rien créer. " +
      "La réponse porte l'URL de paiement du fournisseur.",
    tags: ["commandes"],
    security: DEVICE_SECURITY,
    body: {
      type: "object",
      additionalProperties: false,
      required: ["planId", "planRevision"],
      properties: { planId: str("Forfait choisi."), planRevision: str("Révision lue dans le catalogue.") },
    },
    response: withErrors({
      201: jsonResponse("Commande créée.", {
        properties: {
          orderId: str("Commande."),
          status: str("`created` ou `pending`."),
          amountXaf: int("Montant."),
          checkout: shape({ url: str("URL de paiement."), provider: str("Fournisseur.") }),
        },
      }),
      409: errorResponse("`PLAN_CHANGED` : la révision a changé, relire le catalogue."),
    }),
  },

  "GET /v1/orders": {
    summary: "Lister ses commandes",
    description: "Historique du compte, du plus récent au plus ancien, avec curseur opaque.",
    tags: ["commandes"],
    security: DEVICE_SECURITY,
    querystring: { type: "object", properties: { limit: int("1 à 100.", { minimum: 1, maximum: 100 }), cursor: str("Curseur de la page précédente.") } },
    response: withErrors({ 200: jsonResponse("Page de commandes.", { properties: { items: arrayOf(shape({ id: str("Commande."), status: str("Statut."), amountXaf: int("Montant.") }), "Commandes."), nextCursor: str("Curseur suivant, absent à la fin.") } }) }),
  },

  "GET /v1/orders/:orderId": {
    summary: "Lire une commande",
    description: "Statut d'une commande du compte. `?refresh=1` réconcilie le paiement chez le fournisseur si le webhook est en retard.",
    tags: ["commandes"],
    security: DEVICE_SECURITY,
    params: PARAM_ORDER_ID,
    querystring: { type: "object", properties: { refresh: str("`1` pour revérifier chez le fournisseur.") } },
    response: withErrors({ 200: jsonResponse("Commande.", { properties: { id: str("Commande."), status: str("Statut."), activationStatus: str("`active`, `pending`, `revoked` ou `not_started`.") } }) }),
  },

  /* -------------------------------------------------------------- paiement */

  "POST /v1/payments/webhook/:provider": {
    summary: "Recevoir un webhook fournisseur",
    description:
      "Réservé au fournisseur de paiement : fournir `X-Webhook-Secret` (`FAPSHI_WEBHOOK_SECRET`). En production, ce secret est obligatoire et le statut est aussi revérifié auprès du fournisseur. " +
      "Un webhook rejoué n'active qu'une fois.",
    tags: ["paiements"],
    security: [{ webhookSecret: [] }],
    headers: { type: "object", required: ["x-webhook-secret"], properties: { "x-webhook-secret": str("Secret partagé avec le fournisseur, `FAPSHI_WEBHOOK_SECRET`.") } },
    params: { type: "object", required: ["provider"], properties: { provider: str("Doit égaler `PAYMENT_PROVIDER`, sinon 404.") } },
    body: { type: "object", additionalProperties: true, description: "Enveloppe du fournisseur. Seule la référence est lue." },
    response: withErrors({
      200: jsonResponse("Événement traité.", { properties: { received: { type: "boolean" } } }),
      404: errorResponse("Fournisseur inconnu."),
      401: errorResponse("Secret de webhook absent ou incorrect."),
      409: errorResponse("Montant différent de la commande."),
      503: errorResponse("Revérification fournisseur désactivée."),
    }),
  },

  "POST /pay/mock/:ref/confirm": {
    summary: "Confirmer un paiement simulé",
    description: "Route de simulation, montée uniquement si `PAYMENT_PROVIDER=mock`. Elle n'existe pas en production (garde-fou D55).",
    tags: ["paiements"],
    security: [],
    params: { type: "object", required: ["ref"], properties: { ref: str("Référence de paiement simulée.") } },
    body: { type: "object", additionalProperties: false, properties: { outcome: { type: "string", enum: ["paid", "failed"], description: "Résultat simulé." } } },
    response: { 200: { description: "Page HTML de résultat de simulation.", contentType: "text/html" } },
  },

  "GET /pay/mock/:ref": {
    summary: "Afficher le paiement simulé",
    description: "Page HTML de test avec les actions de confirmation ou d'échec. Cette route n'est enregistrée que lorsque `PAYMENT_PROVIDER=mock` ; elle est absente en production.",
    tags: ["paiements"],
    security: [],
    params: { type: "object", required: ["ref"], properties: { ref: str("Référence du paiement simulé.") } },
    response: { 200: { description: "Formulaire HTML du fournisseur de paiement simulé.", contentType: "text/html" }, 404: errorResponse("Référence inconnue.") },
  },

  "GET /pay/return/:orderId": {
    summary: "Afficher le retour du paiement",
    description: "Page HTML de retour navigateur après le checkout. Son affichage ne confirme pas le paiement : lire la commande via `GET /v1/orders/{orderId}` pour connaître son état vérifié.",
    tags: ["paiements"],
    security: [],
    params: PARAM_ORDER_ID,
    response: { 200: { description: "Page HTML de retour du checkout.", contentType: "text/html" } },
  },

  /* ------------------------------------------------------------- télémétrie */

  "POST /v1/me/telemetry": {
    summary: "Envoyer santé et consommation",
    description:
      "Seul endroit où un client change la santé d'un nœud. L'heure du serveur fait foi, `deviceId` vient de la session, " +
      "`configId` doit exister. Au plus 20 rapports par requête ; `usage` est un cumul monotone.",
    tags: ["télémétrie"],
    security: DEVICE_SECURITY,
    body: {
      type: "object",
      additionalProperties: false,
      properties: {
        usage: {
          type: "object",
          additionalProperties: false,
          required: ["day", "bytesUp", "bytesDown", "seconds"],
          properties: {
            day: str("Jour du téléphone, borné à ±1 jour de l'heure serveur.", { example: "2026-10-23" }),
            bytesUp: int("Octets émis."),
            bytesDown: int("Octets reçus."),
            seconds: int("Durée de session."),
          },
        },
        reports: {
          type: "array",
          maxItems: 20,
          description: "Mesures par configuration. Vide ou absent pour un envoi de consommation seule.",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["configId", "ok"],
            properties: { configId: str("Identifiant de configuration."), ok: { type: "boolean", description: "Le test à travers le tunnel a-t-il réussi ?" }, latencyMs: int("Latence mesurée, nulle en échec.") },
          },
        },
      },
    },
    response: withErrors({
      202: jsonResponse("Rapports acceptés.", { properties: { accepted: int("Rapports enregistrés."), usage: shape({ day: str("Jour."), source: str("`device`.") }) } }),
      400: errorResponse("Lot trop gros, jour hors fenêtre, ou `configId` inconnu."),
    }),
  },

  /* -------------------------------------------------------------- ingestion */

  "POST /v1/internal/endpoints/register": {
    summary: "Enregistrer un nœud",
    description:
      "Appelé par le conteneur au démarrage. Idempotent par `deployment_key` : un redémarrage rend le même UUID et n'étend jamais l'expiration. " +
      "Le serveur génère lui-même l'UUID et le chemin WebSocket.",
    tags: ["ingestion"],
    security: INGEST_SECURITY,
    body: {
      type: "object",
      additionalProperties: false,
      required: ["deployment_key", "public_host"],
      properties: {
        deployment_key: str("`K_SERVICE:K_REVISION`, ou le nom d'hôte.", { example: "vpn-lab-1:00001-abc" }),
        public_host: str("Hôte public, sans schéma ni chemin.", { example: "vpn-lab-1-xxxx.run.app" }),
        port: int("Port public annoncé.", { example: 443 }),
        sni: str("SNI TLS. Défaut : `public_host`."),
        region: str("Région.", { example: "us-central1" }),
        label: str("Libellé lisible."),
        capacity: int("Capacité annoncée."),
        ttl_seconds: int("Durée de vie demandée, bornée par `ENDPOINT_MIN_TTL` et `ENDPOINT_MAX_TTL`."),
        agent_version: str("Version du conteneur.", { example: "endpoint/1.0" }),
        tier: { type: "string", enum: ["free-labs", "paid-gcp"], description: "Nature du nœud. Jamais mélangée." },
        identity_mode: { type: "string", enum: ["shared", "per_device"], description: "`per_device` n'a de sens que sur `paid-gcp`." },
      },
    },
    response: withErrors({
      200: jsonResponse("Nœud enregistré ou rejoué.", {
        properties: {
          endpoint_id: str("Nœud."),
          uuid: str("Identité VLESS à écrire côté Xray."),
          ws_path: str("Chemin WebSocket généré par le serveur."),
          expires_at: str("Expiration.", { format: "date-time" }),
          status: str("`pending` ou `active`."),
          pool_revision: int("Révision du pool."),
          tier: str("Tier retenu."),
          client_pool: arrayOf({ type: "string" }, "UUID pré-provisionnés, uniquement en `per_device`."),
        },
      }),
      409: errorResponse("Déploiement expiré."),
    }),
  },

  "POST /v1/internal/endpoints/ready": {
    summary: "Déclarer un nœud prêt",
    description: "Passe `pending` à `active` si l'auto-approbation est active. Ne touche jamais à la santé : seule la télémétrie le fait.",
    tags: ["ingestion"],
    security: INGEST_SECURITY,
    body: { type: "object", additionalProperties: false, required: ["deployment_key"], properties: { deployment_key: str("Clé de déploiement."), tier: str("Tier annoncé, ignoré s'il diffère.") } },
    response: withErrors({ 200: jsonResponse("Statut et révision.", { properties: { status: str("`active` ou `pending`."), pool_revision: int("Révision.") } }) }),
  },

  "POST /v1/internal/endpoints/heartbeat": {
    summary: "Battement de cœur d'un nœud",
    description: "Met à jour `last_seen_at`. Ne prolonge jamais l'expiration et ne lève jamais un `down` posé par les clients.",
    tags: ["ingestion"],
    security: INGEST_SECURITY,
    body: {
      type: "object",
      additionalProperties: false,
      required: ["deployment_key"],
      properties: {
        deployment_key: str("Clé de déploiement."),
        latency_ms: int("Latence mesurée par le conteneur."),
        healthy: { type: "boolean", description: "Déclaration du conteneur. Ne lève jamais un `down`." },
        agent_version: str("Version."),
        usage: arrayOf(
          {
            type: "object",
            additionalProperties: false,
            required: ["uuid"],
            properties: { uuid: str("Identité du client."), bytesUp: int("Octets émis."), bytesDown: int("Octets reçus.") },
          },
          "Consommation par identité, nœud `paid-gcp` uniquement.",
        ),
      },
    },
    response: withErrors({ 200: jsonResponse("Accusé.", { properties: { status: str("Statut courant."), expires_at: str("Expiration.", { format: "date-time" }) } }) }),
  },

  "GET /v1/internal/pool": {
    summary: "Diagnostic du pool",
    description: "État des nœuds pour le conteneur. Ne renvoie jamais d'UUID, de credential ni de chemin WebSocket.",
    tags: ["ingestion"],
    security: INGEST_SECURITY,
    response: withErrors({ 200: jsonResponse("Nœuds et révision.", { properties: { count: int("Nombre."), revision: int("Révision."), endpoints: arrayOf(shape({ endpointId: str("Nœud."), tier: str("Tier."), status: str("Statut."), health: str("Santé."), expiresAt: str("Expiration.") }), "Nœuds.") } }) }),
  },

  /* ----------------------------------------------------------------- builds */

  "POST /v1/admin/apps/:appId/builds": {
    summary: "Déclencher un build de marque",
    description:
      "Le manifeste vient de la base et de l'origine serveur, jamais du corps. Le numéro de version est calculé sous verrou. " +
      "Un refus de GitHub marque le build `failed` et renvoie 502.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: PARAM_APP_ID,
    body: { type: "object", additionalProperties: false, properties: { versionName: str("Nom de version. Défaut `1.0.0`.", { example: "1.2.0" }) } },
    response: withErrors({ 202: jsonResponse("Build en file.", { properties: { buildId: str("Build."), status: str("`queued`.") } }), 422: errorResponse("Marque incomplète : le champ manquant est nommé.") }),
  },

  "GET /v1/admin/apps/:appId/builds": {
    summary: "Suivre les builds d'une marque",
    description: "File des cent derniers builds, avec empreinte et lien de téléchargement une fois le callback reçu.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: PARAM_APP_ID,
    response: withErrors({ 200: jsonResponse("Builds.", { properties: { items: arrayOf(shape({ id: str("Build."), status: str("Statut."), versionCode: int("Version."), sha256: str("Empreinte."), apkUrl: str("Lien de l'APK.") }), "Builds.") } }) }),
  },

  "POST /v1/internal/builds/:id/callback": {
    summary: "Clore un build depuis la CI",
    description: "Secret propre au callback, distinct de l'ingestion. Idempotent : rejouer le même corps ne change rien.",
    tags: ["ingestion"],
    security: [{ buildCallback: [] }],
    params: { type: "object", required: ["id"], properties: { id: str("Build à clore.") } },
    body: {
      type: "object",
      additionalProperties: false,
      required: ["status"],
      properties: {
        status: { type: "string", enum: ["queued", "running", "succeeded", "failed", "cancelled"] },
        sha256: str("Empreinte de l'APK signé.", { pattern: "^[0-9a-f]{64}$" }),
        apkUrl: str("Lien https de l'APK.", { format: "uri" }),
        versionCode: int("Code de version."),
        runId: str("Identifiant du run CI."),
      },
    },
    response: withErrors({ 200: jsonResponse("Build mis à jour.", { properties: { buildId: str("Build."), status: str("Statut.") } }), 503: errorResponse("Callback non configuré.") }),
  },

  /* ---------------------------------------------------------------- offline */

  "GET /v1/admin/offline-bundles": {
    summary: "Lister les fichiers hors-ligne",
    description: "États seulement : jamais le contenu d'un fichier hors-ligne.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    response: withErrors({ 200: jsonResponse("Fichiers.", { properties: { items: arrayOf(shape({ id: str("Fichier."), deviceId: str("Appareil."), consumedAt: str("Consommation.") }), "Fichiers.") } }) }),
  },

  "POST /v1/offline-bundles/:bundleId/consumed": {
    summary: "Marquer un fichier hors-ligne consommé",
    description: "Usage unique, lié à l'appareil. L'app ne l'appelle pas encore.",
    tags: ["abonnement"],
    security: DEVICE_SECURITY,
    params: { type: "object", required: ["bundleId"], properties: { bundleId: str("Fichier.") } },
    response: withErrors({ 204: { description: "Marqué consommé." }, 409: errorResponse("Déjà consommé.") }),
  },

  /* ---------------------------------------------------------- administration */

  "POST /v1/admin/auth/login": {
    summary: "Connexion à la console",
    description: "Connexion par mot de passe après la clé partagée `X-Access-Key` (obligatoire en production). Message identique pour compte inconnu et mot de passe faux. TTL 8 heures.",
    tags: ["administration"],
    security: [{ accessKey: [] }],
    body: { type: "object", additionalProperties: false, required: ["email", "password"], properties: { email: str("Email.", { format: "email" }), password: str("Mot de passe.") } },
    response: withErrors({
      200: jsonResponse("Session d'administration.", { properties: { accessToken: str("Jeton `vpn-admin`."), token: str("Alias du même jeton."), accessExpiresAt: str("Expiration.", { format: "date-time" }), admin: shape({ id: str("Admin."), email: str("Email."), platformRole: str("`owner` ou `none`."), memberships: arrayOf(shape({ communityId: str("Communauté."), role: str("Rôle local.") }), "Appartenances.") }) } }),
      429: errorResponse("Trop de tentatives. `retryAfter` en secondes."),
    }),
  },

  "GET /v1/admin/me": {
    summary: "Contexte de la session",
    description: "Rôle plateforme et appartenances relus en base à chaque requête, jamais lus dans le jeton.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    response: withErrors({ 200: jsonResponse("Contexte.", { properties: { id: str("Admin."), platformRole: str("Rôle."), memberships: arrayOf(shape({}), "Appartenances.") } }) }),
  },

  "GET /v1/admin/communities": {
    summary: "Lister les communautés",
    description: "Owner : toutes. Autres rôles : uniquement celles où l'appartenance est active.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    response: withErrors({ 200: jsonResponse("Communautés.", { properties: { items: arrayOf(shape({ id: str("Communauté."), name: str("Nom."), slug: str("Identifiant lisible."), status: str("`active` ou `suspended`."), commissionBps: int("Part des communautés, en points de base.") }), "Communautés.") } }) }),
  },

  "POST /v1/admin/communities": {
    summary: "Créer une communauté",
    description: "Owner uniquement. `slug` en minuscules, chiffres et tirets.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    body: { type: "object", additionalProperties: false, required: ["name", "slug"], properties: { name: str("Nom.", { example: "Bouendji" }), slug: str("Identifiant lisible.", { example: "bouendji" }), commissionBps: int("0 à 3000. Défaut 3000.", { minimum: 0, maximum: 3000 }) } },
    response: withErrors({ 201: jsonResponse("Communauté créée.", { properties: { id: str("Communauté."), slug: str("Slug.") } }) }),
  },

  "GET /v1/admin/communities/:communityId": {
    summary: "Lire une communauté",
    description: "Lecture scopée : un membre ne voit que la sienne.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: PARAM_COMMUNITY_ID,
    response: withErrors({ 200: jsonResponse("Communauté.", { properties: { id: str("Communauté."), name: str("Nom."), commissionBps: int("Part.") } }) }),
  },

  "PATCH /v1/admin/communities/:communityId": {
    summary: "Modifier une communauté",
    description: "Owner uniquement. `commissionBps` reste borné à 3000.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: PARAM_COMMUNITY_ID,
    body: { type: "object", additionalProperties: false, properties: { name: str("Nom."), commissionBps: int("0 à 3000.", { minimum: 0, maximum: 3000 }), status: { type: "string", enum: ["active", "suspended"] } } },
    response: withErrors({ 200: jsonResponse("Communauté mise à jour.", { properties: { id: str("Communauté.") } }) }),
  },

  "GET /v1/admin/apps": {
    summary: "Lister les marques",
    description: "Marques visibles pour le rôle, avec `brandReady` : le bouton « Construire » se désactive quand un champ manque.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    response: withErrors({ 200: jsonResponse("Marques.", { properties: { items: arrayOf(shape({ id: str("Marque."), name: str("Nom."), packageName: str("Identifiant Android."), communityId: str("Communauté."), theme: str("Thème."), brandReady: { type: "boolean" } }), "Marques.") } }) }),
  },

  "GET /v1/admin/apps/:appId/plans": {
    summary: "Lister les forfaits d'une marque",
    description: "Toutes les offres, actives ou non.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: PARAM_APP_ID,
    response: withErrors({ 200: jsonResponse("Forfaits.", { properties: { items: arrayOf(shape({ id: str("Forfait."), code: str("Code."), priceXaf: int("Prix."), durationDays: int("Durée."), active: { type: "boolean" } }), "Forfaits.") } }) }),
  },

  "POST /v1/admin/apps/:appId/plans": {
    summary: "Créer un forfait",
    description: "Prix et durée libres. `code` est stable et fait partie de la révision comparée par l'app.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: PARAM_APP_ID,
    body: {
      type: "object",
      additionalProperties: false,
      required: ["code", "name", "priceXaf", "durationDays"],
      properties: {
        code: str("Code stable, minuscules et tirets.", { example: "1-jour" }),
        name: str("Nom.", { example: "1 jour" }),
        description: str("Description."),
        priceXaf: int("Prix en XAF.", { example: 300, minimum: 1 }),
        durationDays: int("Durée en jours.", { example: 1, minimum: 1 }),
        deviceLimit: int("Appareils inclus.", { minimum: 1, maximum: 10 }),
        badge: str("Badge affiché."),
        featured: { type: "boolean" },
        active: { type: "boolean" },
        sortOrder: int("Ordre d'affichage."),
      },
    },
    response: withErrors({ 201: jsonResponse("Forfait créé.", { properties: { id: str("Forfait."), revision: str("Révision.") } }), 422: errorResponse("Tier sans nœud actif.") }),
  },

  "PATCH /v1/admin/plans/:planId": {
    summary: "Modifier un forfait",
    description: "`code` est immuable : il fait partie de la révision que l'app compare. Les commandes passées gardent leur prix.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: { type: "object", required: ["planId"], properties: { planId: str("Forfait.") } },
    body: { type: "object", additionalProperties: false, properties: { name: str("Nom."), priceXaf: int("Prix."), durationDays: int("Durée."), deviceLimit: int("Appareils."), badge: str("Badge."), featured: { type: "boolean" }, active: { type: "boolean" }, sortOrder: int("Ordre.") } },
    response: withErrors({ 200: jsonResponse("Forfait mis à jour.", { properties: { id: str("Forfait."), revision: str("Nouvelle révision.") } }) }),
  },

  "GET /v1/admin/communities/:communityId/memberships": {
    summary: "Lister les membres",
    description: "Owner et `community_admin` de la communauté.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: PARAM_COMMUNITY_ID,
    response: withErrors({ 200: jsonResponse("Membres.", { properties: { items: arrayOf(shape({ id: str("Appartenance."), adminUserId: str("Compte."), role: str("Rôle."), status: str("Statut.") }), "Membres.") } }) }),
  },

  "POST /v1/admin/communities/:communityId/memberships": {
    summary: "Ajouter un membre",
    description: "Le `communityId` du corps est ignoré : le chemin fait foi.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: PARAM_COMMUNITY_ID,
    body: { type: "object", additionalProperties: false, required: ["adminUserId", "role"], properties: { adminUserId: str("Compte à ajouter."), role: { type: "string", enum: ["community_admin", "support", "finance"] } } },
    response: withErrors({ 201: jsonResponse("Membre ajouté.", { properties: { id: str("Appartenance.") } }), 409: errorResponse("Appartenance déjà existante.") }),
  },

  "PATCH /v1/admin/memberships/:membershipId": {
    summary: "Modifier un membre",
    description: "Un non-owner ne peut pas modifier sa propre appartenance. Le dernier `community_admin` actif ne peut pas être retiré.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: { type: "object", required: ["membershipId"], properties: { membershipId: str("Appartenance.") } },
    body: { type: "object", additionalProperties: false, properties: { role: { type: "string", enum: ["community_admin", "support", "finance"] }, status: { type: "string", enum: ["active", "disabled"] } } },
    response: withErrors({ 200: jsonResponse("Membre mis à jour.", { properties: { id: str("Appartenance.") } }), 409: errorResponse("Dernier administrateur actif.") }),
  },

  "DELETE /v1/admin/memberships/:membershipId": {
    summary: "Retirer un membre",
    description: "Désactivation logique. Mêmes garde-fous que la modification.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: { type: "object", required: ["membershipId"], properties: { membershipId: str("Appartenance.") } },
    response: withErrors({ 204: { description: "Retiré." }, 409: errorResponse("Dernier administrateur actif.") }),
  },

  "POST /v1/admin/admins": {
    summary: "Créer un compte d'administration",
    description: "Owner uniquement. Mot de passe de 12 caractères minimum.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    body: { type: "object", additionalProperties: false, required: ["email", "name", "password"], properties: { email: str("Email.", { format: "email" }), name: str("Nom."), password: str("Mot de passe.", { minLength: 12 }), platformRole: { type: "string", enum: ["none", "owner"] } } },
    response: withErrors({ 201: jsonResponse("Compte créé.", { properties: { id: str("Compte."), email: str("Email.") } }), 409: errorResponse("Email déjà utilisé.") }),
  },

  "GET /v1/admin/admins": {
    summary: "Lister les comptes d'administration",
    description: "Annuaire minimal : sans lui, ajouter un membre oblige à deviner un identifiant.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    response: withErrors({ 200: jsonResponse("Comptes.", { properties: { items: arrayOf(shape({ id: str("Compte."), email: str("Email."), name: str("Nom."), platformRole: str("Rôle."), active: { type: "boolean" } }), "Comptes.") } }) }),
  },

  "GET /v1/admin/communities/:communityId/users": {
    summary: "Lister les abonnés",
    description: "Owner, `community_admin` et `support` de la communauté.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: PARAM_COMMUNITY_ID,
    response: withErrors({ 200: jsonResponse("Abonnés.", { properties: { items: arrayOf(shape({ id: str("Compte."), email: str("Email."), phone: str("Téléphone.") }), "Abonnés.") } }) }),
  },

  "GET /v1/admin/communities/:communityId/devices": {
    summary: "Lister les appareils",
    description: "Appareils des abonnés de la communauté, avec statut et quota.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: PARAM_COMMUNITY_ID,
    response: withErrors({ 200: jsonResponse("Appareils.", { properties: { items: arrayOf(shape({ id: str("Appareil."), status: str("Statut."), userId: str("Compte.") }), "Appareils.") } }) }),
  },

  "POST /v1/admin/devices/:deviceId/revoke": {
    summary: "Révoquer un appareil",
    description: "Révoque l'appareil et ses sessions. Le tunnel en cours s'éteint à la reconnexion suivante.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: PARAM_DEVICE_ID,
    response: withErrors({ 200: jsonResponse("Appareil révoqué.", { properties: { id: str("Appareil."), status: str("`revoked`.") } }) }),
  },

  "POST /v1/admin/devices/:deviceId/offline-bundles": {
    summary: "Émettre un fichier hors-ligne",
    description: "Fichier signé Ed25519, à usage unique, lié à l'appareil. Sans clé de signature configurée, la route refuse.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: PARAM_DEVICE_ID,
    body: { type: "object", additionalProperties: false, properties: { ttlHours: int("1 à 72 heures.", { minimum: 1, maximum: 72 }) } },
    response: withErrors({ 201: jsonResponse("Fichier émis.", { properties: { id: str("Fichier."), notAfter: str("Expiration.", { format: "date-time" }) } }), 409: errorResponse("Clé de signature absente.") }),
  },

  "GET /v1/admin/communities/:communityId/orders": {
    summary: "Lister les commandes",
    description: "Les montants sont omis pour les rôles qui ne voient pas l'argent.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: PARAM_COMMUNITY_ID,
    querystring: { type: "object", properties: { status: str("Filtre de statut."), limit: int("1 à 100."), cursor: str("Curseur.") } },
    response: withErrors({ 200: jsonResponse("Commandes.", { properties: { items: arrayOf(shape({ id: str("Commande."), status: str("Statut."), amountXaf: int("Montant, absent si masqué.") }), "Commandes."), nextCursor: str("Curseur suivant.") } }) }),
  },

  "GET /v1/admin/communities/:communityId/commissions": {
    summary: "Lister les commissions",
    description: "Commissions de la communauté, avec leur état.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: PARAM_COMMUNITY_ID,
    querystring: { type: "object", properties: { status: str("Filtre."), limit: int("1 à 100.") } },
    response: withErrors({ 200: jsonResponse("Commissions.", { properties: { items: arrayOf(shape({ id: str("Commission."), amountXaf: int("Montant."), status: str("`pending`, `available`, `paid`.") }), "Commissions.") } }) }),
  },

  "POST /v1/admin/communities/:communityId/payouts": {
    summary: "Préparer un retrait",
    description: "Aucun montant dans le corps : il est calculé depuis les commissions disponibles. `note` est la seule entrée acceptée.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: PARAM_COMMUNITY_ID,
    body: { type: "object", additionalProperties: false, properties: { note: str("Note de préparation.", { maxLength: 280 }) } },
    response: withErrors({ 201: jsonResponse("Retrait préparé.", { properties: { id: str("Retrait."), amountXaf: int("Montant calculé."), status: str("`pending`."), commissionCount: int("Commissions rattachées.") } }), 409: errorResponse("Aucune commission disponible.") }),
  },

  "POST /v1/admin/payouts/:payoutId/approve": {
    summary: "Approuver un retrait",
    description: "Owner, `finance` ou `community_admin` de la communauté. Jamais sa propre demande. Transition conditionnelle : la seconde approbation reçoit 409.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: PARAM_PAYOUT_ID,
    response: withErrors({ 200: jsonResponse("Retrait approuvé.", { properties: { id: str("Retrait."), status: str("`approved`."), approvedBy: str("Approbateur.") } }), 409: errorResponse("Plus en attente, ou c'est votre propre demande.") }),
  },

  "POST /v1/admin/payouts/:payoutId/pay": {
    summary: "Exécuter le virement",
    description: "Réclamation atomique avant l'appel : un échec laisse le retrait `approved` avec `failed_reason`, rejouable.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: PARAM_PAYOUT_ID,
    response: withErrors({ 200: jsonResponse("Virement envoyé.", { properties: { id: str("Retrait."), status: str("`processing`."), providerRef: str("Référence fournisseur.") } }), 409: errorResponse("Non réclamable."), 502: errorResponse("Fournisseur injoignable : le retrait reste approuvé.") }),
  },

  "POST /v1/admin/payouts/:payoutId/confirm": {
    summary: "Confirmer un virement reçu",
    description: "`processing` → `paid`. Exige une référence fournisseur : un accusé de réception ne suffit pas.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: PARAM_PAYOUT_ID,
    response: withErrors({ 200: jsonResponse("Retrait payé.", { properties: { id: str("Retrait."), status: str("`paid`.") } }), 409: errorResponse("Référence absente ou état incompatible.") }),
  },

  "POST /v1/admin/payouts/:payoutId/resolve": {
    summary: "Clore une ambiguïté",
    description: "Un humain qui a vérifié chez Fapshi dit ce qui s'est passé. `reason` est la trace écrite.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: PARAM_PAYOUT_ID,
    body: { type: "object", additionalProperties: false, required: ["outcome"], properties: { outcome: { type: "string", enum: ["paid", "failed"] }, providerRef: str("Référence constatée."), reason: str("Motif.", { maxLength: 280 }) } },
    response: withErrors({ 200: jsonResponse("Retrait clos.", { properties: { id: str("Retrait."), status: str("`paid` ou `failed`.") } }) }),
  },

  "GET /v1/admin/payouts": {
    summary: "File des retraits",
    description: "`needs_review` en tête. Filtre par communauté et par statut.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    querystring: { type: "object", properties: { communityId: str("Communauté."), status: { type: "string", enum: ["pending", "approved", "processing", "paid", "failed", "needs_review"] }, limit: int("1 à 200.") } },
    response: withErrors({ 200: jsonResponse("Retraits.", { properties: { items: arrayOf(shape({ id: str("Retrait."), amountXaf: int("Montant."), status: str("Statut."), attempts: int("Tentatives.") }), "Retraits.") } }) }),
  },

  "GET /v1/admin/pool": {
    summary: "Lire le pool",
    description: "Tier, santé, raison et expiration. Jamais d'UUID, de chemin WebSocket ni de credential.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    response: withErrors({ 200: jsonResponse("Pool.", { properties: { count: int("Nœuds."), endpoints: arrayOf(shape({ endpointId: str("Nœud."), tier: str("Tier."), status: str("Statut."), health: str("Santé."), downReason: str("Raison du retrait."), expiresAt: str("Expiration.") }), "Nœuds.") } }) }),
  },

  "POST /v1/admin/endpoints/:endpointId/health": {
    summary: "Forcer la santé d'un nœud",
    description: "Le levier manuel : un nœud forgé ou douteux sort du service sans attendre un quorum.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: { type: "object", required: ["endpointId"], properties: { endpointId: str("Nœud.") } },
    body: { type: "object", additionalProperties: false, required: ["state"], properties: { state: { type: "string", enum: ["down", "healthy"] }, reason: str("Motif, conservé dans la trace.", { maxLength: 200 }) } },
    response: withErrors({ 200: jsonResponse("Santé mise à jour.", { properties: { id: str("Nœud."), health: str("Santé.") } }) }),
  },

  "GET /v1/admin/audit-log": {
    summary: "Lire le journal d'audit",
    description: "Append-only en base : une modification ou une suppression est un no-op, pas une réécriture silencieuse.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    querystring: { type: "object", properties: { communityId: str("Communauté."), limit: int("1 à 200.") } },
    response: withErrors({ 200: jsonResponse("Entrées.", { properties: { items: arrayOf(shape({ id: str("Entrée."), action: str("Action."), actorId: str("Auteur."), createdAt: str("Date.", { format: "date-time" }) }), "Entrées.") } }) }),
  },
};

/**
 * Complète une route avec son contrat. Appelé depuis `transform` de
 * `@fastify/swagger`, donc à la génération du document uniquement.
 */
export function docFor(method: string, url: string): RouteDoc | undefined {
  return ROUTE_DOCS[`${method.toUpperCase()} ${url}`];
}
