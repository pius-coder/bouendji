import type { Queryable } from "../db.js";

/**
 * Opérateurs de paiement (2026-10-30, décisions owner) :
 *
 * Fapshi propose Orange Money et MTN MoMo sur sa page. L'owner déclare à la
 * main qu'un opérateur est indisponible ; l'API affiche alors une page d'avis
 * avant la redirection vers Fapshi (ou à la place, si les deux sont coupés).
 *
 * - une ligne par opérateur (`orange`, `momo`), `available` vrai par défaut :
 *   tant que l'owner ne touche à rien, le paiement reste direct, comme avant ;
 * - `updated_by` = `admin_users.id` de l'owner qui a changé l'état (texte libre,
 *   pas de clé étrangère : la trace d'audit fait foi) ;
 * - réglage **manuel** : aucune détection automatique d'une panne chez Fapshi.
 *
 * Table neuve uniquement : aucune table existante n'est modifiée, aucune ligne
 * existante n'est réécrite.
 */
export const id = "106_payment_operators";

export async function up(db: Queryable): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS payment_operators (
      operator   text PRIMARY KEY,
      available  boolean NOT NULL DEFAULT true,
      updated_by text,
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT payment_operators_operator_check CHECK (operator IN ('orange', 'momo'))
    )
  `);
  await db.query(`
    INSERT INTO payment_operators (operator, available)
    VALUES ('orange', true), ('momo', true)
    ON CONFLICT (operator) DO NOTHING
  `);
}
