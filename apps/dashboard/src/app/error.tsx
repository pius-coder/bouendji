"use client";

import { EmptyBlock } from "@/components/page/empty";
import { Button } from "@/components/ui/button";

/** Erreur de rendu ; `digest` = référence à communiquer à l'exploitant. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="mx-auto flex h-full w-full max-w-md flex-col justify-center p-4">
      <EmptyBlock
        icon="danger"
        tone="danger"
        title="Une erreur est survenue"
        description={error.digest ? `Référence : ${error.digest}` : undefined}
        action={
          <Button type="button" onClick={retry}>
            Réessayer
          </Button>
        }
      />
    </main>
  );
}
