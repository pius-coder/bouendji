/**
 * `POST /v1/me/telemetry` — le seul endroit où un client change la santé d'un
 * nœud (§3.4, D50/D63/D64).
 *
 * Ce que cette route refuse de faire, et pourquoi :
 *
 * - **croire l'horloge du téléphone** : `reported_at = now()`. Un appareil dont
 *   l'heure dérive de dix minutes déplacerait une panne hors de la fenêtre de
 *   verdict, donc un nœud mort resterait servi (règle 1) ;
 * - **croire le corps sur l'identité** : `device_id` vient de `requireSession`
 *   (bearer + preuve signée + propriété), jamais du corps (règle 5) ;
 * - **créer un nœud** : un `configId` absent d'`endpoints` est un `400`, pas une
 *   ligne fantôme (règle 4) ;
 * - **doubler un compteur** : `usage` est un cumul, écrit en `GREATEST`
 *   (règle 2), donc un lot rejoué après une coupure est sans effet ;
 * - **écrire dans le passé** : `day` est borné à ±1 jour de l'heure serveur
 *   (règle 3) ;
 * - **perdre les octets quand les rapports sont refusés** : `reports` est
 *   optionnel, un envoi de consommation seule passe en `202` (règle 6).
 *
 * `requireSession` vit dans `routes/me.ts` (avec `loadEntitlement` et
 * `parseBody`) : c'est le module qui possède la définition de « session » côté
 * mobile, et les routes `bundle`/`devices` l'importent déjà de là.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Database } from "../db.js";
import { newId } from "../lib/crypto.js";
import { fail } from "../lib/errors.js";
import { reconcileDeviceWitnesses, reconcileHealth } from "../services/health.js";
import { parseBody, requireSession } from "./me.js";

/** D64 : au-delà de 20 rapports, le client découpe. Un lot plus gros est un bug client, pas un cas d'usage. */
export const MAX_REPORTS = 20;

/** Une journée comptée en secondes, plus une heure de marge : le cumul d'un jour ne peut pas la dépasser. */
const MAX_SECONDS = 25 * 3_600;

/** `bigint` en base, `number` sûr en JSON : au-delà, le client ment ou déborde. */
const MAX_COUNTER = Number.MAX_SAFE_INTEGER;

const DAY_MS = 86_400_000;

const usageSchema = z
  .object({
    /** Jour **du téléphone**, borné côté serveur (règle 3). */
    day: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ."),
    bytesUp: z.number().int().min(0).max(MAX_COUNTER),
    bytesDown: z.number().int().min(0).max(MAX_COUNTER),
    seconds: z.number().int().min(0).max(MAX_SECONDS),
  })
  .strict();

const reportSchema = z
  .object({
    configId: z.string().trim().min(1).max(190),
    ok: z.boolean(),
    /** Absent ou `null` quand la mesure a échoué : on ne mesure pas une latence d'échec. */
    latencyMs: z.number().int().min(0).max(600_000).nullish(),
  })
  .strict();

const telemetrySchema = z
  .object({
    usage: usageSchema.optional(),
    reports: z.array(reportSchema).max(MAX_REPORTS, `${MAX_REPORTS} rapports au maximum par requête.`).optional(),
  })
  // Strict : un `deviceId` dans le corps n'est pas « honoré mais écrasé », il est
  // refusé. C'est la seule façon d'être sûr qu'aucune version future du client
  // ne croie pouvoir viser un autre appareil.
  .strict();

/**
 * `day` borné à ±1 jour de l'heure serveur (règle 3).
 *
 * La borne est une différence de **jours calendaires UTC**, pas une différence
 * de millisecondes : un appareil à UTC+1 qui déclare « hier » à 23 h locales
 * reste dans la tolérance, alors qu'une tolérance de 24 h le refuserait. Les
 * deux jours voisins servent à absorber le fuseau et la dérive d'horloge
 * tolérée par la signature (±120 s) ; au-delà, c'est une écriture dans le passé
 * pour masquer une consommation.
 */
function assertDayInWindow(day: string): void {
  const parsed = new Date(`${day}T00:00:00.000Z`);
  // Le format seul ne suffit pas : `2026-13-45` passe le regex. Soit `Date`
  // rend `Invalid Date`, soit il ramène la valeur à un autre jour ; les deux
  // sont attrapés par l'aller-retour.
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== day) {
    throw fail.validation({ day: "Date invalide : AAAA-MM-JJ attendu." });
  }
  const now = new Date();
  const serverDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const offsetDays = Math.round((parsed.getTime() - serverDay) / DAY_MS);
  if (offsetDays < -1 || offsetDays > 1) {
    throw fail.validation({ day: "Jour hors tolérance : ±1 jour autour de l'heure serveur." });
  }
}

interface UsageDto {
  day: string;
  bytesUp: number;
  bytesDown: number;
  seconds: number;
  /** D52 : deux sources nommées, jamais confondues. Ici, c'est le moteur du téléphone. */
  source: "device";
}

export function registerTelemetryRoutes(app: FastifyInstance, db: Database): void {
  app.post(
    "/v1/me/telemetry",
    // Le corps attendu est ≤ 8 Ko (§3.4). La limite arrête un tampon de 200
    // rapports envoyé d'un bloc avant qu'il n'atteigne la base — le client le
    // reçoit en 4xx et ne rejoue pas (D64), alors qu'un 200 partiel laisserait
    // `config_reports` dans un état inconnu.
    { bodyLimit: 8 * 1024 },
    async (req: FastifyRequest, reply) => {
      // Preuve d'appareil + session : le propriétaire de l'appareil est vérifié
      // avant tout accès aux tables (règle 5).
      const auth = await requireSession(db, req);
      const input = parseBody(telemetrySchema, req.body);

      let usage: UsageDto | null = null;
      if (input.usage) {
        assertDayInWindow(input.usage.day);
        // Cumul monotone (règle 2). `GREATEST` plutôt qu'une addition : le
        // client envoie un **total du jour**, pas un delta ; un lot rejoué
        // après une coupure réseau ne doit donc rien doubler, et un téléphone
        // qui redémarre ne doit pas faire reculer le compteur.
        await db.query(
          `INSERT INTO usage_daily (device_id, day, source, bytes_up, bytes_down, seconds, updated_at)
           VALUES ($1, $2, 'device', $3, $4, $5, now())
           ON CONFLICT (device_id, day, source) DO UPDATE
              SET bytes_up   = GREATEST(usage_daily.bytes_up,   EXCLUDED.bytes_up),
                  bytes_down = GREATEST(usage_daily.bytes_down, EXCLUDED.bytes_down),
                  seconds    = GREATEST(usage_daily.seconds,    EXCLUDED.seconds),
                  updated_at = now()`,
          [auth.deviceId, input.usage.day, input.usage.bytesUp, input.usage.bytesDown, input.usage.seconds],
        );
        usage = { ...input.usage, source: "device" };
      }

      const reports = input.reports ?? [];

      // Un rapport ne crée pas de nœud fantôme (règle 4). Le lot entier est
      // validé **avant** la première insertion : sinon un identifiant inconnu
      // au 19e rapport laisserait 18 lignes derrière un 400 que le client
      // interprète comme « lot abandonné » (D64), donc un état partiel que
      // personne ne relit.
      for (const report of reports) {
        const known = await db.scalar("SELECT 1 FROM endpoints WHERE id = $1", [report.configId]);
        if (!known) throw fail.validation({ configId: `Configuration inconnue : ${report.configId}` });
      }

      for (const report of reports) {
        // `reported_at` est l'heure du serveur : aucune colonne ne reçoit une
        // date du client (règle 1).
        await db.query(
          `INSERT INTO config_reports (id, device_id, config_id, ok, latency_ms, reported_at)
           VALUES ($1, $2, $3, $4, $5, now())`,
          [newId(), auth.deviceId, report.configId, report.ok, report.latencyMs ?? null],
        );
      }

      // Le verdict est calculé **après** insertion (§4.2) : une seule requête
      // par nœud cité, et seule une transition bump la révision (D48).
      const judged = new Set<string>();
      for (const report of reports) {
        if (judged.has(report.configId)) continue;
        judged.add(report.configId);
        await reconcileHealth(db, report.configId);
      }

      // Un succès dans ce lot peut faire de cet appareil un **témoin** sur un
      // nœud qu'il échoue par ailleurs (D63) — y compris quand la preuve arrive
      // un lot après les échecs, ce qui est le cas normal de la bascule.
      if (reports.some((report) => report.ok)) {
        await reconcileDeviceWitnesses(db, auth.deviceId);
      }

      return reply.code(202).send({ accepted: reports.length, usage });
    },
  );
}
