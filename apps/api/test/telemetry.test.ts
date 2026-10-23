/**
 * `POST /v1/me/telemetry` — le contrat du §3.4, et le verdict du §1.3 qu'il
 * déclenche.
 *
 * Ce que ces tests prouvent, dans l'ordre où une panne se produirait :
 *
 * - un lot de 21 rapports est refusé en 400 : le client découpe (D64) ;
 * - un `configId` inconnu est refusé **avant** toute écriture : un rapport ne
 *   crée pas de nœud fantôme ;
 * - **un seul appareil** peut retirer un nœud mort, s'il échoue deux fois sur X
 *   et réussit ailleurs : c'est le témoin différentiel (D63), et il fonctionne
 *   même quand la preuve arrive dans le lot suivant ;
 * - trois appareils distincts en échec sortent le nœud ; trois en succès le
 *   remettent ; un appareil seul ne fait ni l'un ni l'autre ;
 * - `usage` est un cumul : rejoué, il ne double pas les octets (`GREATEST`) et
 *   ne recule pas ;
 * - un rapport ne peut pas viser l'appareil d'un autre : l'identité vient de la
 *   session, et un `deviceId` dans le corps est refusé.
 *
 * Aucun de ces fichiers de test ne monte son propre serveur : `support.ts`
 * fournit la base PGlite en mémoire, l'app réelle, l'enrôlement réel et la
 * signature de preuve. On ajoute seulement la route testée si `app.ts` (édité
 * ailleurs) ne l'a pas encore montée, pour que ces tests portent sur
 * `routes/telemetry.ts` et pas sur l'ordre de fusion.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

const { app, db, call, closeAll, deviceClient, enrollDevice, publishEndpoint, seedApp, signProof } = await import("./support.js");
const { registerTelemetryRoutes } = await import("../src/routes/telemetry.js");

const TELEMETRY = "/v1/me/telemetry";
if (!app.hasRoute({ method: "POST", url: TELEMETRY })) registerTelemetryRoutes(app, db);

const PASSWORD = "mot-de-passe-de-test";
const seed = await seedApp({ deviceLimit: 4 });

after(closeAll);

/* ------------------------------------------------------------------ outils */

interface Account {
  device: Awaited<ReturnType<typeof enrollDevice>>;
  userId: string;
  accessToken: string;
  client: ReturnType<typeof deviceClient>;
}

let accountCounter = 0;

/**
 * Appareil enrôlé (route réelle) + compte (route réelle) + session (jeton réel).
 * `requireSession` exige les trois : c'est exactement la situation de l'app.
 */
async function createAccount(label: string): Promise<Account> {
  const device = await enrollDevice({ deviceName: `Pixel ${label}` });
  const email = `${label}-${randomUUID().slice(0, 8)}@example.test`;
  const base = { appId: seed.appId, email, password: PASSWORD, name: "Testeur télémétrie", locale: "fr" };

  const attempt = async (payload: Record<string, unknown>) => {
    const body = JSON.stringify(payload);
    return call("POST", "/v1/auth/register", {
      payload,
      headers: { "x-device-token": device.deviceToken, ...signProof(device.keys.signing, "POST", "/v1/auth/register", body) },
    });
  };

  let registered = await attempt(base);
  // D53 ajoute `phone` à l'inscription, dans `routes/auth.ts` — un fichier que
  // ce lot ne touche pas. Le test accepte les deux formes du contrat pour ne
  // pas dépendre de l'ordre de fusion des deux agents.
  if (registered.status === 400 && registered.text.includes("phone")) {
    accountCounter += 1;
    registered = await attempt({ ...base, phone: `+2376${String(accountCounter).padStart(2, "0")}${String(Date.now()).slice(-6)}` });
  }
  assert.equal(registered.status, 201, `inscription attendue en 201 : ${registered.text}`);

  const accessToken = String(registered.body.accessToken);
  return {
    device,
    userId: String(registered.body.user.id),
    accessToken,
    client: deviceClient({ accessToken, signing: device.keys.signing }),
  };
}

interface EndpointState {
  health: string;
  down_reason: string | null;
  down_since: string | Date | null;
}

async function endpointState(id: string): Promise<EndpointState> {
  const row = await db.one<EndpointState>("SELECT health, down_reason, down_since FROM endpoints WHERE id = $1", [id]);
  assert.ok(row, "endpoint introuvable");
  return row;
}

async function poolRevision(): Promise<number> {
  return Number(await db.scalar<string | number>("SELECT revision FROM pool_state WHERE id = 'pool'"));
}

const utcDay = (offsetDays = 0): string =>
  new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

/** Réponse d'erreur : on vérifie le code, jamais le texte libre. */
function assertFailure(res: { status: number; body: Record<string, any>; text: string }, status: number): void {
  assert.equal(res.status, status, res.text);
  assert.equal(res.body.error?.code, "VALIDATION_FAILED", res.text);
}

/* ------------------------------------------------------- le lot borné (D64) */

test("21 rapports dans une requête sont refusés en 400 ; 20 passent (D64)", async () => {
  const account = await createAccount("lot");
  const node = await publishEndpoint("telemetry-node-batch");

  const overflow = await account.client("POST", TELEMETRY, {
    reports: Array.from({ length: 21 }, () => ({ configId: node.endpointId, ok: true, latencyMs: 40 })),
  });
  assertFailure(overflow, 400);
  assert.ok(overflow.body.error.details.reports, "le champ fautif est nommé");
  assert.equal(
    (await db.query("SELECT 1 FROM config_reports WHERE config_id = $1", [node.endpointId])).length,
    0,
    "un lot refusé n'écrit rien",
  );

  const boundary = await account.client("POST", TELEMETRY, {
    reports: Array.from({ length: 20 }, () => ({ configId: node.endpointId, ok: true, latencyMs: 40 })),
  });
  assert.equal(boundary.status, 202, boundary.text);
  assert.equal(boundary.body.accepted, 20);
  assert.equal(boundary.body.usage, null, "pas d'usage, pas de bloc inventé");
});

/* ------------------------------------------------------ le nœud doit exister */

test("un configId inconnu est refusé en 400 et le lot entier est abandonné", async () => {
  const account = await createAccount("inconnu");
  const node = await publishEndpoint("telemetry-node-unknown");

  const res = await account.client("POST", TELEMETRY, {
    reports: [
      { configId: node.endpointId, ok: true, latencyMs: 30 },
      { configId: "ep_fantome", ok: false, latencyMs: null },
    ],
  });
  assertFailure(res, 400);
  assert.match(String(res.body.error.details.configId), /ep_fantome/, "le configId fautif est nommé");
  assert.equal(
    (await db.query("SELECT 1 FROM config_reports WHERE config_id = $1", [node.endpointId])).length,
    0,
    "le rapport valide du même lot n'est pas écrit : un 400 ne laisse pas d'état partiel",
  );
  assert.equal((await db.query("SELECT 1 FROM config_reports WHERE config_id = 'ep_fantome'")).length, 0);
});

/* ------------------------------------------- le témoin différentiel (D63) */

test("un seul appareil retire un nœud : 2 échecs sur X, 1 succès sur Y → down / witness", async () => {
  const account = await createAccount("temoin");
  const nodeX = await publishEndpoint("telemetry-witness-x");
  const nodeY = await publishEndpoint("telemetry-witness-y");

  // Deux échecs sur X, sans succès nulle part : un appareil seul ne condamne
  // pas un nœud, sinon un téléphone cassé viderait le pool (D50).
  const failures = await account.client("POST", TELEMETRY, {
    reports: [
      { configId: nodeX.endpointId, ok: false, latencyMs: null },
      { configId: nodeX.endpointId, ok: false, latencyMs: null },
    ],
  });
  assert.equal(failures.status, 202, failures.text);
  assert.equal(failures.body.accepted, 2);
  assert.equal((await endpointState(nodeX.endpointId)).health, "unknown", "un douteur isolé ne suffit pas");

  const revisionBefore = await poolRevision();

  // La bascule : le même appareil réussit sur un **autre** nœud. C'est la
  // preuve différentielle, et elle arrive dans le lot suivant — le cas normal.
  const success = await account.client("POST", TELEMETRY, {
    reports: [{ configId: nodeY.endpointId, ok: true, latencyMs: 120 }],
  });
  assert.equal(success.status, 202, success.text);

  const down = await endpointState(nodeX.endpointId);
  assert.equal(down.health, "down", "le témoin suffit à retirer le nœud");
  assert.equal(down.down_reason, "witness");
  assert.ok(down.down_since, "l'entrée en down horodate la probation (D50)");
  assert.equal(await poolRevision(), revisionBefore + 1, "une transition bumpe la révision, une seule fois (D48)");

  assert.equal((await endpointState(nodeY.endpointId)).health, "unknown", "un succès isolé ne déclare pas healthy");

  // Rejouer le même verdict ne re-bumpe pas : sinon chaque lot forcerait tous
  // les appareils à retélécharger un bundle (D48).
  const again = await account.client("POST", TELEMETRY, {
    reports: [{ configId: nodeX.endpointId, ok: false, latencyMs: null }],
  });
  assert.equal(again.status, 202, again.text);
  assert.equal(await poolRevision(), revisionBefore + 1, "pas de bump sans transition");
});

/* ------------------------------------------------------- quorum de sortie */

test("trois appareils distincts en échec → down ; deux ne suffisent pas", async () => {
  const first = await createAccount("quorum-1");
  const second = await createAccount("quorum-2");
  const third = await createAccount("quorum-3");
  const node = await publishEndpoint("telemetry-quorum-down");

  const fail = async (account: Account) =>
    account.client("POST", TELEMETRY, { reports: [{ configId: node.endpointId, ok: false, latencyMs: null }] });

  assert.equal((await fail(first)).status, 202);
  assert.equal((await fail(second)).status, 202);
  assert.equal((await endpointState(node.endpointId)).health, "unknown", "deux appareils ne sortent pas un nœud");

  assert.equal((await fail(third)).status, 202);
  const down = await endpointState(node.endpointId);
  assert.equal(down.health, "down");
  assert.equal(down.down_reason, "reports:3", "la raison nomme le quorum atteint");
});

/* ------------------------------------------------------ quorum de retour */

test("trois appareils distincts en succès → healthy", async () => {
  const first = await createAccount("retour-1");
  const second = await createAccount("retour-2");
  const third = await createAccount("retour-3");
  const node = await publishEndpoint("telemetry-quorum-up");

  const succeed = async (account: Account) =>
    account.client("POST", TELEMETRY, { reports: [{ configId: node.endpointId, ok: true, latencyMs: 85 }] });

  assert.equal((await succeed(first)).status, 202);
  assert.equal((await succeed(second)).status, 202);
  assert.equal((await endpointState(node.endpointId)).health, "unknown", "deux succès ne déclarent pas healthy");

  assert.equal((await succeed(third)).status, 202);
  const healthy = await endpointState(node.endpointId);
  assert.equal(healthy.health, "healthy");
  assert.equal(healthy.down_reason, "reports");
  assert.equal(healthy.down_since, null);

  // L'heure du rapport est celle du serveur : le client n'écrit aucune date.
  const reported = await db.one<{ reported_at: string | Date }>(
    "SELECT reported_at FROM config_reports WHERE config_id = $1 ORDER BY reported_at DESC LIMIT 1",
    [node.endpointId],
  );
  assert.ok(reported, "un rapport a été écrit");
  const ageMs = Date.now() - new Date(reported.reported_at).getTime();
  assert.ok(ageMs >= 0 && ageMs < 30_000, `reported_at est l'heure du serveur (écart ${ageMs} ms)`);
});

/* ---------------------------------------------------- la consommation (D52) */

test("usage rejoué ne double pas les octets (GREATEST) et ne recule jamais", async () => {
  const account = await createAccount("usage");
  const day = utcDay(0);
  const usage = { day, bytesUp: 1_000, bytesDown: 2_000, seconds: 60 };

  const first = await account.client("POST", TELEMETRY, { usage });
  assert.equal(first.status, 202, first.text);
  assert.equal(first.body.accepted, 0, "un envoi de consommation seule est accepté (règle 6)");
  assert.deepEqual(first.body.usage, { ...usage, source: "device" });

  // Le même lot, rejoué après une coupure : rien ne double.
  assert.equal((await account.client("POST", TELEMETRY, { usage })).status, 202);

  const row = async () =>
    db.one<{ bytes_up: string | number; bytes_down: string | number; seconds: string | number; source: string }>(
      "SELECT bytes_up, bytes_down, seconds, source FROM usage_daily WHERE device_id = $1 AND day::text = $2",
      [account.device.deviceId, day],
    );

  let stored = await row();
  assert.ok(stored, "la ligne de consommation existe");
  assert.equal(Number(stored.bytes_up), 1_000, "rejouer ne double pas");
  assert.equal(Number(stored.bytes_down), 2_000);
  assert.equal(Number(stored.seconds), 60);
  assert.equal(stored.source, "device", "la source est nommée (D52)");

  // Un compteur ne recule pas non plus : un téléphone redémarré qui renvoie un
  // total plus faible n'efface pas ce qui a été consommé.
  const lower = await account.client("POST", TELEMETRY, {
    usage: { day, bytesUp: 10, bytesDown: 20, seconds: 5 },
  });
  assert.equal(lower.status, 202, lower.text);
  stored = await row();
  assert.equal(Number(stored.bytes_up), 1_000);
  assert.equal(Number(stored.seconds), 60);

  // Et il monte.
  const higher = await account.client("POST", TELEMETRY, {
    usage: { day, bytesUp: 5_000, bytesDown: 9_000, seconds: 120 },
  });
  assert.equal(higher.status, 202, higher.text);
  stored = await row();
  assert.equal(Number(stored.bytes_up), 5_000);
  assert.equal(Number(stored.bytes_down), 9_000);
  assert.equal(Number(stored.seconds), 120);
});

test("un jour hors ±1 jour de l'heure serveur est refusé en 400", async () => {
  const account = await createAccount("jour");

  for (const day of [utcDay(-2), utcDay(2)]) {
    const res = await account.client("POST", TELEMETRY, {
      usage: { day, bytesUp: 1, bytesDown: 1, seconds: 1 },
    });
    assertFailure(res, 400);
    assert.ok(res.body.error.details.day, "le champ fautif est nommé");
  }

  // La veille et le lendemain restent dans la tolérance : le fuseau du
  // téléphone et la dérive d'horloge tolérée par la signature ne doivent pas
  // faire perdre une journée de compteurs.
  for (const day of [utcDay(-1), utcDay(0), utcDay(1)]) {
    const res = await account.client("POST", TELEMETRY, {
      usage: { day, bytesUp: 1, bytesDown: 1, seconds: 1 },
    });
    assert.equal(res.status, 202, `${day} : ${res.text}`);
  }

  // Une date inexistante ne passe pas le format : elle ne doit pas être
  // silencieusement ramenée au mois suivant par `Date`.
  const invalid = await account.client("POST", TELEMETRY, {
    usage: { day: "2026-02-31", bytesUp: 1, bytesDown: 1, seconds: 1 },
  });
  assertFailure(invalid, 400);
});

/* ------------------------------------------------ l'identité vient de la session */

test("un rapport ne peut pas viser l'appareil d'un autre : le deviceId du corps est refusé", async () => {
  const victim = await createAccount("victime");
  const sender = await createAccount("expediteur");
  const node = await publishEndpoint("telemetry-node-identity");

  // 1. Le corps ne peut pas désigner un appareil : la clé est refusée, pas
  // « honorée puis écrasée » — une version future du client ne doit pas croire
  // qu'elle peut choisir.
  const forged = await sender.client("POST", TELEMETRY, {
    deviceId: victim.device.deviceId,
    reports: [{ configId: node.endpointId, ok: false, latencyMs: null }],
  });
  assertFailure(forged, 400);
  assert.equal(
    (await db.query("SELECT 1 FROM config_reports WHERE device_id = $1", [victim.device.deviceId])).length,
    0,
    "rien n'est écrit au nom de la victime",
  );

  // 2. Le même rapport, sans le champ : il est écrit au nom de la **session**,
  // et d'elle seule.
  const honest = await sender.client("POST", TELEMETRY, {
    reports: [{ configId: node.endpointId, ok: false, latencyMs: null }],
  });
  assert.equal(honest.status, 202, honest.text);

  const rows = await db.query<{ device_id: string }>("SELECT device_id FROM config_reports WHERE config_id = $1", [
    node.endpointId,
  ]);
  assert.deepEqual(
    rows.map((row) => row.device_id),
    [sender.device.deviceId],
    "une seule ligne, au nom de l'appareil de la session",
  );

  // 3. La consommation suit la même règle.
  const usage = await sender.client("POST", TELEMETRY, {
    deviceId: victim.device.deviceId,
    usage: { day: utcDay(0), bytesUp: 7, bytesDown: 7, seconds: 7 },
  });
  assertFailure(usage, 400);
  assert.equal(
    (await db.query("SELECT 1 FROM usage_daily WHERE device_id = $1", [victim.device.deviceId])).length,
    0,
    "aucune consommation écrite au nom de la victime",
  );
});

/* ------------------------------------------------------------ la preuve */

test("sans preuve d'appareil ni session, la route ne répond rien d'utile", async () => {
  const anonymous = await call("POST", TELEMETRY, { payload: { reports: [] } });
  assert.equal(anonymous.status, 401, anonymous.text);
  assert.equal(anonymous.body.error.code, "UNAUTHENTICATED");

  // Un jeton valide sans la preuve signée ne suffit pas non plus : la signature
  // est ce qui prouve que la clé de l'appareil est bien là.
  const account = await createAccount("preuve");
  const unsigned = await call("POST", TELEMETRY, {
    payload: { reports: [] },
    headers: { authorization: `Bearer ${account.accessToken}` },
  });
  assert.equal(unsigned.status, 401, unsigned.text);
  assert.equal(unsigned.body.error.code, "DEVICE_PROOF_INVALID");
});
