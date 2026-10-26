import "server-only";
import { ApiError } from "@/server/api/api-error";
import { PASSWORD_CHANGE_PATH } from "./password-change-path";
import { PASSWORD_CHANGE_REQUIRED } from "./admin-auth.schema";

/**
 * Où envoyer l'utilisateur quand l'API répond 403 `PASSWORD_CHANGE_REQUIRED` :
 * `/mot-de-passe`. `null` pour toute autre erreur. Fonction pure, sans
 * `next/navigation` : le `redirect` reste à l'appelant (context.ts, actions).
 */
export function passwordChangeTarget(err: unknown): string | null {
  return err instanceof ApiError && err.code === PASSWORD_CHANGE_REQUIRED ? PASSWORD_CHANGE_PATH : null;
}
