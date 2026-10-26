/**
 * Fichier de secours hors-ligne — moitié serveur.
 *
 * Le contrat est écrit **côté Android** (`OfflineBundle.kt`, conteneur v1) :
 * c'est lui qui vérifie, donc c'est lui qui fait foi. Ce module doit produire
 * exactement ce qu'il attend, sinon l'import échoue au premier contrôle.
 *
 *   1. la liste est scellée pour la clé ACORD de l'appareil (ECDH → HKDF → AES-GCM) ;
 *   2. le conteneur est signé en Ed25519 sur une chaîne textuelle, pour ne
 *      dépendre d'aucune canonicalisation JSON ;
 *   3. `not_after` est court : un fichier qui traîne dans une conversation ne
 *      doit pas rester utilisable une semaine.
 *
 * Ce que ce module ne fait pas, et ne prétend pas faire : supprimer le fichier
 * chez l'utilisateur. La protection réelle est la signature, le chiffrement par
 * appareil, l'usage unique et la mort des UUID contenus.
 */
import { createPrivateKey, sign } from "node:crypto";
import { env } from "../config.js";
import type { Database, Queryable, Row } from "../db.js";
import { newId, sealForDevice, sha256Hex, type SealedEnvelope } from "../lib/crypto.js";
import { fail } from "../lib/errors.js";
import { loadEntitlement } from "../routes/me.js";
import { endpointToConfig, poolRevision, servedEndpoints } from "./endpoints.js";
import {
  latestLimitedSubscription,
  loadLimitedSubscription,
  nightRowsFor,
  xuiLeadConfig,
} from "./xui.js";

const PREFIX = "vpn-offline-v1";

/** Les six clés du fichier, dans l'ordre. L'app les nomme à l'identique. */
export interface OfflineFile {
  v: 1;
  bundleId: string;
  deviceId: string;
  issuedAt: string;
  notAfter: string;
  revision: number;
  envelope: SealedEnvelope;
  sig: string;
}

/**
 * Chaîne signée. Toute divergence avec `OfflineBundle.kt` rend le fichier
 * inutilisable : elle est donc reproduite ici à la lettre, commentaire compris.
 */
export function offlineSignedMessage(input: {
  v: number;
  bundleId: string;
  deviceId: string;
  issuedAt: string;
  notAfter: string;
  revision: number;
  envelope: SealedEnvelope;
}): string {
  const envelopeDigest = sha256Hex(
    [
      input.envelope.ephemeralKey,
      input.envelope.salt,
      input.envelope.iv,
      input.envelope.ciphertext,
      input.envelope.tag,
    ].join("|"),
  );
  return [
    PREFIX,
    String(input.v),
    input.bundleId,
    input.deviceId,
    input.issuedAt,
    input.notAfter,
    String(input.revision),
    envelopeDigest,
  ].join("\n");
}

function signingKey() {
  if (!env.offline.signingKey) {
    throw fail.conflict(
      "La signature hors-ligne n'est pas configurée (OFFLINE_BUNDLE_SIGNING_KEY). Aucun fichier ne peut être émis.",
    );
  }
  try {
    return createPrivateKey({
      key: Buffer.from(env.offline.signingKey, "base64"),
      format: "der",
      type: "pkcs8",
    });
  } catch {
    throw fail.conflict("OFFLINE_BUNDLE_SIGNING_KEY n'est pas une clé Ed25519 PKCS#8 en base64.");
  }
}

/** Ed25519 brut : `sign(null, …)`, pas de prédigest. */
export function signOfflineMessage(message: string): string {
  return sign(null, Buffer.from(message, "utf8"), signingKey()).toString("base64");
}

export interface IssueInput {
  deviceId: string;
  userId: string;
  createdBy: string | null;
  ttlMinutes?: number;
}

/**
 * Émet un fichier pour un appareil **déjà enrôlé**. Le cas « appareil inconnu »
 * demande d'abord un échange de clé publique : il n'a pas sa place ici.
 */
export async function issueOfflineBundle(
  db: Database,
  input: IssueInput,
): Promise<{ file: OfflineFile; endpointCount: number; notAfter: string }> {
  const device = await db.one<Row>(
    "SELECT id, user_id, agreement_key, status FROM devices WHERE id = $1",
    [input.deviceId],
  );
  if (!device) throw fail.notFound("Appareil inconnu.");
  if (device.user_id !== input.userId) throw fail.forbidden("Cet appareil n'appartient pas à cet utilisateur.");
  if (device.status === "revoked") throw fail.deviceRevoked();

  /*
   * Forfait limité : le fichier porte le client 3x-ui dédié (et les nœuds de nuit
   * de la plage achetée), jamais le pool partagé. Abonnement limité épuisé ou
   * expiré : rien à émettre.
   */
  const { subscription, entitlement } = await loadEntitlement(db, input.userId);
  const limited =
    entitlement.active && subscription
      ? await loadLimitedSubscription(db, subscription.id)
      : await latestLimitedSubscription(db, input.userId);
  if (limited && (!entitlement.active || limited.exhausted)) {
    throw fail.conflict("Abonnement limité épuisé ou expiré : aucun fichier hors-ligne.");
  }
  const lead = limited ? await xuiLeadConfig(db, limited) : null;
  if (limited && !lead) throw fail.conflict("Le client de cet abonnement n'est pas encore prêt côté serveur.");
  const night =
    limited?.family === "limited_night" && limited.nightWindow
      ? await nightRowsFor(db, limited.nightWindow, env.ingest.drainLeadSeconds)
      : null;
  const rows = limited ? (night?.rows ?? []) : await servedEndpoints(db, entitlement.endpointTier);
  if (!lead && rows.length === 0) {
    throw fail.conflict("Aucun nœud actif : un fichier hors-ligne ne servirait à rien.");
  }

  const revision = await poolRevision(db);
  const maxSessionSeconds = env.ingest.reconnectAfterSeconds;
  const configs = [
    ...(lead ? [{ ...lead, maxSessionSeconds }] : []),
    ...rows.map((row) => {
      const config = endpointToConfig(row);
      const startsAt = night?.startsAt.get(row.id);
      return {
        id: config.id,
        label: config.label,
        uri: config.uri,
        expiresAt: config.expiresAt,
        region: config.region,
        maxSessionSeconds,
        // Présent seulement sur les nœuds de nuit : même règle que le bundle.
        ...(startsAt ? { startsAt } : {}),
      };
    }),
  ];

  const now = new Date();
  const ttl = Math.max(5, Math.min(input.ttlMinutes ?? env.offline.ttlMinutes, 24 * 60));
  // Un fichier ne survit jamais à la fin des droits (D115 : la plage achetée).
  let notAfter = new Date(now.getTime() + ttl * 60_000);
  if (entitlement.active && entitlement.endsAt) {
    const endsAt = new Date(entitlement.endsAt);
    if (endsAt.getTime() < notAfter.getTime()) notAfter = endsAt;
  }
  if (notAfter.getTime() <= now.getTime()) {
    throw fail.conflict("L'abonnement se termine trop tôt pour un fichier hors-ligne.");
  }
  const bundleId = newId();
  const issuedAt = now.toISOString();

  // Clés exactement celles de `BundlePayload` côté Kotlin : l'app refuse un
  // champ inconnu (`ignoreUnknownKeys = false`).
  const plaintext = JSON.stringify({
    revision,
    issuedAt,
    expiresAt: notAfter.toISOString(),
    configs,
  });

  const envelope = sealForDevice(device.agreement_key as string, plaintext, {
    deviceId: input.deviceId,
    revision,
  });
  const sig = signOfflineMessage(
    offlineSignedMessage({
      v: 1,
      bundleId,
      deviceId: input.deviceId,
      issuedAt,
      notAfter: notAfter.toISOString(),
      revision,
      envelope,
    }),
  );

  await db.query(
    `INSERT INTO offline_bundles (id, device_id, user_id, created_by, not_after)
     VALUES ($1, $2, $3, $4, $5)`,
    [bundleId, input.deviceId, input.userId, input.createdBy, notAfter],
  );

  return {
    file: {
      v: 1,
      bundleId,
      deviceId: input.deviceId,
      issuedAt,
      notAfter: notAfter.toISOString(),
      revision,
      envelope,
      sig,
    },
    endpointCount: configs.length,
    notAfter: notAfter.toISOString(),
  };
}

export async function loadOfflineBundle(db: Queryable, bundleId: string): Promise<Row | null> {
  return db.one<Row>("SELECT * FROM offline_bundles WHERE id = $1", [bundleId]);
}

/**
 * Le serveur note la consommation, mais il ne peut pas l'imposer : l'app a déjà
 * le fichier. Il peut seulement refuser de le réémettre.
 */
export async function markConsumed(
  db: Database,
  bundleId: string,
  deviceId: string,
): Promise<{ consumedAt: string }> {
  const row = await loadOfflineBundle(db, bundleId);
  if (!row) throw fail.notFound("Bundle inconnu.");
  if (row.device_id !== deviceId) throw fail.forbidden("Ce bundle appartient à un autre appareil.");
  if (row.consumed_at) return { consumedAt: new Date(row.consumed_at as string).toISOString() };
  if (new Date(row.not_after as string).getTime() < Date.now()) {
    throw fail.conflict("Ce bundle a expiré : il n'a pas pu être consommé dans les délais.");
  }
  await db.query("UPDATE offline_bundles SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL", [
    row.id,
  ]);
  return { consumedAt: new Date().toISOString() };
}

/** Vue admin : jamais de contenu, seulement l'état. */
export function bundleState(row: Row): {
  id: string;
  deviceId: string;
  userId: string;
  notAfter: string;
  consumedAt: string | null;
  expired: boolean;
} {
  const notAfter = new Date(row.not_after as string);
  return {
    id: row.id as string,
    deviceId: row.device_id as string,
    userId: row.user_id as string,
    notAfter: notAfter.toISOString(),
    consumedAt: row.consumed_at ? new Date(row.consumed_at as string).toISOString() : null,
    expired: notAfter.getTime() < Date.now(),
  };
}
