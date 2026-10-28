import { Suspense, type ReactNode } from "react";
import { PageChromeProvider } from "@/components/common/page-chrome";
import {
  BottomBarSection,
  CommandPaletteSection,
  MobileCommunitySection,
  RailSection,
  SectionBandSection,
  UserMenuSection,
} from "@/components/shell/shell-nav-section";
import { TopBar } from "@/components/shell/top-bar";

/**
 * Charpente Refonte v2 :
 * - Desktop (≥ 1024 px) : UNE seule barre latérale par sujet (`RailSection` / `ShellSidebar`) +
 *   en-tête avec Fil d'Ariane (`Breadcrumb`), Recherche globale (`Ctrl K`) et Guide par rôle (`RoleGuideSheet`).
 * - Mobile (< 1024 px) : barre supérieure (`TopBar`) + barre basse à 5 entrées (`BottomBarSection`).
 * - Les sous-vues vivent dans les onglets (`PageTabs`) sous le titre de chaque page sujet.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <PageChromeProvider>
      <div className="flex h-dvh overflow-hidden bg-frame text-foreground">
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-foreground focus:px-4 focus:py-2 focus:text-background"
        >
          Aller au contenu
        </a>
        <Suspense fallback={<div aria-hidden className="hidden w-64 shrink-0 lg:block" />}>
          <RailSection />
        </Suspense>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Suspense fallback={<div aria-hidden className="hidden h-13 shrink-0 lg:block" />}>
            <SectionBandSection />
          </Suspense>
          <TopBar
            leading={
              <Suspense fallback={<span aria-hidden className="block h-5 w-28 animate-pulse rounded-full bg-group-strong" />}>
                <MobileCommunitySection />
              </Suspense>
            }
            trailing={
              <Suspense fallback={<span aria-hidden className="block size-8 animate-pulse rounded-full bg-group-strong" />}>
                <UserMenuSection />
              </Suspense>
            }
          />
          <main
            id="contenu"
            tabIndex={-1}
            className="relative mx-2 mb-[calc(var(--bottombar-h)+0.5rem+env(safe-area-inset-bottom))] flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain rounded-2xl bg-surface shadow-surface outline-none lg:mx-2 lg:mb-3"
          >
            {children}
          </main>
        </div>
        <Suspense fallback={null}>
          <BottomBarSection />
        </Suspense>
        <Suspense fallback={null}>
          <CommandPaletteSection />
        </Suspense>
      </div>
    </PageChromeProvider>
  );
}
