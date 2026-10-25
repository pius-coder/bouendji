import "server-only";
import { redirect } from "next/navigation";
import { ZodError } from "zod";
import { ApiError, type ActionFailure } from "@/server/api/api-error";

export type ActionResult<T = void> = ({ ok: true } & (T extends void ? object : { data: T })) | ActionFailure;

/**
 * Exécute le corps d'une Server Action et convertit `ApiError` en résultat
 * sérialisable. Un 401 renvoie vers /login (le cookie périmé reste, mais le
 * proxy ne le contrôle que pour sa présence et /login est toujours atteignable).
 * Toute autre erreur (bug) remonte à `error.tsx`.
 */
export async function runAction<T>(body: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await body();
    return (data === undefined ? { ok: true } : { ok: true, data }) as ActionResult<T>;
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.isUnauthenticated) redirect("/login");
      return err.toResult();
    }
    // Entrée client invalide, rejouée côté serveur : erreurs par champ, comme celles de l'API.
    if (err instanceof ZodError) {
      const details: Record<string, string> = {};
      for (const issue of err.issues) details[issue.path.join(".") || "_"] ??= issue.message;
      return { ok: false, code: "VALIDATION_FAILED", message: "Données invalides.", details } as ActionResult<T>;
    }
    throw err;
  }
}

/** Chemin de retour interne uniquement : refuse `//host`, `http://...`, `\`. */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string") return "/";
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/";
}

export function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}
