import { Suspense, type ReactNode } from "react";
import { PageChromeProvider } from "@/components/common/page-chrome";
import {
  BottomBarSection,
  MobileCommunitySection,
  RailSection,
  SectionBandSection,
  SectionChipsSection,
  SubmenuSection,
  UserMenuSection,
} from "@/components/shell/shell-nav-section";
import { TopBar } from "@/components/shell/top-bar";
import { CommandPaletteSection } from "@/components/shell/shell-nav-section";

/**
 * Shell (D106, D108) : architecture conservée, rendu Chariow mesuré.
 * Le DOCUMENT NE DÉFILE PAS : cadre en `h-dvh`, rail / sous-menu / bande fixes ;
 * la surface blanche (rayon 16, ombre 0 0 6px .06, marges 8 px à droite et 16 px
 * en bas) est la seule zone qui défile (`#contenu`) ; dans la surface, la barre
 * d'outils de page et l'en-tête de tableau sont collants.
 * < 1024 px : barre du haut et puces fixes, surface qui défile, barre basse fixe.
 * Synchrone : chaque lecture de session a sa frontière Suspense, à la géométrie du bloc.
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
        <Suspense fallback={<div aria-hidden className="hidden w-[5.25rem] shrink-0 lg:block" />}>
          <RailSection />
        </Suspense>
        <Suspense fallback={<div aria-hidden className="hidden w-[15.5rem] shrink-0 lg:block" />}>
          <SubmenuSection />
        </Suspense>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Suspense fallback={<div aria-hidden className="hidden h-12 shrink-0 lg:block" />}>
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
          <Suspense fallback={null}>
            <SectionChipsSection />
          </Suspense>
          <main
            id="contenu"
            tabIndex={-1}
            className="relative mx-2 mb-[calc(var(--bottombar-h)+0.5rem+env(safe-area-inset-bottom))] flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-contain rounded-2xl bg-surface shadow-surface outline-none lg:mx-0 lg:me-2 lg:mb-4"
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
