/**
 * Serveurs 3x-ui du forfait limité (D113, D123) : liste, ajout, modification,
 * désactivation et test de connexion. Réservé au propriétaire de la plateforme.
 *
 * Invariants :
 * 1. **Le jeton ne sort jamais.** Il est scellé à l'écriture (`encryptSecret`,
 *    MASTER_KEY) ; les réponses ne donnent que `tokenSet`. Le test de connexion
 *    ne renvoie ni le jeton ni le chemin de base du panneau dans son message.
 * 2. **Désactiver ne coupe aucun client.** `active = false` retire le serveur
 *    de l'attribution et de la lecture du trafic ; les clients déjà créés
 *    restent tels quels côté panneau.
 * 3. **Chaque changement écrit une ligne d'audit** dans la même transaction.
 *
 * Capacité `xui.manage` : absente de `permitted()` dans cette copie (R1 ne l'a
 * pas encore fusionnée). Le contrôle est donc un contrôle `platformRole ===
 * "owner"` équivalent, à remplacer par `authorize(admin, "xui.manage", null)` au
 * merge de R1.
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Database, Row } from "../db.js";
import { requireAdmin, type AdminContext } from "../lib/auth.js";
import { encryptSecret, newId } from "../lib/crypto.js";
import { fail } from "../lib/errors.js";
import { appendAudit, parseBody } from "./admin.js";
import { panelFromRow, testPanel, XuiError } from "../services/xui.js";

const PREFIX = "/v1/admin/xui/servers";

const httpUrl = z
  .string()
  .trim()
  .max(300)
  .url()
  .refine((value) => /^https?:\/\//.test(value), "Adresse HTTP(S) attendue.");

const serverCreateSchema = z
  .object({
    label: z.string().trim().min(2).max(80),
    /** Racine du panneau, chemin de base compris (ex. https://hote/<basePath>). */
    panelUrl: httpUrl,
    apiToken: z.string().trim().min(16).max(300),
    inboundId: z.number().int().min(1).max(1_000_000),
    capacity: z.number().int().min(1).max(5_000).optional(),
    publicHost: z.string().trim().min(3).max(253),
    publicPort: z.number().int().min(1).max(65_535).optional(),
    security: z.enum(["tls", "none"]).optional(),
    sni: z.string().trim().min(1).max(253).nullable().optional(),
    wsPath: z.string().trim().startsWith("/").max(200),
    wsHost: z.string().trim().min(1).max(253).nullable().optional(),
  })
  .strict();

const serverPatchSchema = z
  .object({
    label: z.string().trim().min(2).max(80).optional(),
    panelUrl: httpUrl.optional(),
    apiToken: z.string().trim().min(16).max(300).optional(),
    inboundId: z.number().int().min(1).max(1_000_000).optional(),
    capacity: z.number().int().min(1).max(5_000).optional(),
    active: z.boolean().optional(),
    publicHost: z.string().trim().min(3).max(253).optional(),
    publicPort: z.number().int().min(1).max(65_535).optional(),
    security: z.enum(["tls", "none"]).optional(),
    sni: z.string().trim().min(1).max(253).nullable().optional(),
    wsPath: z.string().trim().startsWith("/").max(200).optional(),
    wsHost: z.string().trim().min(1).max(253).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Aucun champ à modifier.");

/** Seul le propriétaire gère les serveurs 3x-ui (voir l'en-tête du fichier). */
async function requireOwner(db: Database, req: FastifyRequest): Promise<AdminContext> {
  const admin = await requireAdmin(db, req);
  if (admin.platformRole !== "owner") throw fail.forbidden("Réservé au propriétaire de la plateforme.");
  return admin;
}

interface ServerDto {
  id: string;
  label: string;
  panelUrl: string;
  inboundId: number;
  capacity: number;
  active: boolean;
  publicHost: string;
  publicPort: number;
  security: "tls" | "none";
  sni: string | null;
  wsPath: string;
  wsHost: string | null;
  tokenSet: boolean;
  assigned: number;
  createdAt: string;
}

function serverDto(row: Row): ServerDto {
  return {
    id: String(row.id),
    label: String(row.label),
    panelUrl: String(row.panel_url),
    inboundId: Number(row.inbound_id),
    capacity: Number(row.capacity),
    active: row.active === true,
    publicHost: String(row.public_host),
    publicPort: Number(row.public_port),
    security: row.security === "none" ? "none" : "tls",
    sni: (row.sni as string | null) ?? null,
    wsPath: String(row.ws_path),
    wsHost: (row.ws_host as string | null) ?? null,
    tokenSet: typeof row.api_token_sealed === "string" && row.api_token_sealed.length > 0,
    assigned: Number(row.assigned ?? 0),
    createdAt: new Date(row.created_at as string | Date).toISOString(),
  };
}

const LIST_SQL = `
  SELECT s.*,
         (SELECT count(*)::int FROM subscriptions x WHERE x.xui_server_id = s.id) AS assigned
    FROM xui_servers s`;

async function loadServer(db: Database, serverId: string): Promise<Row> {
  const row = await db.one<Row>(`${LIST_SQL} WHERE s.id = $1`, [serverId]);
  if (!row) throw fail.notFound("Serveur 3x-ui introuvable.");
  return row;
}

export function registerAdminXuiRoutes(app: FastifyInstance, db: Database): void {
  app.get(PREFIX, async (req) => {
    await requireOwner(db, req);
    const rows = await db.query<Row>(`${LIST_SQL} ORDER BY s.created_at ASC`);
    return { servers: rows.map(serverDto) };
  });

  app.post(PREFIX, async (req, reply) => {
    const admin = await requireOwner(db, req);
    const body = parseBody(serverCreateSchema, req.body);
    const id = newId();

    await db.tx(async (q) => {
      await q.query(
        `INSERT INTO xui_servers
           (id, label, panel_url, api_token_sealed, inbound_id, capacity, active,
            public_host, public_port, security, sni, ws_path, ws_host, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9, $10, $11, $12, $13)`,
        [
          id,
          body.label,
          body.panelUrl,
          encryptSecret(body.apiToken),
          body.inboundId,
          body.capacity ?? 100,
          body.publicHost,
          body.publicPort ?? 443,
          body.security ?? "tls",
          body.sni ?? null,
          body.wsPath,
          body.wsHost ?? null,
          admin.adminId,
        ],
      );
      await appendAudit(q, admin, req, {
        action: "xui_server.create",
        targetType: "xui_server",
        targetId: id,
        after: { label: body.label, inboundId: body.inboundId, capacity: body.capacity ?? 100 },
      });
    });

    reply.code(201);
    return { server: serverDto(await loadServer(db, id)) };
  });

  app.patch<{ Params: { serverId: string } }>(`${PREFIX}/:serverId`, async (req) => {
    const admin = await requireOwner(db, req);
    const body = parseBody(serverPatchSchema, req.body);
    const serverId = req.params.serverId;
    const before = await loadServer(db, serverId);

    // Une colonne par champ fourni : rien d'autre ne peut être touché.
    const columns: Array<[string, unknown]> = [];
    if (body.label !== undefined) columns.push(["label", body.label]);
    if (body.panelUrl !== undefined) columns.push(["panel_url", body.panelUrl]);
    if (body.apiToken !== undefined) columns.push(["api_token_sealed", encryptSecret(body.apiToken)]);
    if (body.inboundId !== undefined) columns.push(["inbound_id", body.inboundId]);
    if (body.capacity !== undefined) columns.push(["capacity", body.capacity]);
    if (body.active !== undefined) columns.push(["active", body.active]);
    if (body.publicHost !== undefined) columns.push(["public_host", body.publicHost]);
    if (body.publicPort !== undefined) columns.push(["public_port", body.publicPort]);
    if (body.security !== undefined) columns.push(["security", body.security]);
    if (body.sni !== undefined) columns.push(["sni", body.sni]);
    if (body.wsPath !== undefined) columns.push(["ws_path", body.wsPath]);
    if (body.wsHost !== undefined) columns.push(["ws_host", body.wsHost]);

    const assignments = columns.map(([column], index) => `${column} = $${index + 2}`).join(", ");
    await db.tx(async (q) => {
      await q.query(`UPDATE xui_servers SET ${assignments} WHERE id = $1`, [
        serverId,
        ...columns.map(([, value]) => value),
      ]);
      await appendAudit(q, admin, req, {
        action: body.active === false ? "xui_server.disable" : "xui_server.update",
        targetType: "xui_server",
        targetId: serverId,
        before: { label: before.label, active: before.active, capacity: before.capacity },
        after: {
          ...(body.label !== undefined ? { label: body.label } : {}),
          ...(body.active !== undefined ? { active: body.active } : {}),
          ...(body.capacity !== undefined ? { capacity: body.capacity } : {}),
          ...(body.apiToken !== undefined ? { tokenRotated: true } : {}),
        },
      });
    });

    return { server: serverDto(await loadServer(db, serverId)) };
  });

  /**
   * Vérifie le jeton et l'inbound. Renvoie 200 dans tous les cas : un échec de
   * connexion est une réponse attendue du bouton « Tester », pas une erreur API.
   */
  app.post<{ Params: { serverId: string } }>(`${PREFIX}/:serverId/test`, async (req) => {
    await requireOwner(db, req);
    const row = await loadServer(db, req.params.serverId);
    try {
      const panel = panelFromRow(row);
      const result = await testPanel(panel);
      return { ok: true, message: "Connexion au panneau 3x-ui réussie.", inboundRemark: result.inboundRemark };
    } catch (err) {
      const message = err instanceof XuiError ? err.message : "Échec du test de connexion.";
      return { ok: false, message, inboundRemark: null };
    }
  });

  /**
   * Suppression d'un serveur 3x-ui (D140).
   * Vérifie qu'aucun abonnement actif n'y est assigné.
   */
  app.delete<{ Params: { serverId: string } }>(`${PREFIX}/:serverId`, async (req) => {
    const admin = await requireOwner(db, req);
    const serverId = req.params.serverId;
    const server = await loadServer(db, serverId);

    const assigned = await db.scalar<number>(
      "SELECT count(*)::int FROM subscriptions WHERE xui_server_id = $1 AND status = 'active'",
      [serverId],
    );
    if (assigned && assigned > 0) {
      throw fail.conflict(`Impossible de supprimer : ${assigned} abonnement(s) actif(s) sont assigné(s) à ce serveur. Désactivez-le d'abord.`);
    }

    await db.tx(async (q) => {
      await q.query("DELETE FROM xui_clients WHERE subscription_id IN (SELECT id FROM subscriptions WHERE xui_server_id = $1)", [serverId]);
      await q.query("DELETE FROM xui_servers WHERE id = $1", [serverId]);
      await appendAudit(q, admin, req, {
        action: "xui_server.delete",
        targetType: "xui_server",
        targetId: serverId,
        before: { label: server.label, publicHost: server.public_host },
      });
    });

    return { ok: true, serverId };
  });
}
