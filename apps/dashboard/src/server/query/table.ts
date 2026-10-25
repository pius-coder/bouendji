import type { UseQueryStatesKeysMap } from "nuqs";
import { createLoader, createSerializer, parseAsInteger, parseAsString } from "nuqs/server";

/**
 * Paramètres d'URL communs à TOUTES les tables (dashboard-architecture : nuqs,
 * un fichier de parseurs par table, préfixe de clé par table, défauts écrits une fois).
 * Une table déclare : son préfixe, ses clés de tri, ses filtres. Le même objet sert
 * au serveur (`load`, `serialize`) et au client (`parsers` + `urlKeys` dans `useQueryStates`).
 *
 * Fichier sans `server-only` : `nuqs/server` est importable des deux côtés (doc nuqs).
 */
export type SortDir = "asc" | "desc";

export interface TableConfig<S extends string, F extends string> {
  /** Préfixe d'URL, ex. `d` -> `d_q`, `d_sort`… Deux tables d'une page n'en partagent jamais. */
  prefix: string;
  sortKeys: readonly S[];
  defaultSort: { key: S; dir: SortDir };
  filterKeys?: readonly F[];
  pageSizes?: readonly number[];
  defaultPageSize?: number;
}

const stringParser = () => parseAsString.withDefault("");
type StringParser = ReturnType<typeof stringParser>;

export function defineTable<S extends string, F extends string = never>(config: TableConfig<S, F>) {
  const pageSizes = config.pageSizes ?? [10, 25, 50, 100];
  const defaultPageSize = config.defaultPageSize ?? 25;
  const filterKeys = (config.filterKeys ?? []) as readonly F[];
  const defaultSort = `${config.defaultSort.key}.${config.defaultSort.dir}`;

  const filterParsers = Object.fromEntries(filterKeys.map((k) => [k, stringParser()])) as Record<F, StringParser>;
  const parsers = {
    q: parseAsString.withDefault(""),
    sort: parseAsString.withDefault(defaultSort),
    page: parseAsInteger.withDefault(1),
    size: parseAsInteger.withDefault(defaultPageSize),
    open: parseAsString.withDefault(""),
    ...filterParsers,
  };
  const p = config.prefix;
  const urlKeys = {
    q: `${p}_q`,
    sort: `${p}_sort`,
    page: `${p}_page`,
    size: `${p}_size`,
    open: `${p}_open`,
    ...Object.fromEntries(filterKeys.map((k) => [k, `${p}_${k}`])),
  } as Record<keyof typeof parsers, string>;

  return {
    config: { ...config, pageSizes, defaultPageSize, filterKeys, defaultSortValue: defaultSort },
    parsers,
    urlKeys,
    load: createLoader(parsers, { urlKeys }),
    serialize: createSerializer(parsers, { urlKeys, clearOnDefault: true }),
  };
}

/** Forme minimale d’une table vue par le client (`DataTable`) : n’importe quel `defineTable` s’y conforme. */
export interface TableDefinition {
  config: {
    sortKeys: readonly string[];
    defaultSort: { key: string; dir: SortDir };
    pageSizes: readonly number[];
    defaultPageSize: number;
    filterKeys: readonly string[];
  };
  parsers: UseQueryStatesKeysMap;
  urlKeys: Partial<Record<string, string>>;
}
export type TableState = {
  q: string;
  sort: string;
  page: number;
  size: number;
  open: string;
} & Record<string, string | number>;

export function parseSort<S extends string>(value: string, keys: readonly S[], fallback: { key: S; dir: SortDir }) {
  const [key, dir] = value.split(".");
  if (keys.includes(key as S) && (dir === "asc" || dir === "desc")) return { key: key as S, dir: dir as SortDir };
  return fallback;
}

type SortValue = string | number | null | undefined;

export interface TableQueryOptions<T, S extends string, F extends string> {
  /** Texte cherché par `q` (insensible à la casse et aux accents). */
  search?: (row: T) => string;
  sort: Record<S, (row: T) => SortValue>;
  filters?: Record<F, (row: T, value: string) => boolean>;
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr");
const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

function compare(a: SortValue, b: SortValue): number {
  // Les valeurs absentes vont toujours à la fin, quel que soit le sens.
  if (a == null || a === "") return b == null || b === "" ? 0 : 1;
  if (b == null || b === "") return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

/**
 * Recherche, filtres, tri et pagination SUR LE SERVEUR NEXT (jamais dans le navigateur),
 * sur le jeu que l'API a renvoyé. L'API ne trie pas et plafonne ses listes (100 ou une page
 * à curseur) : la portée réelle est rendue par `scopeNote` côté page, pas cachée.
 */
export function applyTableQuery<T, S extends string, F extends string>(
  rows: readonly T[],
  table: { config: { sortKeys: readonly S[]; defaultSort: { key: S; dir: SortDir }; pageSizes: readonly number[]; defaultPageSize: number; filterKeys: readonly F[] } },
  state: { q: string; sort: string; page: number; size: number } & Partial<Record<F, string>>,
  options: TableQueryOptions<T, S, F>,
) {
  const { config } = table;
  const q = fold(state.q.trim());
  let result = rows.slice();
  if (q && options.search) result = result.filter((row) => fold(options.search!(row)).includes(q));
  for (const key of config.filterKeys) {
    const value = state[key];
    const predicate = options.filters?.[key];
    if (value && predicate) result = result.filter((row) => predicate(row, value));
  }
  const sort = parseSort(state.sort, config.sortKeys, config.defaultSort);
  const accessor = options.sort[sort.key];
  result.sort((a, b) => {
    const order = compare(accessor(a), accessor(b));
    const missing = accessor(a) == null || accessor(b) == null;
    return sort.dir === "asc" || missing ? order : -order;
  });

  const size = config.pageSizes.includes(state.size) ? state.size : config.defaultPageSize;
  const total = result.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const page = Math.min(Math.max(1, Math.trunc(state.page) || 1), pageCount);
  const start = (page - 1) * size;
  return { rows: result.slice(start, start + size), filtered: result, total, page, pageCount, size, sort };
}
