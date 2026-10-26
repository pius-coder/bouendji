/**
 * Créneaux de nuit, de bout en bout dans l'API : espace Réseau, clé de
 * déploiement à usage unique (D124), enregistrement par clé, durée de 4 h,
 * prise en charge, destinataires Telegram (D119/D120).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

const { app, db, call, closeAll } = await import("./support.js");
const { issueAdminToken } = await import("../src/lib/auth.js");
const { sha256Hex } = await import("../src/lib/crypto.js");
const { recipientChatIds } = await import("../src/services/telegram.js");
const { insertAdmin, prepareNightSchema } = await import("./nightFixtures.js");

after(closeAll);

const OWNER = "adm_n_owner";
const RESEAU = "adm_n_reseau";
const PARTNER = "adm_n_partner";
const INACTIVE = "adm_n_inactive";

before(async () => {
  await prepareNightSchema(db);
  await insertAdmin(db, { id: OWNER, platformRole: "owner", telegramChatId: "5001" });
  await insertAdmin(db, { id: RESEAU, reseau: true, telegramChatId: "5002" });
  await insertAdmin(db, { id: PARTNER, telegramChatId: "5003" });
  await insertAdmin(db, { id: INACTIVE, platformRole: "owner", telegramChatId: "5004", active: false });
});

async function tokenOf(adminId: string): Promise<string> {
  const role = adminId === OWNER ? "platform" : "partner";
  return (await issueAdminToken({ adminId, role, communityId: null })).token;
}

async function as(adminId: string) {
  const token = await tokenOf(adminId);
  return {
    get: (url: string) => call("GET", url, { headers: { authorization: `Bearer ${token}` } }),
    post: (url: string, payload?: unknown) =>
      call("POST", url, { headers: { authorization: `Bearer ${token}` }, ...(payload === undefined ? {} : { payload }) }),
  };
}

const ingest = (key: string) => ({ authorization: `Bearer ${key}` });

async function listSlots(): Promise<{ today: any[]; upcoming: any[]; timezone: string }> {
  const res = await (await as(RESEAU)).get("/v1/admin/night-slots");
  assert.equal(res.status, 200, res.text);
  return res.body as any;
}

/* ------------------------------------------------------------ espace Réseau */

test("un partenaire ne voit pas les créneaux (403)", async () => {
  const res = await (await as(PARTNER)).get("/v1/admin/night-slots");
  assert.equal(res.status, 403, res.text);
});

test("le réseau voit aujourd'hui et les deux jours suivants, heure de Douala, sans aucune clé", async () => {
  const body = await listSlots();
  assert.equal(body.timezone, "Africa/Douala");
  assert.equal(body.today.length, 2, "20 h et minuit d'aujourd'hui");
  assert.equal(body.upcoming.length, 4, "deux jours à venir");
  const text = JSON.stringify(body);
  assert.equal(text.includes("nk_"), false);
  assert.equal(text.includes("deployKeyHash") || text.includes("deploy_key_hash"), false);
});

/* --------------------------------------------------------- clé de créneau */

test("la clé de créneau est affichée une fois ; seule son empreinte est en base", async () => {
  const slot = (await listSlots()).upcoming[0];
  const res = await (await as(RESEAU)).post(`/v1/admin/night-slots/${slot.slotId}/deploy-key`);
  assert.equal(res.status, 201, res.text);
  assert.match(res.body.key, /^nk_[A-Za-z0-9_-]{20,}$/);
  assert.equal(res.body.variable, "ENDPOINT_INGEST_SECRET");
  assert.match(String(res.headers["cache-control"]), /no-store/);

  const row = await db.one<{ hash: string; expires: Date }>(
    "SELECT deploy_key_hash AS hash, deploy_key_expires_at AS expires FROM night_slots WHERE id = $1",
    [slot.slotId],
  );
  assert.equal(row?.hash, sha256Hex(res.body.key));
  assert.equal(row?.hash.includes(res.body.key), false);
  assert.equal(new Date(row!.expires).toISOString(), new Date(slot.endsAt).toISOString(), "valable jusqu'à la fin du créneau");

  const audit = await db.query<{ n: number }>(
    "SELECT CAST(count(*) AS int) AS n FROM audit_log WHERE action = 'night_slot.deploy_key' AND target_id = $1 AND (before_state::text LIKE '%nk_%' OR after_state::text LIKE '%nk_%')",
    [slot.slotId],
  );
  assert.equal(Number(audit[0]?.n), 0, "la clé n'entre pas dans le journal");
});

test("une nouvelle clé remplace l'ancienne tant qu'aucun nœud n'est lié", async () => {
  const slot = (await listSlots()).upcoming[0];
  const reseau = await as(RESEAU);
  const first = await reseau.post(`/v1/admin/night-slots/${slot.slotId}/deploy-key`);
  const second = await reseau.post(`/v1/admin/night-slots/${slot.slotId}/deploy-key`);
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);

  const oldKey = await call("POST", "/v1/internal/endpoints/register", {
    headers: ingest(first.body.key),
    payload: { deployment_key: `old-${randomUUID()}`, public_host: "old.example.net" },
  });
  assert.equal(oldKey.status, 401, "l'ancienne clé ne vaut plus");

  // La clé est remise à zéro : on la retrouve pour les tests suivants.
  (globalThis as any).__slotKey = second.body.key;
  (globalThis as any).__slotId = slot.slotId;
});

test("un partenaire ne peut pas demander de clé (403)", async () => {
  const slot = (await listSlots()).upcoming[1];
  const res = await (await as(PARTNER)).post(`/v1/admin/night-slots/${slot.slotId}/deploy-key`);
  assert.equal(res.status, 403, res.text);
});

/* ------------------------------------------------------- enregistrement */

const DEPLOYMENT_A = `rev-a-${randomUUID()}`;
const DEPLOYMENT_B = `rev-b-${randomUUID()}`;

test("enregistrement avec la clé de créneau : 4 h exactes, nœud rattaché au créneau", async () => {
  const key = (globalThis as any).__slotKey as string;
  const slotId = (globalThis as any).__slotId as string;
  const before = Date.now();
  const res = await call("POST", "/v1/internal/endpoints/register", {
    headers: ingest(key),
    payload: { deployment_key: DEPLOYMENT_A, public_host: "night-a.example.net", region: "us" },
  });
  assert.equal(res.status, 200, res.text);
  const lifetimeSeconds = (new Date(res.body.expires_at).getTime() - before) / 1000;
  assert.ok(Math.abs(lifetimeSeconds - 14_400) < 120, `durée attendue 14 400 s, obtenue ${lifetimeSeconds}`);

  const endpoint = await db.one<{ night_slot_id: string; label: string }>(
    "SELECT night_slot_id, label FROM endpoints WHERE id = $1",
    [res.body.endpoint_id],
  );
  assert.equal(endpoint?.night_slot_id, slotId, "le nœud est rattaché au créneau");
  assert.match(String(endpoint?.label), /^[a-z]+-[a-z]+-\d{2}$/, "nom générique, pas l'hôte");

  const slot = await db.one<{ endpoint_id: string; bound: string; state: string }>(
    "SELECT endpoint_id, bound_deployment_key AS bound, state FROM night_slots WHERE id = $1",
    [slotId],
  );
  assert.equal(slot?.endpoint_id, res.body.endpoint_id);
  assert.equal(slot?.bound, DEPLOYMENT_A);
  assert.equal(slot?.state, "deployed");
});

test("la clé liée ne sert pas à un autre déploiement (409) ; un redémarrage du même passe", async () => {
  const key = (globalThis as any).__slotKey as string;
  const other = await call("POST", "/v1/internal/endpoints/register", {
    headers: ingest(key),
    payload: { deployment_key: DEPLOYMENT_B, public_host: "night-b.example.net" },
  });
  assert.equal(other.status, 409, other.text);

  const restart = await call("POST", "/v1/internal/endpoints/register", {
    headers: ingest(key),
    payload: { deployment_key: DEPLOYMENT_A, public_host: "night-a.example.net" },
  });
  assert.equal(restart.status, 200, restart.text);
  const count = await db.one<{ n: number }>(
    "SELECT CAST(count(*) AS int) AS n FROM endpoints WHERE deployment_key = $1",
    [DEPLOYMENT_A],
  );
  assert.equal(Number(count?.n), 1, "même ligne au redémarrage");
});

test("ready et heartbeat : seule la clé liée à ce déploiement passe", async () => {
  const key = (globalThis as any).__slotKey as string;
  const ok = await call("POST", "/v1/internal/endpoints/ready", { headers: ingest(key), payload: { deployment_key: DEPLOYMENT_A } });
  assert.equal(ok.status, 200, ok.text);

  const wrong = await call("POST", "/v1/internal/endpoints/ready", { headers: ingest(key), payload: { deployment_key: DEPLOYMENT_B } });
  assert.equal(wrong.status, 401, wrong.text);

  const beat = await call("POST", "/v1/internal/endpoints/heartbeat", {
    headers: ingest(key),
    payload: { deployment_key: DEPLOYMENT_A, latency_ms: 120 },
  });
  assert.equal(beat.status, 200, beat.text);
});

test("la clé déjà liée ne se recrée pas (409)", async () => {
  const slotId = (globalThis as any).__slotId as string;
  const res = await (await as(RESEAU)).post(`/v1/admin/night-slots/${slotId}/deploy-key`);
  assert.equal(res.status, 409, res.text);
});

test("le secret global reste accepté pour l'enregistrement, sans créneau", async () => {
  const deployment = `global-${randomUUID()}`;
  const res = await call("POST", "/v1/internal/endpoints/register", {
    headers: ingest("test-ingest-secret"),
    payload: { deployment_key: deployment, public_host: "global.example.net" },
  });
  assert.equal(res.status, 200, res.text);
  const row = await db.one<{ night_slot_id: string | null }>("SELECT night_slot_id FROM endpoints WHERE deployment_key = $1", [deployment]);
  assert.equal(row?.night_slot_id ?? null, null);
});

test("une clé inventée est refusée (401)", async () => {
  const res = await call("POST", "/v1/internal/endpoints/register", {
    headers: ingest(`nk_${randomUUID().replace(/-/g, "")}`),
    payload: { deployment_key: `x-${randomUUID()}`, public_host: "x.example.net" },
  });
  assert.equal(res.status, 401, res.text);
});

/* ------------------------------------------------------------ prise en charge */

test("« je m'en occupe » : un seul membre à la fois, le suivant est refusé", async () => {
  const slot = (await listSlots()).upcoming[1];
  const claimed = await (await as(RESEAU)).post(`/v1/admin/night-slots/${slot.slotId}/claim`);
  assert.equal(claimed.status, 200, claimed.text);
  assert.equal(claimed.body.claimedBy.id, RESEAU);

  const taken = await (await as(OWNER)).post(`/v1/admin/night-slots/${slot.slotId}/claim`);
  assert.equal(taken.status, 409, taken.text);
  assert.match(taken.body.message ?? taken.text, /Déjà pris en charge par Membre adm_n_reseau/);

  const audit = await db.one<{ n: number }>(
    "SELECT CAST(count(*) AS int) AS n FROM audit_log WHERE action = 'night_slot.claim' AND target_id = $1",
    [slot.slotId],
  );
  assert.equal(Number(audit?.n), 1);
});

test("l'historique répond et ne contient que des créneaux terminés", async () => {
  const res = await (await as(RESEAU)).get("/v1/admin/night-slots/history");
  assert.equal(res.status, 200, res.text);
  assert.ok(Array.isArray(res.body.slots));
  const now = Date.now();
  for (const slot of res.body.slots) assert.ok(new Date(slot.endsAt).getTime() <= now);
});

/* ----------------------------------------------------------- Telegram */

test("destinataires : owners et réseau actifs, ni partenaire ni compte désactivé", async () => {
  const ids = (await recipientChatIds(db)).sort();
  assert.deepEqual(ids, ["5001", "5002"]);
});

test("le test Telegram est réservé au propriétaire (403 pour le réseau)", async () => {
  const res = await (await as(RESEAU)).post("/v1/admin/telegram/test");
  assert.equal(res.status, 403, res.text);
});

test("Telegram désactivé dans cet environnement : le test le dit (409)", async () => {
  const res = await (await as(OWNER)).post("/v1/admin/telegram/test");
  assert.equal(res.status, 409, res.text);
});
