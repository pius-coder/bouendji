/**
 * Routes de paiement : webhook fournisseur et page simulée.
 *
 * Le webhook est une **notification**, pas une preuve. Il fournit au plus une
 * référence de transaction ; l'état est relu chez le fournisseur par
 * `handleWebhookEvent` -> `reconcilePayment`. Le corps ne peut donc pas
 * fabriquer un paiement : au pire il désigne une transaction inconnue, ce qui
 * renvoie 404 et laisse le fournisseur réessayer.
 *
 * Le montant du corps, quand il existe, ne sert qu'à **rejeter** : différent du
 * montant de la commande -> 409, aucune transition.
 */
import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { env } from "../config.js";
import type { Database } from "../db.js";
import { ApiFailure, fail } from "../lib/errors.js";
import { handleWebhookEvent, hasCheckout, payloadHash, reconcilePayment, loadOrder, loadOrderByProviderRef } from "../services/payments.js";
import { currentNoticeMode, noticeContent } from "../services/paymentOperators.js";
import { getMockPaymentStatus, setMockPaymentStatus, type MockPaymentStatus } from "../services/mockPayments.js";
import { findSettlementForWebhook, reconcileSettlement } from "../services/manualGrants.js";

/* ------------------------------------------------------------------ utils */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) {
    timingSafeEqual(right, right);
    return false;
  }
  return timingSafeEqual(left, right);
}

/** `mock_<uuid>` : le préfixe est la seule forme que ce fournisseur émet. */
const MOCK_REF = /^mock_[A-Za-z0-9_-]{1,120}$/;

function html(body: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Paiement simulé</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; padding: 2rem 1.25rem; line-height: 1.5; }
  main { max-width: 26rem; margin: 0 auto; }
  h1 { font-size: 1.25rem; margin: 0 0 .25rem; }
  p { margin: .5rem 0; }
  code { font-size: .85em; word-break: break-all; }
  form { display: inline-block; margin: .75rem .5rem 0 0; }
  button { font: inherit; padding: .6rem 1rem; border-radius: .5rem; border: 1px solid currentColor; background: transparent; cursor: pointer; }
  button[value="paid"] { background: #0a7c42; border-color: #0a7c42; color: #fff; }
  .muted { opacity: .7; font-size: .875rem; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

/**
 * Page d'avis avant paiement (106). Tout le texte est échappé ; sans `target`,
 * aucun bouton vers le fournisseur n'est rendu.
 */
function noticePage({ title, message, target }: { title: string; message: string; target: string | null }): string {
  const button = target
    ? `<a class="btn" href="${escapeHtml(target)}" rel="noopener noreferrer">Continuer vers le paiement</a>`
    : `<p class="muted">Vous pouvez fermer cette page et revenir à l'application.</p>`;
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f5f7fb;color:#0b1220}
main{max-width:420px;padding:24px;margin:16px;background:#fff;border-radius:16px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
h1{font-size:20px;margin:0 0 12px}p{line-height:1.5;margin:0 0 20px}.muted{opacity:.7;font-size:14px;margin:0}
a.btn{display:block;text-align:center;padding:14px;border-radius:12px;background:#0a5cf0;color:#fff;text-decoration:none;font-weight:600}
@media (prefers-color-scheme:dark){body{background:#0b1220;color:#f5f7fb}main{background:#111827}}</style>
</head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>
${button}</main></body></html>`;
}

interface ReturnPageProps {
  orderId: string;
  status: "success" | "pending" | "failed";
  amountXaf: number;
  transId?: string;
}

function renderReturnPage({ orderId, status, amountXaf, transId }: ReturnPageProps): string {
  const safeOrderId = escapeHtml(orderId);
  const safeTransId = transId ? escapeHtml(transId) : "";
  const shortId = safeOrderId.slice(0, 8);
  const deepLink = `cm.bouendji.vpn://pay/return?orderId=${encodeURIComponent(orderId)}&status=${status}`;
  const intentUrl = `intent://pay/return?orderId=${encodeURIComponent(orderId)}&status=${status}#Intent;scheme=cm.bouendji.vpn;package=cm.bouendji.nevpn;end`;

  const isSuccess = status === "success";
  const isPending = status === "pending";

  const iconSvg = isSuccess
    ? `<div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem;">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </div>`
    : isPending
    ? `<div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(245, 158, 11, 0.15); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem;">
        <div style="width: 28px; height: 28px; border: 3px solid rgba(245, 158, 11, 0.3); border-top-color: #F59E0B; border-radius: 50%; animation: spin 1s linear infinite;"></div>
      </div>`
    : `<div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(239, 68, 68, 0.15); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem;">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </div>`;

  const title = isSuccess
    ? "Paiement réussi !"
    : isPending
    ? "Vérification en cours..."
    : "Paiement non complété";

  const subtitle = isSuccess
    ? "Votre forfait est immédiatement activé. Vous pouvez reprendre votre navigation sécurisée."
    : isPending
    ? "Nous attendons la confirmation de l'opérateur mobile money."
    : "La transaction a été annulée ou n'a pas pu aboutir.";

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${isPending ? '<meta http-equiv="refresh" content="3">' : ""}
<title>${title} — Bouendji VPN</title>
<style>
  @keyframes spin { to { transform: rotate(360deg); } }
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    margin: 0;
    padding: 2rem 1.25rem;
    background: #090D16;
    color: #F8FAFC;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .card {
    background: #111827;
    border: 1px solid #1F2937;
    border-radius: 1.25rem;
    padding: 2rem 1.75rem;
    max-width: 24rem;
    width: 100%;
    text-align: center;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
  }
  h1 { font-size: 1.5rem; margin: 0 0 0.5rem; font-weight: 700; }
  p { margin: 0 0 1.25rem; color: #9CA3AF; font-size: 0.925rem; line-height: 1.5; }
  .details {
    background: #1A2234;
    border: 1px solid #243048;
    border-radius: 0.75rem;
    padding: 1rem;
    margin: 1.25rem 0;
    text-align: left;
    font-size: 0.875rem;
  }
  .row { display: flex; justify-content: space-between; margin-bottom: 0.5rem; }
  .row:last-child { margin-bottom: 0; }
  .row span:first-child { color: #9CA3AF; }
  .row span:last-child { color: #F3F4F6; font-weight: 600; }
  .btn {
    display: block;
    width: 100%;
    padding: 0.875rem 1rem;
    background: #10B981;
    color: #022C22;
    text-decoration: none;
    font-weight: 700;
    font-size: 1rem;
    border-radius: 0.75rem;
    border: none;
    cursor: pointer;
    margin-top: 1.25rem;
    text-align: center;
    transition: background 0.15s ease;
  }
  .btn:hover { background: #059669; color: #FFFFFF; }
  .btn-alt {
    background: transparent;
    border: 1px solid #374151;
    color: #D1D5DB;
    margin-top: 0.75rem;
    font-weight: 600;
  }
  .btn-alt:hover { background: #1F2937; color: #FFFFFF; }
</style>
${isSuccess ? `<script>
  // Essai de redirection automatique vers l'application
  setTimeout(function() {
    window.location.href = "${intentUrl}";
  }, 1000);
</script>` : ""}
</head>
<body>
  <div class="card">
    ${iconSvg}
    <h1>${title}</h1>
    <p>${subtitle}</p>

    <div class="details">
      <div class="row">
        <span>Montant</span>
        <span style="color: #34D399; font-size: 1.05rem;">${amountXaf} FCFA</span>
      </div>
      <div class="row">
        <span>Commande</span>
        <code>#${shortId}</code>
      </div>
      ${safeTransId ? `<div class="row"><span>Transaction</span><code>${safeTransId}</code></div>` : ""}
      <div class="row">
        <span>Statut</span>
        <span style="color: ${isSuccess ? '#34D399' : isPending ? '#FBBF24' : '#F87171'}; font-weight: 700;">
          ${isSuccess ? "Confirmé" : isPending ? "En attente" : "Échoué"}
        </span>
      </div>
    </div>

    <a href="${intentUrl}" class="btn">Ouvrir l'application</a>
    <a href="${deepLink}" class="btn btn-alt">Lien direct application</a>
  </div>
</body>
</html>`;
}

function mockPage(providerRef: string): string {
  const status: MockPaymentStatus = getMockPaymentStatus(providerRef);
  const safeRef = escapeHtml(providerRef);
  if (status !== "pending") {
    return html(`<h1>Paiement ${status === "paid" ? "simulé accepté" : "simulé échoué"}</h1>
<p>Référence <code>${safeRef}</code></p>
<p class="muted">Retournez à l'application. Le webhook fait foi.</p>`);
  }
  return html(`<h1>Paiement simulé</h1>
<p>Référence <code>${safeRef}</code></p>
<p class="muted">Fournisseur local de développement. Aucun argent réel n'est débité.</p>
<form method="post" action="/pay/mock/${encodeURIComponent(providerRef)}/confirm">
  <button name="outcome" value="paid" type="submit">Simuler un paiement réussi</button>
</form>
<form method="post" action="/pay/mock/${encodeURIComponent(providerRef)}/confirm">
  <button name="outcome" value="failed" type="submit">Simuler un échec</button>
</form>`);
}

/* ------------------------------------------------------------------ body */

interface WebhookBody {
  [key: string]: unknown;
}

function firstString(body: WebhookBody, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

/**
 * Montant annoncé. `NaN` quand le champ existe mais n'est pas un nombre :
 * la comparaison avec le montant de la commande échouera, donc rejet.
 */
function readAmount(body: WebhookBody): number | undefined {
  for (const key of ["amount", "amountXaf", "amount_xaf"]) {
    if (!(key in body)) continue;
    const raw = body[key];
    if (raw === null || raw === undefined || raw === "") continue;
    const value = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(value) ? value : Number.NaN;
  }
  return undefined;
}

/* ------------------------------------------------------------------ routes */

export function registerPaymentRoutes(app: FastifyInstance, db: Database): void {
  // Fastify ne parse pas les formulaires par défaut. Le parseur n'est posé que
  // s'il manque, pour ne pas entrer en conflit avec un autre module de l'API.
  if (!app.hasContentTypeParser("application/x-www-form-urlencoded")) {
    app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
      try {
        const params = new URLSearchParams(String(body ?? ""));
        done(null, Object.fromEntries(params.entries()));
      } catch (error) {
        done(error as Error, undefined);
      }
    });
  }

  /**
   * Webhook fournisseur. Une seule route par fournisseur actif : un webhook
   * `fapshi` reçu par une instance configurée en `mock` n'existe pas.
   */
  app.post(
    "/v1/payments/webhook/:provider",
    async (req: FastifyRequest<{ Params: { provider: string } }>) => {
      const claimed = String(req.params.provider ?? "").toLowerCase();
      if (claimed !== env.paymentProvider) throw fail.notFound("Fournisseur inconnu.");

      // Un secret partagé, quand il est configuré, filtre le bruit avant même
      // la lecture du corps. Il ne remplace pas la revérification.
      // Fapshi n'envoie pas d'en-tête personnalisé : le secret peut aussi venir
      // de l'URL déclarée chez le fournisseur (`…/webhook/fapshi?key=<secret>`).
      const expectedSecret = env.fapshi.webhookSecret;
      if (expectedSecret.length > 0) {
        const header = req.headers["x-webhook-secret"];
        const query = (req.query ?? {}) as Record<string, unknown>;
        const provided = typeof header === "string" ? header : typeof query.key === "string" ? query.key : "";
        if (!provided || !sameSecret(provided, expectedSecret)) {
          throw new ApiFailure(401, "UNAUTHENTICATED", "Webhook non authentifié.");
        }
      }

      if (claimed === "fapshi" && !env.fapshi.verifyWithApi) {
        // Refus explicite : sans revérification, ce handler ne serait qu'un
        // générateur d'abonnements gratuits.
        throw new ApiFailure(503, "INTERNAL", "FAPSHI_VERIFY_WITH_API doit rester actif.");
      }

      const body = (req.body ?? {}) as WebhookBody;
      const providerRef = firstString(body, ["transId", "trans_id", "transactionId", "transaction_id", "providerRef", "provider_ref"]);
      const orderId = firstString(body, ["externalId", "external_id", "orderId", "order_id"]);
      if (!providerRef && !orderId) {
        throw fail.validation({ providerRef: "Référence de transaction ou de commande requise." });
      }

      /*
       * 105 : un versement de communauté (`settlements`) passe par le même
       * webhook. Reconnu par sa référence, il n'obtient que la réconciliation —
       * revérifiée chez le fournisseur, idempotente. Le flux des commandes
       * ci-dessous est inchangé.
       */
      const settlementId = await findSettlementForWebhook(db, { providerRef, externalId: orderId });
      if (settlementId) {
        const settled = await reconcileSettlement(db, { settlementId, reportedAmountXaf: readAmount(body) });
        return {
          received: true,
          duplicate: !settled.changed,
          settlementId: settled.settlement.id,
          status: settled.settlement.status,
          settledGrants: settled.settledGrants,
        };
      }

      const raw = req.rawBody ?? JSON.stringify(body);
      const eventId = firstString(body, ["eventId", "event_id"]) ?? payloadHash(raw);

      const result = await handleWebhookEvent(db, {
        eventId,
        providerRef,
        orderId,
        reportedAmountXaf: readAmount(body),
        payloadHash: payloadHash(raw),
      });

      return {
        received: true,
        duplicate: result.status === "duplicate",
        orderId: result.orderId,
        status: result.orderStatus,
        activationStatus: result.activationStatus,
        activated: result.activated,
      };
    },
  );

  /* ----------------------------------------------------- avis avant paiement */

  /*
   * Page d'avis (106). L'état des opérateurs est relu **à l'ouverture**, pas
   * figé à la création de la commande :
   * - les deux disponibles : redirection directe vers Fapshi, aucun avis ;
   * - un opérateur coupé : avis + bouton vers Fapshi ;
   * - les deux coupés : avis sans bouton (payer l'administrateur).
   * Le lien Fapshi vient de la commande (`payment_url`), jamais de la requête.
   * Réglage manuel de l'owner : aucune détection automatique d'une panne.
   */
  app.get("/pay/notice/:orderId", async (req: FastifyRequest<{ Params: { orderId: string } }>, reply) => {
    const order = await loadOrder(db, String(req.params.orderId ?? "").trim());
    if (!order || !order.payment_url) {
      throw fail.notFound("Commande introuvable.");
    }
    // L'état change sans prévenir : ni le navigateur ni un intermédiaire ne gardent la page.
    reply.header("cache-control", "no-store");

    const expired = order.expires_at !== null && new Date(order.expires_at).getTime() <= Date.now();
    if (!hasCheckout(order) || expired) {
      return reply
        .type("text/html; charset=utf-8")
        .send(noticePage({ title: "Paiement indisponible", message: "Cette commande n'attend plus de paiement. Revenez à l'application.", target: null }));
    }

    const mode = await currentNoticeMode(db);
    const target = /^https?:\/\//i.test(order.payment_url) ? order.payment_url : null;
    if (mode === "direct") {
      if (!target) throw fail.notFound("Commande introuvable.");
      return reply.redirect(target, 302);
    }
    const content = noticeContent(mode);
    return reply
      .type("text/html; charset=utf-8")
      .send(noticePage({ title: content.title, message: content.message, target: content.withCheckout ? target : null }));
  });

  /* --------------------------------------------------------- retour paiement */

  app.get("/pay/return/:orderId", async (req: FastifyRequest<{ Params: { orderId: string } }>, reply) => {
    const orderId = String(req.params.orderId ?? "").trim();
    const query = (req.query ?? {}) as Record<string, unknown>;
    const transId = typeof query.transId === "string" ? query.transId.trim() : undefined;
    const qStatus = typeof query.status === "string" ? query.status.trim().toUpperCase() : undefined;

    let order = await loadOrder(db, orderId);
    if (!order && transId) {
      order = await loadOrderByProviderRef(db, transId);
    }

    if (order && (order.status === "created" || order.status === "pending")) {
      try {
        await reconcilePayment(db, {
          orderId: order.id,
          providerRef: transId ?? (order.provider_ref ? String(order.provider_ref) : undefined),
        });
        order = (await loadOrder(db, order.id)) ?? order;
      } catch (err) {
        req.log.warn({ err, orderId }, "reconcile on return failed");
      }
    }

    const isSuccess = order?.status === "paid" || qStatus === "SUCCESSFUL";
    const isFailed = order?.status === "failed" || qStatus === "FAILED" || qStatus === "EXPIRED";
    const amountXaf = order?.amount_xaf ?? 300;

    return reply.type("text/html; charset=utf-8").send(
      renderReturnPage({
        orderId: order?.id ?? orderId,
        status: isSuccess ? "success" : isFailed ? "failed" : "pending",
        amountXaf,
        transId,
      }),
    );
  });

  /* --------------------------------------------------------- page simulée */

  // La page n'existe qu'avec PAYMENT_PROVIDER=mock : en production, la route
  // n'est pas enregistrée du tout.
  if (env.paymentProvider !== "mock") return;

  app.get("/pay/mock/:ref", async (req: FastifyRequest<{ Params: { ref: string } }>, reply) => {
    const ref = String(req.params.ref ?? "");
    if (!MOCK_REF.test(ref)) throw fail.notFound("Paiement inconnu.");
    return reply.type("text/html; charset=utf-8").send(mockPage(ref));
  });

  app.post(
    "/pay/mock/:ref/confirm",
    async (req: FastifyRequest<{ Params: { ref: string } }>, reply) => {
      const ref = String(req.params.ref ?? "");
      if (!MOCK_REF.test(ref)) throw fail.notFound("Paiement inconnu.");
      const body = (req.body ?? {}) as WebhookBody;
      const outcome = firstString(body, ["outcome", "status"]) ?? "paid";
      if (outcome !== "paid" && outcome !== "failed") throw fail.validation({ outcome: "paid ou failed." });
      setMockPaymentStatus(ref, outcome);
      return reply.type("text/html; charset=utf-8").send(mockPage(ref));
    },
  );
}
