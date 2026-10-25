"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { SegmentedControl } from "@/components/common/segmented-control";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/lib/format";
import { issueOfflineBundleAction } from "@/server/actions/devices.action";

const ISSUE_LABEL = "Créer et télécharger";
/** Type reconnu par l'app (AndroidManifest : `application/vnd.bouendji.bvpn`). */
const BVPN_TYPE = "application/vnd.bouendji.bvpn";

type Ttl = "1" | "6" | "24";
const TTL_OPTIONS: readonly { value: Ttl; label: string }[] = [
  { value: "1", label: "1 h" },
  { value: "6", label: "6 h" },
  { value: "24", label: "24 h" },
];

/** Nom de fichier sûr : l'appareil puis le début de l'identifiant du fichier. */
function fileName(deviceName: string, bundleId: string): string {
  const base = deviceName.normalize("NFKD").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "appareil";
  return `${base}-${bundleId.slice(0, 8)}.bvpn`;
}

function download(name: string, content: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(content)], { type: BVPN_TYPE }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Émission d'un fichier de secours pour un appareil précis (D29, D94) : scellé
 * pour lui, à usage unique, durée courte. Rendu inline dans le tiroir appareil
 * (pas de feuille imbriquée). Le dashboard ne voit qu'un conteneur opaque et le
 * remet tel quel ; l'admin l'envoie à l'abonné, qui l'ouvre avec l'app.
 */
export function OfflineBundleSection({ deviceId, deviceName }: { deviceId: string; deviceName: string }) {
  const [ttl, setTtl] = useState<Ttl>("1");
  const [pending, startTransition] = useTransition();

  function issue() {
    startTransition(async () => {
      const result = await issueOfflineBundleAction(deviceId, Number(ttl));
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      const { bundleId, notAfter, endpointCount, file } = result.data;
      download(fileName(deviceName, bundleId), file);
      toast.success(`Fichier téléchargé · ${endpointCount} serveur${endpointCount > 1 ? "s" : ""} · valable jusqu'au ${formatDateTime(notAfter)}`);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-footnote text-muted-foreground">
        Pour « {deviceName} » uniquement. Utilisable une seule fois, puis inutile. Envoyez le fichier à l&apos;abonné : il l&apos;ouvre
        avec l&apos;application, qui ajoute les serveurs même sans accès à l&apos;API.
      </p>
      <SegmentedControl<Ttl> label="Durée de validité" options={TTL_OPTIONS} value={ttl} onValueChange={setTtl} />
      <div>
        <Button size="sm" disabled={pending} onClick={issue}>
          {pending ? <Spinner /> : null}
          {pending ? "Création…" : ISSUE_LABEL}
        </Button>
      </div>
    </div>
  );
}
