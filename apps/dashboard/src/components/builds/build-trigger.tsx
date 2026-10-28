"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/common/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { requestBuildAction, triggerBuildAction } from "@/server/actions/builds.action";

/**
 * Pour l'admin de communauté : « Demander une nouvelle version » (`requestBuildAction`, statut `requested`).
 * Pour le propriétaire (`isOwner`) : « Construire l'APK » direct (`triggerBuildAction`) ou demande.
 */
export function BuildTrigger({
  appId,
  brandReady,
  isOwner = false,
}: {
  appId: string;
  brandReady: boolean;
  isOwner?: boolean;
}) {
  const [versionName, setVersionName] = useState("");
  const [pending, startTransition] = useTransition();
  const inputId = useId();
  const reasonId = useId();

  function handleRequest() {
    startTransition(async () => {
      const result = await requestBuildAction(appId, versionName);
      if (result.ok) {
        toast.success("Demande de version envoyée", {
          description: "Le propriétaire de la plateforme est notifié pour lancer la compilation.",
        });
        setVersionName("");
      } else {
        toast.error(result.message);
      }
    });
  }

  function handleTrigger() {
    startTransition(async () => {
      const result = await triggerBuildAction(appId, versionName);
      if (result.ok) {
        toast.success("Build lancé", { description: "En file d'attente GitHub Actions." });
        setVersionName("");
      } else {
        toast.error(result.message);
      }
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
          variant={isOwner ? "outline" : "default"}
          className="min-h-11"
          disabled={!brandReady || pending}
          aria-describedby={brandReady ? undefined : reasonId}
          onClick={handleRequest}
        >
          {pending ? <Spinner /> : <Icon name="download" />}
          Demander une nouvelle version
        </Button>
        {isOwner ? (
          <Button
            className="min-h-11"
            disabled={!brandReady || pending}
            aria-describedby={brandReady ? undefined : reasonId}
            onClick={handleTrigger}
          >
            {pending ? <Spinner /> : <Icon name="check" />}
            Construire l&apos;APK maintenant (Owner)
          </Button>
        ) : null}
      </div>
      {brandReady ? (
        <p className="text-footnote text-muted-foreground">
          Nom facultatif (défaut : 1.0.0). Le numéro de version code est incrémenté automatiquement.
        </p>
      ) : (
        <p id={reasonId} className="text-footnote text-muted-foreground">
          Construction impossible tant que la marque est incomplète.
        </p>
      )}
    </div>
  );
}
