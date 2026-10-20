import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Database, Row } from "../db.js";
import { requireAdmin, requireDeviceByToken, scopedCommunity, verifyDeviceProof } from "../lib/auth.js";
import { bundleState, markConsumed } from "../services/offlineBundles.js";
import { parseBody } from "./admin.js";

/**
 * Fichier de secours hors-ligne — lecture et consommation.
 *
 * L'**émission** vit dans `routes/admin.ts` (`POST /v1/admin/devices/:id/offline-bundles`) :
 * c'est une action privilégiée, elle partage donc le contrôle de périmètre et
 * l'audit des autres actions d'administration. Ici, seulement ce qui manque :
 * l'état des fichiers déjà émis, et le marquage de consommation par l'appareil.
 *
 * Aucune route de ce fichier ne rend un contenu : ni UUID, ni chemin, ni clé.
 */

const ListQuery = z.object({
  deviceId: z.string().trim().min(8).max(64).optional(),
});

export function registerOfflineRoutes(app: FastifyInstance, db: Database): void {
  app.get("/v1/admin/offline-bundles", async (req: FastifyRequest) => {
    const admin = await requireAdmin(db, req);
    const query = parseBody(ListQuery, req.query ?? {});

    const requested = query.deviceId
      ? (
          await db.one<Row>(
            `SELECT u.community_id
               FROM devices d JOIN users u ON u.id = d.user_id
              WHERE d.id = $1`,
            [query.deviceId],
          )
        )?.community_id
      : null;

    // `owner` voit tout, les autres seulement leur périmètre — même règle que
    // le reste de l'administration, et jamais un identifiant venu du corps.
    const communityId = scopedCommunity(admin, requested ? String(requested) : null);

    const rows = await db.query<Row>(
      `SELECT b.*
         FROM offline_bundles b
         JOIN users u ON u.id = b.user_id
        WHERE ($1::text IS NULL OR u.community_id = $1)
          AND ($2::text IS NULL OR b.device_id = $2)
        ORDER BY b.created_at DESC
        LIMIT 50`,
      [communityId, query.deviceId ?? null],
    );

    return { bundles: rows.map(bundleState) };
  });

  /**
   * Marquage de consommation. L'application marque déjà localement, **avant**
   * d'écrire la liste : une coupure entre les deux laisse un fichier consommé
   * sans configurations (l'utilisateur en redemande un), jamais un fichier
   * réutilisable. Ce point d'entrée sert à l'observation côté administration ;
   * il n'est pas encore appelé par le client.
   */
  app.post("/v1/offline-bundles/:bundleId/consumed", async (req: FastifyRequest) => {
    const params = parseBody(z.object({ bundleId: z.string().trim().min(8).max(64) }), req.params);
    const device = await requireDeviceByToken(db, req);
    await verifyDeviceProof(db, req, device);

    return markConsumed(db, params.bundleId, String(device.id));
  });
}
