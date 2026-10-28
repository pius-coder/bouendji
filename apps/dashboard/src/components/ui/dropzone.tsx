"use client";

import * as React from "react";
import { Icon } from "@/components/common/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MAX_BYTES = 1_048_576; // 1 Mo
const ACCEPTED_MIMES = ["image/png", "image/svg+xml"] as const;

export interface DropzoneFilePayload {
  mime: "image/png" | "image/svg+xml";
  dataBase64: string;
  dataUrl: string;
  fileName: string;
  sizeBytes: number;
}

/**
 * Zone de dépôt de fichier pour le logo d'application (PNG ou SVG carré, ≤ 1 Mo).
 * Vérifie le format et la taille côté client avant l'envoi.
 */
export function Dropzone({
  valueUrl,
  onSelectFile,
  disabled,
  className,
}: {
  valueUrl?: string | null;
  onSelectFile: (payload: DropzoneFilePayload) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(valueUrl ?? null);

  React.useEffect(() => {
    if (valueUrl !== undefined) setPreviewUrl(valueUrl ?? null);
  }, [valueUrl]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (!file) return;

    setError(null);
    if (!ACCEPTED_MIMES.includes(file.type as (typeof ACCEPTED_MIMES)[number])) {
      setError("Format non pris en charge. Utilisez un fichier PNG ou SVG.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Le fichier dépasse 1 Mo. Réduisez sa taille avant de réessayer.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const commaIdx = result.indexOf(",");
      const dataBase64 = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;
      setPreviewUrl(result);
      await onSelectFile({
        mime: file.type as "image/png" | "image/svg+xml",
        dataBase64,
        dataUrl: result,
        fileName: file.name,
        sizeBytes: file.size,
      });
    };
    reader.onerror = () => {
      setError("Impossible de lire le fichier.");
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex items-center gap-4 rounded-section border border-dashed p-4 transition-colors",
          dragging ? "border-foreground bg-accent/15" : "border-separator bg-background",
          disabled && "opacity-60",
        )}
      >
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-separator bg-muted">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Aperçu du logo" className="size-full object-contain" />
          ) : (
            <Icon name="smartphone" className="size-6 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-subhead font-medium text-foreground">Logo de l&apos;application</p>
          <p className="text-footnote text-muted-foreground">PNG ou SVG carré · 1 Mo maximum</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/svg+xml"
          className="hidden"
          disabled={disabled}
          onChange={(e) => void handleFiles(e.target.files)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Choisir un fichier
        </Button>
      </div>
      {error ? <p className="text-footnote text-destructive">{error}</p> : null}
    </div>
  );
}
