/**
 * Ajout manuel d'un nœud par URI VLESS (R8) : l'API lit l'URI, l'admin choisit
 * seulement jour ou nuit. L'UUID et l'URI ne doivent jamais sortir en réponse
 * ni dans une erreur.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

const { db, call, closeAll } = await import("./support.js");
const { openAdminSession } = await import("../src/lib/auth.js");
const { endpointToConfig } = await import("../src/services/endpoints.js");
const { parseVlessUri } = await import("../src/lib/vless.js");

after(closeAll);

const OWNER = "adm_vless_owner";
const PARTNER = "adm_vless_partner";
await db.query(
  `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active)
   VALUES ($1, $2, 'scrypt$16384$8$1$x$y', $1, 'platform', 'owner', true),
          ($3, $4, 'scrypt$16384$8$1$x$y', $3, 'partner', 'none', true)`,
  [OWNER, `${OWNER}@example.test`, PARTNER, `${PARTNER}@example.test`],
);

async function post(adminId: string, payload: unknown) {
  await db.query("UPDATE admin_users SET must_change_password = false WHERE id = $1", [adminId]);
  const { token } = await openAdminSession(db, { adminId });
  return call("POST", "/v1/admin/endpoints/manual", { payload, headers: { authorization: `Bearer ${token}` } });
}

const UUID = randomUUID();
const uri = (extra = "") =>
  `vless://${UUID}@203.0.113.20:443?encryption=none&security=tls&sni=cdn.example.com&type=ws&host=svc-123.example.run.app&path=%2Fws%2Fabc${extra}#Ancien`;

test("une URI collée, nuit : nom généré, lien illimité (free-labs), UUID chiffré et absent de la réponse", async () => {
  const res = await post(OWNER, { vlessUri: uri(), kind: "nuit" });
  assert.equal(res.status, 201, res.text);
  assert.equal(res.text.includes(UUID), false, "l'UUID ne revient pas");
  assert.match(String(res.body.label), /^[A-Za-z-]+ \d{2}$/, "nom de fleuve camerounais + numéro");
  assert.equal(res.body.count, 1);

  const rows = await db.query<any>("SELECT * FROM endpoints WHERE deployment_key = $1", [`manual:${res.body.group}:1`]);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.tier, "free-labs");
  assert.equal(row.host, "203.0.113.20");
  assert.equal(row.sni, "cdn.example.com");
  assert.equal(row.ws_host, "svc-123.example.run.app");
  assert.notEqual(row.credential, UUID, "chiffré en base");

  const uriOut = parseVlessUri(endpointToConfig(row).uri);
  assert.equal(uriOut.id, UUID, "le lien rendu au client garde l'identifiant");
  assert.equal(uriOut.params.path, "/ws/abc");
  assert.equal(uriOut.params.sni, "cdn.example.com");

  const audit = await db.query<any>("SELECT * FROM audit_log WHERE action = 'endpoint.manual' AND target_id = $1", [res.body.group]);
  assert.equal(JSON.stringify(audit).includes(UUID), false, "l'audit ne contient pas l'UUID");
});

test("jour : nœud limité (paid-gcp)", async () => {
  const res = await post(OWNER, { vlessUri: uri().replace("path=%2Fws%2Fabc", "path=%2Fws%2Fjour"), kind: "jour" });
  assert.equal(res.status, 201, res.text);
  const row = await db.one<any>("SELECT tier FROM endpoints WHERE deployment_key = $1", [`manual:${res.body.group}:1`]);
  assert.equal(row?.tier, "paid-gcp");
});

test("republier la même URI ne duplique pas le nœud", async () => {
  const first = await post(OWNER, { vlessUri: uri(), kind: "nuit" });
  const second = await post(OWNER, { vlessUri: uri(), kind: "nuit" });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(first.body.group, second.body.group);
  const rows = await db.query<any>(
    "SELECT status FROM endpoints WHERE deployment_key LIKE $1",
    [`manual:${first.body.group}:%`],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "active");
});

test("security absente ou autre que tls : refusé (400), sans recopier l'URI", async () => {
  const bad = uri().replace("security=tls", "security=none");
  const res = await post(OWNER, { vlessUri: bad, kind: "nuit" });
  assert.equal(res.status, 400, res.text);
  assert.equal(res.text.includes(UUID), false);
  assert.equal(res.text.includes("203.0.113.20"), false, "l'URI n'est pas recopiée dans l'erreur");
});

test("UUID malformé, transport gRPC, port hors plage : 400", async () => {
  assert.equal((await post(OWNER, { vlessUri: uri().replace(UUID, "pas-un-uuid"), kind: "nuit" })).status, 400);
  assert.equal((await post(OWNER, { vlessUri: uri().replace("type=ws", "type=grpc"), kind: "nuit" })).status, 400);
  assert.equal((await post(OWNER, { vlessUri: uri().replace(":443?", ":70000?"), kind: "nuit" })).status, 400);
});

test("type jour ou nuit obligatoire, et réservé au propriétaire", async () => {
  assert.equal((await post(OWNER, { vlessUri: uri() })).status, 400, "sans kind");
  assert.equal((await post(PARTNER, { vlessUri: uri(), kind: "nuit" })).status, 403);
});

test("plusieurs liens collés : un nœud par host, pays déduit de la région Cloud Run", async () => {
  const hosts = [
    "vb-912278514787.us-west1.run.app",
    "simteste-114859348629.europe-west4.run.app",
    "ahmed-vip1-982056827202.us-east4.run.app",
  ];
  const block = hosts
    .map((host, index) =>
      uri()
        .replace("host=svc-123.example.run.app", `host=${host}`)
        .replace("#Ancien", `#illimiter-vip${index + 1}`),
    )
    .join("\n");
  const res = await post(OWNER, { vlessUri: block, kind: "nuit" });
  assert.equal(res.status, 201, res.text);
  assert.equal(res.body.count, 3);
  assert.equal(res.body.groups.length, 3, "un groupe par host : aucun écrasement");
  assert.deepEqual(
    res.body.nodes.map((node: any) => node.region),
    ["us", "nl", "us"],
    "région GCP -> code pays ISO affiché par l'application",
  );
  assert.equal(new Set(res.body.nodes.map((node: any) => node.label)).size, 3, "un nom de fleuve par nœud");
  assert.equal(res.text.includes(UUID), false);

  const rows = await db.query<any>(
    "SELECT ws_host, region, label, tier FROM endpoints WHERE deployment_key = ANY($1::text[]) ORDER BY ws_host",
    [res.body.ids.map((_: string, index: number) => `manual:${res.body.groups[index]}:1`)],
  );
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.ws_host).sort(), [...hosts].sort());
  assert.deepEqual(rows.map((row) => row.region).sort(), ["nl", "us", "us"]);
  assert.equal(rows.every((row) => row.tier === "free-labs"), true);
});

test("un lien invalide dans le bloc refuse tout le bloc, sans rien écrire", async () => {
  const before = await db.scalar<number>("SELECT count(*)::int FROM endpoints");
  const block = [uri(), uri().replace(UUID, "pas-un-uuid")].join("\n");
  const res = await post(OWNER, { vlessUri: block, kind: "nuit" });
  assert.equal(res.status, 400, res.text);
  assert.equal(res.text.includes(UUID), false);
  const after = await db.scalar<number>("SELECT count(*)::int FROM endpoints");
  assert.equal(after, before, "aucune écriture partielle");
});
