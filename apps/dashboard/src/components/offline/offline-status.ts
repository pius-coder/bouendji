/**
 * État d'un fichier de secours, calculé côté affichage à partir de ce que l'API
 * renvoie réellement (`bundleState` : `notAfter`, `consumedAt`, `expired`).
 *
 * Ordre : « consommé » l'emporte sur « expiré » (un fichier utilisé puis périmé
 * reste « consommé »). Une échéance égale à maintenant reste valable, comme dans
 * l'API (`notAfter < now` = expiré).
 *
 * Fonction pure, sans import serveur : testée dans `test/offline.test.ts`.
 */
export type OfflineFileState = "valid" | "consumed" | "expired";

export interface OfflineFileFacts {
  notAfter: string;
  consumedAt: string | null;
}

export function offlineFileStatus(file: OfflineFileFacts, now: number = Date.now()): OfflineFileState {
  if (file.consumedAt) return "consumed";
  if (new Date(file.notAfter).getTime() < now) return "expired";
  return "valid";
}

/** Identifiant court affiché quand le nom de l'appareil n'est pas connu. */
export function shortId(id: string): string {
  return id.slice(0, 8);
}
