"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { AdminMe } from "@/server/services/admin-auth/admin-auth.schema";
import { allSections, buildNav } from "./nav-model";
import { NavGlyph } from "./nav-icon";
import { useActiveCommunityId } from "./use-active-community";
import type { CommunityOption } from "./community-switcher";

const PLACEHOLDER = "Aller à une section ou un écran";
const EMPTY = "Aucun écran trouvé.";

/**
 * Palette de commandes (Ctrl K / Cmd K). Navigation entre sections et écrans pour la
 * communauté active. La recherche d'abonnés, de commandes et d'appareils viendra avec
 * la vague 2 (API `GET /v1/admin/search`).
 */
export function CommandPalette({ me, communities }: { me: AdminMe; communities: readonly CommunityOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const activeId = useActiveCommunityId(communities.map((c) => c.id));
  const nav = buildNav(me, activeId);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Navigation" description={PLACEHOLDER}>
      <CommandInput placeholder={PLACEHOLDER} />
      <CommandList>
        <CommandEmpty>{EMPTY}</CommandEmpty>
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
        <CommandGroup heading="Compte">
          <CommandItem value={nav.account.label} onSelect={() => go(nav.account.href)}>
            <NavGlyph name={nav.account.icon} className="size-4" />
            {nav.account.label}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
