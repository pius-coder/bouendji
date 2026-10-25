import type { FastifyInstance, FastifyRequest } from "fastify";

/**
 * Rideau anti-curieux, couche 2 (Fastify).
 *
 * Doublon local/test de `middleware.ts` (Edge Vercel). L'Edge ne tourne ni en
 * `pnpm dev` ni dans les tests : ce hook applique la même règle ici pour que
 * le comportement soit vérifiable sans déployer.
 *
 * Même contrat, même exceptions :
 *   - BYPASS : /healthz, /readyz, /v1/payments/webhook/*, et la documentation
 *     (/reference, /openapi.json) → jamais de redirect.
 *   - navigateur (Accept: text/html) sans X-App-Id → 302 DECOY_URL.
 *   - /v1/* sans X-App-Id ni preuve ni Bearer → 302 DECOY_URL.
 *   - sinon → next (l'API répond JSON, même en erreur).
 *
 * Env : DECOY_URL (défaut https://example-sms.com — placeholder du site SMS).
 */
const BYPASS_RE = [
  /^\/healthz$/,
  /^\/readyz$/,
  /^\/v1\/payments\/webhook\//,
  /*
   * Documentation. Sans ces deux exceptions, ouvrir `/reference/` dans un
   * navigateur renvoie vers le site leurre : l'interface est inutilisable
   * exactement là où elle sert. Ce n'est pas une fuite — le document décrit les
   * routes que `curl` énumère déjà (404/401), et le rideau n'est pas une
   * sécurité (D43).
   */
  /^\/reference(\/.*)?$/,
  /^\/openapi\.json$/,
  /*
   * Pages de paiement ouvertes par l'app dans le navigateur : la page de retour
   * après Fapshi (`/pay/return/:orderId`) et la page simulée (`/pay/mock/:ref`).
   * Le navigateur n'envoie ni X-App-Id ni preuve : sans cette exception, le
   * client atterrit sur le site leurre au moment de payer.
   */
  /^\/pay\//,
];
export const DECOY_FALLBACK = "https://example-sms.com";

function isBypass(url: string): boolean {
  const path = url.split("?")[0] ?? "";
  return BYPASS_RE.some((re) => re.test(path));
}

export function shouldDecoyRedirect(req: FastifyRequest, decoyUrl: string): boolean {
  void decoyUrl;
  const url = req.url ?? "/";
  if (isBypass(url)) return false;

  const h = (name: string): string | undefined => {
    const v = req.headers[name.toLowerCase()];
    return Array.isArray(v) ? v[0] : v ?? undefined;
  };

  const appId = h("x-app-id");
  const proof = h("x-device-signature");
  const nonce = h("x-device-nonce");
  const bearer = h("authorization");
  const ua = h("user-agent") ?? "";
  const accept = h("accept") ?? "";
  const wantsHtml = accept.includes("text/html");

  const hasApiMetadata = !!appId && appId.length >= 2 && ua.includes("vpn-android");
  const hasAuth = (!!proof && !!nonce) || (!!bearer && bearer.startsWith("Bearer "));

  // Rideau limité au navigateur (Accept: text/html) : un client JSON sans
  // métadonnées reçoit le JSON d'erreur normal, pas un 302 — sinon on casse
  // les tests, le dashboard (fetch) et le contrat d'API. Le curl verra
  // l'API : normal, la sécurité réelle est D4/D5, pas le rideau.
  if (wantsHtml && !hasApiMetadata && !hasAuth) return true;
  return false;
}

export async function registerDecoyGuard(
  app: FastifyInstance,
  options: { decoyUrl?: string } = {},
): Promise<void> {
  const decoyUrl = options.decoyUrl ?? process.env.DECOY_URL ?? DECOY_FALLBACK;
  app.addHook("onRequest", async (req, reply) => {
    if (shouldDecoyRedirect(req, decoyUrl)) {
      return reply.code(302).header("location", decoyUrl).send();
    }
  });
}
