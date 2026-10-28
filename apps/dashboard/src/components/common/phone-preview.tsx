"use client";

import * as React from "react";
import { BRAND_THEME_META, type BrandTheme, previewPackageName } from "@/server/services/onboarding/onboarding.schema";
import { cn } from "@/lib/utils";

const THEME_PALETTES: Record<BrandTheme, { bg: string; surface: string; text: string }> = {
  billet: { bg: "#0F172A", surface: "#1E293B", text: "#F8FAFC" },
  halo: { bg: "#18181B", surface: "#27272A", text: "#FAFAFA" },
  mono: { bg: "#111827", surface: "#1F2937", text: "#F9FAFB" },
  vector: { bg: "#090D16", surface: "#131C2E", text: "#F1F5F9" },
  otaku: { bg: "#1A1025", surface: "#281938", text: "#FAF5FF" },
};

/**
 * Maquette visuelle d'un téléphone Android montrant l'application de la communauté
 * en direct (nom de l'app, thème `billet | halo | mono | vector | otaku`, couleur
 * principale, logo et fenêtre d'accueil WhatsApp). Pur HTML/CSS/SVG.
 */
export function PhonePreview({
  displayName,
  theme = "billet",
  accentHex,
  logoUrl,
  communityName,
  whatsappGroupUrl,
  packageName,
  compact = false,
  className,
}: {
  displayName: string;
  theme?: BrandTheme | string;
  accentHex?: string | null;
  logoUrl?: string | null;
  communityName?: string | null;
  whatsappGroupUrl?: string | null;
  packageName?: string | null;
  compact?: boolean;
  className?: string;
}) {
  const safeTheme: BrandTheme =
    theme in BRAND_THEME_META ? (theme as BrandTheme) : "billet";
  const meta = BRAND_THEME_META[safeTheme];
  const palette = THEME_PALETTES[safeTheme];
  const accent = accentHex && /^#[0-9a-fA-F]{6}$/.test(accentHex) ? accentHex : meta.color;
  const appTitle = displayName.trim() || "Mon VPN";
  const pkg = packageName || previewPackageName(appTitle);

  return (
    <div className={cn("flex flex-col items-center gap-2.5", className)}>
      <div
        className={cn(
          "relative flex flex-col overflow-hidden rounded-[2rem] border-4 border-foreground/85 shadow-md transition-colors",
          compact ? "w-56 min-h-80" : "w-64 min-h-96",
        )}
        style={{ backgroundColor: palette.bg, color: palette.text }}
      >
        {/* Barre d'état Android */}
        <div className="flex items-center justify-between px-5 pt-2.5 pb-1 text-[10px] opacity-75">
          <span className="font-mono tabular-nums">20:04</span>
          <div className="h-2.5 w-12 rounded-full bg-current/20" />
          <span className="font-mono">4G · 92%</span>
        </div>

        {/* En-tête de l'application */}
        <div className="flex items-center gap-2.5 px-4 py-2.5">
          <div
            className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-current/15 font-semibold"
            style={{ backgroundColor: palette.surface, color: accent }}
          >
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="size-full object-contain" />
            ) : (
              <span className="text-sm uppercase">{appTitle.slice(0, 2)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold leading-tight">{appTitle}</p>
            <p className="truncate text-[10px] opacity-65">
              {communityName?.trim() || "Communauté connectée"}
            </p>
          </div>
          <span
            className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
            style={{ backgroundColor: `${accent}26`, color: accent }}
          >
            Actif
          </span>
        </div>

        {/* Carte centrale du tunnel */}
        <div
          className="mx-3.5 my-1.5 flex flex-1 flex-col items-center justify-center gap-2.5 rounded-2xl p-3.5 text-center"
          style={{ backgroundColor: palette.surface }}
        >
          <div
            className="flex size-14 items-center justify-center rounded-full border-2 shadow-inner"
            style={{ borderColor: accent, backgroundColor: `${accent}1f` }}
          >
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke={accent} strokeWidth={2}>
              <path d="M12 3v9" strokeLinecap="round" />
              <path d="M16.24 7.76a6 6 0 1 1-8.48 0" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-semibold">Tunnel prêt</p>
            <p className="text-[10px] opacity-70">Francfort · Automatique</p>
          </div>
          <div className="w-full rounded-lg bg-current/10 px-2.5 py-1.5 text-start text-[10px]">
            <div className="flex justify-between">
              <span className="opacity-70">Solde</span>
              <span className="font-mono font-semibold">14,2 / 20 Go</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-current/15">
              <div className="h-full rounded-full" style={{ width: "71%", backgroundColor: accent }} />
            </div>
          </div>
        </div>

        {/* Fenêtre d'accueil WhatsApp */}
        <div
          className="mx-3.5 mb-3 rounded-xl border border-current/10 p-2.5 text-[10px]"
          style={{ backgroundColor: palette.surface }}
        >
          <p className="font-semibold">Rejoindre le groupe WhatsApp</p>
          <p className="mt-0.5 truncate opacity-70">
            {whatsappGroupUrl?.trim() ? whatsappGroupUrl.replace(/^https?:\/\//, "") : "chat.whatsapp.com/…"}
          </p>
          <div
            className="mt-1.5 rounded-md py-1 text-center text-[10px] font-semibold"
            style={{ backgroundColor: accent, color: palette.bg }}
          >
            Ouvrir WhatsApp
          </div>
        </div>
      </div>

      <div className="text-center">
        <p className="font-mono text-caption text-muted-foreground">{pkg}</p>
        <p className="text-caption text-muted-foreground">
          Thème <span className="font-medium text-foreground">{meta.label}</span> · Accent{" "}
          <span className="font-mono text-foreground">{accent}</span>
        </p>
      </div>
    </div>
  );
}
