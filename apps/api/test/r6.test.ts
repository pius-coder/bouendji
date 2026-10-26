/**
 * R6 : forfaits à deux familles, réglages tarifaires, paiement.
 *
 * Vrais `buildApp`, vraie base PGlite en mémoire, vrai fournisseur `mock`.
 * Chaque règle a son test ; les deux régressions de paiement (activation
 * dupliquée, webhook `pending` non final) ont leur test d'abord.
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "memory://";
process.env.MASTER_KEY = Buffer.alloc(32, 9).toString("base64");
process.env.JWT_SECRET = "test-secret-test-secret-test-secret";
process.env.PAYMENT_PROVIDER = "mock";
process.env.PUBLIC_BASE_URL = "http://localhost:8080";

const { createDb } = await import("../src/db.js");
const { buildApp } = await import("../src/app.js");
const { issueAccessToken, issueAdminToken } = await import("../src/lib/auth.js");
const {
  activateOrder,
  createOrder,
  handleWebhookEvent,
  reconcilePayment,
} = await import("../src/services/payments.js");
const { setMockPaymentStatus } = await import("../src/services/mockPayments.js");
const { assertAboveFloor, baseFloorXaf, nightOptionFloorXaf, commissionCapBps } = await import(
  "../src/services/pricing.js"
);
const { applyR6Migrations } = await import("./r6schema.js");
const migration064 = await import("../src/migrations/064_subscriptions_order_unique.js");
const { canonicalProof } = await import("../src/lib/crypto.js");

const db = await createDb();
await applyR6Migrations(db);
const app = await buildApp({ db });

after(async () => {
  await app.close();
  await db.close();
});

/* ------------------------------------------------------------------ graine */

const COMMUNITY = "com_r6";
const APP = "app_r6";
const OWNER = "adm_r6_owner";
const COMMUNITY_ADMIN = "adm_r6_ca";
const SUPPORT = "adm_r6_support";
const PASSWORD_HASH = "scrypt$16384$8$1$x$y";
const QUOTA = 10_000_000_000;
const LIMITED = "plan_r6_limited";
const NIGHT = "plan_r6_night";

await db.query("INSERT INTO communities (id, name, slug, commission_bps) VALUES ($1, $2, $3, $4)", [
  COMMUNITY,
  "Communauté R6",
  "com-r6",
  2000,
]);
await db.query("INSERT INTO apps (id, community_id, slug, name, package_name) VALUES ($1, $2, $3, $4, $5)", [
  APP,
  COMMUNITY,
  "app-r6",
  "App R6",
  "com.example.r6",
]);

for (const [id, email, platformRole] of [
  [OWNER, "owner@r6.test", "owner"],
  [COMMUNITY_ADMIN, "ca@r6.test", "none"],
  [SUPPORT, "support@r6.test", "none"],
] as const) {
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active)
     VALUES ($1, $2, $3, $4, 'partner', $5, true)`,
    [id, email, PASSWORD_HASH, id, platformRole],
  );
}
await db.query(
  `INSERT INTO community_memberships (id, admin_user_id, community_id, role, status)
   VALUES ('mem_r6_ca', $1, $2, 'community_admin', 'active'), ('mem_r6_sup', $3, $2, 'support', 'active')`,
  [COMMUNITY_ADMIN, COMMUNITY, SUPPORT],
);

const ownerToken = (await issueAdminToken({ adminId: OWNER, role: "partner", communityId: null })).token;
const caToken = (await issueAdminToken({ adminId: COMMUNITY_ADMIN, role: "partner", communityId: null })).token;
const supportToken = (await issueAdminToken({ adminId: SUPPORT, role: "partner", communityId: null })).token;

// Offres semées directement : les règles de prix sont testées ensuite par les routes.
await db.query(
  `INSERT INTO plans (id, app_id, code, name, description, price_xaf, duration_days, device_limit, active,
                      family, quota_bytes, endpoint_tier)
   VALUES ($1, $2, 'limite-30', 'Limité 10 Go', '', 1000, 30, 1, true, 'limited', $3, 'paid-gcp')`,
  [LIMITED, APP, QUOTA],
);
await db.query(
  `INSERT INTO plans (id, app_id, code, name, description, price_xaf, duration_days, device_limit, active,
                      family, quota_bytes, endpoint_tier)
   VALUES ($1, $2, 'nuit-30', 'Limité + nuit', '', 1500, 30, 1, true, 'limited_night', $3, 'free-labs')`,
  [NIGHT, APP, QUOTA],
);
await db.query(
  `INSERT INTO plan_night_options (plan_id, night_window, price_xaf, active) VALUES
     ($1, '20-24', 300, true), ($1, '20-04', 500, true), ($1, '24-04', 200, false)`,
  [NIGHT],
);

let seq = 0;
/** Utilisateur, appareil actif et session : même forme que les tests de paiement. */
async function seedUser(): Promise<Buyer> {
  seq += 1;
  // Vraie paire de clés : la route signée vérifie la preuve de l'appareil.
  const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const spki = keys.publicKey.export({ format: "der", type: "spki" }).toString("base64");
  const pem = keys.privateKey.export({ format: "pem", type: "pkcs8" }) as string;
  const userId = `usr_r6_${seq}`;
  const deviceId = `dev_r6_${seq}`;
  const sessionId = `ses_r6_${seq}`;
  await db.query(
    `INSERT INTO users (id, app_id, community_id, email, password_hash, name, email_verified_at)
     VALUES ($1, $2, $3, $4, $5, 'Acheteur R6', now())`,
    [userId, APP, COMMUNITY, `buyer${seq}@r6.test`, PASSWORD_HASH],
  );
  await db.query(
    `INSERT INTO devices (id, user_id, installation_id, name, signing_key, agreement_key, device_token_hash, status)
     VALUES ($1, $2, $3, 'Pixel R6', $4, 'agree', 'hash', 'active')`,
    [deviceId, userId, `inst-r6-${seq}`, spki],
  );
  await db.query(
    `INSERT INTO auth_sessions (id, user_id, device_id, refresh_hash, expires_at)
     VALUES ($1, $2, $3, $4, now() + interval '1 day')`,
    [sessionId, userId, deviceId, `refresh-r6-${seq}`],
  );
  const { token } = await issueAccessToken({ userId, deviceId, communityId: COMMUNITY, sessionId });
  return { userId, deviceId, token, pem };
}

interface Buyer {
  userId: string;
  deviceId: string;
  token: string;
  pem: string;
}

/** En-têtes de preuve d'appareil, comme l'app : nonce neuf, horodatage courant. */
function proofHeaders(pem: string, method: string, path: string): Record<string, string> {
  const timestamp = String(Date.now());
  const nonce = randomUUID();
  const signature = sign("sha256", Buffer.from(canonicalProof({ method, path, body: "", timestamp, nonce }), "utf8"), pem);
  return {
    "x-device-timestamp": timestamp,
    "x-device-nonce": nonce,
    "x-device-signature": signature.toString("base64"),
  };
}

interface Reply {
  status: number;
  body: Record<string, any>;
}

async function call(
  method: string,
  url: string,
  token: string | null,
  payload?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<Reply> {
  const res = await app.inject({
    method: method as never,
    url,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extraHeaders },
    ...(payload === undefined ? {} : { payload: payload as never }),
  });
  let body: Record<string, any> = {};
  try {
    body = res.json() as Record<string, any>;
  } catch {
    body = {};
  }
  return { status: res.statusCode, body };
}

/** Révision telle que l'app la lit dans le catalogue public. */
async function catalogRevision(planId: string): Promise<number> {
  const catalog = await call("GET", `/v1/apps/${APP}/plans`, null);
  const item = (catalog.body.items as Record<string, any>[]).find((plan) => plan.id === planId);
  assert.ok(item, `offre ${planId} absente du catalogue`);
  return Number(item.revision);
}

const SETTINGS = {
  costPerGbXaf: 100,
  nightWindowCostXaf: { "20-24": 300, "24-04": 200, "20-04": 400 },
  platformMarginBps: 1000,
  maxCommissionBps: null,
};

/* ------------------------------------------------------------ migrations */

test("les migrations R6 se rejouent sans effet", async () => {
  await applyR6Migrations(db);
  const count = await db.scalar<number>(
    "SELECT count(*)::int FROM plan_night_options WHERE plan_id = $1",
    [NIGHT],
  );
  assert.equal(Number(count), 3, "rejouer les migrations ne touche pas aux données");
});

test("064 refuse les doublons, nomme la commande, ne supprime rien", async () => {
  const scratch = await createDb("memory://");
  try {
    await scratch.query("INSERT INTO communities (id, name, slug) VALUES ('c1', 'C', 'c1')");
    await scratch.query(
      "INSERT INTO apps (id, community_id, slug, name, package_name) VALUES ('a1', 'c1', 'a1', 'A', 'com.x.a1')",
    );
    await scratch.query(
      "INSERT INTO users (id, app_id, community_id, email, password_hash, name) VALUES ('u1', 'a1', 'c1', 'u1@x.test', 'h', 'U')",
    );
    await scratch.query(
      "INSERT INTO plans (id, app_id, code, name, price_xaf, duration_days) VALUES ('p1', 'a1', 'p', 'P', 1000, 30)",
    );
    await scratch.query(
      `INSERT INTO orders (id, user_id, app_id, plan_id, community_id, amount_xaf, status, provider)
       VALUES ('o1', 'u1', 'a1', 'p1', 'c1', 1000, 'paid', 'mock')`,
    );
    await scratch.query(
      `INSERT INTO subscriptions (id, user_id, plan_id, order_id, starts_at, ends_at) VALUES
         ('s1', 'u1', 'p1', 'o1', now(), now() + interval '30 days'),
         ('s2', 'u1', 'p1', 'o1', now(), now() + interval '30 days')`,
    );

    await assert.rejects(migration064.up(scratch), /o1 \(2 abonnements\)[\s\S]*Aucune ligne n'a été supprimée/);
    assert.equal(Number(await scratch.scalar("SELECT count(*)::int FROM subscriptions")), 2, "aucune ligne supprimée");

    await scratch.query("DELETE FROM subscriptions WHERE id = 's2'");
    await migration064.up(scratch);
    await assert.rejects(
      scratch.query(
        `INSERT INTO subscriptions (id, user_id, plan_id, order_id, starts_at, ends_at)
         VALUES ('s3', 'u1', 'p1', 'o1', now(), now())`,
      ),
      (err: unknown) => (err as { code?: string }).code === "23505",
    );
  } finally {
    await scratch.close();
  }
});

/* ------------------------------------------------------ régressions paiement */

test("activation : deux activations simultanées d'une commande donnent un seul abonnement", async () => {
  const buyer = await seedUser();
  const created = await createOrder(db, {
    userId: buyer.userId,
    planId: LIMITED,
    planRevision: await catalogRevision(LIMITED),
  });
  await db.query("UPDATE orders SET status = 'paid', paid_at = now() WHERE id = $1", [created.raw.orderId]);

  const results = await Promise.all([
    activateOrder(db, created.raw.orderId),
    activateOrder(db, created.raw.orderId),
  ]);
  assert.deepEqual(results.sort(), [false, true], "une seule activation effective");
  assert.equal(
    Number(await db.scalar("SELECT count(*)::int FROM subscriptions WHERE order_id = $1", [created.raw.orderId])),
    1,
  );
});

test("webhook « pending » n'est pas final : le renvoi suivant est retraité et active la commande", async () => {
  const buyer = await seedUser();
  const created = await createOrder(db, {
    userId: buyer.userId,
    planId: LIMITED,
    planRevision: await catalogRevision(LIMITED),
  });
  const providerRef = created.raw.providerRef;

  setMockPaymentStatus(providerRef, "pending");
  const first = await handleWebhookEvent(db, {
    eventId: "evt-pending-1",
    providerRef,
    payloadHash: "hash-1",
  });
  assert.equal(first.status, "pending");

  setMockPaymentStatus(providerRef, "paid");
  const retry = await handleWebhookEvent(db, {
    eventId: "evt-pending-1",
    providerRef,
    payloadHash: "hash-1",
  });
  assert.equal(retry.status, "processed", "le renvoi n'est plus pris pour un doublon");
  assert.equal(retry.activated, true);
  assert.equal(retry.orderStatus, "paid");

  const again = await handleWebhookEvent(db, {
    eventId: "evt-pending-1",
    providerRef,
    payloadHash: "hash-1",
  });
  assert.equal(again.status, "duplicate", "un état terminal bloque bien le rejeu");
});

/* ---------------------------------------------------------------- plancher */

test("plancher : coût du Go arrondi au Go supérieur, marge, plage de nuit", () => {
  const settings = {
    costPerGbXaf: 100,
    nightWindowCostXaf: { "20-24": 300, "24-04": null, "20-04": null },
    platformMarginBps: 1000,
    maxCommissionBps: null,
    updatedAt: null,
    updatedBy: null,
  };
  assert.equal(baseFloorXaf(QUOTA, settings), 1100, "10 Go x 100 = 1000, plus 10 %");
  assert.equal(baseFloorXaf(10_000_000_001, settings), 1210, "10,000000001 Go arrondi à 11 Go");
  assert.equal(nightOptionFloorXaf("20-24", settings), 330);
  assert.equal(nightOptionFloorXaf("24-04", settings), null, "plage sans coût saisi : pas de plancher");
  assert.equal(baseFloorXaf(QUOTA, { ...settings, costPerGbXaf: null }), null, "sans coût du Go : pas de plancher");
});

test("plancher : refus sous le plancher, acceptation au plancher, rien sans réglage", () => {
  const configured = {
    costPerGbXaf: 100,
    nightWindowCostXaf: { "20-24": 300, "24-04": null, "20-04": null },
    platformMarginBps: 1000,
    maxCommissionBps: null,
    updatedAt: null,
    updatedBy: null,
  };
  const unset = {
    costPerGbXaf: null,
    nightWindowCostXaf: { "20-24": null, "24-04": null, "20-04": null },
    platformMarginBps: null,
    maxCommissionBps: null,
    updatedAt: null,
    updatedBy: null,
  };
  assert.throws(
    () => assertAboveFloor(configured, { quotaBytes: QUOTA, priceXaf: 1099, nightOptions: [] }),
    (err: any) => err.status === 409 && err.details.reason === "BELOW_FLOOR" && err.details.floorXaf === "1100",
  );
  assert.doesNotThrow(() => assertAboveFloor(configured, { quotaBytes: QUOTA, priceXaf: 1100, nightOptions: [] }));
  assert.throws(
    () =>
      assertAboveFloor(configured, {
        quotaBytes: QUOTA,
        priceXaf: 1100,
        nightOptions: [{ window: "20-24", priceXaf: 329, active: true }],
      }),
    (err: any) => err.details.window === "20-24" && err.details.floorXaf === "330",
  );
  assert.doesNotThrow(() =>
    assertAboveFloor(configured, {
      quotaBytes: QUOTA,
      priceXaf: 1100,
      nightOptions: [{ window: "20-24", priceXaf: 1, active: false }],
    }),
  );
  assert.doesNotThrow(() => assertAboveFloor(unset, { quotaBytes: QUOTA, priceXaf: 1, nightOptions: [] }));
  assert.doesNotThrow(() => assertAboveFloor(configured, { quotaBytes: null, priceXaf: 1, nightOptions: [] }));
});

/* ----------------------------------------------------------- réglages API */

test("réglages tarifaires : lecture par owner et community_admin, écriture par owner seul", async () => {
  assert.equal((await call("GET", "/v1/admin/pricing", null)).status, 401);
  assert.equal((await call("GET", "/v1/admin/pricing", supportToken)).status, 403, "support : pas de lecture");

  const read = await call("GET", "/v1/admin/pricing", caToken);
  assert.equal(read.status, 200);
  assert.equal(read.body.floorConfigured, false, "rien n'est réglé : aucune valeur par défaut");
  assert.equal(read.body.costPerGbXaf, null);
  assert.equal(read.body.effectiveMaxCommissionBps, 3000, "repli D35 seulement tant que rien n'est réglé");

  assert.equal((await call("PUT", "/v1/admin/pricing", caToken, SETTINGS)).status, 403, "community_admin : pas d'écriture");
  const incomplete = await call("PUT", "/v1/admin/pricing", ownerToken, { costPerGbXaf: 100 });
  assert.equal(incomplete.status, 400, "PUT complet : un champ oublié n'est pas remis à zéro");
  const extra = await call("PUT", "/v1/admin/pricing", ownerToken, {
    ...SETTINGS,
    nightWindowCostXaf: { ...SETTINGS.nightWindowCostXaf, "18-22": 10 },
  });
  assert.equal(extra.status, 400, "plage inconnue refusée");

  const saved = await call("PUT", "/v1/admin/pricing", ownerToken, SETTINGS);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.floorConfigured, true);
  assert.equal(saved.body.nightWindowCostXaf["20-24"], 300);

  const after = await call("GET", "/v1/admin/pricing", caToken);
  assert.equal(after.body.platformMarginBps, 1000);
  assert.equal(after.body.updatedBy, OWNER);
  assert.equal(Number(await db.scalar("SELECT count(*)::int FROM audit_log WHERE action = 'pricing.update'")) >= 1, true);
});

test("plafond de commission : le réglage est appliqué à la commande, le repli de 30 % sans réglage", async () => {
  assert.equal((await call("PUT", "/v1/admin/pricing", ownerToken, { ...SETTINGS, maxCommissionBps: 1000 })).status, 200);
  const buyer = await seedUser();
  const capped = await createOrder(db, {
    userId: buyer.userId,
    planId: LIMITED,
    planRevision: await catalogRevision(LIMITED),
  });
  const cappedRow = await db.one<Record<string, any>>("SELECT commission_bps, commission_xaf FROM orders WHERE id = $1", [
    capped.raw.orderId,
  ]);
  assert.equal(Number(cappedRow?.commission_bps), 1000, "la communauté est à 20 %, le plafond réglé l'abaisse à 10 %");
  assert.equal(Number(cappedRow?.commission_xaf), 100, "10 % de 1000 XAF");

  assert.equal((await call("PUT", "/v1/admin/pricing", ownerToken, SETTINGS)).status, 200);
  assert.equal(commissionCapBps(await (await import("../src/services/pricing.js")).loadPricingSettings(db)), 3000);
  const fallback = await createOrder(db, {
    userId: buyer.userId,
    planId: LIMITED,
    planRevision: await catalogRevision(LIMITED),
  });
  const fallbackRow = await db.one<Record<string, any>>("SELECT commission_bps FROM orders WHERE id = $1", [
    fallback.raw.orderId,
  ]);
  assert.equal(Number(fallbackRow?.commission_bps), 2000, "sans plafond réglé, le taux de la communauté (2000) passe");
});

/* ------------------------------------------------------------------ forfaits */

test("forfaits : famille, quota et options validés à la création", async () => {
  const bad = [
    { code: "x-limite", name: "Sans quota", priceXaf: 1000, durationDays: 30, family: "limited_night", nightOptions: [{ window: "20-24", priceXaf: 300 }] },
    { code: "x-mixte", name: "Limité avec nuit", priceXaf: 1000, durationDays: 30, family: "limited", quotaBytes: QUOTA, nightOptions: [{ window: "20-24", priceXaf: 300 }] },
    { code: "x-doublon", name: "Plage en double", priceXaf: 1000, durationDays: 30, family: "limited_night", quotaBytes: QUOTA, nightOptions: [{ window: "20-24", priceXaf: 300 }, { window: "20-24", priceXaf: 310 }] },
  ];
  for (const body of bad) {
    const res = await call("POST", `/v1/admin/apps/${APP}/plans`, ownerToken, body);
    assert.equal(res.status, 400, `refusé : ${body.code}`);
  }
});

test("forfaits : prix sous le plancher refusé en 409, au plancher accepté", async () => {
  assert.equal((await call("PUT", "/v1/admin/pricing", ownerToken, SETTINGS)).status, 200);

  const underBase = await call("POST", `/v1/admin/apps/${APP}/plans`, ownerToken, {
    code: "nuit-sous",
    name: "Nuit trop bas",
    priceXaf: 1099,
    durationDays: 30,
    family: "limited_night",
    quotaBytes: QUOTA,
    nightOptions: [{ window: "20-24", priceXaf: 330 }],
  });
  assert.equal(underBase.status, 409);
  assert.equal(underBase.body.error.details.reason, "BELOW_FLOOR");
  assert.equal(underBase.body.error.details.floorXaf, "1100");

  const underNight = await call("POST", `/v1/admin/apps/${APP}/plans`, ownerToken, {
    code: "nuit-option-basse",
    name: "Option trop basse",
    priceXaf: 1100,
    durationDays: 30,
    family: "limited_night",
    quotaBytes: QUOTA,
    nightOptions: [{ window: "20-24", priceXaf: 329 }],
  });
  assert.equal(underNight.status, 409);
  assert.equal(underNight.body.error.details.window, "20-24");

  const atFloor = await call("POST", `/v1/admin/apps/${APP}/plans`, ownerToken, {
    code: "nuit-plancher",
    name: "Au plancher",
    priceXaf: 1100,
    durationDays: 30,
    family: "limited_night",
    quotaBytes: QUOTA,
    nightOptions: [{ window: "20-24", priceXaf: 330 }],
  });
  assert.equal(atFloor.status, 201);
  assert.equal(atFloor.body.family, "limited_night");
  assert.equal(atFloor.body.quotaBytes, QUOTA);
  assert.deepEqual(atFloor.body.nightOptions, [{ window: "20-24", priceXaf: 330, active: true }]);
});

test("forfaits : modifier un autre champ ne re-contrôle pas le plancher ; passer en limité retire les options", async () => {
  // Offre antérieure au plancher : elle reste modifiable sur son nom.
  const legacy = await call("PATCH", `/v1/admin/plans/${LIMITED}`, ownerToken, { name: "Limité 10 Go (renommé)" });
  assert.equal(legacy.status, 200, "pas de contrôle de plancher sans changement de prix ou de quota");

  const tooLow = await call("PATCH", `/v1/admin/plans/${LIMITED}`, ownerToken, { priceXaf: 1000 });
  assert.equal(tooLow.status, 409, "changer le prix déclenche le contrôle");

  const plan = await call("POST", `/v1/admin/apps/${APP}/plans`, ownerToken, {
    code: "bascule",
    name: "Bascule",
    priceXaf: 1500,
    durationDays: 30,
    family: "limited_night",
    quotaBytes: QUOTA,
    nightOptions: [{ window: "20-04", priceXaf: 440 }],
  });
  assert.equal(plan.status, 201);
  const downgraded = await call("PATCH", `/v1/admin/plans/${plan.body.id}`, ownerToken, { family: "limited" });
  assert.equal(downgraded.status, 200);
  assert.equal(downgraded.body.family, "limited");
  assert.deepEqual(downgraded.body.nightOptions, [], "les options de nuit sont retirées");

  const forbidden = await call("PATCH", `/v1/admin/plans/${plan.body.id}`, ownerToken, {
    family: "limited",
    nightOptions: [{ window: "20-24", priceXaf: 400 }],
  });
  assert.equal(forbidden.status, 400, "options de nuit refusées pour la famille limitée");
});

test("révision : famille, quota, options et nature de nœud en font partie", async () => {
  const before = await catalogRevision(NIGHT);
  const bumped = await call("PATCH", `/v1/admin/plans/${NIGHT}`, ownerToken, {
    nightOptions: [{ window: "20-24", priceXaf: 330 }, { window: "20-04", priceXaf: 440 }, { window: "24-04", priceXaf: 220 }],
  });
  assert.equal(bumped.status, 200, "option 24-04 réactivée");
  const afterOptions = await catalogRevision(NIGHT);
  assert.notEqual(afterOptions, before, "une option active de plus change la révision");

  const tier = await call("PATCH", `/v1/admin/plans/${NIGHT}`, ownerToken, { endpointTier: "paid-gcp" });
  assert.equal(tier.status, 200);
  assert.notEqual(await catalogRevision(NIGHT), afterOptions, "la nature de nœud change la révision (B5)");
});

test("catalogue : famille, quota et seules les options actives ; révision cohérente avec la liste admin", async () => {
  const catalog = await call("GET", `/v1/apps/${APP}/plans`, null);
  const item = (catalog.body.items as Record<string, any>[]).find((plan) => plan.id === NIGHT);
  assert.ok(item);
  assert.equal(item.family, "limited_night");
  assert.equal(item.quotaBytes, QUOTA);
  assert.deepEqual(
    item.nightOptions.map((option: Record<string, any>) => option.window),
    ["20-04", "20-24", "24-04"],
    "la liste donnée au catalogue reprend les options actives, ici toutes après réactivation",
  );

  const admin = await call("GET", `/v1/admin/apps/${APP}/plans`, ownerToken);
  const adminItem = (admin.body.items as Record<string, any>[]).find((plan) => plan.id === NIGHT);
  assert.equal(adminItem.revision, item.revision, "même révision côté admin et côté catalogue");
});

/* ----------------------------------------------------------------- commandes */

test("commande limité + nuit : total = prix du forfait + plage, plage obligatoire et valide", async () => {
  const buyer = await seedUser();
  const revision = await catalogRevision(NIGHT);
  const missing = await call("POST", "/v1/orders", buyer.token, { planId: NIGHT, planRevision: revision });
  assert.equal(missing.status, 400, "plage manquante");

  const unknown = await call("POST", "/v1/orders", buyer.token, { planId: NIGHT, planRevision: revision, nightWindow: "18-22" });
  assert.equal(unknown.status, 400, "plage inconnue");

  const created = await call("POST", "/v1/orders", buyer.token, { planId: NIGHT, planRevision: revision, nightWindow: "20-24" });
  assert.equal(created.status, 201);
  assert.equal(created.body.price.amount, 1830, "1500 + 330 (plancher de la plage)");
  assert.equal(created.body.nightWindow, "20-24");

  const withAmount = await call("POST", "/v1/orders", buyer.token, {
    planId: NIGHT,
    planRevision: revision,
    nightWindow: "20-24",
    amount: 1,
  });
  assert.equal(withAmount.status, 400, "montant client toujours refusé");
});

test("commande limité : une plage est refusée ; la commande porte le quota figé", async () => {
  const buyer = await seedUser();
  const revision = await catalogRevision(LIMITED);
  const withWindow = await call("POST", "/v1/orders", buyer.token, {
    planId: LIMITED,
    planRevision: revision,
    nightWindow: "20-24",
  });
  assert.equal(withWindow.status, 400, "le forfait limité n'a pas de plage");

  const plain = await call("POST", "/v1/orders", buyer.token, { planId: LIMITED, planRevision: revision });
  assert.equal(plain.status, 201);
  assert.equal(plain.body.price.amount, 1000);
  assert.equal(plain.body.nightWindow, undefined);
  const row = await db.one<Record<string, any>>("SELECT quota_bytes, night_window FROM orders WHERE id = $1", [
    plain.body.orderId,
  ]);
  assert.equal(Number(row?.quota_bytes), QUOTA);
  assert.equal(row?.night_window, null);
});

test("activation : l'abonnement copie le quota et la plage de la commande", async () => {
  const buyer = await seedUser();
  const created = await createOrder(db, {
    userId: buyer.userId,
    planId: NIGHT,
    planRevision: await catalogRevision(NIGHT),
    nightWindow: "20-24",
  });
  setMockPaymentStatus(created.raw.providerRef, "paid");
  const result = await reconcilePayment(db, { orderId: created.raw.orderId });
  assert.equal(result.activated, true);

  const sub = await db.one<Record<string, any>>("SELECT quota_bytes, night_window FROM subscriptions WHERE order_id = $1", [
    created.raw.orderId,
  ]);
  assert.equal(Number(sub?.quota_bytes), QUOTA);
  assert.equal(sub?.night_window, "20-24");
});

/* --------------------------------------------------------- abonnement (vue) */

test("GET /v1/me/subscription : famille, quota, consommation node seule, état épuisé", async () => {
  const buyer = await seedUser();
  const created = await createOrder(db, {
    userId: buyer.userId,
    planId: LIMITED,
    planRevision: await catalogRevision(LIMITED),
  });
  setMockPaymentStatus(created.raw.providerRef, "paid");
  await reconcilePayment(db, { orderId: created.raw.orderId });

  const fresh = await call("GET", "/v1/me/subscription", buyer.token, undefined, proofHeaders(buyer.pem, "GET", "/v1/me/subscription"));
  assert.equal(fresh.status, 200);
  assert.equal(fresh.body.entitlement.family, "limited");
  assert.equal(fresh.body.entitlement.quotaBytes, QUOTA);
  assert.equal(fresh.body.entitlement.usedBytes, 0);
  assert.equal(fresh.body.entitlement.remainingBytes, QUOTA);
  assert.equal(fresh.body.entitlement.nightWindow, null);
  assert.equal(fresh.body.entitlement.state, "active");

  // Le même jour : `node` compte, `device` (déclaré par le client) ne compte pas.
  const sub = await db.one<Record<string, any>>(
    "SELECT (starts_at AT TIME ZONE 'UTC')::date::text AS day FROM subscriptions WHERE order_id = $1",
    [created.raw.orderId],
  );
  await db.query(
    `INSERT INTO usage_daily (device_id, day, source, bytes_up, bytes_down) VALUES
       ($1, $2::date, 'node', 6000000000, 5000000000),
       ($1, $2::date, 'device', 50000000000, 50000000000)`,
    [buyer.deviceId, sub?.day],
  );

  const exhausted = await call("GET", "/v1/me/subscription", buyer.token, undefined, proofHeaders(buyer.pem, "GET", "/v1/me/subscription"));
  assert.equal(exhausted.body.entitlement.usedBytes, 11_000_000_000);
  assert.equal(exhausted.body.entitlement.remainingBytes, 0);
  assert.equal(exhausted.body.entitlement.state, "exhausted");
});

test("GET /v1/me/subscription : sans abonnement, état expiré et aucun quota", async () => {
  const buyer = await seedUser();
  const none = await call("GET", "/v1/me/subscription", buyer.token, undefined, proofHeaders(buyer.pem, "GET", "/v1/me/subscription"));
  assert.equal(none.status, 200);
  assert.equal(none.body.subscription, null);
  assert.equal(none.body.entitlement.state, "expired");
  assert.equal(none.body.entitlement.family, null);
  assert.equal(none.body.entitlement.quotaBytes, null);
  assert.equal(none.body.entitlement.remainingBytes, null);
});
