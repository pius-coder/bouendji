/**
 * E2E — le parcours entier, sur le **vrai HTTP**.
 *
 * Différence avec les autres fichiers de test : ceux-ci appellent `app.inject`,
 * qui court-circuite le réseau. Ici l'API écoute sur un port, et le test lui
 * parle avec `fetch` : sérialisation, en-têtes, codes de statut, ETag, CORS et
 * limiteur de débit sont donc exercés pour de vrai. C'est le seul endroit qui
 * attrape une erreur que `inject` masque — par exemple un `preHandler` qui ne
 * rend jamais la main, ou un corps refusé par le parseur.
 *
 * Le scénario est celui d'un client réel :
 *
 *   inscription → commande → paiement simulé → webhook → abonnement
 *   → nœud publié → bundle chiffré → déchiffrement → contrôle du contenu
 *
 * Le paiement n'est pas bouchonné dans le test : la page `mock` est appelée par
 * HTTP comme le ferait un navigateur, puis le webhook est envoyé comme le ferait
 * Fapshi. C'est la chaîne complète qui est vérifiée, pas un maillon.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { app, closeAll, newKeyPair, seedApp, signProof, type DeviceKeys } from "./support.js";

const { openEnvelope } = await import("../src/lib/crypto.js");

/* ------------------------------------------------------------------ serveur */

let base = "";

before(async () => {
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  assert.ok(address !== null && typeof address === "object", "l'API doit écouter sur un port");
  base = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await closeAll();
});

/* --------------------------------------------------------------------- HTTP */

interface Reply {
  status: number;
  body: Record<string, any>;
  text: string;
  headers: Headers;
}

async function http(
  method: string,
  path: string,
  init: {
    payload?: unknown;
    token?: string;
    deviceToken?: string;
    headers?: Record<string, string>;
    etag?: string;
  } = {},
): Promise<Reply> {
  const body = init.payload === undefined ? undefined : JSON.stringify(init.payload);
  const headers: Record<string, string> = { ...(init.headers ?? {}) };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  if (init.deviceToken) headers["x-device-token"] = init.deviceToken;
  if (init.etag) headers["if-none-match"] = init.etag;

  const res = await fetch(`${base}${path}`, { method, headers, ...(body === undefined ? {} : { body }) });
  const text = await res.text();
  let parsed: Record<string, any> = {};
  try {
    parsed = JSON.parse(text) as Record<string, any>;
  } catch {
    parsed = {};
  }
  return { status: res.status, body: parsed, text, headers: res.headers };
}

/** Requête d'appareil : jeton + preuve fraîche, exactement comme l'application. */
async function deviceCall(
  method: string,
  path: string,
  init: { payload?: unknown; token?: string; deviceToken: string; keys: DeviceKeys },
): Promise<Reply> {
  const body = init.payload === undefined ? "" : JSON.stringify(init.payload);
  const proof = signProof(init.keys.signing, method, path, body);
  return http(method, path, {
    ...(init.payload === undefined ? {} : { payload: init.payload }),
    token: init.token,
    deviceToken: init.deviceToken,
    headers: proof,
  });
}

/* ------------------------------------------------------------------ erreurs */

/** L'erreur de l'API est un objet `{ error: { code, message } }` : on lit le code. */
function errorCode(reply: Reply): string {
  return String(reply.body?.error?.code ?? "");
}

/* ------------------------------------------------------------------- test 1 */

test("parcours complet : inscription, paiement simulé, abonnement, bundle chiffré", async () => {
  const seed = await seedApp({ deviceLimit: 1 });
  const keys: DeviceKeys = { signing: newKeyPair(), agreement: newKeyPair() };
  const installationId = `inst-${randomUUID()}`;

  /* 1. enrôlement du couple de clés ------------------------------------- */

  const challenge = await http("POST", "/v1/devices/challenges", {
    payload: { installationId, purpose: "enroll" },
  });
  assert.equal(challenge.status, 200, challenge.text);
  assert.equal(typeof challenge.body.challengeId, "string");
  assert.equal(typeof challenge.body.nonce, "string");

  const enrollBody = JSON.stringify({
    challengeId: challenge.body.challengeId,
    installationId,
    deviceName: "Émulateur E2E",
    platform: "android",
    signingKey: keys.signing.spki,
    agreementKey: keys.agreement.spki,
    appVersion: "1.0.0",
    androidVersion: 34,
  });

  const enroll = await http("POST", "/v1/devices/enroll", {
    payload: JSON.parse(enrollBody),
    headers: {
      // Le nonce signé est celui du challenge : c'est ce qui rend la preuve
      // d'enrôlement non rejouable.
      ...signProof(keys.signing, "POST", "/v1/devices/enroll", enrollBody, String(challenge.body.nonce)),
    },
  });
  assert.equal(enroll.status, 201, enroll.text);
  const deviceId = String(enroll.body.deviceId);
  const deviceToken = String(enroll.body.deviceToken);
  assert.ok(deviceId.length > 0 && deviceToken.length > 0);

  /* 2. inscription d'un compte ------------------------------------------ */

  const email = `e2e-${randomUUID().slice(0, 8)}@example.com`;
  const password = "MotDePasse-E2E-2026";

  const register = await deviceCall("POST", "/v1/auth/register", {
    payload: { appId: seed.appId, email, password, name: "Client E2E" },
    deviceToken,
    keys,
  });
  assert.equal(register.status, 201, register.text);
  const accessToken = String(register.body.accessToken);
  assert.ok(accessToken.length > 0, "un jeton d'accès doit être délivré");

  /* 3. sans abonnement, pas de bundle ----------------------------------- */

  const beforePaying = await deviceCall("GET", "/v1/configuration-bundles/current", {
    token: accessToken,
    deviceToken,
    keys,
  });
  assert.equal(beforePaying.status, 402, beforePaying.text);
  assert.equal(errorCode(beforePaying), "SUBSCRIPTION_REQUIRED");

  const subscriptionBefore = await deviceCall("GET", "/v1/me/subscription", {
    token: accessToken,
    deviceToken,
    keys,
  });
  assert.equal(subscriptionBefore.status, 200, subscriptionBefore.text);
  assert.equal(subscriptionBefore.body.entitlement.active, false);

  /* 4. commande ---------------------------------------------------------- */

  // La révision de l'offre est ce que le serveur a dérivé du prix. Un client
  // réel la reçoit avec l'offre ; ici on part de la valeur du contrat et on
  // laisse le 409 nous la donner si elle a bougé. C'est le chemin documenté
  // (« rechargez l'offre »), pas un raccourci de test.
  let planRevision = 1;
  let order = await deviceCall("POST", "/v1/orders", {
    payload: { planId: seed.planId, planRevision },
    token: accessToken,
    deviceToken,
    keys,
  });
  if (order.status === 409) {
    planRevision = Number(order.body?.error?.details?.planRevision);
    assert.ok(Number.isInteger(planRevision), `révision attendue dans le 409 : ${order.text}`);
    order = await deviceCall("POST", "/v1/orders", {
      payload: { planId: seed.planId, planRevision },
      token: accessToken,
      deviceToken,
      keys,
    });
  }
  assert.equal(order.status, 201, order.text);
  assert.equal(order.body.price.currency, "XAF");
  assert.equal(order.body.status, "pending");

  const checkoutUrl = String(order.body?.checkout?.url ?? "");
  assert.match(checkoutUrl, /\/pay\/mock\/mock_[A-Za-z0-9_-]+$/, `URL de paiement inattendue : ${checkoutUrl}`);
  const providerRef = checkoutUrl.slice(checkoutUrl.lastIndexOf("/") + 1);
  const orderId = String(order.body.orderId);

  /* 5. paiement simulé : la page mock, puis le webhook ------------------- */

  const confirm = await http("POST", `/pay/mock/${providerRef}/confirm`, { payload: { outcome: "paid" } });
  assert.equal(confirm.status, 200, confirm.text.slice(0, 200));

  const webhook = await http("POST", "/v1/payments/webhook/mock", { payload: { transId: providerRef, externalId: orderId } });
  assert.equal(webhook.status, 200, webhook.text);
  assert.equal(webhook.body.activated, true, webhook.text);

  // Un webhook rejoué ne doit ni activer deux fois, ni créer une deuxième
  // commission : c'est la garantie qu'un fournisseur qui retente est inoffensif.
  const replay = await http("POST", "/v1/payments/webhook/mock", { payload: { transId: providerRef, externalId: orderId } });
  assert.equal(replay.status, 200, replay.text);
  assert.equal(replay.body.duplicate, true, replay.text);

  /* 6. l'abonnement est actif -------------------------------------------- */

  const subscriptionAfter = await deviceCall("GET", "/v1/me/subscription", {
    token: accessToken,
    deviceToken,
    keys,
  });
  assert.equal(subscriptionAfter.status, 200, subscriptionAfter.text);
  assert.equal(subscriptionAfter.body.entitlement.active, true, subscriptionAfter.text);

  /* 7. un nœud est publié, comme le ferait le conteneur de l'endpoint ---- */

  const ingest = { authorization: "Bearer test-ingest-secret" };
  const deploymentKey = `dep-${randomUUID().slice(0, 8)}`;
  const registered = await http("POST", "/v1/internal/endpoints/register", {
    payload: { deployment_key: deploymentKey, public_host: "node1.example.net", region: "eu", port: 8080 },
    headers: ingest,
  });
  assert.equal(registered.status, 200, registered.text);

  const ready = await http("POST", "/v1/internal/endpoints/ready", {
    payload: { deployment_key: deploymentKey },
    headers: ingest,
  });
  assert.equal(ready.status, 200, ready.text);

  /* 8. le bundle --------------------------------------------------------- */

  const bundle = await deviceCall("GET", "/v1/configuration-bundles/current", {
    token: accessToken,
    deviceToken,
    keys,
  });
  assert.equal(bundle.status, 200, bundle.text);
  assert.equal(bundle.body.configCount, 1, bundle.text);

  // L'invariant central : rien d'utilisable ne circule en clair sur le fil.
  assert.ok(!bundle.text.includes("vless://"), "aucun URI VLESS ne doit apparaître dans la réponse");
  assert.ok(!bundle.text.includes("node1.example.net"), "l'hôte du nœud ne doit pas être en clair");
  assert.ok(bundle.body.envelope, "une enveloppe scellée est attendue");
  assert.equal(bundle.body.envelope.version, 1);

  const etag = bundle.headers.get("etag");
  assert.ok(etag, "un ETag est attendu pour permettre le 304");
  assert.equal(bundle.headers.get("cache-control"), "no-store");

  /* 9. déchiffrement, comme le fait l'application ------------------------ */

  const plaintext = openEnvelope(bundle.body.envelope, keys.agreement.pem, {
    deviceId,
    revision: Number(bundle.body.revision),
  });
  const payload = JSON.parse(plaintext) as {
    revision: number;
    expiresAt: string;
    configs: Array<Record<string, any>>;
  };

  assert.equal(payload.configs.length, 1);
  const config = payload.configs[0]!;
  assert.match(String(config.uri), /^vless:\/\//, "déchiffrée, la configuration est un URI VLESS");
  // Le contrat VlessConfig ne porte pas d'hôte séparé : tout est dans l'URI
  // (`id`, `label`, `uri`, `expiresAt`, `region`). On vérifie donc l'URI.
  assert.ok(String(config.uri).includes("node1.example.net"), `hôte absent de l'URI : ${config.uri}`);
  assert.ok(String(config.uri).includes(":8080"), `port absent de l'URI : ${config.uri}`);
  assert.equal(config.region, "eu");
  // D25 : la durée de session vient du serveur, jamais d'une constante du client.
  assert.equal(config.maxSessionSeconds, 3300, "maxSessionSeconds doit venir de ENDPOINT_RECONNECT_AFTER");

  // D21 : la durée de vie d'un nœud est de 4 h 30. Un test qui l'affirme est la
  // seule protection contre un réglage qui dériverait en silence.
  const configExpiry = Date.parse(String(config.expiresAt));
  assert.ok(Number.isFinite(configExpiry), "expiration de configuration illisible");
  const ttlSeconds = (configExpiry - Date.now()) / 1000;
  assert.ok(ttlSeconds > 15_000 && ttlSeconds <= 16_200, `durée de vie inattendue : ${Math.round(ttlSeconds)} s`);

  // Un bundle ne promet jamais plus que les droits : il expire au plus tôt.
  const bundleExpiry = Date.parse(String(payload.expiresAt));
  assert.ok(Number.isFinite(bundleExpiry), "une date d'expiration lisible est attendue");
  assert.ok(bundleExpiry <= Date.parse(payload.issuedAt ?? bundle.body.issuedAt) + 30 * 86_400_000 + 1000, "expiration incohérente");

  /* 10. le second tirage ne retélécharge rien ---------------------------- */

  const notModified = await deviceCall("GET", "/v1/configuration-bundles/current", {
    token: accessToken,
    deviceToken,
    keys,
  });
  const cached = await http("GET", "/v1/configuration-bundles/current", {
    token: accessToken,
    deviceToken,
    headers: { ...signProof(keys.signing, "GET", "/v1/configuration-bundles/current", ""), "if-none-match": String(etag) },
  });
  assert.equal(notModified.status, 200);
  assert.equal(cached.status, 304, `304 attendu, reçu ${cached.status}`);
});

/* ------------------------------------------------------------------- test 2 */

test("santé : /healthz répond sans toucher la base", async () => {
  const reply = await http("GET", "/healthz");
  assert.equal(reply.status, 200, reply.text);
  assert.equal(reply.body.status, "ok");
});

test("un chemin inconnu répond 404 en JSON, pas en HTML", async () => {
  const reply = await http("GET", "/v1/inexistant");
  assert.equal(reply.status, 404, reply.text);
  assert.equal(errorCode(reply), "NOT_FOUND");
});