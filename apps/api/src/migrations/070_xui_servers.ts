import type { Queryable } from "../db.js";

/**
 * Serveurs 3x-ui du forfait limité (D113, D123). Un serveur = un panneau 3x-ui
 * joignable par l'API (Bearer). Le jeton est scellé avec MASTER_KEY
 * (lib/crypto.ts `encryptSecret`) et n'est jamais renvoyé.
 *
 * Colonnes au-delà de la liste imposée (chantier-vague1 §4) : `public_host`,
 * `public_port`, `security`, `sni`, `ws_path`, `ws_host` décrivent l'entrée
 * publique du client VLESS. Le panneau ne les connaît pas : l'hôte public de la
 * VM n'est pas celui du panneau (qui vit sur loopback ou derrière le tunnel).
 */
export const id = "070_xui_servers";

export async function up(db: Queryable): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS xui_servers (
      id                text PRIMARY KEY,
      label             text NOT NULL,
      panel_url         text NOT NULL,
      api_token_sealed  text NOT NULL,
      inbound_id        integer NOT NULL,
      capacity          integer NOT NULL DEFAULT 100 CHECK (capacity > 0),
      active            boolean NOT NULL DEFAULT true,
      public_host       text NOT NULL,
      public_port       integer NOT NULL DEFAULT 443,
      security          text NOT NULL DEFAULT 'tls' CHECK (security IN ('tls', 'none')),
      sni               text,
      ws_path           text NOT NULL,
      ws_host           text,
      created_by        text,
      created_at        timestamptz NOT NULL DEFAULT now()
    )
  `);
}
