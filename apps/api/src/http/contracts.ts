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
      "Le client l'ouvre en mémoire avec sa clé d'accord. Un `If-None-Match` à jour reçoit 304, sauf si l'enveloppe en cache est expirée. " +
      "Format des configurations (une fois ouvertes) : `id`, `label`, `uri`, `expiresAt`, `region`, `maxSessionSeconds`, et `startsAt` (ISO 8601) " +
      "**uniquement** sur les nœuds de nuit d'un forfait `limited_night` (début du créneau acheté). Un forfait limité reçoit une seule configuration, " +
      "le client 3x-ui dédié de l'abonné (`id` = `xui-<subscriptionId>`), jamais un credential partagé. Forfait limité épuisé ou expiré : liste vide.",
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
              revision: int("Révision à renvoyer à la commande."),
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
    description: "Connexion par courriel ou numéro WhatsApp (`identifier`), après la clé partagée `X-Access-Key` (obligatoire en production). `email` reste accepté. Message identique pour compte inconnu et mot de passe faux. Jeton lié à une session révocable, TTL 8 heures. `mustChangePassword` vrai : seules les routes de compte répondent.",
    tags: ["administration"],
    security: [{ accessKey: [] }],
    body: { type: "object", additionalProperties: false, properties: { identifier: str("Courriel ou numéro WhatsApp (9 chiffres, +237 facultatif)."), email: str("Forme historique du courriel.", { format: "email" }), password: str("Mot de passe.") }, required: ["password"] },
    response: withErrors({
      200: jsonResponse("Session d'administration.", { properties: { token: str("Jeton `vpn-admin`."), expiresAt: str("Expiration.", { format: "date-time" }), mustChangePassword: { type: "boolean" }, accessToken: str("Alias du même jeton."), accessExpiresAt: str("Alias d'expiresAt.", { format: "date-time" }), admin: shape({ id: str("Admin."), email: str("Email."), name: str("Nom."), whatsappNumber: str("Numéro WhatsApp, 9 chiffres, ou null."), platformRole: str("Rang le plus haut : `owner`, `reseau` ou `none`."), platformRoles: arrayOf(str("`owner` ou `reseau`."), "Rôles cumulables."), mustChangePassword: { type: "boolean" }, memberships: arrayOf(shape({ communityId: str("Communauté."), role: str("Rôle local.") }), "Appartenances.") }) } }),
      400: errorResponse("Identifiant invalide ou champ inconnu."),
      429: errorResponse("Trop de tentatives pour ce compte depuis cette adresse, ou pour cette adresse. `retryAfter` en secondes."),
    }),
  },

  "POST /v1/admin/auth/logout": {
    summary: "Déconnexion",
    description: "Révoque la session qui a servi à appeler la route.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    response: withErrors({ 204: { description: "Session révoquée." } }),
  },

  "GET /v1/admin/me": {
    summary: "Contexte du compte connecté",
    description: "Rôles plateforme (cumulables) et appartenances relus en base à chaque requête, jamais lus dans le jeton. `mustChangePassword` vrai : changer le mot de passe avant toute autre route.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    response: withErrors({ 200: jsonResponse("Contexte.", { properties: { id: str("Admin."), email: str("Email."), name: str("Nom."), whatsappNumber: str("Numéro WhatsApp ou null."), platformRoles: arrayOf(str("`owner` ou `reseau`."), "Rôles cumulables."), platformRole: str("Rang le plus haut."), mustChangePassword: { type: "boolean" }, memberships: arrayOf(shape({ communityId: str("Communauté."), role: str("Rôle local.") }), "Appartenances."), onboarding: { description: "État de l'onboarding, ou null." } } }) }),
  },

  "PATCH /v1/admin/me": {
    summary: "Modifier son profil",
    description: "Nom, numéro WhatsApp (unique ; `null` l'efface) et identifiant Telegram (`null` l'efface). Au moins un champ.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    body: { type: "object", additionalProperties: false, properties: { name: str("Nom.", { minLength: 2, maxLength: 120 }), whatsappNumber: str("Numéro WhatsApp, ou null.", { maxLength: 40 }), telegramChatId: str("Identifiant Telegram (chiffres), ou null.", { maxLength: 21 }) } },
    response: withErrors({ 200: jsonResponse("Contexte mis à jour, même forme que GET /me.", { properties: { id: str("Admin.") } }), 409: errorResponse("Numéro déjà utilisé.") }),
  },

  "POST /v1/admin/me/password": {
    summary: "Changer son mot de passe",
    description: "Révoque toutes les sessions, y compris celle-ci, et renvoie un jeton neuf. Douze caractères minimum. Lève le drapeau de changement obligatoire.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    body: { type: "object", additionalProperties: false, required: ["currentPassword", "newPassword"], properties: { currentPassword: str("Mot de passe actuel."), newPassword: str("Nouveau mot de passe non vide.", { minLength: 1 }) } },
    response: withErrors({ 200: jsonResponse("Nouvelle session.", { properties: { token: str("Jeton `vpn-admin`."), expiresAt: str("Expiration.", { format: "date-time" }) } }), 429: errorResponse("Trop de tentatives sur le mot de passe actuel.") }),
  },

  "GET /v1/admin/me/sessions": {
    summary: "Lister mes sessions",
    description: "Sessions non révoquées et encore valables. `current` marque celle de la requête. Jamais de jeton.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    response: withErrors({ 200: jsonResponse("Sessions.", { properties: { sessions: arrayOf(shape({ id: str("Session."), createdAt: str("Ouverture.", { format: "date-time" }), lastSeenAt: str("Dernière activité.", { format: "date-time" }), userAgent: str("Navigateur ou null."), current: { type: "boolean" } }), "Sessions.") } }) }),
  },

  "DELETE /v1/admin/me/sessions/:sessionId": {
    summary: "Révoquer une de mes sessions",
    description: "Ne fonctionne que sur ses propres sessions ; une autre répond 404.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: { type: "object", required: ["sessionId"], properties: { sessionId: str("Session.") } },
    response: withErrors({ 204: { description: "Session révoquée." }, 404: errorResponse("Session introuvable.") }),
  },

  "DELETE /v1/admin/me/sessions": {
    summary: "Révoquer mes autres sessions",
    description: "Seul `scope=others` est accepté : toutes sauf la session de la requête.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    querystring: { type: "object", required: ["scope"], properties: { scope: { type: "string", enum: ["others"] } } },
    response: withErrors({ 204: { description: "Sessions révoquées." }, 400: errorResponse("Portée inconnue.") }),
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
    body: { type: "object", additionalProperties: false, properties: { name: str("Nom."), commissionBps: int("0 à 3000.", { minimum: 0, maximum: 3000 }), status: { type: "string", enum: ["active", "suspended"] }, whatsappGroupUrl: { type: ["string", "null"], description: "Lien https://chat.whatsapp.com/..., ou null." }, contactWhatsapp: { type: ["string", "null"], description: "9 chiffres, +237 facultatif, ou null." } } },
    response: withErrors({ 200: jsonResponse("Communauté mise à jour.", { properties: { id: str("Communauté."), whatsappGroupUrl: str("Lien du groupe, ou null."), contactWhatsapp: str("Contact, ou null.") } }) }),
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
    response: withErrors({ 201: jsonResponse("Forfait créé.", { properties: { id: str("Forfait."), revision: int("Révision.") } }), 422: errorResponse("Tier sans nœud actif.") }),
  },

  "PATCH /v1/admin/plans/:planId": {
    summary: "Modifier un forfait",
    description: "`code` est immuable : il fait partie de la révision que l'app compare. Les commandes passées gardent leur prix.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: { type: "object", required: ["planId"], properties: { planId: str("Forfait.") } },
    body: { type: "object", additionalProperties: false, properties: { name: str("Nom."), priceXaf: int("Prix."), durationDays: int("Durée."), deviceLimit: int("Appareils."), badge: str("Badge."), featured: { type: "boolean" }, active: { type: "boolean" }, sortOrder: int("Ordre.") } },
    response: withErrors({ 200: jsonResponse("Forfait mis à jour.", { properties: { id: str("Forfait."), revision: int("Nouvelle révision.") } }) }),
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
    description: "Owner uniquement. Le mot de passe temporaire est généré par le serveur et renvoyé une seule fois. Email facultatif si un numéro WhatsApp est donné.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    body: { type: "object", additionalProperties: false, required: ["name"], properties: { email: str("Email (facultatif si numéro WhatsApp).", { format: "email" }), name: str("Nom."), whatsappNumber: str("9 chiffres, +237 facultatif."), platformRole: { type: "string", enum: ["none", "owner"] } } },
    response: withErrors({ 201: jsonResponse("Compte créé, mot de passe temporaire renvoyé une seule fois.", { properties: { adminId: str("Compte."), email: str("Email, ou null."), whatsappNumber: str("Numéro, ou null."), temporaryPassword: str("Mot de passe temporaire (affiché une seule fois)."), mustChangePassword: { type: "boolean" }, whatsappLink: str("Lien wa.me prêt à envoyer, ou null.") } }), 409: errorResponse("Email ou numéro déjà utilisé.") }),
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

  /* ----------------------------------------------- onboarding (R4, libre-service) */

  "GET /v1/admin/onboarding": {
    summary: "Lire l'avancement de l'onboarding",
    description: "Étape de l'assistant (0 à 5), étape du guide, communauté et application de l'administrateur.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    response: withErrors({ 200: jsonResponse("Avancement.", { properties: { step: int("0 à 5."), completedAt: str("Récapitulatif atteint.", { format: "date-time" }), guideStep: int("Étape du guide."), guideDoneAt: str("Guide terminé.", { format: "date-time" }), communityId: str("Communauté, ou null."), appId: str("Application, ou null.") } }) }),
  },

  "PATCH /v1/admin/onboarding": {
    summary: "Mettre à jour l'avancement de l'onboarding",
    description: "Étape 5 (récapitulatif) date `completedAt`. `guideDone` true date la fin du guide, false la rouvre.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    body: { type: "object", additionalProperties: false, properties: { step: int("0 à 5.", { minimum: 0, maximum: 5 }), guideStep: int("0 à 20.", { minimum: 0, maximum: 20 }), guideDone: { type: "boolean", description: "Guide terminé ou non." } } },
    response: withErrors({ 200: jsonResponse("Avancement.", { properties: { step: int("Étape."), guideStep: int("Étape du guide.") } }) }),
  },

  "POST /v1/admin/onboarding/community": {
    summary: "Créer sa communauté (une seule fois)",
    description: "Ouvert à tout administrateur sans communauté. Il en devient community_admin. Refusé si ce compte a déjà une communauté.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    body: { type: "object", additionalProperties: false, required: ["name"], properties: { name: str("Nom, 2 à 120."), slug: str("Identifiant ; dérivé du nom si absent."), whatsappGroupUrl: str("Lien https://chat.whatsapp.com/..."), contactWhatsapp: str("9 chiffres, +237 facultatif.") } },
    response: withErrors({ 201: jsonResponse("Communauté créée.", { properties: { id: str("Communauté."), slug: str("Identifiant.") } }), 409: errorResponse("Une communauté existe déjà pour ce compte.") }),
  },

  "POST /v1/admin/apps": {
    summary: "Créer l'application de sa communauté",
    description: "Une seule application par communauté. Le paquet est calculé côté serveur à partir du slug de la communauté, puis validé comme une marque.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    body: { type: "object", additionalProperties: false, required: ["name", "theme", "supportUrl"], properties: { name: str("Nom, 2 à 40."), theme: { type: "string", enum: ["billet", "halo", "mono", "vector", "otaku"] }, accent: { type: ["string", "null"], description: "#RRGGBB ou null." }, supportUrl: str("https:, mailto: ou tel:."), supportEmail: str("Email de contact.", { format: "email" }) } },
    response: withErrors({ 201: jsonResponse("Application créée.", { properties: { id: str("Application."), packageName: str("Paquet calculé.") } }), 409: errorResponse("Une application existe déjà pour cette communauté.") }),
  },

  "PATCH /v1/admin/apps/:appId": {
    summary: "Modifier son application",
    description: "Nom, thème, couleur d'accent et liens. Le paquet ne change jamais. Refusé pendant un build.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: PARAM_APP_ID,
    body: { type: "object", additionalProperties: false, properties: { name: str("Nom, 2 à 40."), theme: { type: "string", enum: ["billet", "halo", "mono", "vector", "otaku"] }, accent: { type: ["string", "null"], description: "#RRGGBB ou null." }, supportUrl: str("https:, mailto: ou tel:."), supportEmail: { type: ["string", "null"], description: "Email, ou null." }, privacyUrl: { type: ["string", "null"], description: "https:, ou null." }, termsUrl: { type: ["string", "null"], description: "https:, ou null." } } },
    response: withErrors({ 200: jsonResponse("Application mise à jour.", { properties: { id: str("Application.") } }), 409: errorResponse("Un build est en cours.") }),
  },

  "POST /v1/admin/apps/:appId/logo": {
    summary: "Téléverser le logo de l'application",
    description: "PNG ou SVG, 1 Mo au plus, en base64 dans le corps JSON. Stockage provisoire en base : la copie vers R2 n'est pas câblée.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: PARAM_APP_ID,
    body: { type: "object", additionalProperties: false, required: ["mime", "data"], properties: { mime: { type: "string", enum: ["image/png", "image/svg+xml"] }, data: str("Contenu en base64.") } },
    response: withErrors({ 200: jsonResponse("Logo enregistré.", { properties: { appId: str("Application."), logoKey: str("Clé de stockage."), sha256: str("Empreinte SHA-256.") } }), 422: errorResponse("Logo refusé (type, taille ou contenu).") }),
  },

  /* ---------------------------------------------- serveurs 3x-ui (lot R7) */

  "GET /v1/admin/xui/servers": {
    summary: "Lister les serveurs 3x-ui (forfait limité)",
    description: "Propriétaire seul. Le jeton n'est jamais renvoyé : seulement `tokenSet`.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    response: withErrors({
      200: jsonResponse("Serveurs.", {
        properties: {
          servers: arrayOf(
            shape({
              id: str("Serveur."),
              label: str("Libellé."),
              panelUrl: str("Racine du panneau, chemin de base compris."),
              inboundId: int("Inbound des clients."),
              capacity: int("Clients maximum."),
              active: { type: "boolean", description: "Attribution et lecture du trafic." },
              publicHost: str("Hôte public de la VM dans l'URI VLESS."),
              publicPort: int("Port public."),
              security: str("`tls` ou `none`."),
              sni: str("SNI, facultatif."),
              wsPath: str("Chemin WebSocket."),
              wsHost: str("En-tête Host, facultatif."),
              tokenSet: { type: "boolean", description: "Un jeton est scellé (jamais renvoyé)." },
              assigned: int("Abonnements rattachés."),
              createdAt: str("Création.", { format: "date-time" }),
            }),
            "Serveurs.",
          ),
        },
      }),
    }),
  },

  "POST /v1/admin/xui/servers": {
    summary: "Ajouter un serveur 3x-ui",
    description: "Le jeton est scellé avec MASTER_KEY à l'écriture. Propriétaire seul.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    body: {
      type: "object",
      additionalProperties: false,
      required: ["label", "panelUrl", "apiToken", "inboundId", "publicHost", "wsPath"],
      properties: {
        label: str("Libellé.", { minLength: 2, maxLength: 80 }),
        panelUrl: str("Racine du panneau, chemin de base compris.", { maxLength: 300 }),
        apiToken: str("Jeton Bearer du panneau (scope admin).", { minLength: 16, maxLength: 300 }),
        inboundId: int("Inbound des clients.", { minimum: 1 }),
        capacity: int("Clients maximum (défaut 100).", { minimum: 1, maximum: 5000 }),
        publicHost: str("Hôte public de la VM.", { minLength: 3, maxLength: 253 }),
        publicPort: int("Port public (défaut 443).", { minimum: 1, maximum: 65535 }),
        security: { type: "string", enum: ["tls", "none"], description: "Sécurité de l'URI." },
        sni: str("SNI, facultatif.", { maxLength: 253 }),
        wsPath: str("Chemin WebSocket, commence par `/`.", { maxLength: 200 }),
        wsHost: str("En-tête Host, facultatif.", { maxLength: 253 }),
      },
    },
    response: withErrors({ 201: jsonResponse("Serveur créé (même forme que la liste).", { properties: { server: shape({ id: str("Serveur.") }) } }) }),
  },

  "PATCH /v1/admin/xui/servers/:serverId": {
    summary: "Modifier ou désactiver un serveur 3x-ui",
    description: "`active: false` retire le serveur de l'attribution et de la lecture du trafic. Les clients déjà créés ne sont pas coupés. Propriétaire seul.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: { type: "object", required: ["serverId"], properties: { serverId: str("Serveur.") } },
    body: {
      type: "object",
      additionalProperties: false,
      description: "Au moins un champ. Mêmes contraintes que la création.",
      properties: {
        label: str("Libellé."),
        panelUrl: str("Racine du panneau."),
        apiToken: str("Nouveau jeton (remplace le scellé)."),
        inboundId: int("Inbound."),
        capacity: int("Clients maximum."),
        active: { type: "boolean", description: "Activation." },
        publicHost: str("Hôte public."),
        publicPort: int("Port public."),
        security: { type: "string", enum: ["tls", "none"] },
        sni: str("SNI ou null."),
        wsPath: str("Chemin WebSocket."),
        wsHost: str("En-tête Host ou null."),
      },
    },
    response: withErrors({ 200: jsonResponse("Serveur modifié.", { properties: { server: shape({ id: str("Serveur.") }) } }) }),
  },

  "POST /v1/admin/xui/servers/:serverId/test": {
    summary: "Tester la connexion au panneau 3x-ui",
    description: "Vérifie le jeton et l'inbound. Répond 200 dans les deux cas : `ok` dit le résultat, le message ne contient ni jeton ni chemin de base. Propriétaire seul.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    params: { type: "object", required: ["serverId"], properties: { serverId: str("Serveur.") } },
    response: withErrors({
      200: jsonResponse("Résultat du test.", {
        properties: { ok: { type: "boolean", description: "Connexion réussie." }, message: str("Message lisible."), inboundRemark: str("Nom de l'inbound, si connu.") },
      }),
    }),
  },
};

/**
 * Complète une route avec son contrat. Appelé depuis `transform` de
 * `@fastify/swagger`, donc à la génération du document uniquement.
 */
export function docFor(method: string, url: string): RouteDoc | undefined {
  const key = `${method.toUpperCase()} ${url}`;
  return R6_ROUTE_DOCS[key] ?? ROUTE_DOCS[key];
}

/* ------------------------------------------------------- lot R6 (paiement) */

/**
 * Contrats du lot R6 : forfaits à deux familles, réglages tarifaires, commande,
 * abonnement. Ces entrées l'emportent sur `ROUTE_DOCS` pour les mêmes clés
 * (`docFor` lit d'abord ce bloc). Les champs décrits ici sont ceux que l'app
 * Android lit.
 */
const R6_ROUTE_DOCS: Record<string, RouteDoc> = {
  "GET /v1/apps/:appId/plans": {
    summary: "Lister les offres d'une marque",
    description:
      "Offres actives. `family` : `limited` (quota fixe, client 3x-ui dédié) ou `limited_night` (même quota le jour, " +
      "plus de l'illimité sur la plage choisie). `nightOptions` : plages proposées, actives seulement ; leur `priceXaf` " +
      "s'ajoute au prix du forfait. `quotaBytes` : `null` pour une offre sans quota. `revision` à renvoyer à la commande. Route publique.",
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
              priceXaf: int("Prix du forfait, hors plage de nuit."),
              durationDays: int("Durée."),
              deviceLimit: int("Appareils."),
              endpointTier: str("`free-labs` (illimité) ou `paid-gcp` (limité)."),
              family: str("`limited` ou `limited_night`."),
              quotaBytes: { type: ["integer", "null"], description: "Octets. `null` : sans quota." },
              nightOptions: arrayOf(
                shape({ window: str("`20-24`, `24-04` ou `20-04`."), priceXaf: int("Supplément en XAF.") }, ["window", "priceXaf"]),
                "Plages de nuit proposées.",
              ),
              revision: int("Révision à renvoyer à la commande."),
            }),
            "Offres.",
          ),
        },
      }),
    }),
  },

  "POST /v1/orders": {
    summary: "Créer une commande",
    description:
      "Le prix et la commission sont lus en base, jamais dans le corps. Le total vaut le prix du forfait plus le prix de la " +
      "plage choisie. `nightWindow` est requis pour la famille `limited_night` et refusé pour `limited`. Une révision périmée " +
      "(prix, quota, options, nature de nœud) renvoie 409 sans rien créer. La réponse porte l'URL de paiement du fournisseur.",
    tags: ["commandes"],
    security: DEVICE_SECURITY,
    body: {
      type: "object",
      additionalProperties: false,
      required: ["planId", "planRevision"],
      properties: {
        planId: str("Forfait choisi."),
        planRevision: int("Révision lue dans le catalogue."),
        nightWindow: { type: "string", enum: ["20-24", "24-04", "20-04"], description: "Plage de nuit (limité + nuit uniquement)." },
      },
    },
    response: withErrors({
      201: jsonResponse("Commande créée.", {
        properties: {
          orderId: str("Commande."),
          status: str("`created` ou `pending`."),
          price: shape({ amount: int("Total en XAF."), currency: str("`XAF`.") }),
          nightWindow: str("Plage choisie, absente pour `limited`."),
          checkout: shape({ url: str("URL de paiement."), expiresAt: str("Fin.") }),
        },
      }),
      409: errorResponse("`PLAN_CHANGED` : la révision a changé, relire le catalogue."),
    }),
  },

  "GET /v1/me/subscription": {
    summary: "Lire son abonnement, son quota et sa plage",
    description:
      "Droits et abonnement. Dans `entitlement` : `family`, `quotaBytes` (octets, `null` sans quota), `usedBytes` (somme " +
      "de la consommation côté serveur sur la période, source `node` seulement), `remainingBytes`, `nightWindow` (`null` " +
      "hors limité + nuit) et `state` : `active`, `exhausted` (quota atteint) ou `expired` (aucun abonnement actif). " +
      "Cette route ne coupe rien : la coupure à l'épuisement est faite côté 3x-ui.",
    tags: ["abonnement"],
    security: DEVICE_SECURITY,
    response: withErrors({
      200: jsonResponse("Droits, quota et abonnement.", {
        properties: {
          entitlement: shape({
            active: { type: "boolean" },
            family: str("`limited`, `limited_night`, ou `null` sans abonnement."),
            quotaBytes: { type: ["integer", "null"], description: "Quota de l'abonnement, octets." },
            usedBytes: int("Consommation de la période, octets."),
            remainingBytes: { type: ["integer", "null"], description: "Quota restant, octets. `null` sans quota." },
            nightWindow: { type: ["string", "null"], description: "Plage choisie, `null` si absente." },
            state: { type: "string", enum: ["active", "exhausted", "expired"] },
          }),
          subscription: shape({}),
        },
      }),
    }),
  },

  "GET /v1/admin/pricing": {
    summary: "Lire les réglages tarifaires",
    description:
      "Coût du Go, coût par plage de nuit, marge plateforme, plafond de commission. Aucune valeur n'est fournie par défaut : " +
      "`null` = non réglé. `floorConfigured` indique si le plancher peut être calculé. Lecture : owner et community_admin.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    response: withErrors({
      200: jsonResponse("Réglages.", {
        properties: {
          costPerGbXaf: { type: ["integer", "null"] },
          nightWindowCostXaf: shape({ "20-24": { type: ["integer", "null"] }, "24-04": { type: ["integer", "null"] }, "20-04": { type: ["integer", "null"] } }),
          platformMarginBps: { type: ["integer", "null"] },
          maxCommissionBps: { type: ["integer", "null"], description: "Plafond réglé. `null` : repli de 30 %." },
          effectiveMaxCommissionBps: int("Plafond réellement appliqué."),
          floorConfigured: { type: "boolean" },
          updatedAt: { type: ["string", "null"], format: "date-time" },
          updatedBy: { type: ["string", "null"] },
        },
      }),
    }),
  },

  "PUT /v1/admin/pricing": {
    summary: "Régler les tarifs",
    description:
      "Remplacement complet : tous les champs sont requis, `null` = non réglé. Owner seul. Les forfaits déjà vendus ne sont " +
      "pas recalculés ; les modifications de forfait suivantes sont contrôlées contre le plancher.",
    tags: ["administration"],
    security: ADMIN_SECURITY,
    body: {
      type: "object",
      additionalProperties: false,
      required: ["costPerGbXaf", "nightWindowCostXaf", "platformMarginBps", "maxCommissionBps"],
      properties: {
        costPerGbXaf: { type: ["integer", "null"] },
        nightWindowCostXaf: {
          type: "object",
          additionalProperties: false,
          required: ["20-24", "24-04", "20-04"],
          properties: {
            "20-24": { type: ["integer", "null"] },
            "24-04": { type: ["integer", "null"] },
            "20-04": { type: ["integer", "null"] },
          },
        },
        platformMarginBps: { type: ["integer", "null"], description: "0 à 10 000." },
        maxCommissionBps: { type: ["integer", "null"], description: "0 à 10 000. Remplace le 30 % de D35." },
      },
    },
    response: withErrors({
      200: jsonResponse("Réglages enregistrés.", { properties: { costPerGbXaf: { type: ["integer", "null"] } } }),
      403: errorResponse("Réservé au propriétaire."),
    }),
  },
};
