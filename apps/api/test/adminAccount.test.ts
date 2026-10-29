/**
 * « Mon compte » : garde du changement de mot de passe, sessions révocables,
 * profil, mot de passe. Vrais jetons, vraie base PGlite, vraie application.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

const { app, db, call, closeAll } = await import("./support.js");
const { hashPassword } = await import("../src/lib/crypto.js");
const { issueAdminToken } = await import("../src/lib/auth.js");
const { decodeJwt } = await import("jose");

after(async () => {
  await closeAll();
});

const PASSWORD = "mot-de-passe-de-test-2026";
const NEW_PASSWORD = "nouveau-mot-de-passe-2026";

async function makeAdmin(input: { platformRole?: "owner" | "none"; mustChange?: boolean; whatsapp?: string | null } = {}) {
  const id = `adm_acc_${randomUUID().slice(0, 8)}`;
  const email = `${id}@example.test`;
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active, must_change_password, whatsapp_number)
     VALUES ($1, $2, $3, 'Compte compte', $4, $5, true, $6, $7)`,
    [
      id,
      email,
      hashPassword(PASSWORD),
      input.platformRole === "owner" ? "platform" : "partner",
      input.platformRole ?? "none",
      input.mustChange ?? false,
      input.whatsapp ?? null,
    ],
  );
  return { id, email };
}

let ipCounter = 0;
/** Chaque connexion vient d'une adresse neuve : aucun compteur de connexion n'interfère. */
function nextIp(): string {
  ipCounter += 1;
  return `10.8.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

async function login(email: string, password: string): Promise<string> {
  const res = await call("POST", "/v1/admin/auth/login", {
    payload: { email, password },
    headers: { "x-forwarded-for": nextIp() },
  });
  assert.equal(res.status, 200, res.text);
  return res.body.token as string;
}

function as(token: string) {
  return { authorization: `Bearer ${token}` };
}

function sessionIdOf(token: string): string {
  return String(decodeJwt(token).sid);
}

test("mot de passe à changer : toute route admin répond 403 PASSWORD_CHANGE_REQUIRED", async () => {
  const admin = await makeAdmin({ platformRole: "owner", mustChange: true });
  const token = await login(admin.email, PASSWORD);

  const blocked = await call("GET", "/v1/admin/communities", { headers: as(token) });
  assert.equal(blocked.status, 403, blocked.text);
  assert.equal(blocked.body.error.code, "PASSWORD_CHANGE_REQUIRED");

  // Le compte, la déconnexion et le changement restent ouverts.
  const me = await call("GET", "/v1/admin/me", { headers: as(token) });
  assert.equal(me.status, 200, me.text);
  assert.equal(me.body.mustChangePassword, true);

  const sessions = await call("GET", "/v1/admin/me/sessions", { headers: as(token) });
  assert.equal(sessions.status, 200, sessions.text);
});

test("la garde ne touche pas les routes d'authentification, même sans jeton valable", async () => {
  // Pas de jeton : la route doit répondre (400 corps invalide), pas 401 de la garde.
  const res = await call("POST", "/v1/admin/auth/login", { payload: {} });
  assert.equal(res.status, 400, res.text);
});

test("changer le mot de passe lève le drapeau, révoque les sessions et renvoie un jeton neuf", async () => {
  const admin = await makeAdmin({ platformRole: "owner", mustChange: true });
  const first = await login(admin.email, PASSWORD);
  const second = await login(admin.email, PASSWORD);

  const changed = await call("POST", "/v1/admin/me/password", {
    headers: as(first),
    payload: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
  });
  assert.equal(changed.status, 200, changed.text);
  assert.equal(typeof changed.body.token, "string");
  assert.ok(Date.parse(String(changed.body.expiresAt)) > Date.now());

  // Les deux anciens jetons ne servent plus, y compris celui qui a servi à changer.
  for (const old of [first, second]) {
    const res = await call("GET", "/v1/admin/me", { headers: as(old) });
    assert.equal(res.status, 401, res.text);
    assert.equal(res.body.error.message, "Session révoquée.");
  }

  // Le nouveau jeton ouvre tout : le drapeau est levé.
  const me = await call("GET", "/v1/admin/me", { headers: as(changed.body.token) });
  assert.equal(me.status, 200, me.text);
  assert.equal(me.body.mustChangePassword, false);
  const communities = await call("GET", "/v1/admin/communities", { headers: as(changed.body.token) });
  assert.equal(communities.status, 200, communities.text);

  // L'ancien mot de passe ne connecte plus, le nouveau si.
  const oldLogin = await call("POST", "/v1/admin/auth/login", {
    payload: { email: admin.email, password: PASSWORD },
    headers: { "x-forwarded-for": nextIp() },
  });
  assert.equal(oldLogin.status, 401);
  await login(admin.email, NEW_PASSWORD);

  const trace = await db.query<{ n: string }>(
    "SELECT count(*)::text AS n FROM audit_log WHERE action = 'admin.password_change' AND target_id = $1",
    [admin.id],
  );
  assert.equal(Number(trace[0]!.n), 1);
});

test("mot de passe : validation (actuel faux, identique, nouveau vide)", async () => {
  const admin = await makeAdmin();
  const token = await login(admin.email, PASSWORD);

  const wrong = await call("POST", "/v1/admin/me/password", {
    headers: as(token),
    payload: { currentPassword: `${PASSWORD}-faux`, newPassword: NEW_PASSWORD },
  });
  assert.equal(wrong.status, 400, wrong.text);
  assert.ok(wrong.body.error.details.currentPassword);

  const same = await call("POST", "/v1/admin/me/password", {
    headers: as(token),
    payload: { currentPassword: PASSWORD, newPassword: PASSWORD },
  });
  assert.equal(same.status, 400, same.text);

  const empty = await call("POST", "/v1/admin/me/password", {
    headers: as(token),
    payload: { currentPassword: PASSWORD, newPassword: "" },
  });
  assert.equal(empty.status, 400, empty.text);

  // Aucun de ces échecs n'a changé le mot de passe ni révoqué la session.
  const still = await call("GET", "/v1/admin/me", { headers: as(token) });
  assert.equal(still.status, 200, still.text);
});

test("mot de passe actuel : le même compteur que la connexion limite les essais", async () => {
  const admin = await makeAdmin();
  const token = await login(admin.email, PASSWORD);

  let limited = false;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const res = await call("POST", "/v1/admin/me/password", {
      headers: as(token),
      payload: { currentPassword: `faux-${attempt}`, newPassword: NEW_PASSWORD },
    });
    if (res.status === 429) {
      limited = true;
      assert.ok(Number(res.body.error.retryAfter) > 0);
      break;
    }
    assert.equal(res.status, 400);
  }
  assert.equal(limited, true, "aucune limite après 10 essais sur le mot de passe actuel");
});

test("sessions : liste, « current », révocation de toutes les autres", async () => {
  const admin = await makeAdmin();
  const mine = await login(admin.email, PASSWORD);
  const other = await login(admin.email, PASSWORD);

  const list = await call("GET", "/v1/admin/me/sessions", { headers: as(mine) });
  assert.equal(list.status, 200, list.text);
  assert.equal(list.body.sessions.length, 2);
  const current = list.body.sessions.filter((s: { current: boolean }) => s.current);
  assert.equal(current.length, 1);
  assert.equal(current[0].id, sessionIdOf(mine));
  for (const session of list.body.sessions) {
    assert.equal(session.token, undefined, "une session ne révèle jamais de jeton");
    assert.ok(session.createdAt && session.lastSeenAt);
  }

  const scopeAll = await call("DELETE", "/v1/admin/me/sessions?scope=all", { headers: as(mine) });
  assert.equal(scopeAll.status, 400, scopeAll.text);

  const cleared = await call("DELETE", "/v1/admin/me/sessions?scope=others", { headers: as(mine) });
  assert.equal(cleared.status, 204, cleared.text);

  const otherRes = await call("GET", "/v1/admin/me", { headers: as(other) });
  assert.equal(otherRes.status, 401);
  const mineRes = await call("GET", "/v1/admin/me", { headers: as(mine) });
  assert.equal(mineRes.status, 200, mineRes.text);
});

test("une session se révoque par son identifiant ; une session d'autrui est introuvable", async () => {
  const admin = await makeAdmin();
  const other = await makeAdmin();
  const mine = await login(admin.email, PASSWORD);
  const target = await login(admin.email, PASSWORD);
  const foreign = await login(other.email, PASSWORD);

  const foreignSid = sessionIdOf(foreign);
  const notMine = await call("DELETE", `/v1/admin/me/sessions/${foreignSid}`, { headers: as(mine) });
  assert.equal(notMine.status, 404, notMine.text);
  const stillOpen = await call("GET", "/v1/admin/me", { headers: as(foreign) });
  assert.equal(stillOpen.status, 200, "la session d'autrui ne doit pas être touchée");

  const targetSid = sessionIdOf(target);
  const revoked = await call("DELETE", `/v1/admin/me/sessions/${targetSid}`, { headers: as(mine) });
  assert.equal(revoked.status, 204, revoked.text);
  const targetRes = await call("GET", "/v1/admin/me", { headers: as(target) });
  assert.equal(targetRes.status, 401);

  const again = await call("DELETE", `/v1/admin/me/sessions/${targetSid}`, { headers: as(mine) });
  assert.equal(again.status, 404);
});

test("déconnexion : la session de la requête est révoquée", async () => {
  const admin = await makeAdmin();
  const token = await login(admin.email, PASSWORD);

  const out = await call("POST", "/v1/admin/auth/logout", { headers: as(token) });
  assert.equal(out.status, 204, out.text);

  const after = await call("GET", "/v1/admin/me", { headers: as(token) });
  assert.equal(after.status, 401);
  assert.equal(after.body.error.message, "Session révoquée.");
});

test("une session révoquée en base refuse le jeton, même si le compte reste actif", async () => {
  const admin = await makeAdmin();
  const token = await login(admin.email, PASSWORD);
  await db.query("UPDATE admin_sessions SET revoked_at = now() WHERE id = $1", [sessionIdOf(token)]);

  const res = await call("GET", "/v1/admin/me", { headers: as(token) });
  assert.equal(res.status, 401, res.text);
});

test("un jeton dont la session appartient à un autre compte est refusé", async () => {
  const owner = await makeAdmin();
  const intruder = await makeAdmin();
  const ownerToken = await login(owner.email, PASSWORD);

  // Jeton signé pour `intruder` mais rattaché à la session de `owner`.
  const forged = await issueAdminToken({ adminId: intruder.id, sessionId: sessionIdOf(ownerToken) });
  const res = await call("GET", "/v1/admin/me", { headers: as(forged.token) });
  assert.equal(res.status, 401, res.text);
});

test("dernière activité : écrite au plus une fois par minute", async () => {
  const admin = await makeAdmin();
  const token = await login(admin.email, PASSWORD);
  const sid = sessionIdOf(token);

  await db.query("UPDATE admin_sessions SET last_seen_at = now() - interval '2 minutes' WHERE id = $1", [sid]);
  const first = await call("GET", "/v1/admin/me", { headers: as(token) });
  assert.equal(first.status, 200);
  const touched = await db.scalar<string>("SELECT last_seen_at::text FROM admin_sessions WHERE id = $1", [sid]);

  // Remise à une date ancienne, puis appel immédiat : la requête ne réécrit pas la date.
  await db.query("UPDATE admin_sessions SET last_seen_at = now() - interval '30 seconds' WHERE id = $1", [sid]);
  const before = await db.scalar<string>("SELECT last_seen_at::text FROM admin_sessions WHERE id = $1", [sid]);
  await call("GET", "/v1/admin/me", { headers: as(token) });
  const after = await db.scalar<string>("SELECT last_seen_at::text FROM admin_sessions WHERE id = $1", [sid]);

  assert.ok(touched);
  assert.equal(after, before, "une seconde requête dans la minute ne réécrit pas last_seen_at");
});

test("PATCH /me : nom, numéro WhatsApp normalisé, Telegram, unicité, validation", async () => {
  const admin = await makeAdmin();
  const token = await login(admin.email, PASSWORD);

  const renamed = await call("PATCH", "/v1/admin/me", {
    headers: as(token),
    payload: { name: "Nouveau Nom", whatsappNumber: "+237 655-44-33-22", telegramChatId: "-1001234567890" },
  });
  assert.equal(renamed.status, 200, renamed.text);
  assert.equal(renamed.body.name, "Nouveau Nom");
  assert.equal(renamed.body.whatsappNumber, "655443322");
  assert.equal(renamed.body.telegramChatId, "-1001234567890");

  const taken = await makeAdmin();
  const takenToken = await login(taken.email, PASSWORD);
  const clash = await call("PATCH", "/v1/admin/me", {
    headers: as(takenToken),
    payload: { whatsappNumber: "655443322" },
  });
  assert.equal(clash.status, 409, clash.text);
  assert.equal(clash.body.error.code, "CONFLICT");

  const badNumber = await call("PATCH", "/v1/admin/me", { headers: as(token), payload: { whatsappNumber: "12" } });
  assert.equal(badNumber.status, 400, badNumber.text);

  const empty = await call("PATCH", "/v1/admin/me", { headers: as(token), payload: {} });
  assert.equal(empty.status, 400, empty.text);

  const badTelegram = await call("PATCH", "/v1/admin/me", { headers: as(token), payload: { telegramChatId: "abc" } });
  assert.equal(badTelegram.status, 400, badTelegram.text);

  const smuggled = await call("PATCH", "/v1/admin/me", {
    headers: as(token),
    payload: { name: "Ok nom", platformRole: "owner" },
  });
  assert.equal(smuggled.status, 400, "un champ inconnu est refusé, pas promu");

  const cleared = await call("PATCH", "/v1/admin/me", {
    headers: as(token),
    payload: { whatsappNumber: null, telegramChatId: null },
  });
  assert.equal(cleared.status, 200, cleared.text);
  assert.equal(cleared.body.whatsappNumber, null);
  assert.equal(cleared.body.telegramChatId, null);
});

test("GET /me : id (et non adminId), rôles cumulables, onboarding nul", async () => {
  const admin = await makeAdmin({ platformRole: "owner" });
  await db.query("INSERT INTO admin_platform_roles (admin_id, role) VALUES ($1, 'reseau')", [admin.id]);
  const token = await login(admin.email, PASSWORD);

  const me = await call("GET", "/v1/admin/me", { headers: as(token) });
  assert.equal(me.status, 200, me.text);
  assert.equal(me.body.id, admin.id);
  assert.equal(me.body.adminId, undefined);
  assert.deepEqual(me.body.platformRoles, ["owner", "reseau"]);
  assert.equal(me.body.platformRole, "owner", "le rang le plus haut reste lisible sous l'ancienne forme");
  assert.equal(me.body.mustChangePassword, false);
  assert.equal(me.body.onboarding, null);
  assert.deepEqual(me.body.memberships, []);
});

test("ancien owner sans ligne de rôle : reste owner via la colonne legacy", async () => {
  const admin = await makeAdmin({ platformRole: "owner" });
  const token = await login(admin.email, PASSWORD);
  const me = await call("GET", "/v1/admin/me", { headers: as(token) });
  assert.deepEqual(me.body.platformRoles, ["owner"]);
});
