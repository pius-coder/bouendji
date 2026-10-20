"use client";

import { useState } from "react";
import { ShieldMark } from "./Icons";
import { useSession } from "./SessionProvider";
import { useCommunities } from "./CommunitiesProvider";
import { roleSummary, screenAllowed } from "@/lib/permissions";
import type { Community, ScreenId } from "@/lib/types";
import { LoginScreen } from "./LoginScreen";
import { OverviewScreen } from "./OverviewScreen";
import { CommunitiesScreen } from "./CommunitiesScreen";
import { MembersScreen } from "./MembersScreen";
import { OrdersScreen } from "./OrdersScreen";
import { CommissionsScreen } from "./CommissionsScreen";
import { DevicesScreen } from "./DevicesScreen";
import { PoolScreen } from "./PoolScreen";
import { AuditScreen } from "./AuditScreen";
import { AccessPanel, Loading } from "./ui";

const NAV: { id: ScreenId; label: string }[] = [
  { id: "overview", label: "Vue d’ensemble" },
  { id: "communities", label: "Communautés" },
  { id: "members", label: "Membres" },
  { id: "orders", label: "Commandes" },
  { id: "commissions", label: "Commissions" },
  { id: "devices", label: "Appareils" },
  { id: "pool", label: "Pool" },
  { id: "audit", label: "Journal d’audit" },
];

function TopBar({ communities }: { communities: Community[] }) {
  const { admin, logout } = useSession();
  return (
    <header className="topbar">
      <p className="brand">
        <span className="brand-name">
          <ShieldMark />
          Administration
        </span>
        <span className="brand-sub">Plateforme VPN</span>
      </p>
      <div className="topbar-actions">
        {admin ? (
          <>
            <p className="identity">{`${admin.name} · ${roleSummary(admin, communities)}`}</p>
            <button className="button button-quiet" type="button" onClick={logout}>
              Fermer la session
            </button>
          </>
        ) : null}
      </div>
    </header>
  );
}

function Banner() {
  const { banner, dismissBanner } = useSession();
  if (!banner) return null;
  return (
    <div className="banner" data-tone={banner.tone} role={banner.tone === "error" ? "alert" : "status"}>
      <p className="banner-text">{banner.message}</p>
      <button className="button button-quiet banner-close" type="button" onClick={dismissBanner}>
        Fermer
      </button>
    </div>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <p>
        Export statique Next.js, sans CDN ni police distante. Le jeton de session reste en mémoire de cet onglet :
        il n’est jamais écrit dans le stockage du navigateur, un cookie ou l’URL.
      </p>
    </footer>
  );
}

function SkipLink() {
  return (
    <a className="skip-link" href="#contenu">
      Aller au contenu
    </a>
  );
}

/** Session absente : uniquement l'écran de connexion, aucun écran vide. */
export function PublicShell() {
  return (
    <div className="app">
      <SkipLink />
      <TopBar communities={[]} />
      <Banner />
      <main id="contenu" className="view" tabIndex={-1}>
        <LoginScreen />
      </main>
      <Footer />
    </div>
  );
}

/**
 * Navigation par état React, pas par routeur : l'export est statique, il n'y a
 * donc aucune route serveur à interroger. `aria-current` n'est posé que sur
 * l'entrée active.
 */
export function AdminShell() {
  const { admin } = useSession();
  const { communities, loading } = useCommunities();
  const [screen, setScreen] = useState<ScreenId>("overview");

  const allowed = screenAllowed(admin, screen);

  return (
    <div className="app">
      <SkipLink />
      <TopBar communities={communities} />
      <nav className="nav" aria-label="Navigation principale">
        <ul>
          {NAV.filter((entry) => screenAllowed(admin, entry.id)).map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                aria-current={screen === entry.id ? "page" : undefined}
                onClick={() => setScreen(entry.id)}
              >
                {entry.label}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <Banner />
      <main id="contenu" className="view" tabIndex={-1}>
        {loading && communities.length === 0 ? (
          <Loading label="Chargement des communautés…" />
        ) : allowed ? (
          <Screen screen={screen} />
        ) : (
          <AccessPanel
            title="Accès refusé"
            message="Votre rôle ne donne accès à aucun contenu de cette section."
          />
        )}
      </main>
      <Footer />
    </div>
  );
}

function Screen({ screen }: { screen: ScreenId }) {
  switch (screen) {
    case "overview":
      return <OverviewScreen />;
    case "communities":
      return <CommunitiesScreen />;
    case "members":
      return <MembersScreen />;
    case "orders":
      return <OrdersScreen />;
    case "commissions":
      return <CommissionsScreen />;
    case "devices":
      return <DevicesScreen />;
    case "pool":
      return <PoolScreen />;
    case "audit":
      return <AuditScreen />;
    default:
      return <AccessPanel title="Écran inconnu" message="Cette section n’existe pas dans la console." />;
  }
}
