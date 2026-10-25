import { connection } from "next/server";
import { formatTime } from "@/lib/format";

/**
 * « À jour à 14:32 UTC ». Composant serveur ASYNC : l'heure est lue après
 * `connection()` (Cache Components : jamais d'heure courante au prérendu, doc
 * « blocking-prerender-current-time »). À placer dans la frontière Suspense du bloc,
 * après la lecture des données qu'il date. Pas de cache : donnée admin.
 */
export async function UpdatedAt({ scope }: { scope?: string }) {
  await connection();
  const at = new Date();
  return (
    <p className="text-footnote text-muted-foreground">
      {scope ? `${scope} · ` : ""}à jour à {formatTime(at)}
    </p>
  );
}
