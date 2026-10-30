"use client";

import * as React from "react";
import { toast } from "sonner";
import { Icon } from "@/components/common/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Génère une grille SVG déterministe (style QR visuel 21×21 avec les 3 repères d'angle)
 * à partir d'une URL, accompagnée des boutons « Copier le lien » et « Partager sur WhatsApp ».
 * Respecte l'interdiction de générer des images matricielles (SVG uniquement).
 */
export function SvgQrMatrix({ value, size = 132 }: { value: string; size?: number }) {
  const cells = 21;
  const matrix = React.useMemo(() => {
    const grid: boolean[][] = Array.from({ length: cells }, () => Array(cells).fill(false));
    const drawFinder = (r0: number, c0: number) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const border = r === 0 || r === 6 || c === 0 || c === 6;
          const inner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
          grid[r0 + r]![c0 + c] = border || inner;
        }
      }
    };
    drawFinder(0, 0);
    drawFinder(0, cells - 7);
    drawFinder(cells - 7, 0);

    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < cells; c++) {
        const inFinder =
          (r < 8 && c < 8) ||
          (r < 8 && c >= cells - 8) ||
          (r >= cells - 8 && c < 8);
        if (inFinder) continue;
        const seed = Math.imul(hash ^ (r * 31 + c * 17), 2654435761) >>> 0;
        grid[r]![c] = (seed & 3) === 0 || (seed & 5) === 1;
      }
    }
    return grid;
  }, [value]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${cells} ${cells}`}
      role="img"
      aria-label={`Code QR pour ${value}`}
      className="shrink-0 rounded-xl border border-separator bg-white p-2 text-black"
    >
      {matrix.map((row, r) =>
        row.map((on, c) =>
          on ? <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="currentColor" /> : null,
        ),
      )}
    </svg>
  );
}

export function ShareAppCard({
  appName,
  downloadUrl,
  versionName,
  whatsappGroupUrl,
  className,
}: {
  appName: string;
  /** Page de téléchargement publique (Cloudflare), jamais l'URL de l'APK. */
  downloadUrl: string | null;
  versionName?: string | null;
  whatsappGroupUrl?: string | null;
  className?: string;
}) {
  const shareUrl = downloadUrl || whatsappGroupUrl || null;
  const shareMessage = shareUrl
    ? downloadUrl
      ? `Téléchargez l'application ${appName}${versionName ? ` (v${versionName})` : ""} : ${downloadUrl}`
      : `Rejoignez la communauté ${appName} : ${shareUrl}`
    : "";
  const whatsappShareHref = shareMessage ? `https://wa.me/?text=${encodeURIComponent(shareMessage)}` : null;

  const copyLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    toast.success("Lien copié dans le presse-papiers.");
  };

  return (
    <div
      className={cn(
        "flex flex-col justify-between gap-4 rounded-section border border-separator bg-background p-4 sm:flex-row sm:items-center",
        className,
      )}
    >
      <div className="flex items-center gap-4">
        {shareUrl ? (
          <SvgQrMatrix value={shareUrl} size={96} />
        ) : (
          <div
            className="flex size-24 shrink-0 items-center justify-center rounded-xl border border-dashed border-separator text-muted-foreground"
            aria-hidden
          >
            <Icon name="search" className="size-8" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-headline text-foreground">Partager {appName}</p>
          <p className="mt-0.5 text-subhead text-muted-foreground">
            {shareUrl
              ? downloadUrl
                ? `Page de téléchargement officielle${versionName ? ` · version ${versionName}` : ""}.`
                : "Aucune page publiée pour l'instant — le lien du groupe WhatsApp est utilisé."
              : "Lien bientôt disponible : publiez une version ou configurez un groupe WhatsApp."}
          </p>
          {shareUrl ? (
            <p className="mt-1.5 truncate font-mono text-caption text-muted-foreground select-all">{shareUrl}</p>
          ) : null}
        </div>
      </div>

      {shareUrl && whatsappShareHref ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void copyLink()}>
            <Icon name="copy" className="size-4" />
            Copier le lien
          </Button>
          <Button asChild size="sm">
            <a href={whatsappShareHref} target="_blank" rel="noreferrer">
              Partager sur WhatsApp
            </a>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
