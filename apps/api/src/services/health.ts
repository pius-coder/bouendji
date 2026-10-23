/**
 * Le verdict de santé d'un nœud (D48/D50/D63) — le seul chemin par lequel une
 * observation client change la liste servie.
 *
 * Trois règles, et rien d'autre :
 *
 * 1. **C'est le client qui mesure** (D51). Aucun vérificateur serveur : le
 *    téléphone teste déjà à travers le tunnel, il rapporte, on tranche.
 * 2. **Deux questions, une seule requête** : combien d'appareils distincts
 *    réussissent, combien échouent, et y a-t-il un témoin différentiel. La
 *    fenêtre est de dix minutes (§1.3).
 * 3. **Seule une transition bump la révision** (D48). Un appareil qui répète la
 *    même mesure ne doit pas forcer tous les autres à retélécharger un bundle :
 *    `setHealth` écrit conditionnellement, et c'est `RETURNING id` qui dit si
 *    quelque chose a bougé.
 *
 * `bumpPoolRevision` est **recopié** ici plutôt qu'importé de
 * `services/endpoints.ts` : deux agents écrivent ces deux fichiers en parallèle
 * et un import partagé transformait un conflit d'édition local en conflit de
 * signature. Cinq lignes, une seule définition de la vérité (la table
 * `pool_state`), donc rien à diverger.
 *
 * Aucune de ces fonctions ne parle à Telegram : la transition est constatée
 * ici, l'alerte appartient à l'appelant (§4.6).
 */
import type { Queryable } from "../db.js";

export type EndpointHealth = "unknown" | "healthy" | "degraded" | "down";

/** Fenêtre du verdict (§1.3) : dix minutes. */
export const HEALTH_WINDOW_MINUTES = 10;

/** Chemin 1 (§1.3) : trois appareils **distincts** en échec. */
export const DOWN_QUORUM = 3;

/** Retour : trois appareils distincts en succès. Un nœud `down` revient par probation, pas par ce chemin. */
export const HEALTHY_QUORUM = 3;

/**
 * Chemin 2 (D63) : deux échecs sur ce nœud **et** un succès sur un autre nœud
 * dans la même fenêtre. Deux échecs, c'est ce que produit la bascule du client ;
 * le succès ailleurs est ce qui distingue un nœud mort d'un téléphone cassé.
 */
export const WITNESS_FAILURES = 2;

export interface HealthVerdict {
  configId: string;
  health: EndpointHealth;
  /** `reports`, `reports:<n>` ou `witness` — la raison écrite dans `endpoints.down_reason`. */
  reason: string;
  /** `false` quand la ligne portait déjà ce verdict : aucune révision bumpée. */
  changed: boolean;
}

/**
 * Compteur monotone du pool (`pool_state.revision`). L'ETag du bundle ne dépend
 * que de `deviceId:revision` (`routes/bundle.ts`) : sans bump, un client reçoit
 * 304 et garde une liste morte (D48).
 */
export async function bumpPoolRevision(db: Queryable): Promise<number> {
  const row = await db.one<{ revision: string | number }>(
    "UPDATE pool_state SET revision = revision + 1, updated_at = now() WHERE id = 'pool' RETURNING revision",
  );
  return Number(row?.revision ?? 1);
}

/**
 * Écrit un verdict de santé, atomiquement et **seulement s'il change**.
 *
 * `WHERE health <> $2` est le cœur de D48 : un `down` rejoué toutes les 60 s par
 * un appareil qui insiste reste un `down`, sans bump de révision. `down_since`
 * est posé à l'entrée en `down` et effacé à la sortie : c'est la seule horloge
 * qui compte pour la probation de 30 minutes (D50).
 */
export async function setHealth(
  db: Queryable,
  endpointId: string,
  health: EndpointHealth,
  reason: string | null,
): Promise<boolean> {
  const rows = await db.query<{ id: string }>(
    `UPDATE endpoints
        SET health = $2,
            down_since  = CASE WHEN $2 = 'down' THEN now() ELSE NULL END,
            down_reason = $3,
            updated_at  = now()
      WHERE id = $1 AND health <> $2
      RETURNING id`,
    [endpointId, health, reason],
  );
  if (rows.length === 0) return false;
  await bumpPoolRevision(db);
  return true;
}

/**
 * Le verdict d'un nœud, en une seule passe sur les rapports de la fenêtre.
 *
 * La CTE `recent` est lue **une fois** ; `mine` en extrait les rapports du nœud
 * jugé, `witness` les succès du même appareil sur un **autre** nœud. Le
 * témoin doit regarder hors de `mine` : c'est tout D63, et une jointure sur la
 * seule CTE filtrée par `config_id = $1` ne pourrait jamais voir le succès
 * ailleurs (le cas « j'échoue sur X, je réussis sur Y » ne produirait aucun
 * témoin). La fenêtre est donc celle des dix minutes, tous nœuds confondus.
 *
 * Ordre des règles, il compte :
 * 1. `successes >= 3` → `healthy` (`reports`) : trois appareils qui passent
 *    valent mieux qu'un témoin isolé ;
 * 2. sinon `differential || doubters >= 3` → `down` (`witness` ou
 *    `reports:<n>`) ;
 * 3. sinon rien : un appareil seul qui échoue ne condamne pas un nœud, c'est
 *    le faux positif que D50 interdit.
 *
 * Retourne `null` quand aucun verdict n'est atteint, et `changed: false` quand
 * le verdict est atteint mais déjà écrit (aucune révision bumpée).
 */
export async function reconcileHealth(
  db: Queryable,
  configId: string,
  windowMinutes = HEALTH_WINDOW_MINUTES,
): Promise<HealthVerdict | null> {
  const row = await db.one<{
    successes: string | number;
    doubters: string | number;
    differential: boolean | string | number | null;
  }>(
    `WITH recent AS (
       SELECT device_id, config_id, ok
         FROM config_reports
        WHERE reported_at > now() - ($2::int * interval '1 minute')
     ), mine AS (
       SELECT device_id, ok FROM recent WHERE config_id = $1
     ), repeated_bad AS (
       SELECT device_id FROM mine WHERE NOT ok GROUP BY device_id HAVING count(*) >= $3
     ), witness AS (
       SELECT DISTINCT b.device_id
         FROM repeated_bad b
         JOIN recent g ON g.device_id = b.device_id AND g.ok AND g.config_id <> $1
     )
     SELECT (SELECT count(DISTINCT device_id) FROM mine WHERE ok)     AS successes,
            (SELECT count(DISTINCT device_id) FROM mine WHERE NOT ok) AS doubters,
            (SELECT count(*) FROM witness) > 0                        AS differential`,
    [configId, windowMinutes, WITNESS_FAILURES],
  );

  const successes = Number(row?.successes ?? 0);
  const doubters = Number(row?.doubters ?? 0);
  // `pg` rend un booléen ; certaines passerelles (PGlite, drivers texte) rendent
  // `'t'` ou `1`. Normaliser évite un verdict qui dépend du driver.
  const differential = row?.differential === true || row?.differential === "t" || row?.differential === 1;

  if (successes >= HEALTHY_QUORUM) {
    return { configId, health: "healthy", reason: "reports", changed: await setHealth(db, configId, "healthy", "reports") };
  }
  if (differential || doubters >= DOWN_QUORUM) {
    const reason = differential ? "witness" : `reports:${doubters}`;
    return { configId, health: "down", reason, changed: await setHealth(db, configId, "down", reason) };
  }
  return null;
}

/**
 * Re-vérifie les nœuds sur lesquels **cet** appareil accumule des échecs.
 *
 * Pourquoi ce second passage : `reconcileHealth(configId)` ne juge que le nœud
 * du rapport qu'on vient d'insérer. Or la preuve du témoin arrive souvent dans
 * le lot **suivant** — la sonde mesure `X` en échec, bascule, mesure `Y` en
 * succès vingt secondes plus tard. Sans ce balayage, `X` resterait `unknown`
 * jusqu'à ce que trois appareils le condamnent : exactement le trou que D63
 * ferme (au lancement, l'unique appareil doit pouvoir retirer un nœud mort).
 *
 * Une requête + un verdict par nœud concerné ; l'appelant ne le fait que si le
 * lot contenait au moins un succès, c'est-à-dire quand un témoin est possible.
 */
export async function reconcileDeviceWitnesses(
  db: Queryable,
  deviceId: string,
  windowMinutes = HEALTH_WINDOW_MINUTES,
): Promise<HealthVerdict[]> {
  const rows = await db.query<{ config_id: string }>(
    `SELECT config_id
       FROM config_reports
      WHERE device_id = $1
        AND NOT ok
        AND reported_at > now() - ($2::int * interval '1 minute')
      GROUP BY config_id
     HAVING count(*) >= $3`,
    [deviceId, windowMinutes, WITNESS_FAILURES],
  );

  const verdicts: HealthVerdict[] = [];
  for (const row of rows) {
    const verdict = await reconcileHealth(db, row.config_id, windowMinutes);
    if (verdict) verdicts.push(verdict);
  }
  return verdicts;
}
