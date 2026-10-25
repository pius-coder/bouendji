"use client";

import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/common/icon";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { formatDateTime, NO_VALUE } from "@/lib/format";
import type { AuditEntry } from "@/server/services/audit/audit.service";
import { auditValueRows, type AuditRow } from "./audit-diff";

/**
 * Tiroir de détail d'une entrée du journal (lecture seule, modèle payout-drawer).
 * « Avant » et « après » ne viennent que si l'API les renvoie : sinon on le dit,
 * sans rien inventer. Pas de JSON brut : une ligne clé / valeur par champ.
 */
export function AuditEntryDrawer({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-11 sm:min-h-9">
          Détails
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-[500px]">
        <SheetHeader>
          <SheetTitle>
            <code className="font-mono text-subhead break-all">{entry.action}</code>
          </SheetTitle>
          <SheetDescription className="flex items-center gap-1.5">
            <Icon name="history" className="size-4" /> {formatDateTime(entry.createdAt)}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-6 px-5 pb-6">
          <DrawerSection icon="users" title="Qui et quoi">
            <Line label="Acteur (rôle)" value={entry.actorRole ?? NO_VALUE} />
            <Line label="Cible" value={entry.targetType ?? NO_VALUE} />
            <Line label="Identifiant de la cible" value={entry.targetId ?? NO_VALUE} mono />
          </DrawerSection>
          <ValueSection icon="history" title="Avant" value={entry.before} />
          <ValueSection icon="pen" title="Après" value={entry.after} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Valeur « avant » ou « après » : liste clé / valeur, ou mention d'absence. */
function ValueSection({ icon, title, value }: { icon: IconName; title: string; value: unknown }) {
  const rows: AuditRow[] = auditValueRows(value);
  return (
    <DrawerSection icon={icon} title={title}>
      {value === null || value === undefined ? (
        <p className="text-footnote text-muted-foreground">Non renseigné par l&apos;API pour cette action.</p>
      ) : (
        rows.map((row, i) => <Line key={`${row.key}-${i}`} label={row.key} value={row.value} />)
      )}
    </DrawerSection>
  );
}

/** Section du tiroir (Chariow) : petite tuile d'icône + titre gras + filet, puis contenu. */
function DrawerSection({ icon, title, children }: { icon: IconName; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 border-b border-border pb-3 text-subhead font-bold text-foreground">
        <span className="grid size-6 place-items-center rounded-md bg-group text-muted-foreground">
          <Icon name={icon} className="size-4" />
        </span>
        {title}
      </h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Line({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-subhead">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`min-w-0 break-all text-end text-foreground ${mono ? "font-mono text-footnote" : "tabular-nums"}`}>{value}</span>
    </div>
  );
}
