"use client";

import { Icon } from "./icon";
import { useQueryStates } from "nuqs";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLocalPreference } from "@/hooks/use-local-preference";
import { cn } from "@/lib/utils";
import { parseSort, type TableDefinition, type TableState } from "@/server/query/table";
import { ActionMenu, type MenuAction } from "./action-menu";
import { Button } from "./button";
import { ConfirmAlert } from "./confirm-alert";
import { NavBarButton } from "./nav-bar-button";
import { SearchField } from "./search-field";
import { SelectChip, type SelectOption } from "./select-field";
import { EmptyState } from "./states";

/* ------------------------------------------------------------------ types */

export interface DataColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Clé de tri déclarée dans `defineTable({ sortKeys })`. Sans elle, la colonne ne trie pas. */
  sortKey?: string;
  align?: "start" | "end";
  /** Largeur CSS (ex. `"9rem"`). */
  width?: string;
  /** `false` : toujours visible (identité de la ligne). */
  hideable?: boolean;
  /** Masquée tant que l'utilisateur ne l'affiche pas. */
  defaultHidden?: boolean;
  /** Rôle dans la ligne mobile. Défaut : absente du mobile. */
  mobile?: "title" | "subtitle" | "value" | "trailing";
  /** Valeur texte pour l'export CSV. Sans elle, la colonne n'est pas exportée. */
  exportValue?: (row: T) => string | number | null | undefined;
}

export interface TableFilter {
  /** Clé déclarée dans `defineTable({ filterKeys })`. */
  key: string;
  label: string;
  options: readonly SelectOption[];
}

export interface BulkAction {
  label: string;
  destructive?: boolean;
  /** Irréversible : confirmation avec ce titre (le nombre d'éléments est ajouté). */
  confirm?: { title: (count: number) => string; message?: string; confirmLabel: string };
  /** Retourne un message d'erreur, ou rien en cas de succès. */
  run: (ids: string[]) => Promise<string | void> | string | void;
}

export interface DataTableProps<T> {
  /** Définition d'URL de la table (`defineTable`), importée dans le module client du domaine. */
  table: TableDefinition;
  /** Lignes de la page courante, déjà filtrées/triées/paginées par le serveur. */
  rows: readonly T[];
  /** Total après filtres (toutes pages). */
  total: number;
  columns: readonly DataColumn<T>[];
  getRowId: (row: T) => string;
  /** Nom de la ligne pour le lecteur d'écran (case à cocher, ouverture). */
  rowLabel: (row: T) => string;
  /** Nom de la table (titre accessible, nom du fichier exporté). */
  label: string;
  rowActions?: (row: T) => MenuAction[];
  bulkActions?: readonly BulkAction[];
  filters?: readonly TableFilter[];
  searchPlaceholder?: string;
  /** Lignes exportées (défaut : le jeu filtré complet si fourni, sinon la page). */
  exportRows?: readonly T[];
  /** Vide premier usage (aucune donnée du tout). */
  empty: { title: string; description?: string; action?: ReactNode };
  /** Clé localStorage des préférences (colonnes, densité). */
  storageKey: string;
  /** Portée réelle du jeu (ex. « 100 derniers appareils renvoyés par l'API »). */
  scopeNote?: string;
  /** `false` : la ligne n'ouvre pas de détail. */
  openable?: boolean;
}

type Density = "comfortable" | "compact";

/* ------------------------------------------------------------- component */

/**
 * Table du kit (règles §6 + densité « Meta Business Suite » demandée) :
 * recherche, filtres en puces, tri par en-tête, colonnes affichables, densité,
 * sélection multiple + actions groupées, clic sur ligne = détail (`<prefix>_open`),
 * actions par ligne, pagination avec taille de page, export CSV.
 * L'état partageable vit dans l'URL (nuqs, `shallow: false` : le serveur relit et
 * renvoie la page) ; colonnes et densité sont des préférences locales.
 * < 768 px : liste groupée (titre, sous-titre, valeur, statut, chevron) ; la
 * sélection passe par le mode « Sélectionner » (HIG lists : édition avant sélection).
 */
export function DataTable<T>({
  table,
  rows,
  total,
  columns,
  getRowId,
  rowLabel,
  label,
  rowActions,
  bulkActions = [],
  filters = [],
  searchPlaceholder = "Rechercher",
  exportRows,
  empty,
  storageKey,
  scopeNote,
  openable = true,
}: DataTableProps<T>) {
  const [isPending, startTransition] = useTransition();
  const [rawState, setState] = useQueryStates(table.parsers, {
    urlKeys: table.urlKeys,
    shallow: false,
    history: "replace",
    clearOnDefault: true,
    scroll: false,
    startTransition,
  });
  const state = rawState as unknown as TableState;

  const [hiddenPref, setHiddenPref] = useLocalPreference<string[] | null>(`${storageKey}:hidden`, null);
  const [density, setDensity] = useLocalPreference<Density>(`${storageKey}:density`, "comfortable");
  const hidden = useMemo(
    () => new Set(hiddenPref ?? columns.filter((c) => c.defaultHidden).map((c) => c.id)),
    [hiddenPref, columns],
  );
  const visibleColumns = columns.filter((c) => c.hideable === false || !hidden.has(c.id));

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [pendingBulk, setPendingBulk] = useState<BulkAction | null>(null);
  const [bulkError, setBulkError] = useState<string>();
  const [bulkRunning, setBulkRunning] = useState(false);

  // Les lignes changent (page, filtre, tri) : la sélection ne porte que sur ce qui est affiché.
  const rowIds = rows.map(getRowId).join("|");
  const [selectionKey, setSelectionKey] = useState(rowIds);
  if (selectionKey !== rowIds) {
    setSelectionKey(rowIds);
    setSelected(new Set([...selected].filter((id) => rowIds.split("|").includes(id))));
  }

  const sort = parseSort(state.sort, table.config.sortKeys, table.config.defaultSort);
  const page = state.page;
  const size = state.size;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  const filtered = Boolean(state.q) || filters.some((f) => state[f.key]);
  const hasSelection = bulkActions.length > 0;
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(getRowId(r)));
  const someSelected = selected.size > 0;

  function update(patch: Record<string, string | number | null>) {
    void setState(patch as Parameters<typeof setState>[0]);
  }

  function toggleSort(key: string) {
    const nextDir = sort.key === key && sort.dir === "asc" ? "desc" : "asc";
    update({ sort: `${key}.${nextDir}`, page: null });
  }

  function toggleRow(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function open(row: T) {
    if (!openable) return;
    const id = getRowId(row);
    update({ open: state.open === id ? null : id });
  }

  function exportCsv() {
    const source = exportRows ?? rows;
    const cols = visibleColumns.filter((c) => c.exportValue);
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.map((c) => escape(c.header)).join(";"), ...source.map((r) => cols.map((c) => escape(c.exportValue!(r))).join(";"))];
    // BOM : Excel lit l'UTF-8 et les accents.
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${label.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function runBulk(action: BulkAction): Promise<boolean> {
    setBulkRunning(true);
    setBulkError(undefined);
    try {
      const error = await action.run([...selected]);
      if (error) {
        setBulkError(error);
        return false;
      }
      setSelected(new Set());
      setSelectMode(false);
      return true;
    } finally {
      setBulkRunning(false);
    }
  }

  const mobileTitle = columns.find((c) => c.mobile === "title") ?? columns[0];
  const mobileSubtitle = columns.find((c) => c.mobile === "subtitle");
  const mobileValue = columns.find((c) => c.mobile === "value");
  const mobileTrailing = columns.find((c) => c.mobile === "trailing");
  const rowHeight = density === "compact" ? "md:h-9" : "md:h-11";

  /* ---------------------------------------------------------- toolbar */
  const toolbar = (
    <div className="flex flex-col gap-2 px-0">
      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          value={state.q}
          onSearch={(q) => update({ q: q || null, page: null, open: null })}
          label={`Rechercher dans ${label.toLowerCase()}`}
          placeholder={searchPlaceholder}
          className="w-full md:w-72"
        />
        {filters.map((f) => (
          <FilterChip
            key={f.key}
            filter={f}
            value={String(state[f.key] ?? "")}
            onChange={(value) => update({ [f.key]: value || null, page: null, open: null })}
          />
        ))}
        {filtered ? (
          <Button
            variant="plain"
            size="sm"
            onClick={() => update({ q: null, page: null, open: null, ...Object.fromEntries(filters.map((f) => [f.key, null])) })}
          >
            Effacer les filtres
          </Button>
        ) : null}
        <div className="ms-auto flex items-center gap-1">
          {hasSelection ? (
            <Button
              variant={selectMode ? "tinted" : "plain"}
              size="sm"
              className="md:hidden"
              aria-pressed={selectMode}
              onClick={() => {
                setSelectMode((v) => !v);
                setSelected(new Set());
              }}
            >
              {selectMode ? "Terminé" : "Sélectionner"}
            </Button>
          ) : null}
          <ColumnsMenu columns={columns} hidden={hidden} onChange={(next) => setHiddenPref([...next])} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <NavBarButton label="Densité des lignes" className="hidden text-muted-foreground md:inline-flex">
                <Icon name="rows" />
              </NavBarButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48 rounded-[14px] p-1">
              <DropdownMenuLabel className="text-footnote font-normal text-muted-foreground">Densité</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={density} onValueChange={(v) => setDensity(v as Density)}>
                <DropdownMenuRadioItem value="comfortable" className="min-h-9 rounded-[10px]">
                  Confortable
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="compact" className="min-h-9 rounded-[10px]">
                  Compacte
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {columns.some((c) => c.exportValue) ? (
            <NavBarButton label="Exporter en CSV" className="text-muted-foreground" onClick={exportCsv} disabled={total === 0}>
              <Icon name="download" />
            </NavBarButton>
          ) : null}
        </div>
      </div>
      {someSelected ? (
        <div role="region" aria-label="Actions groupées" className="flex flex-wrap items-center gap-2 rounded-field bg-accent px-3 py-1.5">
          <span className="text-subhead font-semibold text-accent-foreground tabular-nums">
            {selected.size} sélectionné{selected.size > 1 ? "s" : ""}
          </span>
          <div className="ms-auto flex flex-wrap items-center gap-1">
            {bulkActions.map((action) => (
              <Button
                key={action.label}
                size="sm"
                variant={action.destructive ? "destructive-plain" : "plain"}
                onClick={() => (action.confirm ? setPendingBulk(action) : void runBulk(action))}
              >
                {action.label}
              </Button>
            ))}
            <NavBarButton label="Désélectionner tout" className="size-9" onClick={() => setSelected(new Set())}>
              <Icon name="close" />
            </NavBarButton>
          </div>
        </div>
      ) : null}
      {bulkError && !pendingBulk ? (
        <p role="alert" className="px-1 text-footnote text-destructive">
          {bulkError}
        </p>
      ) : null}
    </div>
  );

  /* ------------------------------------------------------------- body */
  const body =
    total === 0 ? (
      filtered ? (
        <EmptyState
          title="Aucun résultat"
          query={state.q || undefined}
          filtered
          description="Modifiez la recherche ou les filtres."
          action={
            <Button variant="tinted" onClick={() => update({ q: null, page: null, ...Object.fromEntries(filters.map((f) => [f.key, null])) })}>
              Effacer les filtres
            </Button>
          }
        />
      ) : (
        <EmptyState title={empty.title} description={empty.description} action={empty.action} />
      )
    ) : (
      <>
        {/* Desktop : table sobre, en-tête collant, filets horizontaux seulement. */}
        <div className="hidden overflow-hidden rounded-section bg-card md:block">
          <div className="max-h-[min(70vh,48rem)] overflow-auto overscroll-contain">
            <table aria-label={label} aria-busy={isPending || undefined} className="w-full border-separate border-spacing-0 text-subhead">
              <thead className="sticky top-0 z-10 bg-card">
                <tr>
                  {hasSelection ? (
                    <th scope="col" className="w-11 border-b border-separator ps-4">
                      <Checkbox
                        checked={allOnPageSelected ? true : someSelected ? "mixed" : false}
                        label="Sélectionner les lignes de la page"
                        onChange={() =>
                          setSelected(allOnPageSelected ? new Set() : new Set([...selected, ...rows.map(getRowId)]))
                        }
                      />
                    </th>
                  ) : null}
                  {visibleColumns.map((c) => {
                    const sorted = c.sortKey && sort.key === c.sortKey;
                    return (
                      <th
                        key={c.id}
                        scope="col"
                        style={c.width ? { width: c.width } : undefined}
                        aria-sort={sorted ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                        className={cn(
                          "h-10 border-b border-separator px-3 text-footnote font-semibold whitespace-nowrap text-muted-foreground first:ps-4",
                          c.align === "end" ? "text-end" : "text-start",
                        )}
                      >
                        {c.sortKey ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(c.sortKey!)}
                            className={cn(
                              "-mx-1.5 inline-flex h-8 items-center gap-1 rounded-md px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(hover:hover)]:hover:text-foreground",
                              sorted && "text-foreground",
                              c.align === "end" && "flex-row-reverse",
                            )}
                          >
                            {c.header}
                            {sorted ? (
                              sort.dir === "asc" ? (
                                <Icon name="arrow-up" className="size-3.5" />
                              ) : (
                                <Icon name="arrow-down" className="size-3.5" />
                              )
                            ) : (
                              <Icon name="sort" className="size-3.5 opacity-40" />
                            )}
                          </button>
                        ) : (
                          c.header
                        )}
                      </th>
                    );
                  })}
                  {rowActions ? (
                    <th scope="col" className="w-12 border-b border-separator pe-2">
                      <span className="sr-only">Actions</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody className={cn(isPending && "opacity-60 transition-opacity")}>
                {rows.map((row) => {
                  const id = getRowId(row);
                  const isOpen = state.open === id;
                  const isSelected = selected.has(id);
                  return (
                    <tr
                      key={id}
                      onClick={() => open(row)}
                      aria-selected={hasSelection ? isSelected : undefined}
                      className={cn(
                        "group/tr",
                        openable && "cursor-pointer",
                        isOpen ? "bg-accent" : isSelected ? "bg-accent/50" : "[@media(hover:hover)]:hover:bg-fill/60",
                      )}
                    >
                      {hasSelection ? (
                        <td className="border-b border-separator ps-4 group-last/tr:border-b-0" onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={isSelected} label={`Sélectionner ${rowLabel(row)}`} onChange={() => toggleRow(id)} />
                        </td>
                      ) : null}
                      {visibleColumns.map((c, index) => (
                        <td
                          key={c.id}
                          className={cn(
                            "border-b border-separator px-3 whitespace-nowrap text-foreground group-last/tr:border-b-0 first:ps-4",
                            rowHeight,
                            c.align === "end" ? "text-end tabular-nums" : "text-start",
                            "max-w-[22rem] truncate",
                          )}
                        >
                          {index === 0 && openable ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                open(row);
                              }}
                              aria-expanded={isOpen}
                              aria-label={`Ouvrir ${rowLabel(row)}`}
                              className="max-w-full truncate text-start font-medium outline-none focus-visible:underline focus-visible:decoration-2 focus-visible:underline-offset-4"
                            >
                              {c.cell(row)}
                            </button>
                          ) : (
                            c.cell(row)
                          )}
                        </td>
                      ))}
                      {rowActions ? (
                        <td className="border-b border-separator pe-2 text-end group-last/tr:border-b-0" onClick={(e) => e.stopPropagation()}>
                          <ActionMenu actions={rowActions(row)} label={`Actions pour ${rowLabel(row)}`} className="size-9" />
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile : liste groupée. */}
        <ul aria-label={label} aria-busy={isPending || undefined} className={cn("overflow-hidden rounded-section bg-card md:hidden", isPending && "opacity-60")}>
          {rows.map((row) => {
            const id = getRowId(row);
            const isSelected = selected.has(id);
            return (
              <li
                key={id}
                className="relative before:absolute before:inset-x-0 before:top-0 before:start-4 before:h-px before:bg-separator first:before:hidden"
              >
                <button
                  type="button"
                  onClick={() => (selectMode ? toggleRow(id) : open(row))}
                  aria-pressed={selectMode ? isSelected : undefined}
                  aria-label={selectMode ? `Sélectionner ${rowLabel(row)}` : undefined}
                  className={cn(
                    "flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-start outline-none active:bg-fill focus-visible:bg-accent",
                    state.open === id && "bg-accent",
                  )}
                >
                  {selectMode ? <CheckCircle checked={isSelected} /> : null}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body font-medium text-foreground">{mobileTitle.cell(row)}</span>
                    {mobileSubtitle ? <span className="truncate text-footnote text-muted-foreground">{mobileSubtitle.cell(row)}</span> : null}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-0.5">
                    {mobileValue ? <span className="text-body text-muted-foreground tabular-nums">{mobileValue.cell(row)}</span> : null}
                    {mobileTrailing ? <span>{mobileTrailing.cell(row)}</span> : null}
                  </span>
                  {!selectMode && openable ? <Icon name="chevron-right" className="size-4 shrink-0 text-muted-foreground/70" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      </>
    );

  /* ------------------------------------------------------- pagination */
  const footer =
    total > 0 ? (
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-footnote text-muted-foreground tabular-nums" aria-live="polite">
          {from}–{to} sur {total}
          {scopeNote ? ` · ${scopeNote}` : ""}
        </p>
        <div className="flex items-center gap-1">
          <span className="hidden text-footnote text-muted-foreground md:inline">Lignes par page</span>
          <SelectChip
            label="Lignes par page"
            value={String(size)}
            options={table.config.pageSizes.map((n) => ({ value: String(n), label: String(n) }))}
            onValueChange={(v) => update({ size: Number(v), page: null })}
          />
          <NavBarButton label="Page précédente" disabled={page <= 1} onClick={() => update({ page: page - 1 > 1 ? page - 1 : null })} className="disabled:opacity-30">
            <Icon name="chevron-left" className="rtl:rotate-180" />
          </NavBarButton>
          <span className="min-w-16 text-center text-footnote text-muted-foreground tabular-nums">
            {page} / {pageCount}
          </span>
          <NavBarButton label="Page suivante" disabled={page >= pageCount} onClick={() => update({ page: page + 1 })} className="disabled:opacity-30">
            <Icon name="chevron-right" className="rtl:rotate-180" />
          </NavBarButton>
        </div>
      </div>
    ) : scopeNote ? (
      <p className="px-1 text-footnote text-muted-foreground">{scopeNote}</p>
    ) : null;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {toolbar}
      {body}
      {footer}
      {pendingBulk?.confirm ? (
        <ConfirmAlert
          open
          onOpenChange={(next) => {
            if (!next) {
              setPendingBulk(null);
              setBulkError(undefined);
            }
          }}
          title={pendingBulk.confirm.title(selected.size)}
          message={pendingBulk.confirm.message}
          confirmLabel={pendingBulk.confirm.confirmLabel}
          destructive={pendingBulk.destructive}
          pending={bulkRunning}
          error={bulkError}
          onConfirm={async () => {
            const ok = await runBulk(pendingBulk);
            if (ok) setPendingBulk(null);
            return ok;
          }}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- pieces */

function FilterChip({ filter, value, onChange }: { filter: TableFilter; value: string; onChange: (v: string) => void }) {
  const current = filter.options.find((o) => o.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "inline-flex h-11 items-center gap-1 rounded-full px-3.5 text-subhead outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-8",
          current ? "bg-primary font-semibold text-primary-foreground" : "bg-fill text-foreground",
        )}
      >
        {current ? `${filter.label} : ${current.label}` : filter.label}
        <Icon name="sort" className="size-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-52 rounded-[14px] p-1">
        <DropdownMenuLabel className="text-footnote font-normal text-muted-foreground">{filter.label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          <DropdownMenuRadioItem value="" className="min-h-11 rounded-[10px] md:min-h-9">
            Tous
          </DropdownMenuRadioItem>
          {filter.options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value} className="min-h-11 rounded-[10px] md:min-h-9">
              {o.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ColumnsMenu<T>({
  columns,
  hidden,
  onChange,
}: {
  columns: readonly DataColumn<T>[];
  hidden: ReadonlySet<string>;
  onChange: (next: ReadonlySet<string>) => void;
}) {
  const hideable = columns.filter((c) => c.hideable !== false);
  if (hideable.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <NavBarButton label="Colonnes affichées" className="hidden text-muted-foreground md:inline-flex">
          <Icon name="columns" />
        </NavBarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52 rounded-[14px] p-1">
        <DropdownMenuLabel className="text-footnote font-normal text-muted-foreground">Colonnes</DropdownMenuLabel>
        {hideable.map((c) => (
          <DropdownMenuCheckboxItem
            key={c.id}
            checked={!hidden.has(c.id)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={(checked) => {
              const next = new Set(hidden);
              if (checked) next.delete(c.id);
              else next.add(c.id);
              onChange(next);
            }}
            className="min-h-9 rounded-[10px]"
          >
            {c.header}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={false}
          onSelect={() => onChange(new Set(columns.filter((c) => c.defaultHidden).map((c) => c.id)))}
          className="min-h-9 rounded-[10px] ps-2 text-accent-foreground"
        >
          Rétablir les colonnes
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Case native (clavier, lecteurs d'écran) habillée : cible 44 px via une zone élargie. */
function Checkbox({ checked, label, onChange }: { checked: boolean | "mixed"; label: string; onChange: () => void }) {
  return (
    <span className="relative inline-flex size-5 items-center justify-center">
      <input
        type="checkbox"
        aria-label={label}
        checked={checked === true}
        ref={(node) => {
          if (node) node.indeterminate = checked === "mixed";
        }}
        onChange={onChange}
        className="peer absolute -inset-3 z-10 cursor-pointer opacity-0"
      />
      <span
        aria-hidden
        className={cn(
          "flex size-5 items-center justify-center rounded-[6px] shadow-[inset_0_0_0_1.5px_var(--input)] peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
          checked && "bg-primary text-primary-foreground shadow-none",
        )}
      >
        {checked === "mixed" ? <span className="h-0.5 w-2.5 rounded bg-current" /> : null}
        {checked === true ? (
          <svg viewBox="0 0 12 12" className="size-3" aria-hidden>
            <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : null}
      </span>
    </span>
  );
}

function CheckCircle({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-full",
        checked ? "bg-primary text-primary-foreground" : "shadow-[inset_0_0_0_1.5px_var(--input)]",
      )}
    >
      {checked ? (
        <svg viewBox="0 0 12 12" className="size-3.5">
          <path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </span>
  );
}
