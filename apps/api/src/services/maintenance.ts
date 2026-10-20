/**
 * Purge des données mortes.
 *
 * Rien de ce qui est supprimé ici n'est encore lisible par une route :
 *
 * - `bundles` : un bundle expiré n'est jamais resservi (`cachedBundle` compare
 *   la révision et l'expiration), la ligne n'est qu'un cache qui grossit d'une
 *   entrée par appareil et par révision de pool.
 * - `device_nonces` : l'anti-rejeu de `verifyDeviceProof` ne regarde que les
 *   10 dernières minutes ; au-delà, le nonce ne protège plus rien.
 * - `enroll_challenges` : un challenge expiré est refusé à la lecture
 *   (`routes/devices.ts`), le garder ne fait que gonfler la table.
 * - `auth_sessions` : une session expirée est refusée (`requireUser`), une
 *   session révoquée depuis plus de 7 jours n'a plus à servir de trace — les
 *   journaux d'audit, eux, gardent l'événement.
 *
 * Propriété utile de la rotation (routes/auth.ts) : toutes les sessions d'une
 * chaîne partagent la **même échéance absolue**. Une chaîne vieillit donc d'un
 * bloc, et purger les lignes expirées ne casse jamais un maillon vivant.
 *
 * Appelée par `server.ts` dans le même tick que le balayage du pool (60 s).
 * Chaque suppression est bornée (`now()` en base) : deux instances peuvent
 * purger en même temps sans se marcher dessus.
 */
import type { Database } from "../db.js";

export interface PurgeResult {
  bundles: number;
  deviceNonces: number;
  enrollChallenges: number;
  authSessions: number;
}

/** Sessions révoquées conservées : la fenêtre où un rejeu reste auditable. */
export const REVOKED_SESSION_RETENTION_DAYS = 7;

/** Un nonce de preuve d'appareil ne vaut que pour cette fenêtre (lib/auth.ts). */
export const NONCE_RETENTION_MINUTES = 10;

export async function purgeExpired(db: Database): Promise<PurgeResult> {
  const bundles = await db.query<{ id: string }>("DELETE FROM bundles WHERE expires_at < now() RETURNING id");

  const nonces = await db.query<{ nonce: string }>(
    "DELETE FROM device_nonces WHERE seen_at < now() - interval '10 minutes' RETURNING nonce",
  );

  const challenges = await db.query<{ id: string }>(
    "DELETE FROM enroll_challenges WHERE expires_at < now() RETURNING id",
  );

  const sessions = await db.query<{ id: string }>(
    `DELETE FROM auth_sessions
      WHERE expires_at < now()
         OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '7 days')
      RETURNING id`,
  );

  return {
    bundles: bundles.length,
    deviceNonces: nonces.length,
    enrollChallenges: challenges.length,
    authSessions: sessions.length,
  };
}

/** Somme des lignes supprimées : ce que `server.ts` journalise. */
export function purgedTotal(result: PurgeResult): number {
  return result.bundles + result.deviceNonces + result.enrollChallenges + result.authSessions;
}
