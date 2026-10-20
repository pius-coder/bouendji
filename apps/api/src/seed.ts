/**
 * Idempotent bootstrap.
 *
 * Everything here is created only if missing, so the command can be replayed
 * after a schema change without duplicating rows and without resetting a
 * password someone already changed.
 *
 * Prices are NOT a product decision: they are read from the environment and
 * fall back to a starting value that is printed as provisional. See
 * knowledge/00-brief/open-questions.md (prix non tranchés).
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

interface SeedPlan {
  code: string;
  name: string;
  description: string;
  price: number;
  days: number;
  devices: number;
  badge: string | null;
  featured: boolean;
  order: number;
}

function planPrices(): SeedPlan[] {
  return [
    {
      code: "essentiel-30",
      name: "Essentiel",
      description: "30 jours, un appareil.",
      price: Number(process.env.SEED_PRICE_1M ?? 5_000),
      days: 30,
      devices: 1,
      badge: null,
      featured: false,
      order: 10,
    },
    {
      code: "famille-90",
      name: "Famille",
      description: "90 jours, trois appareils.",
      price: Number(process.env.SEED_PRICE_3M ?? 13_500),
      days: 90,
      devices: 3,
      badge: "Le plus choisi",
      featured: true,
      order: 20,
    },
    {
      code: "annuel-365",
      name: "Annuel",
      description: "365 jours, cinq appareils.",
      price: Number(process.env.SEED_PRICE_12M ?? 48_000),
      days: 365,
      devices: 5,
      badge: null,
      featured: false,
      order: 30,
    },
  ];
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

    /* ---------------------------------------------------------------- plans */
    for (const plan of planPrices()) {
      const exists = await db.one<Row>("SELECT id FROM plans WHERE app_id = $1 AND code = $2", [appId, plan.code]);
      if (exists) {
        console.log(`forfait existant       ${plan.code}`);
        continue;
      }
      await db.query(
        `INSERT INTO plans (id, app_id, code, name, description, price_xaf, duration_days,
                            device_limit, badge, featured, active, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11)`,
        [newId(), appId, plan.code, plan.name, plan.description, plan.price, plan.days, plan.devices, plan.badge, plan.featured, plan.order],
      );
      console.log(`forfait cree           ${plan.code.padEnd(14)} ${plan.price} XAF / ${plan.days} j  (prix provisoire)`);
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
    console.log("Termine. Prix affiches : valeurs de depart, a valider avant toute vente.");
  } finally {
    await db.close();
  }
}

await seed();
