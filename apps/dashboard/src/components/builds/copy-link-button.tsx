"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/common/icon";
import { Button } from "@/components/ui/button";

/** Copie le lien de l'APK dans le presse-papiers. Seul état client de la colonne « Lien ». */
export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Lien copié");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Contexte non sécurisé ou permission refusée : on dit quoi faire à la main.
      toast.error("Copie impossible", { description: "Sélectionnez le lien et copiez-le à la main." });
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={copy}>
      <Icon name={copied ? "check" : "copy"} className="size-4" />
      {copied ? "Lien copié" : "Copier le lien"}
    </Button>
  );
}
