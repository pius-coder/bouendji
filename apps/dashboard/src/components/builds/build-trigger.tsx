"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/common/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { triggerBuildAction } from "@/server/actions/builds.action";

/**
 * « Construire l'APK » et son champ « Nom de version » (facultatif). Quand la marque
 * est incomplète, le bouton est désactivé et la raison reste affichée. L'API reste
 * l'autorité : un 422 ou un 403 s'affiche tel quel dans un toast.
 */
export function BuildTrigger({ appId, brandReady }: { appId: string; brandReady: boolean }) {
  const [versionName, setVersionName] = useState("");
  const [pending, startTransition] = useTransition();
  const inputId = useId();
  const reasonId = useId();

  function build() {
    startTransition(async () => {
      const result = await triggerBuildAction(appId, versionName);
      if (result.ok) {
        toast.success("Build lancé", { description: "En file d'attente. La liste se met à jour." });
        setVersionName("");
      } else toast.error(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <label htmlFor={inputId} className="flex min-w-48 flex-col gap-1.5 text-footnote font-semibold">
          Nom de version
          <Input
            id={inputId}
            value={versionName}
            maxLength={40}
            placeholder="1.0.0"
            disabled={!brandReady || pending}
            onChange={(e) => setVersionName(e.target.value)}
            className="h-11"
          />
        </label>
        <Button
          className="min-h-11"
          disabled={!brandReady || pending}
          aria-describedby={brandReady ? undefined : reasonId}
          onClick={build}
        >
          {pending ? <Spinner /> : <Icon name="download" />}
          Construire l&apos;APK
        </Button>
      </div>
      {brandReady ? (
        <p className="text-footnote text-muted-foreground">Nom facultatif. Vide : 1.0.0. Le numéro de build est attribué automatiquement.</p>
      ) : (
        <p id={reasonId} className="text-footnote text-muted-foreground">
          Construction impossible tant que la marque est incomplète.
        </p>
      )}
    </div>
  );
}
