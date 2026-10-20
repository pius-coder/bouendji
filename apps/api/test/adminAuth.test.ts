/**
 * Connexion du dashboard.
 *
 * Cette route est la seule surface d'administration sans jeton : ce fichier
 * vérifie donc surtout ce qui ne doit **pas** se passer — énumération des
 * comptes, contournement du mot de passe, absence de trace.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

const { app, db, call, closeAll } = await import("./support.js");
const { hashPassword } = await import("../src/lib/crypto.js");

after(async () => {
  await closeAll();
});

const PASSWORD = "mot-de-passe-de-test-2026";

async function makeAdmin(input: { active?: boolean; platformRole?: "owner" | "none" } = {}) {
  const id = `adm_${randomUUID().slice(0, 8)}`;
  const email = `${id}@example.test`;
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active)
     VALUES ($1, $2, $3, 'Compte test', $4, $5, $6)`,
    [
      id,
      email,
      hashPassword(PASSWORD),
      input.platformRole === "owner" ? "platform" : "partner",
      input.platformRole ?? "none",
      input.active ?? true,
    ],
  );
  return { id, email };
}

function login(email: string, password: string) {
  return call("POST", "/v1/admin/auth/login", { payload: { email, password } });
}

test("connexion : le jeton délivré ouvre réellement l'administration", async () => {
  const admin = await makeAdmin({ platformRole: "owner" });

  const res = await login(admin.email, PASSWORD);
  assert.equal(res.status, 200, res.text);
  assert.equal(typeof res.body.token, "string");
  assert.equal(res.body.accessToken, res.body.token);
  assert.equal(res.body.admin.platformRole, "owner");
  assert.equal(res.body.admin.email, admin.email);
  assert.ok(Date.parse(String(res.body.expiresAt)) > Date.now());

  const me = await call("GET", "/v1/admin/me", {
    headers: { authorization: `Bearer ${res.body.token}` },
  });
  assert.equal(me.status, 200, me.text);
});

test("mauvais mot de passe et compte inconnu : même réponse, même code", async () => {
  const admin = await makeAdmin();

  const wrong = await login(admin.email, `${PASSWORD}-faux`);
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.error.code, "INVALID_CREDENTIALS");

  const unknown = await login(`inconnu-${randomUUID().slice(0, 6)}@example.test`, PASSWORD);
  assert.equal(unknown.status, 401);
  assert.equal(unknown.body.error.code, "INVALID_CREDENTIALS");
  assert.equal(unknown.body.error.message, wrong.body.error.message);
});

test("un compte désactivé ne reçoit pas de jeton, même avec le bon mot de passe", async () => {
  const admin = await makeAdmin({ active: false });
  const res = await login(admin.email, PASSWORD);
  assert.equal(res.status, 403, res.text);
});

test("une connexion réussie est tracée", async () => {
  const admin = await makeAdmin({ platformRole: "owner" });
  const before = await db.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM audit_log WHERE action = 'admin.login' AND target_id = $1",
    [admin.id],
  );

  await login(admin.email, PASSWORD);

  const after = await db.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM audit_log WHERE action = 'admin.login' AND target_id = $1",
    [admin.id],
  );
  assert.equal(Number(after[0]!.count), Number(before[0]!.count) + 1);
});

test("le corps est strict : un champ en trop est refusé", async () => {
  const admin = await makeAdmin();
  const res = await call("POST", "/v1/admin/auth/login", {
    payload: { email: admin.email, password: PASSWORD, platformRole: "owner" },
  });
  assert.equal(res.status, 400, res.text);
});

test("trop d'essais sur un compte : 429, et le bon mot de passe attend aussi", async () => {
  const admin = await makeAdmin();

  let limited = false;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const res = await login(admin.email, `faux-${attempt}`);
    if (res.status === 429) {
      limited = true;
      assert.ok(Number(res.body.error.retryAfter) > 0, "la réponse doit dire combien de temps attendre");
      break;
    }
    assert.equal(res.status, 401);
  }
  assert.equal(limited, true, "aucune limite atteinte après 10 essais");

  // La limite protège le compte, pas seulement l'adresse : le bon mot de passe
  // n'est pas une clé qui rouvre la porte pendant la fenêtre.
  const correct = await login(admin.email, PASSWORD);
  assert.equal(correct.status, 429);
});
