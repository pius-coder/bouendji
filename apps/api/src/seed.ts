/**
 * Idempotent bootstrap.
 *
 * Everything here is created only if missing, so the command can be replayed
 * after a schema change without duplicating rows and without resetting a
 * password someone already changed.
 *
 * Il ne crée que trois choses : la communauté, la marque et le compte `owner`.
 * **Aucun forfait** (D59) : un prix est une décision commerciale, pas une
 * valeur de démarrage. Un forfait semé s'affiche dans l'app et engage celui qui
 * le voit ; il se crée depuis la console, prix et durée libres, quand il est
 * décidé. Le seed ne doit donc jamais réapparaître avec des prix provisoires,
 * même en développement : c'est la même route de lecture qui sert la
 * production.
 */
import { env } from "./config.js";
import { createDb, type Database, type Row } from "./db.js";
import { hashPassword, newId } from "./lib/crypto.js";

async function columnExists(db: Database, table: string, column: string): Promise<boolean> {
  const row = await db.one<Row>(
    `SELECT 1 AS present
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return row !== null;
}

async function seed(): Promise<void> {
  if (!env.seed.adminPassword) {
    console.error("SEED_ADMIN_PASSWORD est vide : refus de creer un compte sans mot de passe.");
    console.error("Relancez avec SEED_ADMIN_PASSWORD='<mot de passe long>'.");
    process.exit(78);
  }
  if (env.seed.adminPassword.length < 12) {
    console.error("SEED_ADMIN_PASSWORD trop court (12 caracteres minimum).");
    process.exit(78);
  }

  const db = await createDb();
  try {
    /* ------------------------------------------------------------ community */
    const existingCommunity = await db.one<Row>("SELECT id FROM communities WHERE slug = $1", [env.seed.communitySlug]);
    let communityId: string;
    if (existingCommunity) {
      communityId = existingCommunity.id as string;
      console.log(`communaute existante   ${communityId}  (${env.seed.communitySlug})`);
    } else {
      communityId = newId();
      await db.query(
        `INSERT INTO communities (id, name, slug, commission_bps) VALUES ($1, $2, $3, $4)`,
        [communityId, env.seed.communityName, env.seed.communitySlug, 2_000],
      );
      console.log(`communaute creee       ${communityId}  (${env.seed.communitySlug})`);
    }

    /* ------------------------------------------------------------------ app */
    const appSlug = `${env.seed.communitySlug}-android`;
    const existingApp = await db.one<Row>("SELECT id FROM apps WHERE slug = $1", [appSlug]);
    let appId: string;
    if (existingApp) {
      appId = existingApp.id as string;
      console.log(`application existante  ${appId}  (${appSlug})`);
    } else {
      appId = newId();
      await db.query(
        `INSERT INTO apps (id, community_id, slug, name, package_name, theme, appearance)
         VALUES ($1, $2, $3, $4, $5, 'halo', 'auto')`,
        [appId, communityId, appSlug, env.seed.appName, env.seed.packageName],
      );
      console.log(`application creee      ${appId}  (${appSlug})`);
    }

    /* ---------------------------------------------------------------- owner */
    const existingAdmin = await db.one<Row>("SELECT id FROM admin_users WHERE email = $1", [env.seed.adminEmail]);
    if (existingAdmin) {
      console.log(`administrateur existant ${env.seed.adminEmail} (mot de passe inchange)`);
    } else {
      const platformRole = await columnExists(db, "admin_users", "platform_role");
      const adminId = newId();
      if (platformRole) {
        await db.query(
          `INSERT INTO admin_users (id, email, password_hash, name, platform_role, active)
           VALUES ($1, $2, $3, $4, 'owner', true)`,
          [adminId, env.seed.adminEmail, hashPassword(env.seed.adminPassword), "Proprietaire"],
        );
      } else {
        await db.query(
          `INSERT INTO admin_users (id, email, password_hash, name, role, active)
           VALUES ($1, $2, $3, $4, 'platform', true)`,
          [adminId, env.seed.adminEmail, hashPassword(env.seed.adminPassword), "Proprietaire"],
        );
      }
      console.log(`administrateur cree    ${env.seed.adminEmail}  (${adminId})`);
    }

    console.log("");
    console.log("Termine. Communaute, marque et owner en place. Aucun forfait cree (D59) :");
    console.log("les prix et les durees se decident depuis la console, jamais au seed.");
  } finally {
    await db.close();
  }
}

await seed();
