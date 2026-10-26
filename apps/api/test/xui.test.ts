/**
 * Forfait limité 3x-ui (lot R7) contre un faux panneau HTTP local.
 *
 * Ce que ces tests prouvent :
 * - le jeton du panneau est scellé, jamais renvoyé, jamais dans un message ;
 * - seul le propriétaire gère les serveurs ; le test de connexion répond 200 ;
 * - un abonnement limité reçoit un client dédié (quota en octets, échéance,
 *   inbound), confirmé seulement après réponse du panneau ;
 * - un échec du panneau se rejoue avec le même UUID et le même e-mail ;
 * - la consommation ne recule jamais, et le quota atteint coupe le client et
 *   vide le bundle ;
 * - le bundle limité ne contient jamais le pool partagé ; la nuit ajoute
 *   `startsAt` ; un abonnement expiré donne une liste vide ;
 * - le fichier hors-ligne ne dépasse pas la fin de l'abonnement.
 */
import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

// Clé de signature hors-ligne avant le premier import de config.ts (voir offline.test.ts).
const ed = generateKeyPairSync("ed25519");
process.env.OFFLINE_BUNDLE_SIGNING_KEY = ed.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
process.env.OFFLINE_BUNDLE_TTL_MINUTES = "60";

const { call, closeAll, db, deviceClient, enrollDevice, publishEndpoint, seedApp, signProof } = await import("./support.js");

const { decryptSecret, encryptSecret, openEnvelope } = await import("../src/lib/crypto.js");
const { openAdminSession } = await import("../src/lib/auth.js");
const { runXuiTick } = await import("../src/services/xuiWorker.js");
const { issueOfflineBundle } = await import("../src/services/offlineBundles.js");

const BUNDLE = "/v1/configuration-bundles/current";
const PASSWORD = "mot-de-passe-de-test";
const PANEL_TOKEN = "jeton-panneau-de-test-0123456789";
const PANEL_BASE = "/chemin-secret-de-test";
const INBOUND_ID = 7;
const PUBLIC_HOST = "vm-limite.example.net";
const QUOTA = 5_000_000_000; // 5 Go
const seed = await seedApp({ deviceLimit: 1 });

/* ------------------------------------------------------------- faux panneau */

interface PanelHit {
  method: string;
  path: string;
  auth: string | undefined;
  body: Record<string, any> | undefined;
}

const hits: PanelHit[] = [];
/** Octets consommés par email, lus par `clients/traffic`. */
const traffic = new Map<string, number>();
/** Réponses forcées : la prochaine requête dont le chemin finit ainsi échoue. */
const forcedFailures: Array<{ suffix: string; status: number }> = [];

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const panel: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  let raw = "";
  for await (const chunk of req) raw += String(chunk);
  const path = req.url ?? "";
  const body = raw ? (JSON.parse(raw) as Record<string, any>) : undefined;
  hits.push({ method: req.method ?? "", path, auth: req.headers.authorization, body });

  if (req.headers.authorization !== `Bearer ${PANEL_TOKEN}`) return sendJson(res, 401, { success: false, msg: "jeton" });

  const forced = forcedFailures.findIndex((failure) => path.endsWith(failure.suffix));
  if (forced >= 0) {
    const [failure] = forcedFailures.splice(forced, 1);
    return sendJson(res, failure!.status, { success: false, msg: "panne simulée" });
  }
  if (req.method === "POST" && path.endsWith("/panel/api/clients/add")) return sendJson(res, 200, { success: true, msg: "", obj: null });
  if (req.method === "GET" && path.includes("/panel/api/clients/traffic/")) {
    const email = decodeURIComponent(path.split("/").pop() ?? "");
    return sendJson(res, 200, { success: true, msg: "", obj: { up: traffic.get(email) ?? 0, down: 0 } });
  }
  if (req.method === "POST" && (path.endsWith("/clients/bulkDisable") || path.endsWith("/clients/bulkEnable"))) {
    return sendJson(res, 200, { success: true, msg: "", obj: null });
  }
  if (req.method === "GET" && /\/panel\/api\/inbounds\/get\/\d+$/.test(path)) {
    return sendJson(res, 200, { success: true, msg: "", obj: { remark: "vm-test" } });
  }
  return sendJson(res, 404, { success: false, msg: "inconnu" });
});

let panelUrl = "";
before(async () => {
  await new Promise<void>((resolve) => panel.listen(0, "127.0.0.1", () => resolve()));
  const { port } = panel.address() as AddressInfo;
  panelUrl = `http://127.0.0.1:${port}${PANEL_BASE}`;
});

after(async () => {
  panel.close();
  await closeAll();
});

/** Hits sur un e-mail donné, pour ne pas confondre les tests entre eux. */
function hitsFor(email: string): PanelHit[] {
  return hits.filter((hit) => hit.path.includes(encodeURIComponent(email)) || hit.body?.client?.email === email || hit.body?.emails?.includes(email));
}

/* ------------------------------------------------------------------ admins */

async function makeAdmin(label: string, platformRole: "owner" | "none"): Promise<string> {
  const id = `adm_xui_${label}_${randomUUID().slice(0, 6)}`;
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active)
     VALUES ($1, $2, 'scrypt$16384$8$1$x$y', 'Admin test', 'partner', $3, true)`,
    [id, `${id}@test.local`, platformRole],
  );
  await db.query("UPDATE admin_users SET must_change_password = false WHERE id = $1", [id]);
  const { token } = await openAdminSession(db, { adminId: id });
  return token;
}

const ownerToken = await makeAdmin("owner", "owner");
const staffToken = await makeAdmin("staff", "none");

/* ----------------------------------------------------------------- comptes */

let phoneSeq = 0;

interface Account {
  deviceId: string;
  pem: string;
  userId: string;
  client: ReturnType<typeof deviceClient>;
}

/** Même parcours que bundle.test.ts : enrôlement puis inscription par l'API. */
async function createAccount(label: string): Promise<Account> {
  const device = await enrollDevice({ deviceName: `Pixel ${label}` });
  phoneSeq += 1;
  const email = `${label}-${randomUUID().slice(0, 8)}@example.test`;
  const body = {
    appId: seed.appId,
    email,
    password: PASSWORD,
    name: "Testeur 3x-ui",
    phone: `+2377${String(phoneSeq).padStart(8, "0")}`,
    locale: "fr",
  };
  const registered = await call("POST", "/v1/auth/register", {
    payload: body,
    headers: {
      "x-device-token": device.deviceToken,
      ...signProof(device.keys.signing, "POST", "/v1/auth/register", JSON.stringify(body)),
    },
  });
  assert.equal(registered.status, 201, registered.text);
  return {
    deviceId: device.deviceId,
    pem: device.keys.agreement.pem,
    userId: String(registered.body.user.id),
    client: deviceClient({ accessToken: String(registered.body.accessToken), signing: device.keys.signing }),
  };
}

interface LimitedOptions {
  family?: "limited" | "limited_night";
  quotaBytes?: number | null;
  nightWindow?: "20-24" | "24-04" | "20-04" | null;
  days?: number;
  endsInPastDays?: number;
}

/** Abonnement limité : plan de famille `family`, quota et plage portés par la ligne. */
async function grantLimited(userId: string, options: LimitedOptions = {}): Promise<{ subscriptionId: string; endsAt: Date }> {
  const suffix = randomUUID().slice(0, 8);
  const planId = `plan_xui_${suffix}`;
  const orderId = `ord_xui_${suffix}`;
  const subscriptionId = `sub_xui_${suffix}`;
  const startsAt = new Date(Date.now() - (options.endsInPastDays ? 40 : 0) * 86_400_000);
  const endsAt = options.endsInPastDays
    ? new Date(Date.now() - options.endsInPastDays * 86_400_000)
    : new Date(startsAt.getTime() + (options.days ?? 30) * 86_400_000);
  await db.query(
    `INSERT INTO plans (id, app_id, code, name, description, price_xaf, duration_days, device_limit, active, family)
     VALUES ($1, $2, $3, 'Limité test', '', 3000, 30, 1, true, $4)`,
    [planId, seed.appId, `lim-${suffix}`, options.family ?? "limited"],
  );
  await db.query(
    `INSERT INTO orders (id, user_id, app_id, plan_id, community_id, amount_xaf, status, provider, paid_at, activated_at)
     VALUES ($1, $2, $3, $4, $5, 3000, 'paid', 'mock', now(), now())`,
    [orderId, userId, seed.appId, planId, seed.communityId],
  );
  await db.query(
    `INSERT INTO subscriptions (id, user_id, plan_id, order_id, status, starts_at, ends_at, quota_bytes, night_window)
     VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8)`,
    [
      subscriptionId,
      userId,
      planId,
      orderId,
      startsAt,
      endsAt,
      options.quotaBytes === undefined ? QUOTA : options.quotaBytes,
      options.nightWindow ?? null,
    ],
  );
  return { subscriptionId, endsAt };
}

/** Serveur 3x-ui de test, créé par la vraie route propriétaire. */
async function registerServer(token = ownerToken, apiToken = PANEL_TOKEN): Promise<string> {
  const res = await call("POST", "/v1/admin/xui/servers", {
    headers: { authorization: `Bearer ${token}` },
    payload: {
      label: `VM test ${randomUUID().slice(0, 4)}`,
      panelUrl,
      apiToken,
      inboundId: INBOUND_ID,
      capacity: 50,
      publicHost: PUBLIC_HOST,
      publicPort: 443,
      security: "tls",
      sni: PUBLIC_HOST,
      wsPath: "/vpn",
    },
  });
  assert.equal(res.status, 201, res.text);
  return String(res.body.server.id);
}

async function readBundle(account: Account) {
  const res = await account.client("GET", BUNDLE);
  assert.equal(res.status, 200, res.text);
  const plaintext = JSON.parse(
    openEnvelope(res.body.envelope, account.pem, { deviceId: account.deviceId, revision: Number(res.body.revision) }),
  ) as { configs: Array<Record<string, any>> };
  return { res, configs: plaintext.configs };
}

/* ----------------------------------------------------------------- tests */

test("migrations 070-073 : tables présentes, rejouables sans effet", async () => {
  const tables = await db.query<{ table_name: string }>(
    "SELECT table_name FROM information_schema.tables WHERE table_name IN ('xui_servers','xui_clients','xui_jobs')",
  );
  assert.equal(tables.length, 3);
  const columns = await db.query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'subscriptions' AND column_name IN ('xui_server_id','xui_client_email')",
  );
  assert.equal(columns.length, 2);
});

test("serveur 3x-ui : le jeton est scellé, jamais renvoyé, et seul le propriétaire agit", async () => {
  const forbidden = await call("GET", "/v1/admin/xui/servers", { headers: { authorization: `Bearer ${staffToken}` } });
  assert.equal(forbidden.status, 403);

  const serverId = await registerServer();
  const listed = await call("GET", "/v1/admin/xui/servers", { headers: { authorization: `Bearer ${ownerToken}` } });
  assert.equal(listed.status, 200);
  assert.ok(!listed.text.includes(PANEL_TOKEN), "jamais le jeton en clair");
  const item = listed.body.servers.find((server: { id: string }) => server.id === serverId);
  assert.equal(item.tokenSet, true);

  const row = await db.one<{ api_token_sealed: string }>("SELECT api_token_sealed FROM xui_servers WHERE id = $1", [serverId]);
  assert.notEqual(row?.api_token_sealed, PANEL_TOKEN);
  assert.equal(decryptSecret(row!.api_token_sealed), PANEL_TOKEN, "scellé avec MASTER_KEY, déscellable");
});

test("test de connexion : 200 et ok ; échec sans jeton ni chemin de base dans le message", async () => {
  const serverId = await registerServer();
  const good = await call("POST", `/v1/admin/xui/servers/${serverId}/test`, { headers: { authorization: `Bearer ${ownerToken}` } });
  assert.equal(good.status, 200);
  assert.equal(good.body.ok, true);

  // Serveur au mauvais jeton : désactivé aussitôt, pour ne pas être attribué ensuite.
  const badId = await registerServer(ownerToken, "mauvais-jeton-de-test-000000");
  const bad = await call("POST", `/v1/admin/xui/servers/${badId}/test`, { headers: { authorization: `Bearer ${ownerToken}` } });
  assert.equal(bad.status, 200);
  assert.equal(bad.body.ok, false);
  assert.ok(!bad.text.includes(PANEL_BASE), "pas de chemin de base");
  assert.ok(!bad.text.includes("mauvais-jeton"), "pas de jeton");
  await call("PATCH", `/v1/admin/xui/servers/${badId}`, { headers: { authorization: `Bearer ${ownerToken}` }, payload: { active: false } });
});

test("désactivation : active=false sans toucher aux clients ; modification refusée si vide", async () => {
  const serverId = await registerServer();
  const res = await call("PATCH", `/v1/admin/xui/servers/${serverId}`, {
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: { active: false },
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.server.active, false);
  const empty = await call("PATCH", `/v1/admin/xui/servers/${serverId}`, {
    headers: { authorization: `Bearer ${ownerToken}` },
    payload: {},
  });
  assert.equal(empty.status, 400);
});

test("création : client dédié avec quota en octets, échéance et inbound ; confirmé ; pool revu", async () => {
  await registerServer();
  const account = await createAccount("creation");
  const { subscriptionId, endsAt } = await grantLimited(account.userId);

  const before = Number((await db.scalar<string>("SELECT revision FROM pool_state WHERE id = 'pool'")) ?? 0);
  const outcome = await runXuiTick(db, { readTraffic: false });
  assert.equal(outcome.skipped, false);

  const email = `bd-${subscriptionId}`;
  const add = hits.find((hit) => hit.method === "POST" && hit.path.endsWith("/clients/add") && hit.body?.client?.email === email);
  assert.ok(add, "clients/add appelé pour l'abonnement");
  assert.equal(add.auth, `Bearer ${PANEL_TOKEN}`);
  assert.equal(add.body?.client?.totalGB, QUOTA, "quota en octets");
  assert.equal(add.body?.client?.expiryTime, endsAt.getTime(), "échéance = fin de l'abonnement");
  assert.deepEqual(add.body?.inboundIds, [INBOUND_ID]);

  const sub = await db.one<{ xui_client_email: string; xui_server_id: string }>(
    "SELECT xui_client_email, xui_server_id FROM subscriptions WHERE id = $1",
    [subscriptionId],
  );
  assert.equal(sub.xui_client_email, email);
  const client = await db.one<{ confirmed_at: unknown; uuid_sealed: string }>(
    "SELECT confirmed_at, uuid_sealed FROM xui_clients WHERE subscription_id = $1",
    [subscriptionId],
  );
  assert.ok(client.confirmed_at, "confirmé après réponse du panneau");
  assert.equal(decryptSecret(client.uuid_sealed), add.body?.client?.id, "UUID scellé = UUID envoyé au panneau");

  const after = Number((await db.scalar<string>("SELECT revision FROM pool_state WHERE id = 'pool'")) ?? 0);
  assert.ok(after > before, "la révision du pool bouge");
});

test("bundle limité : seul le client 3x-ui dédié, jamais le pool partagé", async () => {
  await publishEndpoint("xui-shared-node", { host: "partage.example.net" });
  const account = await createAccount("bundle-limite");
  const { subscriptionId } = await grantLimited(account.userId);
  await runXuiTick(db, { readTraffic: false });

  const { res, configs } = await readBundle(account);
  assert.equal(res.body.configCount, 1);
  assert.equal(configs.length, 1);
  assert.equal(configs[0].id, `xui-${subscriptionId}`);
  assert.ok(configs[0].uri.startsWith("vless://"));
  assert.ok(configs[0].uri.includes(PUBLIC_HOST), "hôte public de la VM");
  assert.ok(!configs[0].startsAt, "pas de startsAt hors nuit");
  assert.equal(configs[0].maxSessionSeconds, 3300, "durée de session posée par le serveur (D25)");
  assert.ok(!JSON.stringify(configs).includes("partage.example.net"), "aucun repli sur le pool partagé");
  assert.ok(!res.text.includes("partage.example.net"));
});

test("reprise : un échec du panneau se rejoue avec le même e-mail et le même UUID", async () => {
  const account = await createAccount("reprise");
  const { subscriptionId } = await grantLimited(account.userId);
  const email = `bd-${subscriptionId}`;

  forcedFailures.push({ suffix: "/clients/add", status: 500 });
  await runXuiTick(db, { readTraffic: false });
  const failed = await db.one<{ state: string; attempts: number; last_error: string | null }>(
    "SELECT state, attempts, last_error FROM xui_jobs WHERE subscription_id = $1 AND kind = 'create_client'",
    [subscriptionId],
  );
  assert.equal(failed.state, "pending");
  assert.equal(failed.attempts, 1);
  assert.ok(failed.last_error?.includes("HTTP 500"));
  assert.ok(!String(failed.last_error).includes(PANEL_TOKEN));

  // Le réessai n'est pas planifié avant `run_after` : on l'avance pour le test.
  await db.query("UPDATE xui_jobs SET run_after = now() - interval '1 second' WHERE subscription_id = $1", [subscriptionId]);
  await runXuiTick(db, { readTraffic: false });

  const adds = hitsFor(email).filter((hit) => hit.path.endsWith("/clients/add"));
  assert.equal(adds.length, 2, "deux tentatives");
  assert.equal(adds[0]!.body?.client?.id, adds[1]!.body?.client?.id, "même UUID");
  const done = await db.one<{ state: string }>("SELECT state FROM xui_jobs WHERE subscription_id = $1 AND kind = 'create_client'", [subscriptionId]);
  assert.equal(done.state, "done");
});

test("consommation : GREATEST, puis quota atteint = épuisement, coupure, bundle vide", async () => {
  const account = await createAccount("quota");
  const { subscriptionId } = await grantLimited(account.userId, { quotaBytes: 1_000 });
  const email = `bd-${subscriptionId}`;
  await runXuiTick(db, { readTraffic: false });

  traffic.set(email, 600);
  await runXuiTick(db, { readTraffic: true });
  traffic.set(email, 100); // compteur remis à zéro côté panneau : on ne recule pas
  await runXuiTick(db, { readTraffic: true });
  const used = await db.scalar<string>("SELECT used_bytes FROM xui_clients WHERE subscription_id = $1", [subscriptionId]);
  assert.equal(Number(used), 600);
  const notYet = await db.scalar<unknown>("SELECT exhausted_at FROM subscriptions WHERE id = $1", [subscriptionId]);
  assert.equal(notYet, null);

  traffic.set(email, 1_200);
  const outcome = await runXuiTick(db, { readTraffic: true });
  assert.ok(outcome.exhausted >= 1);
  const exhausted = await db.scalar<unknown>("SELECT exhausted_at FROM subscriptions WHERE id = $1", [subscriptionId]);
  assert.ok(exhausted, "exhausted_at posé");

  const disable = hitsFor(email).find((hit) => hit.path.endsWith("/clients/bulkDisable"));
  assert.ok(disable, "clients/bulkDisable appelé");
  assert.deepEqual(disable.body?.emails, [email]);

  const { res, configs } = await readBundle(account);
  assert.equal(res.body.configCount, 0, "bundle vide après épuisement");
  assert.equal(configs.length, 0);
});

test("forfait limité_night : nœud de nuit avec startsAt ; l'autre créneau est exclu", async () => {
  const account = await createAccount("nuit");
  const { subscriptionId } = await grantLimited(account.userId, { family: "limited_night", nightWindow: "20-24" });
  await runXuiTick(db, { readTraffic: false });

  const start = new Date(Date.now() - 3_600_000);
  const end = new Date(Date.now() + 3 * 3_600_000);
  const slot20 = randomUUID();
  const slot00 = randomUUID();
  await db.query(
    `INSERT INTO night_slots (id, day, slot, starts_at, ends_at) VALUES ($1, '2031-03-01', '20', $2, $3), ($4, '2031-03-01', '00', $5, $6)`,
    [slot20, start, end, slot00, new Date(start.getTime() + 4 * 3_600_000), new Date(end.getTime() + 4 * 3_600_000)],
  );
  const nightA = await publishEndpoint("nuit-20h", { host: "nuit-a.example.net" });
  const nightB = await publishEndpoint("nuit-00h", { host: "nuit-b.example.net" });
  await db.query("UPDATE endpoints SET night_slot_id = $1 WHERE id = $2", [slot20, nightA.endpointId]);
  await db.query("UPDATE endpoints SET night_slot_id = $1 WHERE id = $2", [slot00, nightB.endpointId]);

  const { configs } = await readBundle(account);
  const night = configs.find((config) => config.uri.includes("nuit-a.example.net"));
  assert.ok(night, "nœud du créneau 20 h servi");
  assert.equal(night.startsAt, start.toISOString(), "startsAt = début du créneau");
  assert.ok(!configs.some((config) => config.uri.includes("nuit-b.example.net")), "créneau 00 h non acheté : exclu");
  assert.ok(configs.some((config) => config.id === `xui-${subscriptionId}`), "le client 3x-ui reste servi");
});

test("abonnement limité expiré : bundle vide au lieu d'une erreur", async () => {
  const account = await createAccount("expire");
  await grantLimited(account.userId, { endsInPastDays: 2 });
  const { res, configs } = await readBundle(account);
  assert.equal(res.status, 200);
  assert.equal(configs.length, 0);
});

test("hors-ligne : fin du fichier bornée par la fin de l'abonnement", async () => {
  const account = await createAccount("offline");
  const { endsAt } = await grantLimited(account.userId, { days: 2 });
  await runXuiTick(db, { readTraffic: false });

  const issued = await issueOfflineBundle(db, {
    deviceId: account.deviceId,
    userId: account.userId,
    createdBy: null,
    ttlMinutes: 7 * 24 * 60,
  });
  assert.ok(new Date(issued.notAfter).getTime() <= endsAt.getTime(), "notAfter <= fin de l'abonnement");
  assert.equal(issued.endpointCount, 1, "le client 3x-ui dédié, rien d'autre");
});
