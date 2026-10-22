import { NextResponse, type NextRequest } from "next/server";

/**
 * Rideau anti-curieux (Edge, Vercel).
 *
 * Contexte : le domaine `bouendji.numzer0.store` est visible dans l'APK après
 * reverse — inévitable. Quand quelqu'un l'ouvre dans un navigateur SANS les
 * métadonnées de l'app, on le renvoie vers le site leurre (SMS) au lieu
 * d'exposer l'API en clair.
 *
 * Contrat avec l'app (voir CONTRIBUTING.md + lib/decoy.ts) :
 *   - l'app envoie TOUJOURS `User-Agent: vpn-android` + `X-App-Id: <appId>`
 *   - plus `X-Device-Signature` (preuve) ou `Authorization: Bearer <jwt>`
 *     sur les routes qui l'exigent.
 *
 * Règles :
 *   1. `/healthz`, `/readyz`, `/v1/payments/webhook/*` → JAMAIS de redirect
 *      (sondes + Fapshi D14 doivent toujours passer).
 *   2. Navigateur (`Accept: text/html`) sans `X-App-Id` → 302 vers DECOY_URL.
 *   3. `/v1/*` sans `X-App-Id` ni preuve ni Bearer → 302 vers DECOY_URL.
 *   4. Sinon → laisser passer (l'API répond JSON, même en 401/404).
 *
 * Ce n'est PAS une sécurité : la vraie sécurité reste la preuve d'appareil,
 * le JWT 15 min et le bundle scellé (D4/D5). Le reverse donnera toujours le
 * domaine + les noms d'en-têtes ; le leurre ne fait que décourager le curieux.
 *
 * `DECOY_URL` : variable Vercel. Preview = leurre de test,
 * Production = vrai site SMS (remplace https://example-sms.com).
 */
const BYPASS = [/^\/healthz$/, /^\/readyz$/, /^\/v1\/payments\/webhook\//];
const DECOY_FALLBACK = "https://example-sms.com";

export function middleware(req: NextRequest): NextResponse {
  const url = req.nextUrl;
  const path = url.pathname;

  if (BYPASS.some((re) => re.test(path))) return NextResponse.next();

  const decoy = process.env.DECOY_URL ?? DECOY_FALLBACK;
  const appId = req.headers.get("x-app-id");
  const proof = req.headers.get("x-device-signature");
  const nonce = req.headers.get("x-device-nonce");
  const bearer = req.headers.get("authorization");
  const ua = req.headers.get("user-agent") ?? "";
  const accept = req.headers.get("accept") ?? "";
  const wantsHtml = accept.includes("text/html");

  const hasApiMetadata = appId !== null && appId.length >= 2 && ua.includes("vpn-android");
  const hasAuth = (proof !== null && nonce !== null) || (bearer !== null && bearer.startsWith("Bearer "));

  // Navigateur curieux : pas de métadonnées app → leurre.
  // Volontairement limité au navigateur (Accept: text/html) : un client JSON
  // sans métadonnées reçoit le JSON d'erreur normal (401/404), pas un 302.
  // Sinon on casserait les tests, le dashboard (fetch JSON) et on mentirait
  // sur le contrat d'API. Le reverse en curl verra l'API — normal, la vraie
  // sécurité est la preuve d'appareil + JWT (D4/D5), pas le rideau.
  if (wantsHtml && !hasApiMetadata && !hasAuth) {
    return NextResponse.redirect(new URL(decoy), 302);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
