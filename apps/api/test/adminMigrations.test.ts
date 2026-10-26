/**
 * Migrations admin 010-012 : sur une base qui porte déjà des comptes, sans
 * perte de données, rejouables, et contraintes réelles (unicité, rôles connus).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

const { closeAll } = await import("./support.js");
const { createDb, isUniqueViolation } = await import("../src/db.js");
const { applyAdminMigrations } = await import("./adminMigrations.js");

const fresh = [] as Awaited<ReturnType<typeof createDb>>[];

after(async () => {
  for (const db of fresh) await db.close();
  await closeAll();
});

async function freshDb() {
  // Schéma de base seul (avant migrations), comme une base de production existante.
  const db = await createDb("memory://");
  fresh.push(db);
  return db;
}

test("une base existante : le propriétaire legacy devient owner, les autres n'en reçoivent pas", async () => {
  const db = await freshDb();
  const owner = `adm_${randomUUID().slice(0, 6)}`;
  const staff = `adm_${randomUUID().slice(0, 6)}`;
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active)
     VALUES ($1, $2, 'x', 'Propriétaire', 'platform', 'owner', true),
            ($3, $4, 'x', 'Équipe', 'partner', 'none', true)`,
    [owner, `${owner}@example.test`, staff, `${staff}@example.test`],
  );

  await applyAdminMigrations(db);

  const roles = await db.query<{ admin_id: string; role: string }>("SELECT admin_id, role FROM admin_platform_roles");
  assert.deepEqual(roles, [{ admin_id: owner, role: "owner" }]);
});

test("les comptes existants doivent changer leur mot de passe (DEFAULT true)", async () => {
  const db = await freshDb();
  const id = `adm_${randomUUID().slice(0, 6)}`;
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active)
     VALUES ($1, $2, 'x', 'Ancien', 'partner', 'none', true)`,
    [id, `${id}@example.test`],
  );

  await applyAdminMigrations(db);

  const row = await db.one<{ must_change_password: boolean }>(
    "SELECT must_change_password FROM admin_users WHERE id = $1",
    [id],
  );
  assert.equal(row?.must_change_password, true);
});

test("rejouer les migrations ne change rien et ne lève aucune erreur", async () => {
  const db = await freshDb();
  await applyAdminMigrations(db);
  await applyAdminMigrations(db);
  const count = await db.scalar<string>("SELECT count(*)::text FROM admin_platform_roles");
  assert.equal(count, "0");
});

test("numéro WhatsApp : unique, mais plusieurs comptes sans numéro restent possibles", async () => {
  const db = await freshDb();
  await applyAdminMigrations(db);
  const insert = (id: string, whatsapp: string | null) =>
    db.query(
      `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active, whatsapp_number)
       VALUES ($1, $2, 'x', 'Compte', 'partner', 'none', true, $3)`,
      [id, `${id}@example.test`, whatsapp],
    );

  await insert("adm_a", "655000111");
  await insert("adm_b", null);
  await insert("adm_c", null);
  await assert.rejects(insert("adm_d", "655000111"), (error: unknown) => isUniqueViolation(error));
});

test("admin_platform_roles refuse un rôle inconnu", async () => {
  const db = await freshDb();
  await applyAdminMigrations(db);
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active)
     VALUES ('adm_r', 'r@example.test', 'x', 'R', 'partner', 'none', true)`,
  );
  await db.query("INSERT INTO admin_platform_roles (admin_id, role) VALUES ('adm_r', 'reseau')");
  await assert.rejects(db.query("INSERT INTO admin_platform_roles (admin_id, role) VALUES ('adm_r', 'support')"));
});

test("admin_sessions : une session disparaît avec son compte", async () => {
  const db = await freshDb();
  await applyAdminMigrations(db);
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active)
     VALUES ('adm_s', 's@example.test', 'x', 'S', 'partner', 'none', true)`,
  );
  await db.query("INSERT INTO admin_sessions (id, admin_id) VALUES ('ses_1', 'adm_s')");
  await db.query("DELETE FROM admin_users WHERE id = 'adm_s'");
  const left = await db.scalar<string>("SELECT count(*)::text FROM admin_sessions");
  assert.equal(left, "0");
});
