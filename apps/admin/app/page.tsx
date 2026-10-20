"use client";

import { SessionProvider, useSession } from "@/components/SessionProvider";
import { CommunitiesProvider } from "@/components/CommunitiesProvider";
import { AdminShell, PublicShell } from "@/components/Shell";

/**
 * Une seule page, navigation par état React. L'export est statique : il n'y a
 * volontairement aucun routeur serveur ni segment dynamique.
 */
function Root() {
  const { admin } = useSession();
  if (!admin) return <PublicShell />;
  return (
    <CommunitiesProvider>
      <AdminShell />
    </CommunitiesProvider>
  );
}

export default function Page() {
  return (
    <SessionProvider>
      <Root />
    </SessionProvider>
  );
}
