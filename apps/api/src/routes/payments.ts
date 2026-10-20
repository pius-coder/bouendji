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
import { handleWebhookEvent, payloadHash } from "../services/payments.js";
import { getMockPaymentStatus, setMockPaymentStatus, type MockPaymentStatus } from "../services/mockPayments.js";

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

/** Page de retour après paiement : aucune donnée, aucun jeton. */
function returnPage(): string {
  return html(`<h1>Paiement terminé</h1>
<p>Revenez à l'application : elle vérifie le statut auprès du serveur.</p>
<p class="muted">Cette page ne confirme rien par elle-même.</p>`);
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
      const expectedSecret = env.fapshi.webhookSecret;
      if (expectedSecret.length > 0) {
        const header = req.headers["x-webhook-secret"];
        const provided = typeof header === "string" ? header : "";
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

  app.get("/pay/return/:orderId", async (_req, reply) => {
    return reply.type("text/html; charset=utf-8").send(returnPage());
  });
}
