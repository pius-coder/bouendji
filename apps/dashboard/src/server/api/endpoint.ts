import type { z, ZodTypeAny } from "zod";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/**
 * Déclaration d'un endpoint : un chemin RELATIF au `basePath` du service et un
 * objet d'options. Aucun en-tête, aucun fetch : le process générique
 * `BaseService.call` s'en charge.
 */
export interface Endpoint<
  P extends ZodTypeAny | undefined = ZodTypeAny | undefined,
  Q extends ZodTypeAny | undefined = ZodTypeAny | undefined,
  B extends ZodTypeAny | undefined = ZodTypeAny | undefined,
  R extends ZodTypeAny | undefined = ZodTypeAny | undefined,
> {
  method: HttpMethod;
  /** Relatif au basePath, ex. `"/:communityId/memberships"`. `"/"` = le basePath lui-même. */
  path: string;
  /**
   * Autre dossier de l'API pour ce seul endpoint (ex. `/v1/admin/devices`), quand
   * la route ne vit pas sous le basePath du service. Le `path` reste relatif.
   */
  basePath?: string;
  /** `true` : X-Access-Key + Bearer de session. `"key"` : clé seule. `false` : rien. Défaut : celui du service. */
  admin?: boolean | "key";
  /** Valide `:param` du chemin avant envoi. */
  params?: P;
  /** Valide la query string avant envoi. */
  query?: Q;
  /** Valide le corps avant envoi : rien ne part vers l'API s'il est invalide. */
  body?: B;
  /** Valide la réponse ; sinon `BAD_RESPONSE`. */
  response?: R;
  paginate?: "cursor";
  /** Envoie `Idempotency-Key`. */
  idempotent?: boolean;
  timeout?: number;
  /** Secondes de cache Next. Interdit avec `admin` : pas de cache sur les données admin. */
  revalidate?: number;
  cacheTags?: string[];
  /** Mutation : une fois réussie, demande à Next de relire les données (`refresh()`). */
  refreshAfter?: boolean;
}

/** Identité typée : fait inférer les schémas. */
export function endpoint<
  P extends ZodTypeAny | undefined = undefined,
  Q extends ZodTypeAny | undefined = undefined,
  B extends ZodTypeAny | undefined = undefined,
  R extends ZodTypeAny | undefined = undefined,
>(def: Endpoint<P, Q, B, R>): Endpoint<P, Q, B, R> {
  return def;
}

type In<S> = S extends ZodTypeAny ? z.input<S> : never;
type Out<S> = S extends ZodTypeAny ? z.output<S> : unknown;

export type CallInput<E> = E extends Endpoint<infer P, infer Q, infer B, ZodTypeAny | undefined>
  ? (P extends ZodTypeAny ? { params: In<P> } : object) &
      (Q extends ZodTypeAny ? { query?: In<Q> } : object) &
      (B extends ZodTypeAny ? { body: In<B> } : object) & {
        idempotencyKey?: string;
        signal?: AbortSignal;
      }
  : never;

export type CallResult<E> = E extends Endpoint<ZodTypeAny | undefined, ZodTypeAny | undefined, ZodTypeAny | undefined, infer R>
  ? R extends ZodTypeAny
    ? Out<R>
    : void
  : never;
