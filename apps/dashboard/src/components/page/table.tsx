import type { Key, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Tableau Chariow, 100 % serveur. L'en-tête vient de colonnes STATIQUES et se rend
 * tout de suite ; seules les lignes passent dans un Suspense (D104) :
 *
 *   <TableCard label="Commandes" columns={ORDER_COLUMNS}>
 *     <Suspense fallback={<TableRowsSkeleton columns={ORDER_COLUMNS} />}>
 *       <OrdersRows … />   // rend <TableRows> ou <TableEmpty>
 *     </Suspense>
 *   </TableCard>
 *
 * Mobile (< 768 px) : chaque ligne devient une cellule de liste — `primary` à
 * gauche, `trailing` à droite, `secondary` dessous, `hidden` masquée.
 */
export interface TableColumn {
  id: string;
  header: string;
  align?: "right";
  mobile?: "primary" | "secondary" | "trailing" | "hidden";
  /** Colonne secondaire : affichée seulement à partir de 1280 px (évite le défilement horizontal). */
  wide?: boolean;
}

const CELL_MOBILE: Record<NonNullable<TableColumn["mobile"]>, string> = {
  primary: "min-w-0 flex-1",
  trailing: "shrink-0",
  secondary: "order-last basis-full text-footnote text-muted-foreground",
  hidden: "hidden",
};

function cellClass(c: TableColumn) {
  return cn(
    CELL_MOBILE[c.mobile ?? "hidden"],
    "md:table-cell md:px-4 md:py-3 md:align-middle md:text-subhead md:text-foreground",
    c.mobile !== "primary" && "md:whitespace-nowrap",
    c.align === "right" && "md:text-right md:tabular-nums",
    c.wide && "md:hidden xl:table-cell",
  );
}

/**
 * Pas de carte (Chariow) : le tableau est posé sur la surface, lignes séparées par
 * un filet #e5e7e8 ; l'en-tête colle sous la barre d'outils (`stickyTop`, px).
 */
export function TableCard({
  label,
  columns,
  children,
  footer,
  stickyTop = 0,
}: {
  label: string;
  columns: readonly TableColumn[];
  children: ReactNode;
  footer?: ReactNode;
  stickyTop?: number;
}) {
  return (
    <div className="flex flex-col">
      <div className="overflow-x-auto">
        <table aria-label={label} className="w-full border-collapse text-start">
          <thead className="sticky z-10 hidden bg-surface shadow-[inset_0_-1px_0_var(--border)] md:table-header-group" style={{ top: stickyTop }}>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className={cn(
                    "px-4 py-3 text-start text-footnote font-semibold whitespace-nowrap text-muted-foreground",
                    c.align === "right" && "text-end",
                    c.wide && "hidden xl:table-cell",
                  )}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&>tr]:border-b [&>tr]:border-border">{children}</tbody>
        </table>
      </div>
      {footer ? <div className="flex flex-wrap items-center justify-between gap-2 px-1 py-4">{footer}</div> : null}
    </div>
  );
}

const ROW = "flex flex-wrap items-center gap-x-3 gap-y-1 px-1 py-3 transition-colors hover:bg-group md:table-row md:h-[57px] md:p-0";

/** Lignes : `cells(row)` rend chaque colonne par son `id`. */
export function TableRows<T>({
  rows,
  columns,
  getKey,
  cells,
}: {
  rows: readonly T[];
  columns: readonly TableColumn[];
  getKey: (row: T) => Key;
  cells: (row: T) => Record<string, ReactNode>;
}) {
  return (
    <>
      {rows.map((row) => {
        const values = cells(row);
        return (
          <tr key={getKey(row)} className={ROW}>
            {columns.map((c) => (
              <td key={c.id} className={cellClass(c)}>
                {values[c.id] ?? null}
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}

/** Ligne unique pleine largeur : état vide, refus, erreur. */
export function TableMessage({ columns, children }: { columns: readonly TableColumn[]; children: ReactNode }) {
  return (
    <tr className="block md:table-row">
      <td colSpan={columns.length} className="block py-4 md:table-cell">
        {children}
      </td>
    </tr>
  );
}

/** Squelette de lignes, à la géométrie des vraies lignes. */
export function TableRowsSkeleton({ columns, rows = 6 }: { columns: readonly TableColumn[]; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} aria-hidden className={ROW}>
          {columns.map((c) => (
            <td key={c.id} className={cellClass(c)}>
              <span className={cn("block h-4 animate-pulse rounded-md bg-group-strong", c.mobile === "primary" ? "w-40" : "w-20", c.align === "right" && "md:ms-auto")} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Texte sur deux niveaux dans une cellule (nom + e-mail, produit + prix). */
export function CellStack({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate text-subhead font-medium text-foreground">{title}</span>
      {subtitle ? <span className="truncate text-footnote text-muted-foreground">{subtitle}</span> : null}
    </span>
  );
}

/** Avatar à initiales (Chariow : rond gris). */
export function Initials({ name }: { name: string }) {
  const text =
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";
  return (
    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-group-strong text-footnote font-semibold text-foreground">
      {text}
    </span>
  );
}
