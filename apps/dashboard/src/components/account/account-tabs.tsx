"use client";

import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TABS = [
  { value: "profil", label: "Profil" },
  { value: "mot-de-passe", label: "Mot de passe" },
  { value: "sessions", label: "Sessions" },
  { value: "apparence", label: "Apparence" },
] as const;

/**
 * Onglets du compte. Les contenus sont des composants serveur passés en props ;
 * l'onglet courant reste local au navigateur (pas d'état partagé).
 */
export function AccountTabs({
  profile,
  password,
  sessions,
  appearance,
}: {
  profile: ReactNode;
  password: ReactNode;
  sessions: ReactNode;
  appearance: ReactNode;
}) {
  const panels: Record<(typeof TABS)[number]["value"], ReactNode> = {
    profil: profile,
    "mot-de-passe": password,
    sessions,
    apparence: appearance,
  };
  return (
    <Tabs defaultValue="profil" className="flex flex-col gap-6">
      <TabsList className="self-start">
        {TABS.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {TABS.map((tab) => (
        <TabsContent key={tab.value} value={tab.value}>
          {panels[tab.value]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
