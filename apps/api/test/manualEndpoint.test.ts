/**
 * `POST /v1/admin/endpoints/manual` — nœuds que l'API n'a pas déployés
 * (Cloud Run lancé à la main), y compris le domain fronting : SNI d'un domaine
 * frontal, en-tête Host du service réel.
 *
 * - une ligne active par SNI, Host distinct du SNI dans la configuration ;
 * - l'UUID n'est jamais renvoyé ni écrit dans l'audit ;
 * - republier le groupe remplace ses lignes et sort les variantes retirées ;
 * - un administrateur de communauté ne peut pas ajouter de nœud.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

const { app, db, call, closeAll } = await import("./support.js");
const { issueAdminToken } = await import("../src/lib/auth.js");
const { endpointToConfig } = await import("../src/services/endpoints.js");
const { parseVlessUri } = await import("../src/lib/vless.js");

after(closeAll);

const OWNER = "adm_manual_owner";
const PARTNER = "adm_manual_partner";
for (const [id, platformRole, role] of [[OWNER, "owner", "platform"], [PARTNER, "none", "partner"]] as const) {
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active)
     VALUES ($1, $2, 'scrypt$16384$8$1$x$y', $1, $3, $4, true)`,
    [id, `${id}@example.test`, role, platformRole],
  );
}

async function as(adminId: string, role: "platform" | "partner") {
  const { token } = await issueAdminToken({ adminId, role, communityId: null });
  return (payload: unknown) =>
    call("POST", "/v1/admin/endpoints/manual", { payload, headers: { authorization: `Bearer ${token}` } });
}

const SECRET = randomUUID();
const body = (snis: string[]) => ({
  group: "fronted-test",
  label: "Oregon",
  region: "us",
  address: "203.0.113.10",
  snis,
  hostHeader: "service-123.us-west1.run.app",
  wsPath: "/chemin/de/test",
  uuid: SECRET,
  ttlHours: 6,
});

test("une ligne active par SNI, Host distinct du SNI, UUID jamais renvoyé", async () => {
  const owner = await as(OWNER, "platform");
  const res = await owner(body(["a.example.com", "b.example.com"]));
  assert.equal(res.status, 201, res.text);
  assert.equal(res.body.count, 2);
  assert.ok(!res.text.includes(SECRET), "l'UUID ne revient pas");

  const rows = await db.query<any>("SELECT * FROM endpoints WHERE deployment_key LIKE 'manual:fronted-test:%' ORDER BY deployment_key");
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.status, "active");
    assert.notEqual(row.credential, SECRET, "chiffré en base");
    const uri = parseVlessUri(endpointToConfig(row).uri);
    assert.equal(uri.host, "203.0.113.10");
    assert.equal(uri.params.host, "service-123.us-west1.run.app");
    assert.match(uri.params.sni ?? "", /^[ab]\.example\.com$/);
    assert.equal(uri.params.path, "/chemin/de/test");
    assert.equal(uri.id, SECRET);
  }

  const audit = await db.query<any>("SELECT * FROM audit_log WHERE action = 'endpoint.manual'");
  assert.ok(audit.length > 0);
  assert.ok(!JSON.stringify(audit).includes(SECRET), "l'audit ne contient pas l'UUID");
});

test("republier le groupe remplace les lignes et sort les variantes retirées", async () => {
  const owner = await as(OWNER, "platform");
  const res = await owner(body(["c.example.com"]));
  assert.equal(res.status, 201, res.text);
  const rows = await db.query<any>("SELECT deployment_key, status, sni FROM endpoints WHERE deployment_key LIKE 'manual:fronted-test:%' ORDER BY deployment_key");
  assert.deepEqual(rows.map((r) => [r.deployment_key, r.status, r.sni]), [
    ["manual:fronted-test:1", "active", "c.example.com"],
    ["manual:fronted-test:2", "expired", "b.example.com"],
  ]);
});

test("un administrateur de communauté ne peut pas ajouter de nœud", async () => {
  const partner = await as(PARTNER, "partner");
  const res = await partner(body(["d.example.com"]));
  assert.equal(res.status, 403, res.text);
});

test("UUID ou chemin malformé : 400", async () => {
  const owner = await as(OWNER, "platform");
  assert.equal((await owner({ ...body(["e.example.com"]), uuid: "pas-un-uuid" })).status, 400);
  assert.equal((await owner({ ...body(["e.example.com"]), wsPath: "sans-slash" })).status, 400);
  void app;
});
