"use client";

/**
 * Téléchargement d'un objet déjà en mémoire. Aucun réseau : le fichier est créé
 * par `Blob` puis `URL.createObjectURL`, donc il ne transite jamais par une URL
 * (le jeton n'apparaît ni dans l'historique, ni dans un journal serveur).
 */
export function downloadJson(filename: string, data: unknown): boolean {
  try {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename || "bundle.json";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

export function bundleFilename(deviceName: string, bundleId: string): string {
  const safeDevice = (deviceName || "appareil").replace(/[^A-Za-z0-9_-]+/g, "-");
  const safeId = (bundleId || "bundle").replace(/[^A-Za-z0-9_-]+/g, "-");
  return `vpn-${safeDevice}-${safeId}.json`;
}
