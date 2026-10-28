"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/common/icon";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAdminQuery } from "@/hooks/use-admin-query";
import type { AdminMe } from "@/server/services/admin-auth/admin-auth.schema";
import { searchResult } from "@/server/services/subscribers/subscribers.schema";
import { allSections, buildNav } from "./nav-model";
import { NavGlyph } from "./nav-icon";
import { useActiveCommunityId } from "./use-active-community";
import type { CommunityOption } from "./community-switcher";

const PLACEHOLDER = "Rechercher un abonné, un appareil, une commande Fapshi ou un écran…";
const EMPTY = "Aucun résultat trouvé.";

export const OPEN_COMMAND_PALETTE_EVENT = "bouendji:open-command-palette";

export function triggerCommandPalette() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_COMMAND_PALETTE_EVENT));
  }
}

/**
 * Palette de commandes et recherche globale (Ctrl K / Cmd K).
 * Utilise `useAdminQuery` (`/api/bff/v1/admin/search?q=...`, `staleTime = 30s`) dès 2 caractères
 * pour afficher les abonnés, appareils et commandes avec mise en cache côté client.
 */
export function CommandPalette({ me, communities }: { me: AdminMe; communities: readonly CommunityOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const activeId = useActiveCommunityId(communities.map((c) => c.id));
  const nav = buildNav(me, activeId);

  const trimmed = query.trim();
  const searchEnabled = open && trimmed.length >= 2;
  const { data: results, isFetching: loading } = useAdminQuery("/v1/admin/search", {
    query: { q: trimmed },
    schema: searchResult,
    enabled: searchEnabled,
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    function onCustomOpen() {
      setOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onCustomOpen);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onCustomOpen);
    };
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  const fallbackCommunityId = activeId ?? communities[0]?.id ?? null;

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Recherche & Navigation" description={PLACEHOLDER}>
      <CommandInput
        placeholder={PLACEHOLDER}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>{loading ? "Recherche en cours…" : EMPTY}</CommandEmpty>

        {searchEnabled && results && results.subscribers.length > 0 ? (
          <CommandGroup heading="Abonnés">
            {results.subscribers.map((s) => {
              const cid = s.communityId || fallbackCommunityId;
              const href = cid ? `/${cid}/subscribers?abonne=${s.id}` : `/?abonne=${s.id}`;
              return (
                <CommandItem
                  key={`subscriber-${s.id}`}
                  value={`abonne ${s.name} ${s.phone ?? ""} ${s.id}`}
                  onSelect={() => go(href)}
                >
                  <Icon name="users" className="size-4 text-muted-foreground" />
                  <span className="font-medium">{s.name || s.id.slice(0, 8)}</span>
                  <span className="ms-auto font-mono text-caption text-muted-foreground">{s.phone ?? ""}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ) : null}

        {searchEnabled && results && results.devices.length > 0 ? (
          <CommandGroup heading="Appareils">
            {results.devices.map((d) => {
              const cid = d.communityId || fallbackCommunityId;
              const href = cid ? `/${cid}/devices?appareil=${d.deviceId}` : `/?appareil=${d.deviceId}`;
              return (
                <CommandItem
                  key={`device-${d.deviceId}`}
                  value={`appareil ${d.name} ${d.deviceId}`}
                  onSelect={() => go(href)}
                >
                  <Icon name="smartphone" className="size-4 text-muted-foreground" />
                  <span className="font-medium">{d.name || d.deviceId.slice(0, 8)}</span>
                  <span className="ms-auto font-mono text-caption text-muted-foreground">
                    abonné {d.userId.slice(0, 8)}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ) : null}

        {searchEnabled && results && results.orders.length > 0 ? (
          <CommandGroup heading="Commandes">
            {results.orders.map((o) => {
              const cid = o.communityId || fallbackCommunityId;
              const href = cid ? `/${cid}/orders?commande=${o.id}` : `/?commande=${o.id}`;
              return (
                <CommandItem
                  key={`order-${o.id}`}
                  value={`commande ${o.id} ${o.status}`}
                  onSelect={() => go(href)}
                >
                  <Icon name="receipt" className="size-4 text-muted-foreground" />
                  <span className="font-medium">Commande {o.id.slice(0, 8)}</span>
                  <span className="ms-auto font-mono text-caption text-muted-foreground">{o.status}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ) : null}

        {allSections(nav).map((section) => (
          <CommandGroup key={section.key} heading={section.label}>
            {section.items.map((item) => (
              <CommandItem key={item.href} value={`${section.label} ${item.label}`} onSelect={() => go(item.href)}>
                <NavGlyph name={item.icon} className="size-4" />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
        <CommandGroup heading="Configuration & Compte">
          <CommandItem value="Assistant de configuration onboarding" onSelect={() => go("/onboarding")}>
            <Icon name="tag" className="size-4" />
            Assistant de configuration (6 étapes)
          </CommandItem>
          <CommandItem value={nav.account.label} onSelect={() => go(nav.account.href)}>
            <NavGlyph name={nav.account.icon} className="size-4" />
            {nav.account.label}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
