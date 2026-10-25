import "server-only";

/**
 * Variables d'environnement serveur. Aucune n'a le préfixe `NEXT_PUBLIC_` :
 * elles ne peuvent donc pas être inlinées dans le JavaScript du navigateur.
 * Lues paresseusement pour que `next build` ne casse pas sans secrets.
 */
export interface ServerConfig {
  apiBaseUrl: string;
  accessKey: string;
}

export function readServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const apiBaseUrl = env.API_BASE_URL?.trim().replace(/\/+$/, "");
  const accessKey = env.DASHBOARD_ACCESS_KEY?.trim();
  const missing = [!apiBaseUrl && "API_BASE_URL", !accessKey && "DASHBOARD_ACCESS_KEY"].filter(Boolean);
  if (missing.length > 0 || !apiBaseUrl || !accessKey) {
    throw new Error(`Configuration serveur incomplète : ${missing.join(", ")}.`);
  }
  return { apiBaseUrl, accessKey };
}
