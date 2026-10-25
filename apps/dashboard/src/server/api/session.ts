import "server-only";
import { cookies } from "next/headers";

/**
 * Session du dashboard = le JWT `vpn-admin` dans un cookie httpOnly.
 *
 * - `httpOnly` : illisible depuis le JavaScript du navigateur.
 * - `sameSite: "lax"` : le cookie n'accompagne pas un POST venu d'un autre site
 *   (en plus du contrôle Origin/Host natif des Server Actions, voir README).
 * - `__Host-` en production : impose `secure`, `path=/` et aucun `Domain`.
 *   Sur http://localhost le préfixe serait rejeté, d'où le nom simple en dev.
 * - Expiration = celle du JWT (8 h, pas de refresh admin : D55).
 *
 * `setSession` et `clearSession` ne s'appellent que depuis une Server Action :
 * Next interdit d'écrire un cookie pendant le rendu d'un Server Component.
 */
const PRODUCTION = process.env.NODE_ENV === "production";
export const SESSION_COOKIE = PRODUCTION ? "__Host-vpn_admin" : "vpn_admin";

export async function readSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value || undefined;
}

export async function setSession(token: string, expiresAt: Date): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: PRODUCTION,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}
