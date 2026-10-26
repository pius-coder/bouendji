import "server-only";
import { z } from "zod";
import { BaseService } from "@/server/api/base-service";
import { endpoint } from "@/server/api/endpoint";

/**
 * Lecture relayée par le BFF. Passe par `BaseService.call` comme tous les services :
 * X-Access-Key et Bearer de session ajoutés côté serveur, réponse en `no-store`.
 * Le chemin vient de la liste blanche (`lib/bff-allowlist.ts`), jamais du navigateur brut.
 */
export class BffReadService extends BaseService {
  constructor(deps: ConstructorParameters<typeof BaseService>[0]) {
    super(deps, { basePath: "" });
  }

  read(path: string, query: Record<string, string>): Promise<unknown> {
    const ep = endpoint({ method: "GET", path, basePath: "", response: z.unknown() });
    return this.call(ep, { query } as never) as Promise<unknown>;
  }
}
