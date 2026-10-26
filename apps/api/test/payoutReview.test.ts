/**
 * Versement après une réponse positive du fournisseur (R0).
 *
 * Bug corrigé : si l'écriture de `provider_ref` échouait après un virement
 * accepté, le versement repassait `approved` et pouvait être payé une seconde
 * fois. Il passe désormais en `needs_review`, la référence est dans la raison,
 * l'action est journalisée, et seul `/resolve` le clôt.
 *
 * Le fournisseur est remplacé le temps du test par une réponse dont la référence
 * est déjà prise par un autre versement : c'est la seule façon déterministe de
 * faire échouer l'écriture (`provider_ref` est UNIQUE).
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";

import { call, closeAll, db } from "./support.js";
import { issueAdminToken } from "../src/lib/auth.js";
import { payments } from "../src/lib/fapshi.js";

after(async () => {
  await closeAll();
});

const COM = "com_review";
const OWNER = "adm_review_owner";
const TAKEN_REF = "ref_deja_prise_review";

await db.query(
  `INSERT INTO communities (id, name, slug, commission_bps, payout_phone, payout_name)
   VALUES ($1, $2, $3, $4, $5, $6)`,
  [COM, "Communauté revue", "communaute-revue", 2000, "+237 670 11 22 33", "Bénéficiaire revue"],
);
await db.query(
  `INSERT INTO admin_users (id, email, password_hash, name, role, platform_role, active)
   VALUES ($1, $2, 'scrypt$16384$8$1$x$y', $3, 'platform', 'owner', true)`,
  [OWNER, "review-owner@example.com", "Compte revue"],
);
// Un versement déjà payé, qui détient la référence que le fournisseur renverra.
await db.query(
  `INSERT INTO payouts (id, community_id, amount_xaf, status, created_by, provider_ref)
   VALUES ('pay_review_taken', $1, 1000, 'paid', $2, $3)`,
  [COM, OWNER, TAKEN_REF],
);

const { token } = await issueAdminToken({ adminId: OWNER, role: "platform", communityId: null });

async function adminCall(method: string, url: string, payload?: unknown) {
  const res = await call(method, `/v1/admin${url}`, {
    ...(payload === undefined ? {} : { payload }),
    headers: { authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: res.body as Record<string, any>, text: res.text };
}

async function row(id: string): Promise<Record<string, any>> {
  const found = await db.one<Record<string, any>>("SELECT * FROM payouts WHERE id = $1", [id]);
  assert.ok(found, `versement ${id} introuvable`);
  return found as Record<string, any>;
}

test("référence refusée après virement accepté : needs_review, jamais approved", async () => {
  const id = "pay_review_target";
  await db.query(
    `INSERT INTO payouts (id, community_id, amount_xaf, status, created_by)
     VALUES ($1, $2, 5000, 'approved', $3)`,
    [id, COM, OWNER],
  );

  const original = payments.payout;
  payments.payout = async () => ({ providerRef: TAKEN_REF });
  let failed;
  try {
    failed = await adminCall("POST", `/payouts/${id}/pay`);
  } finally {
    payments.payout = original;
  }

  assert.equal(failed.status, 502, failed.text);
  assert.equal(failed.body.error.code, "PAYMENT_PROVIDER_ERROR");

  const stored = await row(id);
  assert.equal(stored.status, "needs_review", "le versement part en revue, pas en approved");
  assert.equal(stored.provider_ref, null, "la référence prise n'est pas réécrite");
  assert.match(String(stored.failed_reason), /ref_deja_prise_review/, "la raison porte la référence à vérifier");
  assert.equal(Number(stored.attempts), 1);

  const audits = await db.query<{ after_json: string }>(
    `SELECT after_state::text AS after_json FROM audit_log WHERE action = 'payout.review' AND target_id = $1`,
    [id],
  );
  assert.equal(audits.length, 1, "la mise en revue est journalisée une fois");
  assert.match(String(audits[0]?.after_json), /provider_ref_not_recorded/);

  // Rejouer ne repaie pas : le versement n'est pas réclamable depuis needs_review.
  const replay = await adminCall("POST", `/payouts/${id}/pay`);
  assert.equal(replay.status, 409, replay.text);
  assert.equal((await row(id)).status, "needs_review", "le rejeu ne le remet pas en approved");

  // Seule une clôture humaine avec une référence lue chez Fapshi le sort de là.
  const closed = await adminCall("POST", `/payouts/${id}/resolve`, {
    outcome: "paid",
    providerRef: "ref_lue_chez_fapshi_review",
  });
  assert.equal(closed.status, 200, closed.text);
  assert.equal(closed.body.status, "paid");
  assert.equal((await row(id)).provider_ref, "ref_lue_chez_fapshi_review");
});
