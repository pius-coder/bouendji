/**
 * Pages de téléchargement publiques d'une marque (2026-10-30).
 *
 * Le Worker `cleanforce-plus` sert `https://<slug>.cleanforceplus.online` : la
 * page lit le catalogue de l'API et propose toujours la dernière version
 * publiée. C'est **ce lien** que l'on partage, jamais l'URL brute de l'APK :
 * elle change à chaque build et expose le stockage R2.
 *
 * Un slug absent ou invalide ne produit aucun lien : mieux vaut ne rien
 * afficher qu'un sous-domaine qui répond 404.
 */
import { env } from "../config.js";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function downloadPageUrl(slug: string | null | undefined): string | null {
  const value = String(slug ?? "").trim().toLowerCase();
  if (!SLUG.test(value)) return null;
  return `https://${value}.${env.downloadPages.domain}`;
}
