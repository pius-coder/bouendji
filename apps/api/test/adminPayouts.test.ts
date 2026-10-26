/**
 * Retraits : la machine à états de l'argent (D57, D58, D65) et les routes
 * d'administration qui la font avancer.
 *
 * Rien n'est simulé côté API : vrai `buildApp` (via `test/support.ts`), vraie
 * base PGlite, vrais jetons signés par `issueAdminToken`, rôles relus en base.
 * Le seul point injecté est le fournisseur de versement (`lib/fapshi.ts`) —
 * remplacé le temps d'un test par un échec, exactement ce que fait Fapshi quand
 * il répond 5xx. Aucun autre fichier de production n'est modifié.
 *
 * Ce que ces tests pincent, dans l'ordre des décisions :
 * - D57 : `owner`, `finance` (de la communauté **ou** d'ailleurs) et
 *   `community_admin` de la communauté approuvent — jamais leur propre demande ;
 * - D65 : la réclamation (`processing`) précède l'appel réseau, un échec remet
 *   `approved` + `failed_reason`, `attempts` plafonne à 3 ;
 * - D58 : un accusé de réception n'est pas un versement (`confirm` exige
 *   `provider_ref`, `resolve` clôt une ambiguïté avec une référence lue chez le
 *   fournisseur).
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";

import { call, closeAll, db } from "./support.js";
import { openAdminSession } from "../src/lib/auth.js";
import { payments } from "../src/lib/fapshi.js";

after(async () => {
  await closeAll();
});

/* ------------------------------------------------------------------ graine */

const COM = "com_money";
const OTHER = "com_other";
/** 041 : une communauté ne porte qu'une app ; la marque manifeste a la sienne. */
const MANIFEST = "com_manifest";

const OWNER = "adm_money_owner";
const FINANCE = "adm_money_finance";
const FINANCE_OTHER = "adm_money_finance_other";
const ADMIN = "adm_money_admin";
const SUPPORT = "adm_money_support";
const ADMIN_OTHER = "adm_money_admin_other";

await db.query(
  `INSERT INTO communities (id, name, slug, commission_bps, payout_phone, payout_name)
   VALUES ($1, $2, $3, $4, $5, $6)`,
  [COM, "Communauté argent", "communaute-argent", 2000, "+237 670 00 00 00", "Bénéficiaire de test"],
);
await db.query(`INSERT INTO communities (id, name, slug, commission_bps) VALUES ($1, $2, $3, $4)`, [
  OTHER,
  "Communauté voisine",
  "communaute-voisine",
  1500,
]);
await db.query(`INSERT INTO communities (id, name, slug, commission_bps) VALUES ($1, $2, $3, $4)`, [
  MANIFEST,
  "Communauté manifeste",
  "communaute-manifeste",
  2000,
]);

for (const [id, email, platformRole] of [
  [OWNER, "money-owner@example.com", "owner"],
  [FINANCE, "money-finance@example.com", "none"],
  [FINANCE_OTHER, "money-finance-other@example.com", "none"],
  [ADMIN, "money-admin@example.com", "none"],
  [SUPPORT, "money-support@example.com", "none"],
  [ADMIN_OTHER, "money-admin-other@example.com", "none"],
] as const) {
  await db.query(
    `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active, must_change_password)
     VALUES ($1, $2, 'scrypt$16384$8$1$x$y', $3, $4, $5, true, false)`,
    [id, email, id.replace("adm_money_", "Compte "), platformRole === "owner" ? "platform" : "partner", platformRole],
  );
}

for (const [membershipId, adminId, communityId, role] of [
  ["mem_money_finance", FINANCE, COM, "finance"],
  ["mem_money_finance_other", FINANCE_OTHER, OTHER, "finance"],
  ["mem_money_admin", ADMIN, COM, "community_admin"],
  ["mem_money_support", SUPPORT, COM, "support"],
  ["mem_money_admin_other", ADMIN_OTHER, OTHER, "community_admin"],
] as const) {
  await db.query(
    `INSERT INTO community_memberships (id, admin_user_id, community_id, role, status)
     VALUES ($1, $2, $3, $4, 'active')`,
    [membershipId, adminId, communityId, role],
  );
}

// Une marque complète (constructible) et une incomplète : sans `supportUrl`,
// `tools/inject-brand.mjs` sort en 78 et aucun APK n'existe.
await db.query(
  `INSERT INTO apps (id, community_id, slug, name, package_name, theme, support_url)
   VALUES ('app_money', $1, 'app-money', 'Marque Argent', 'cm.argent.vpn', 'halo', 'https://argent.example.com/support')`,
  [COM],
);
await db.query(
  `INSERT INTO apps (id, community_id, slug, name, package_name, theme)
   VALUES ('app_bare', $1, 'app-bare', 'Marque Incomplète', 'cm.incomplete.vpn', 'halo')`,
  [OTHER],
);
// Le `supportUrl` peut venir du manifeste (`apps.brand`, §3.5) et non de la
// colonne héritée : la complétude se lit sur les deux.
await db.query(
  `INSERT INTO apps (id, community_id, slug, name, package_name, theme, brand)
   VALUES ('app_brand', $1, 'app-brand', 'Marque Manifeste', 'cm.manifeste.vpn', 'mono', $2::jsonb)`,
  [
    MANIFEST,
    JSON.stringify({
      supportUrl: "https://manifeste.example.com/aide",
      versionName: "1.2.0",
      versionCode: 3,
      defaultLocale: "fr",
    }),
  ],
);

await db.query(
  `INSERT INTO endpoints (id, deployment_key, label, host, port, credential, region, capacity,
                          status, health, expires_at)
   VALUES ('ep_money', 'deploy-money-1', 'Nœud argent', 'node-money.example.net', 443,
           'sealed-credential', 'eu', 80, 'active', 'unknown', now() + interval '1 hour')`,
);

/* ------------------------------------------------------------------ jetons */

const tokens: Record<string, string> = {};
for (const [id, legacyRole] of [
  [OWNER, "platform"],
  [FINANCE, "partner"],
  [FINANCE_OTHER, "partner"],
  [ADMIN, "partner"],
  [SUPPORT, "partner"],
  [ADMIN_OTHER, "partner"],
] as const) {
  const { token } = await openAdminSession(db, { adminId: id });
  tokens[id] = token;
}

async function adminCall(method: string, url: string, as: string | null, payload?: unknown) {
  const res = await call(method, `/v1/admin${url}`, {
    ...(payload === undefined ? {} : { payload }),
    ...(as ? { headers: { authorization: `Bearer ${tokens[as]}` } } : {}),
  });
  return { status: res.status, body: res.body as Record<string, any>, text: res.text };
}

/* --------------------------------------------------------------- versements */

let payoutSeq = 0;

async function seedPayout(
  options: {
    status?: string;
    createdBy?: string | null;
    amountXaf?: number;
    providerRef?: string | null;
    communityId?: string;
  } = {},
): Promise<string> {
  payoutSeq += 1;
  const id = `pay_test_${payoutSeq}`;
  await db.query(
    `INSERT INTO payouts (id, community_id, amount_xaf, status, created_by, provider_ref)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      options.communityId ?? COM,
      options.amountXaf ?? 5_000,
      options.status ?? "pending",
      options.createdBy ?? OWNER,
      options.providerRef ?? null,
    ],
  );
  return id;
}

async function payoutRow(id: string): Promise<Record<string, any>> {
  const row = await db.one<Record<string, any>>("SELECT * FROM payouts WHERE id = $1", [id]);
  assert.ok(row, `versement ${id} introuvable`);
  return row as Record<string, any>;
}

/* ------------------------------------------------------------------- tests */

test("approbation : finance de la communauté et finance d'ailleurs (D57)", async () => {
  const local = await seedPayout({ createdBy: OWNER });
  const approved = await adminCall("POST", `/payouts/${local}/approve`, FINANCE, {});
  assert.equal(approved.status, 200, approved.text);
  assert.equal(approved.body.status, "approved");
  assert.equal(approved.body.approvedBy, FINANCE);
  assert.ok(approved.body.approvedAt, "l'approbation est horodatée");

  const stored = await payoutRow(local);
  assert.equal(stored.status, "approved");
  assert.equal(stored.approved_by, FINANCE);
  assert.ok(stored.approved_at);

  const audit = await db.query<{ actor_id: string; actor_role: string; community_id: string }>(
    `SELECT actor_id, actor_role, community_id FROM audit_log
      WHERE action = 'payout.approve' AND target_id = $1`,
    [local],
  );
  assert.equal(audit.length, 1, "une approbation, une ligne d'audit");
  assert.equal(audit[0]?.actor_id, FINANCE);
  assert.equal(audit[0]?.actor_role, "finance");
  assert.equal(audit[0]?.community_id, COM);

  // `anyRole(["finance"])` : elle encaisse pour la plateforme, sa communauté
  // d'appartenance ne la limite pas.
  const abroad = await seedPayout({ createdBy: OWNER });
  const crossApproved = await adminCall("POST", `/payouts/${abroad}/approve`, FINANCE_OTHER, {});
  assert.equal(crossApproved.status, 200, crossApproved.text);
  assert.equal((await payoutRow(abroad)).status, "approved");
});

test("auto-approbation : 409, jamais 403 — et rien ne bouge", async () => {
  const mine = await seedPayout({ createdBy: FINANCE });
  const self = await adminCall("POST", `/payouts/${mine}/approve`, FINANCE, {});
  assert.equal(self.status, 409, self.text);
  assert.equal(self.body.error.code, "CONFLICT");
  assert.match(String(self.body.error.message), /propre demande/);

  const untouched = await payoutRow(mine);
  assert.equal(untouched.status, "pending", "la demande reste en attente");
  assert.equal(untouched.approved_by, null);
  assert.equal(untouched.approved_at, null);

  // Le propriétaire n'est pas au-dessus de la règle (D57).
  const ownersOwn = await seedPayout({ createdBy: OWNER });
  const ownerSelf = await adminCall("POST", `/payouts/${ownersOwn}/approve`, OWNER, {});
  assert.equal(ownerSelf.status, 409, ownerSelf.text);
  assert.equal((await payoutRow(ownersOwn)).status, "pending");
});

test("double approbation : la seconde est un 409, une seule ligne d'audit", async () => {
  const id = await seedPayout({ createdBy: OWNER });

  const support = await adminCall("POST", `/payouts/${id}/approve`, SUPPORT, {});
  assert.equal(support.status, 403, "support ne touche pas à l'argent");

  const first = await adminCall("POST", `/payouts/${id}/approve`, ADMIN, {});
  assert.equal(first.status, 200, "un community_admin approuve sa communauté");
  assert.equal(first.body.status, "approved");

  const second = await adminCall("POST", `/payouts/${id}/approve`, FINANCE, {});
  assert.equal(second.status, 409, second.text);

  const audits = await db.scalar<number>(
    `SELECT count(*)::int FROM audit_log WHERE action = 'payout.approve' AND target_id = $1`,
    [id],
  );
  assert.equal(Number(audits), 1, "une seule approbation a eu lieu");

  const foreign = await adminCall("POST", `/payouts/${id}/approve`, ADMIN_OTHER, {});
  assert.equal(foreign.status, 403, "une autre communauté obtient 403, jamais 404");
});

test("pay : réclamation avant l'appel, attempts + 1, provider_ref écrit (mock)", async () => {
  const id = await seedPayout({ status: "approved", createdBy: OWNER });

  const forbidden = await adminCall("POST", `/payouts/${id}/pay`, ADMIN, {});
  assert.equal(forbidden.status, 403, "un community_admin n'exécute pas un virement");
  assert.equal((await payoutRow(id)).status, "approved");

  const paid = await adminCall("POST", `/payouts/${id}/pay`, FINANCE, {});
  assert.equal(paid.status, 200, paid.text);
  assert.equal(paid.body.status, "processing", "un accusé de réception n'est pas un versement");
  assert.equal(paid.body.attempts, 1);
  const providerRef = String(paid.body.providerRef);
  assert.match(providerRef, /^mockpayout_/, "le fournisseur mock est celui du mode test");
  assert.ok(providerRef.includes(id), "externalId = l'identifiant du versement (idempotence fournisseur)");

  const stored = await payoutRow(id);
  assert.equal(stored.status, "processing");
  assert.equal(Number(stored.attempts), 1);
  assert.ok(stored.claimed_at, "la réclamation est écrite avant l'appel réseau");
  assert.equal(stored.provider_ref, providerRef);
  assert.equal(stored.failed_reason, null);

  const again = await adminCall("POST", `/payouts/${id}/pay`, FINANCE, {});
  assert.equal(again.status, 409, "un versement en cours ne se réclame pas deux fois");
  assert.equal(Number((await payoutRow(id)).attempts), 1, "une réclamation refusée n'incrémente rien");

  const pending = await seedPayout({ status: "pending" });
  const tooEarly = await adminCall("POST", `/payouts/${pending}/pay`, FINANCE, {});
  assert.equal(tooEarly.status, 409, "on ne paie pas ce qui n'est pas approuvé");
  assert.equal(Number((await payoutRow(pending)).attempts), 0, "aucune tentative consommée");
});

test("échec fournisseur : 502, retour à approved avec failed_reason, puis rejouable", async () => {
  const id = await seedPayout({ status: "approved", createdBy: OWNER });

  const original = payments.payout;
  payments.payout = async () => {
    throw new Error("fapshi 503 indisponible");
  };
  try {
    const failed = await adminCall("POST", `/payouts/${id}/pay`, FINANCE, {});
    assert.equal(failed.status, 502, failed.text);
    assert.equal(failed.body.error.code, "PAYMENT_PROVIDER_ERROR");

    const stored = await payoutRow(id);
    assert.equal(stored.status, "approved", "le versement reste approuvé, jamais coincé en processing");
    assert.equal(stored.claimed_at, null, "la réclamation est rendue");
    assert.equal(stored.provider_ref, null);
    assert.equal(Number(stored.attempts), 1, "la tentative est comptée");
    assert.match(String(stored.failed_reason), /fapshi 503/);
  } finally {
    payments.payout = original;
  }

  const retried = await adminCall("POST", `/payouts/${id}/pay`, FINANCE, {});
  assert.equal(retried.status, 200, retried.text);
  const after = await payoutRow(id);
  assert.equal(Number(after.attempts), 2, "la reprise est une seconde tentative");
  assert.equal(after.status, "processing");
  assert.equal(after.failed_reason, null, "la raison d'échec est effacée par la reprise");
  assert.ok(after.provider_ref);
});

test("trois échecs : le versement part en vérification, /resolve le clôt", async () => {
  const id = await seedPayout({ status: "approved", createdBy: OWNER });

  const original = payments.payout;
  payments.payout = async () => {
    throw new Error("fapshi timeout");
  };
  try {
    for (const attempt of [1, 2, 3]) {
      const failed = await adminCall("POST", `/payouts/${id}/pay`, FINANCE, {});
      assert.equal(failed.status, 502, `tentative ${attempt} : ${failed.text}`);
      assert.equal(Number((await payoutRow(id)).attempts), attempt);
    }
  } finally {
    payments.payout = original;
  }

  // Trois tentatives ne bloquent pas l'argent : elles forcent un humain (D65).
  const exhausted = await adminCall("POST", `/payouts/${id}/pay`, FINANCE, {});
  assert.equal(exhausted.status, 409, exhausted.text);
  assert.match(String(exhausted.body.error.message), /vérifier|Vérifiez/);
  const inReview = await payoutRow(id);
  assert.equal(inReview.status, "needs_review", "l'ambiguïté sort du paiement automatique");
  assert.equal(Number(inReview.attempts), 3, "aucune quatrième tentative n'est consommée");

  const closed = await adminCall("POST", `/payouts/${id}/resolve`, FINANCE, {
    outcome: "failed",
    reason: "Fapshi : aucun versement pour cet externalId",
  });
  assert.equal(closed.status, 200, closed.text);
  assert.equal(closed.body.status, "failed", "un humain a tranché, sans UPDATE SQL manuel");
});

test("confirm : processing -> paid, et seulement avec une référence fournisseur", async () => {
  const withRef = await seedPayout({ status: "processing", createdBy: OWNER, providerRef: "ref_versement_1" });

  const denied = await adminCall("POST", `/payouts/${withRef}/confirm`, ADMIN, {});
  assert.equal(denied.status, 403, "confirmer un versement est un acte de caisse");

  const confirmed = await adminCall("POST", `/payouts/${withRef}/confirm`, FINANCE, {});
  assert.equal(confirmed.status, 200, confirmed.text);
  assert.equal(confirmed.body.status, "paid");
  assert.ok(confirmed.body.confirmedAt);
  assert.equal(confirmed.body.resolvedBy, FINANCE);

  const stored = await payoutRow(withRef);
  assert.equal(stored.status, "paid");
  assert.ok(stored.paid_at, "la date de versement est écrite");

  const twice = await adminCall("POST", `/payouts/${withRef}/confirm`, FINANCE, {});
  assert.equal(twice.status, 409, "on ne confirme pas deux fois");

  const noRef = await seedPayout({ status: "processing", createdBy: OWNER });
  const refused = await adminCall("POST", `/payouts/${noRef}/confirm`, FINANCE, {});
  assert.equal(refused.status, 409, "sans référence, on ne sait pas si l'argent est parti");
  assert.equal((await payoutRow(noRef)).status, "processing");
});

test("resolve : clôt une ambiguïté depuis processing (et depuis needs_review)", async () => {
  const ambiguous = await seedPayout({ status: "processing", createdBy: OWNER });
  const resolvedPaid = await adminCall("POST", `/payouts/${ambiguous}/resolve`, FINANCE, {
    outcome: "paid",
    providerRef: "ref_lue_chez_fapshi",
  });
  assert.equal(resolvedPaid.status, 200, resolvedPaid.text);
  assert.equal(resolvedPaid.body.status, "paid");
  assert.equal(resolvedPaid.body.providerRef, "ref_lue_chez_fapshi");
  assert.equal(resolvedPaid.body.resolvedBy, FINANCE);
  assert.ok(resolvedPaid.body.confirmedAt);

  const storedPaid = await payoutRow(ambiguous);
  assert.equal(storedPaid.status, "paid");
  assert.equal(storedPaid.resolved_by, FINANCE);
  assert.equal(storedPaid.provider_ref, "ref_lue_chez_fapshi");

  const lost = await seedPayout({ status: "processing", createdBy: OWNER });
  const resolvedFailed = await adminCall("POST", `/payouts/${lost}/resolve`, OWNER, {
    outcome: "failed",
    reason: "Fapshi : virement rejeté",
  });
  assert.equal(resolvedFailed.status, 200, resolvedFailed.text);
  assert.equal(resolvedFailed.body.status, "failed");
  assert.match(String(resolvedFailed.body.failedReason), /rejeté/);

  const review = await seedPayout({ status: "needs_review", createdBy: OWNER, providerRef: null });
  const fromReview = await adminCall("POST", `/payouts/${review}/resolve`, FINANCE, {
    outcome: "failed",
    reason: "jamais parti",
  });
  assert.equal(fromReview.status, 200, fromReview.text);
  assert.equal(fromReview.body.status, "failed");

  const pending = await seedPayout({ status: "pending" });
  const tooEarly = await adminCall("POST", `/payouts/${pending}/resolve`, FINANCE, { outcome: "paid" });
  assert.equal(tooEarly.status, 409, "on ne clôt pas ce qui n'a jamais été envoyé");

  // Une référence est la preuve : sans elle, « paid » est refusé (D58).
  const withoutProof = await seedPayout({ status: "processing", createdBy: OWNER });
  const noProof = await adminCall("POST", `/payouts/${withoutProof}/resolve`, FINANCE, { outcome: "paid" });
  assert.equal(noProof.status, 400, noProof.text);
  assert.ok(noProof.body.error.details?.providerRef, "le champ manquant est nommé");
  assert.equal((await payoutRow(withoutProof)).status, "processing", "rien n'a bougé");

  const forbidden = await adminCall("POST", `/payouts/${review}/resolve`, ADMIN, { outcome: "failed" });
  assert.equal(forbidden.status, 403, "un community_admin ne clôt pas un versement");

  const invalid = await adminCall("POST", `/payouts/${ambiguous}/resolve`, FINANCE, { outcome: "peut-être" });
  assert.equal(invalid.status, 400, "l'issue est un contrat fermé");
});

test("file des versements : needs_review en tête, filtres communauté et statut", async () => {
  const review = await seedPayout({ status: "needs_review" });
  const pending = await seedPayout({ status: "pending" });
  const elsewhere = await seedPayout({ status: "pending", communityId: OTHER });

  const queue = await adminCall("GET", `/payouts?communityId=${COM}&limit=200`, FINANCE);
  assert.equal(queue.status, 200, queue.text);
  const items = queue.body.items as Array<Record<string, any>>;
  assert.ok(items.length >= 2);
  assert.equal(items[0]?.status, "needs_review", "l'ambiguïté passe avant tout le reste");
  assert.ok(items.every((item) => item.communityId === COM), "le filtre de communauté est respecté");
  assert.ok(items.some((item) => item.id === review));
  assert.ok(items.some((item) => item.id === pending));
  assert.ok(!items.some((item) => item.id === elsewhere), "jamais la file d'une autre communauté");
  assert.ok(items.every((item) => typeof item.attempts === "number"));

  const paidOnly = await adminCall("GET", "/payouts?status=paid&limit=200", FINANCE);
  assert.equal(paidOnly.status, 200);
  const paidItems = paidOnly.body.items as Array<Record<string, any>>;
  assert.ok(paidItems.length >= 1);
  assert.ok(paidItems.every((item) => item.status === "paid"));

  const support = await adminCall("GET", "/payouts", SUPPORT);
  assert.equal(support.status, 403, "support ne voit pas l'argent");

  const foreign = await adminCall("GET", `/payouts?communityId=${OTHER}`, ADMIN);
  assert.equal(foreign.status, 403, "une communauté hors périmètre est un 403, jamais un 404");

  const nonsense = await adminCall("GET", "/payouts?status=inventé", FINANCE);
  assert.equal(nonsense.status, 400);
});

test("marques et annuaire : la console ne devine plus d'identifiants", async () => {
  const apps = await adminCall("GET", "/apps", OWNER);
  assert.equal(apps.status, 200, apps.text);
  const items = apps.body.items as Array<Record<string, any>>;
  const ready = items.find((item) => item.id === "app_money");
  const bare = items.find((item) => item.id === "app_bare");
  const manifest = items.find((item) => item.id === "app_brand");
  assert.ok(ready, "la marque complète est listée");
  assert.equal(ready?.communityId, COM);
  assert.equal(ready?.name, "Marque Argent");
  assert.equal(ready?.packageName, "cm.argent.vpn");
  assert.equal(ready?.theme, "halo");
  assert.equal(ready?.brandReady, true, "une marque complète est constructible");
  assert.equal(manifest?.brandReady, true, "le supportUrl du manifeste suffit (§3.5)");
  assert.equal(bare?.brandReady, false, "sans supportUrl, inject-brand.mjs refuse de construire");
  assert.deepEqual(bare?.brandMissing, ["supportUrl"], "le champ manquant est nommé");

  const scoped = await adminCall("GET", "/apps", ADMIN);
  assert.equal(scoped.status, 200, scoped.text);
  assert.ok(
    (scoped.body.items as Array<Record<string, any>>).every((item) => item.communityId === COM),
    "jamais la marque d'une autre communauté",
  );

  const directory = await adminCall("GET", "/admins", OWNER);
  assert.equal(directory.status, 200, directory.text);
  const admins = directory.body.items as Array<Record<string, any>>;
  const finance = admins.find((item) => item.id === FINANCE);
  assert.equal(finance?.platformRole, "none");
  assert.equal(finance?.active, true);
  assert.ok(!("password_hash" in (finance ?? {})), "aucun secret dans l'annuaire");
  assert.ok(!directory.text.includes("scrypt"), "aucune empreinte de mot de passe ne sort");
  assert.ok(!directory.text.includes("password"), "aucun champ de mot de passe");

  const denied = await adminCall("GET", "/admins", ADMIN);
  assert.equal(denied.status, 403, "l'annuaire est réservé au propriétaire");
});

test("santé d'un nœud : transition conditionnelle, révision bumpée, audit unique", async () => {
  const revisionBefore = Number(await db.scalar<number>("SELECT revision FROM pool_state WHERE id = 'pool'"));

  const forbidden = await adminCall("POST", "/endpoints/ep_money/health", ADMIN, { state: "down" });
  assert.equal(forbidden.status, 403, "forcer un nœud down est un acte de propriétaire");

  const down = await adminCall("POST", "/endpoints/ep_money/health", OWNER, {
    state: "down",
    reason: "manual: tunnel muet",
  });
  assert.equal(down.status, 200, down.text);
  assert.equal(down.body.health, "down");
  assert.equal(down.body.changed, true);
  assert.ok(down.body.downSince, "l'horodatage de la panne est posé");
  assert.equal(down.body.downReason, "manual: tunnel muet");
  assert.equal(Number(down.body.poolRevision), revisionBefore + 1, "une transition bumpe la révision (D48)");

  const again = await adminCall("POST", "/endpoints/ep_money/health", OWNER, { state: "down" });
  assert.equal(again.status, 200);
  assert.equal(again.body.changed, false, "aucune transition, aucune écriture");
  assert.equal(Number(again.body.poolRevision), revisionBefore + 1, "pas de bump sans transition");

  const pool = await adminCall("GET", "/pool", OWNER);
  assert.equal(pool.status, 200);
  const node = (pool.body.endpoints as Array<Record<string, any>>).find((item) => item.endpointId === "ep_money");
  assert.equal(node?.health, "down");
  assert.equal(node?.downReason, "manual: tunnel muet");
  assert.equal(typeof node?.tier, "string", "le tier fait partie de l'état affiché");

  const healthy = await adminCall("POST", "/endpoints/ep_money/health", OWNER, { state: "healthy" });
  assert.equal(healthy.status, 200, healthy.text);
  assert.equal(healthy.body.health, "healthy");
  assert.equal(healthy.body.downSince, null, "un nœud sain n'a plus d'horodatage de panne");

  const audits = await db.scalar<number>(
    `SELECT count(*)::int FROM audit_log WHERE action = 'endpoint.health' AND target_id = 'ep_money'`,
  );
  assert.equal(Number(audits), 2, "deux transitions, deux lignes — pas une par requête");

  const missing = await adminCall("POST", "/endpoints/ep_absent/health", OWNER, { state: "down" });
  assert.equal(missing.status, 404);

  const invalid = await adminCall("POST", "/endpoints/ep_money/health", OWNER, { state: "peut-être" });
  assert.equal(invalid.status, 400, "l'état est un contrat fermé");
});
