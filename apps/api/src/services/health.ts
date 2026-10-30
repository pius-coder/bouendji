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
import { escapeHtml, notifyRecipients, telegramEnabled } from "./telegram.js";

export type EndpointHealth = "unknown" | "healthy" | "degraded" | "down";

/** Fenêtre du verdict (§1.3) : dix minutes. */
export const HEALTH_WINDOW_MINUTES = 10;

/**
 * Une sonde serveur plus vieille que cette fenêtre n'est plus considérée comme
 * l'état courant : on retombe sur les rapports des téléphones.
 */
export const PROBE_WINDOW_MINUTES = 15;

/** Chemin 1 (§1.3) : trois appareils **distincts** en échec. */
export const DOWN_QUORUM = 3;

/** Retour : trois appareils distincts en succès. */
export const HEALTHY_QUORUM = 3;

/**
 * Probation d'un nœud `down` (audit R8, §6.3) : trois succès ne suffisent pas à
 * le remettre `healthy` directement. Il faut que `down_since` ait trente minutes,
 * le nœud passe alors `unknown` (de nouveau servi), et seul un quorum de succès
 * ultérieur le rend `healthy`. Même durée que `app.ts` (`down_since < now - 30 min`).
 */
export const PROBATION_MINUTES = 30;

/**
 * Chemin 2 (D63) : deux échecs sur ce nœud **et** un succès sur un autre nœud
 * dans la même fenêtre. Deux échecs, c'est ce que produit la bascule du client ;
 * le succès ailleurs est ce qui distingue un nœud mort d'un téléphone cassé.
 */
export const WITNESS_FAILURES = 2;

/** Entrée pure de la décision, séparée de la base pour être testée seule. */
export interface HealthInput {
  successes: number;
  doubters: number;
  differential: boolean;
  current: EndpointHealth;
  downSince: Date | null;
  now: Date;
}

/**
 * Décide le verdict, sans rien écrire. `null` = pas de verdict.
 *
 * Règle nouvelle : un nœud `down` ne passe jamais directement à `healthy`.
 * Pendant la probation il reste `down` (`null`) ; une fois la probation écoulée
 * et le quorum de succès atteint, il passe `unknown` (reason `probation`), puis
 * le prochain quorum le rend `healthy`.
 */
export function decideHealth(input: HealthInput): { health: EndpointHealth; reason: string } | null {
  if (input.successes >= HEALTHY_QUORUM) {
    if (input.current === "down") {
      const since = input.downSince ? new Date(input.downSince).getTime() : null;
      const probationOver = since !== null && input.now.getTime() - since >= PROBATION_MINUTES * 60_000;
      return probationOver ? { health: "unknown", reason: "probation" } : null;
    }
    return { health: "healthy", reason: "reports" };
  }
  if (input.differential || input.doubters >= DOWN_QUORUM) {
    const reason = input.differential ? "witness" : `reports:${input.doubters}`;
    return { health: "down", reason };
  }
  return null;
}

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
  // Alerte seulement : aucun retrait automatique du nœud. L'envoi est
  // volontairement détaché du verdict pour qu'un Telegram lent ou coupé ne
  // retarde jamais la télémétrie.
  void alertTransition(db, endpointId, health, reason);
  return true;
}

/** Traduction courte d'une raison technique pour le bot. */
export function healthReasonLabel(reason: string | null): string {
  if (!reason) return "état inchangé";
  if (reason === "probe") return "sonde serveur : point d'entrée injoignable";
  if (reason === "probe:clients") return "sonde serveur OK, mais plusieurs téléphones échouent";
  if (reason === "probation") return "fin de probation";
  if (reason === "witness") return "témoin différentiel : un téléphone échoue ici et réussit ailleurs";
  if (reason === "manual") return "forçage manuel depuis le dashboard";
  const m = /^reports:(\d+)$/.exec(reason);
  if (m) return `${m[1]} téléphone(s) en échec sur ce nœud`;
  return reason;
}

const HEALTH_LABEL: Record<EndpointHealth, string> = {
  healthy: "EN SERVICE",
  degraded: "DÉGRADÉ",
  down: "HORS SERVICE",
  unknown: "NON MESURÉ",
};

/**
 * Prévient les destinataires Telegram à chaque transition. Ne lève jamais :
 * une alerte ne doit pas casser le chemin de télémétrie.
 */
async function alertTransition(
  db: Queryable,
  endpointId: string,
  health: EndpointHealth,
  reason: string | null,
): Promise<void> {
  try {
    if (!telegramEnabled() || health === "unknown") return;
    const row = await db.one<{ label: string }>(
      "SELECT label FROM endpoints WHERE id = $1",
      [endpointId],
    );
    if (!row) return;
    await notifyRecipients(
      db,
      [
        `<b>${escapeHtml(String(row.label))} : ${HEALTH_LABEL[health]}</b>`,
        "",
        escapeHtml(healthReasonLabel(reason)),
        "",
        "Le nœud reste servi : aucun retrait automatique, alerte uniquement.",
      ].join("\n"),
    );
  } catch {
    // Silencieux par contrat.
  }
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
 * 1. `successes >= 3` → `healthy` (`reports`), sauf pour un nœud `down` : il
 *    passe d'abord `unknown` (probation, §6.3) une fois ses 30 min écoulées ;
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
    current_health: EndpointHealth | null;
    down_since: Date | string | null;
    probe_ok: boolean | string | number | null;
    probed_at: Date | string | null;
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
            (SELECT count(*) FROM witness) > 0                        AS differential,
            (SELECT health FROM endpoints WHERE id = $1)              AS current_health,
            (SELECT down_since FROM endpoints WHERE id = $1)          AS down_since,
            (SELECT probe_ok FROM endpoints WHERE id = $1)            AS probe_ok,
            (SELECT probed_at FROM endpoints WHERE id = $1)           AS probed_at`,
    [configId, windowMinutes, WITNESS_FAILURES],
  );

  const successes = Number(row?.successes ?? 0);
  const doubters = Number(row?.doubters ?? 0);
  // `pg` rend un booléen ; certaines passerelles (PGlite, drivers texte) rendent
  // `'t'` ou `1`. Normaliser évite un verdict qui dépend du driver.
  const differential = row?.differential === true || row?.differential === "t" || row?.differential === 1;

  // Sonde serveur fraîche : elle tranche la joignabilité. Les téléphones ne
  // peuvent plus condamner un nœud que le serveur vient de joindre ; au pire
  // ils le classent « dégradé ».
  const probeOk = row?.probe_ok === true || row?.probe_ok === "t" || row?.probe_ok === 1;
  const probedAt = row?.probed_at ? new Date(row.probed_at).getTime() : null;
  const probeFresh = probedAt !== null && Date.now() - probedAt <= PROBE_WINDOW_MINUTES * 60_000;

  const decision = probeFresh
    ? !probeOk
      ? { health: "down" as const, reason: "probe" }
      : differential || doubters >= DOWN_QUORUM
        ? { health: "degraded" as const, reason: "probe:clients" }
        : { health: "healthy" as const, reason: "probe" }
    : decideHealth({
        successes,
        doubters,
        differential,
        current: (row?.current_health as EndpointHealth | null) ?? "unknown",
        downSince: row?.down_since ? new Date(row.down_since) : null,
        now: new Date(),
      });
  if (!decision) return null;
  return {
    configId,
    health: decision.health,
    reason: decision.reason,
    changed: await setHealth(db, configId, decision.health, decision.reason),
  };
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
