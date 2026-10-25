/**
 * Ce que l'écran Profil et l'écran Inviter affichent, et qu'aucune autre route
 * ne fournissait :
 *
 * - `GET /v1/me/stats` : données protégées et temps en ligne, sommés depuis
 *   `usage_daily` (alimenté par `POST /v1/me/telemetry`, source `device`) sur
 *   tous les appareils du compte ;
 * - `GET /v1/me/referral` : le code parrain du compte (tiré à la première
 *   lecture) et le nombre d'inscrits qui l'ont utilisé.
 *
 * Le parrainage **n'attribue aucune récompense** : la règle n'est pas décidée.
 * La relation est seulement enregistrée, pour pouvoir l'honorer plus tard.
 */
import { randomInt } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { isUniqueViolation, type Database, type Row } from "../db.js";
import { fail } from "../lib/errors.js";
import { requireSession } from "./me.js";

/** Sans 0/O ni 1/I/L : un code se lit à voix haute et se recopie à la main. */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

function drawCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

export function registerAccountRoutes(app: FastifyInstance, db: Database): void {
  app.get("/v1/me/stats", async (req: FastifyRequest) => {
    const auth = await requireSession(db, req);
    const today = new Date().toISOString().slice(0, 10);
    const row = await db.one<Row>(
      `SELECT COALESCE(SUM(u.bytes_up), 0)   AS bytes_up,
              COALESCE(SUM(u.bytes_down), 0) AS bytes_down,
              COALESCE(SUM(u.seconds), 0)    AS seconds,
              COALESCE(SUM(u.bytes_up + u.bytes_down) FILTER (WHERE u.day = $2::date), 0) AS today_bytes,
              COALESCE(SUM(u.seconds) FILTER (WHERE u.day = $2::date), 0)                 AS today_seconds
         FROM usage_daily u
         JOIN devices d ON d.id = u.device_id
        WHERE d.user_id = $1 AND u.source = 'device'`,
      [auth.userId, today],
    );
    return {
      bytesUp: Number(row?.bytes_up ?? 0),
      bytesDown: Number(row?.bytes_down ?? 0),
      seconds: Number(row?.seconds ?? 0),
      todayBytes: Number(row?.today_bytes ?? 0),
      todaySeconds: Number(row?.today_seconds ?? 0),
    };
  });

  app.get("/v1/me/referral", async (req: FastifyRequest) => {
    const auth = await requireSession(db, req);
    const user = await db.one<Row>("SELECT app_id, referral_code FROM users WHERE id = $1", [auth.userId]);
    if (!user) throw fail.notFound("Compte introuvable.");

    let code = user.referral_code ? String(user.referral_code) : null;
    for (let attempt = 0; !code && attempt < 8; attempt++) {
      const candidate = drawCode();
      try {
        // `referral_code IS NULL` : deux lectures simultanées ne se remplacent pas.
        const updated = await db.one<Row>(
          "UPDATE users SET referral_code = $2 WHERE id = $1 AND referral_code IS NULL RETURNING referral_code",
          [auth.userId, candidate],
        );
        code = updated
          ? String(updated.referral_code)
          : String((await db.one<Row>("SELECT referral_code FROM users WHERE id = $1", [auth.userId]))?.referral_code ?? "") || null;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    if (!code) throw fail.conflict("Impossible d'attribuer un code parrain, réessayez.");

    const invited = Number(
      (await db.one<Row>("SELECT count(*) AS n FROM referrals WHERE referrer_user_id = $1", [auth.userId]))?.n ?? 0,
    );
    return { code, invited };
  });
}
