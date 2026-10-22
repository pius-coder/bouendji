import type { VercelRequest, VercelResponse } from "@vercel/node";
import { buildApp } from "../src/app.js";
import { createDb, type Database } from "../src/db.js";

/**
 * Adaptateur Fastify → Vercel (O16, premier pas vérifiable).
 *
 * Vercel appelle une fonction par requête ; Fastify veut un serveur qui écoute.
 * On garde TOUTE l'API (routes, hooks rawBody, CORS, rate-limit, decoy guard)
 * et on branche le socket Vercel dessus : `app.server.emit('request', req, res)`.
 *
 * Singleton lazy : la 1re invocation construit l'app + pool Postgres
 * (`DATABASE_URL` obligatoire — PGlite n'a pas de disque sur Vercel, D32),
 * les suivantes réutilisent. Le tick 60 s de `server.ts` ne tourne PAS ici :
 * prévoir cron Vercel Pro ou déclencheur externe (O15).
 */
let ready: Promise<{ app: Awaited<ReturnType<typeof buildApp>> }> | null = null;

async function getApp(): Promise<Awaited<ReturnType<typeof buildApp>>> {
  if (!ready) {
    ready = (async () => {
      const url = process.env.DATABASE_URL ?? "";
      if (!url.startsWith("postgres://") && !url.startsWith("postgresql://")) {
        throw new Error("DATABASE_URL Postgres requis sur Vercel (PGlite sans disque).");
      }
      const db: Database = await createDb(url);
      const app = await buildApp({ db, logger: false });
      await app.ready();
      return { app };
    })();
  }
  return (await ready).app;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const app = await getApp();
  app.server.emit("request", req, res);
}
