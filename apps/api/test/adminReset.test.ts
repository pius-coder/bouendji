/**
 * Réinitialisation du mot de passe d'un admin par l'owner : mot de passe
 * provisoire renvoyé une fois, drapeau levé, sessions de la cible révoquées.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

const { db, call, closeAll } = await import("./support.js");
const { hashPassword } = await import("../src/lib/crypto.js");

after(async () => {
  await closeAll();
});

const PASSWORD = "mot-de-passe-de-test-2026";

async function makeAdmin(platformRole: "owner" | "none", whatsapp: string | null = null) {
  const id = `adm_rst_${randomUUID().slice(0, 8)}`;
  const email = `${id}@example.test`;
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active, must_change_password, whatsapp_number)
     VALUES ($1, $2, $3, 'Compte reset', $4, $5, true, false, $6)`,
    [id, email, hashPassword(PASSWORD), platformRole === "owner" ? "platform" : "partner", platformRole, whatsapp],
  );
  return { id, email };
}

let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `10.9.${Math.floor(ipCounter / 250)}.${ipCounter % 250}`;
}

async function login(email: string, password: string): Promise<string> {
  const res = await call("POST", "/v1/admin/auth/login", {
    payload: { email, password },
    headers: { "x-forwarded-for": nextIp() },
  });
  assert.equal(res.status, 200, res.text);
  return res.body.token as string;
}

const as = (token: string) => ({ authorization: `Bearer ${token}` });

test("owner réinitialise un admin : mot de passe provisoire, drapeau, sessions révoquées", async () => {
  const owner = await makeAdmin("owner");
  const target = await makeAdmin("none", "699000111");
  const ownerToken = await login(owner.email, PASSWORD);
  const targetToken = await login(target.email, PASSWORD);

  const reset = await call("POST", `/v1/admin/admins/${target.id}/reset-password`, { headers: as(ownerToken) });
  assert.equal(reset.status, 200, reset.text);
  assert.equal(reset.body.mustChangePassword, true);
  const temporary = String(reset.body.temporaryPassword);
  assert.ok(temporary.length >= 12);
  assert.match(String(reset.body.whatsappLink), /^https:\/\/wa\.me\/237699000111\?text=/);

  // L'ancienne session de la cible est refusée.
  const stale = await call("GET", "/v1/admin/me", { headers: as(targetToken) });
  assert.equal(stale.status, 401, stale.text);

  // Connexion avec le provisoire : l'écran de changement est imposé.
  const fresh = await login(target.email, temporary);
  const me = await call("GET", "/v1/admin/me", { headers: as(fresh) });
  assert.equal(me.status, 200, me.text);
  assert.equal(me.body.mustChangePassword, true);
  const blocked = await call("GET", "/v1/admin/communities", { headers: as(fresh) });
  assert.equal(blocked.body.error.code, "PASSWORD_CHANGE_REQUIRED");
});

test("un admin simple ne réinitialise personne ; l'owner ne réinitialise pas son propre compte", async () => {
  const owner = await makeAdmin("owner");
  const simple = await makeAdmin("none");
  const other = await makeAdmin("none");
  const simpleToken = await login(simple.email, PASSWORD);
  const ownerToken = await login(owner.email, PASSWORD);

  const denied = await call("POST", `/v1/admin/admins/${other.id}/reset-password`, { headers: as(simpleToken) });
  assert.equal(denied.status, 403, denied.text);

  const self = await call("POST", `/v1/admin/admins/${owner.id}/reset-password`, { headers: as(ownerToken) });
  assert.equal(self.status, 400, self.text);
});
