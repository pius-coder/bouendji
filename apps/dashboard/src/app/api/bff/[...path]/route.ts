import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { bffQuery, bffTargetPath } from "@/lib/bff-allowlist";
import { ApiError } from "@/server/api/api-error";
import { readServerConfig } from "@/server/api/config";
import { readSessionToken } from "@/server/api/session";
import { BffReadService } from "./bff-read.service";

/**
 * BFF de LECTURE du dashboard (lot R2). Le navigateur appelle `/api/bff/v1/admin/...` ;
 * ce gestionnaire relaie seulement les GET de la liste blanche, avec le jeton de session
 * et la clé d'accès ajoutés côté serveur. Aucune mutation : elles restent des Server Actions.
 */
type Params = { params: Promise<{ path: string[] }> };

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest, { params }: Params) {
  // Requête issue d'une autre origine : refus (le cookie de session ne doit pas servir à un tiers).
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return error(403, "FORBIDDEN", "Requête d'une autre origine refusée.");
  }

  const { path } = await params;
  const target = bffTargetPath(path);
  if (!target) return error(404, "NOT_FOUND", "Ressource inconnue.");

  try {
    const config = readServerConfig();
    const service = new BffReadService({
      baseUrl: config.apiBaseUrl,
      accessKey: config.accessKey,
      getToken: readSessionToken,
    });
    const data = await service.read(target, bffQuery(request.nextUrl.searchParams));
    return NextResponse.json(data ?? null, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof ApiError) {
      const status = err.status === 0 ? 503 : err.status;
      const headers: Record<string, string> = { ...NO_STORE };
      if (err.retryAfter !== undefined) headers["Retry-After"] = String(err.retryAfter);
      return NextResponse.json({ error: { code: err.code, message: err.message } }, { status, headers });
    }
    return error(500, "INTERNAL", "Erreur serveur.");
  }
}

function error(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: NO_STORE });
}
