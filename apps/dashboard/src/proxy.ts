import { NextResponse, type NextRequest } from "next/server";

/**
 * Garde légère : présence du cookie de session, sinon /login?next=. Ne vérifie ni
 * signature ni rôle (l'API le fait à chaque appel) : un cookie forgé passe ici et
 * échoue au premier appel (401 -> /login). Nom du cookie dupliqué volontairement :
 * proxy.ts ne doit pas importer le code serveur (`server-only`, `next/headers`).
 */
const COOKIE = process.env.NODE_ENV === "production" ? "__Host-vpn_admin" : "vpn_admin";

export function proxy(request: NextRequest) {
  if (request.cookies.has(COOKIE)) return NextResponse.next();
  const url = request.nextUrl.clone();
  const next = request.nextUrl.pathname + request.nextUrl.search;
  url.pathname = "/login";
  url.search = next === "/" ? "" : `?next=${encodeURIComponent(next)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Tout sauf /login, les ressources Next et les fichiers statiques.
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|webp)$).*)"],
};
