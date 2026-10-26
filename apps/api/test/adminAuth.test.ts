/**
 * Connexion du dashboard.
 *
 * Cette route est la seule surface d'administration sans jeton : ce fichier
 * vérifie donc surtout ce qui ne doit **pas** se passer — énumération des
 * comptes, contournement du mot de passe, absence de trace, verrouillage du
 * propriétaire par un tiers.
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

async function makeAdmin(
  input: { active?: boolean; platformRole?: "owner" | "none"; mustChange?: boolean; whatsapp?: string | null } = {},
) {
  const id = `adm_${randomUUID().slice(0, 8)}`;
  const email = `${id}@example.test`;
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active, must_change_password, whatsapp_number)
     VALUES ($1, $2, $3, 'Compte test', $4, $5, $6, $7, $8)`,
    [
      id,
      email,
      hashPassword(PASSWORD),
      input.platformRole === "owner" ? "platform" : "partner",
      input.platformRole ?? "none",
      input.active ?? true,
      input.mustChange ?? false,
      input.whatsapp ?? null,
    ],
  );
  return { id, email };
}

function login(email: string, password: string, headers: Record<string, string> = {}) {
  return call("POST", "/v1/admin/auth/login", { payload: { email, password }, headers });
}

/** Chaque test reçoit sa propre adresse : le compteur par IP ne doit pas traverser les tests. */
function fromIp(ip: string): Record<string, string> {
  return { "x-forwarded-for": ip };
}

test("connexion : le jeton délivré ouvre réellement l'administration", async () => {
  const admin = await makeAdmin({ platformRole: "owner" });

  const res = await login(admin.email, PASSWORD);
  assert.equal(res.status, 200, res.text);
  assert.equal(typeof res.body.token, "string");
  assert.equal(res.body.accessToken, res.body.token);
  assert.equal(res.body.admin.platformRole, "owner");
  assert.equal(res.body.admin.email, admin.email);
  assert.equal(res.body.mustChangePassword, false);
  assert.ok(Date.parse(String(res.body.expiresAt)) > Date.now());

  const me = await call("GET", "/v1/admin/me", {
    headers: { authorization: `Bearer ${res.body.token}` },
  });
  assert.equal(me.status, 200, me.text);
});

test("mauvais mot de passe et compte inconnu : même réponse, même code", async () => {
  const admin = await makeAdmin();

  const wrong = await login(admin.email, `${PASSWORD}-faux`, fromIp("10.0.1.1"));
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body.error.code, "INVALID_CREDENTIALS");

  const unknown = await login(`inconnu-${randomUUID().slice(0, 6)}@example.test`, PASSWORD, fromIp("10.0.1.2"));
  assert.equal(unknown.status, 401);
  assert.equal(unknown.body.error.code, "INVALID_CREDENTIALS");
  assert.equal(unknown.body.error.message, wrong.body.error.message);
});

test("un compte désactivé ne reçoit pas de jeton, même avec le bon mot de passe", async () => {
  const admin = await makeAdmin({ active: false });
  const res = await login(admin.email, PASSWORD, fromIp("10.0.1.3"));
  assert.equal(res.status, 403, res.text);
});

test("une connexion réussie est tracée", async () => {
  const admin = await makeAdmin({ platformRole: "owner" });
  const before = await db.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM audit_log WHERE action = 'admin.login' AND target_id = $1",
    [admin.id],
  );

  await login(admin.email, PASSWORD, fromIp("10.0.1.4"));

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
    const res = await login(admin.email, `faux-${attempt}`, fromIp("10.0.2.1"));
    if (res.status === 429) {
      limited = true;
      assert.ok(Number(res.body.error.retryAfter) > 0, "la réponse doit dire combien de temps attendre");
      break;
    }
    assert.equal(res.status, 401);
  }
  assert.equal(limited, true, "aucune limite atteinte après 10 essais");

  // La limite protège le couple compte + adresse : le bon mot de passe depuis
  // cette même adresse n'ouvre pas la porte pendant la fenêtre.
  const correct = await login(admin.email, PASSWORD, fromIp("10.0.2.1"));
  assert.equal(correct.status, 429);
});

test("connexion par numéro WhatsApp, avec +237 et séparateurs facultatifs", async () => {
  const number = `6${String(randomUUID().replace(/\D/g, "")).slice(0, 8)}`.padEnd(9, "0");
  const admin = await makeAdmin({ whatsapp: number });

  const res = await call("POST", "/v1/admin/auth/login", {
    payload: { identifier: `+237 ${number.slice(0, 3)}-${number.slice(3, 6)}-${number.slice(6)}`, password: PASSWORD },
    headers: fromIp("10.0.3.1"),
  });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.admin.id, admin.id);
  assert.equal(res.body.admin.whatsappNumber, number);
});

test("identifiant par courriel, insensible à la casse ; forme inconnue refusée", async () => {
  const admin = await makeAdmin();

  const upper = await call("POST", "/v1/admin/auth/login", {
    payload: { identifier: admin.email.toUpperCase(), password: PASSWORD },
    headers: fromIp("10.0.3.2"),
  });
  assert.equal(upper.status, 200, upper.text);

  const junk = await call("POST", "/v1/admin/auth/login", {
    payload: { identifier: "pas-un-numero", password: PASSWORD },
    headers: fromIp("10.0.3.3"),
  });
  assert.equal(junk.status, 400, junk.text);
  assert.equal(junk.body.error.code, "VALIDATION_FAILED");
});

test("un identifiant doit être fourni", async () => {
  const res = await call("POST", "/v1/admin/auth/login", { payload: { password: PASSWORD }, headers: fromIp("10.0.3.4") });
  assert.equal(res.status, 400, res.text);
});

test("un échec est journalisé, sans mot de passe ni identifiant saisi", async () => {
  const admin = await makeAdmin();
  await login(admin.email, `${PASSWORD}-faux`, fromIp("10.0.4.1"));

  const rows = await db.query<{ target_id: string; meta: { reason: string } }>(
    "SELECT target_id, meta FROM audit_log WHERE action = 'admin.login_failed' AND target_id = $1",
    [admin.id],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.meta.reason, "bad_password");

  const unknownEmail = `fantome-${randomUUID().slice(0, 6)}@example.test`;
  await login(unknownEmail, PASSWORD, fromIp("10.0.4.2"));
  const unknown = await db.query<{ meta: { reason: string }; meta_text: string }>(
    `SELECT meta, meta::text AS meta_text FROM audit_log
      WHERE action = 'admin.login_failed' AND target_id = 'inconnu' AND ip = '10.0.4.2'`,
  );
  assert.equal(unknown.length, 1);
  assert.equal(unknown[0]!.meta.reason, "unknown_account");
  assert.ok(!unknown[0]!.meta_text.includes(unknownEmail), "l'identifiant saisi n'est pas journalisé");
  assert.ok(!unknown[0]!.meta_text.includes(PASSWORD), "le mot de passe n'est jamais journalisé");
});

test("un tiers qui vise le propriétaire depuis une autre adresse ne le verrouille pas", async () => {
  const owner = await makeAdmin({ platformRole: "owner" });

  // L'attaquant épuise le couple « compte + son adresse ».
  let attackerLimited = false;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const res = await login(owner.email, `attaque-${attempt}`, fromIp("203.0.113.9"));
    if (res.status === 429) {
      attackerLimited = true;
      break;
    }
  }
  assert.equal(attackerLimited, true);

  // Le propriétaire, depuis son adresse, entre toujours.
  const legit = await login(owner.email, PASSWORD, fromIp("10.0.5.1"));
  assert.equal(legit.status, 200, legit.text);
});

test("le drapeau de changement obligatoire est renvoyé à la connexion", async () => {
  const admin = await makeAdmin({ mustChange: true });
  const res = await login(admin.email, PASSWORD, fromIp("10.0.6.1"));
  assert.equal(res.status, 200, res.text);
  assert.equal(res.body.mustChangePassword, true);
  assert.equal(res.body.admin.mustChangePassword, true);
});
