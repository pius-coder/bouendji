"use client";

import * as React from "react";
import { toast } from "sonner";
import { Icon } from "@/components/common/icon";
import { StatusBadge } from "@/components/common/status-badge";
import { ManualEndpointSheet } from "@/components/network/manual-endpoint-sheet";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/lib/format";
import { claimNightSlotAction, issueDeployKeyAction } from "@/server/actions/network.action";
import type { DeployKeyResult, NightSlotView } from "@/server/services/network/network.schema";

const ADJECTIVES = ["ivoire", "ebene", "kora", "wouri", "sanaga", "fako", "benoue", "nyong"] as const;

function randomNodeLabel(slot: string): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)] ?? "wouri";
  const num = Math.floor(10 + Math.random() * 89);
  return `nuit-${slot.replace(/[^a-z0-9]/gi, "")}-${adj}-${num}`;
}

function formatSlotTitle(slot: NightSlotView): string {
  if (slot.label) return slot.label;
  return slot.slot.includes("20") ? "Créneau 20h00 – 00h00" : "Créneau 00h00 – 04h00";
}

export function NightSlotsClient({ slots }: { slots: readonly NightSlotView[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {slots.map((slot) => (
        <NightSlotCard key={slot.slotId} slot={slot} />
      ))}
    </div>
  );
}

function NightSlotCard({ slot }: { slot: NightSlotView }) {
  const [pending, startTransition] = React.useTransition();
  const [deployKey, setDeployKey] = React.useState<DeployKeyResult | null>(null);
  const [suggestedName, setSuggestedName] = React.useState(() => randomNodeLabel(slot.slot));
  const [guideOpen, setGuideOpen] = React.useState(false);

  const handleClaim = () => {
    startTransition(async () => {
      const res = await claimNightSlotAction(slot.slotId);
      if (res.ok) {
        toast.success("Créneau pris en charge !");
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleIssueKey = () => {
    startTransition(async () => {
      const res = await issueDeployKeyAction(slot.slotId);
      if (res.ok) {
        setDeployKey(res.data);
        toast.success("Clé de déploiement à usage unique générée.");
      } else {
        toast.error(res.message);
      }
    });
  };

  const copySecret = async () => {
    if (!deployKey) return;
    await navigator.clipboard.writeText(deployKey.key);
    toast.success(`Clé ${deployKey.variable} copiée.`);
  };

  return (
    <div className="flex flex-col justify-between gap-4 rounded-section border border-separator bg-background p-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-title-3 font-semibold text-foreground">
              {formatSlotTitle(slot)}
            </h3>
            <p className="text-footnote text-muted-foreground">
              Début : {formatDateTime(slot.startsAt)} · Fin : {formatDateTime(slot.endsAt)}
            </p>
          </div>
          <StatusBadge status={slot.state} />
        </div>

        <dl className="grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-3 text-subhead">
          <div>
            <dt className="text-caption text-muted-foreground">Responsable</dt>
            <dd className="font-medium text-foreground">
              {slot.claimedBy?.name || "Non assigné"}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-muted-foreground">Serveur actif</dt>
            <dd className="font-mono font-semibold tabular-nums text-foreground">
              {slot.endpoint ? slot.endpoint.label : "Aucun nœud"}
            </dd>
          </div>
        </dl>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-separator pt-3">
        <Button
          type="button"
          size="sm"
          variant={slot.claimedBy ? "outline" : "default"}
          disabled={pending}
          onClick={handleClaim}
        >
          {pending ? <Spinner /> : <Icon name="check" className="size-4" />}
          {slot.claimedBy ? "Reprendre le créneau" : "Je m'en occupe"}
        </Button>

        <Sheet>
          <SheetTrigger asChild>
            <Button type="button" size="sm" variant="outline">
              <Icon name="server" className="size-4" />
              Marche à suivre & Clé
            </Button>
          </SheetTrigger>
          <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
            <SheetHeader>
              <SheetTitle>Déployer pour {formatSlotTitle(slot)}</SheetTitle>
              <SheetDescription>
                Générez une clé d&apos;ingestion à usage unique ou collez un lien de secours.
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-5 px-4 pb-6">
              {/* Nom aléatoire suggéré */}
              <div className="rounded-section border border-separator bg-muted/35 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-caption text-muted-foreground">Nom de serveur suggéré</p>
                    <p className="font-mono text-subhead font-semibold text-foreground">
                      {suggestedName}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setSuggestedName(randomNodeLabel(slot.slot))}
                  >
                    <Icon name="refresh" className="size-3.5" />
                    Autre nom
                  </Button>
                </div>
              </div>

              {/* Clé ENDPOINT_INGEST_SECRET à usage unique */}
              <div className="flex flex-col gap-3 rounded-section border border-separator bg-background p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-subhead font-semibold text-foreground">
                      1. Clé d&apos;ingestion à usage unique
                    </p>
                    <p className="text-footnote text-muted-foreground">
                      Variable `ENDPOINT_INGEST_SECRET` pour l&apos;auto-enregistrement du conteneur.
                    </p>
                  </div>
                  <Button type="button" size="sm" disabled={pending} onClick={handleIssueKey}>
                    {pending ? <Spinner /> : null}
                    Générer une clé
                  </Button>
                </div>

                {deployKey ? (
                  <div className="flex flex-col gap-2 rounded-xl border border-foreground/20 bg-accent/15 p-3">
                    <p className="text-caption font-semibold text-foreground">
                      Affichée une seule fois · Expire le {formatDateTime(deployKey.expiresAt)}
                    </p>
                    <div className="flex items-center justify-between gap-2 rounded-lg bg-background px-3 py-2 font-mono text-footnote">
                      <span className="truncate select-all">{deployKey.key}</span>
                      <Button type="button" size="sm" variant="outline" onClick={() => void copySecret()}>
                        <Icon name="copy" className="size-3.5" />
                        Copier
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Marche à suivre dépliable */}
              <Collapsible
                open={guideOpen}
                onOpenChange={setGuideOpen}
                className="rounded-section border border-separator bg-background p-4"
              >
                <CollapsibleTrigger className="flex w-full items-center justify-between text-start">
                  <span className="text-subhead font-semibold text-foreground">
                    2. Instructions de déploiement Cloud Run
                  </span>
                  <Icon
                    name={guideOpen ? "chevron-up" : "chevron-down"}
                    className="size-4 text-muted-foreground"
                  />
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 flex flex-col gap-2 text-footnote text-muted-foreground">
                  <ol className="ms-4 list-decimal space-y-1.5 text-foreground">
                    <li>
                      Déployez l&apos;image `infra/endpoint` dans la région cible avec `ENDPOINT_LABEL={suggestedName}`.
                    </li>
                    <li>
                      Passez la clé générée ci-dessus dans `ENDPOINT_INGEST_SECRET`.
                    </li>
                    <li>
                      Au démarrage, le conteneur appelle `/v1/internal/endpoints/register`, démarre Xray, puis envoie `/ready` et ses battements `/heartbeat`.
                    </li>
                  </ol>
                </CollapsibleContent>
              </Collapsible>

              {/* Ajout manuel par lien VLESS */}
              <div className="flex flex-col gap-2 rounded-section border border-separator bg-muted/25 p-4">
                <p className="text-subhead font-semibold text-foreground">
                  3. Ou publier un nœud manuellement
                </p>
                <p className="text-footnote text-muted-foreground">
                  Si le serveur ne s&apos;enregistre pas seul, collez son lien pour extraire ses paramètres.
                </p>
                <div className="pt-1">
                  <ManualEndpointSheet defaultLabel={suggestedName} />
                </div>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
