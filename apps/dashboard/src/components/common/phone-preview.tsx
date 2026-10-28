"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import type { BrandTheme } from "@/server/services/onboarding/onboarding.schema";

export type AndroidThemeKey =
  | BrandTheme
  | "sahel"
  | "nebula"
  | "glacier";

export interface PhonePreviewProps {
  appName?: string;
  displayName?: string;
  packageName?: string | null;
  communityName?: string;
  theme?: AndroidThemeKey | string;
  accent?: string | null;
  accentHex?: string | null;
  logoPreviewUrl?: string | null;
  logoUrl?: string | null;
  whatsappGroupUrl?: string | null;
  contactWhatsapp?: string | null;
  showWelcomePopup?: boolean;
  compact?: boolean;
  className?: string;
}

/**
 * Graines chromatiques exactes issues de `apps/android/.../ui/theme/Billet.kt` (l. 122-235).
 */
interface ThemeSeed {
  bg: string;
  bgSubtle: string;
  surface: string;
  surfaceElev: string;
  label: string;
  labelSec: string;
  labelTer: string;
  accent: string;
  accentGrad: string;
  onAccent: string;
  gold: string;
  goldText: string;
  ok: string;
  warn: string;
  err: string;
}

type DecorKind = "SHADOW" | "GLASS" | "RULE" | "TERMINAL" | "STICKER";
type ArtKind = "GUILLOCHE" | "ORBITS" | "TYPE" | "RADAR" | "BURST" | "KENTE" | "STARS" | "FACETS";
type PowerShapeKind = "CIRCLE" | "SQUIRCLE" | "SQUARE" | "OCTAGON" | "BLOB" | "DIAMOND" | "PILL" | "HEXAGON";

interface ThemeStyleSpec {
  id: AndroidThemeKey;
  label: string;
  fontClass: string;
  titleUppercase: boolean;
  radiusPx: number;
  decor: DecorKind;
  art: ArtKind;
  powerShape: PowerShapeKind;
  headerPrefix: string;
  strokePx: number;
  light: ThemeSeed;
  dark: ThemeSeed;
}

const ANDROID_THEMES: Record<AndroidThemeKey, ThemeStyleSpec> = {
  billet: {
    id: "billet",
    label: "Billet",
    fontClass: "font-display",
    titleUppercase: false,
    radiusPx: 18,
    decor: "SHADOW",
    art: "GUILLOCHE",
    powerShape: "CIRCLE",
    headerPrefix: "",
    strokePx: 1,
    light: {
      bg: "#F6F2EA",
      bgSubtle: "#EDE7DA",
      surface: "#FBF8F1",
      surfaceElev: "#FFFFFF",
      label: "#101E17",
      labelSec: "#425349",
      labelTer: "#586A60",
      accent: "#0F5D3A",
      accentGrad: "#0A4228",
      onAccent: "#FAF6EE",
      gold: "#C89B3C",
      goldText: "#6E5012",
      ok: "#0E6B40",
      warn: "#8A5600",
      err: "#A82424",
    },
    dark: {
      bg: "#0B1410",
      bgSubtle: "#101D17",
      surface: "#14231C",
      surfaceElev: "#1B2E25",
      label: "#F2EDE2",
      labelSec: "#B2BDB4",
      labelTer: "#839288",
      accent: "#33D17A",
      accentGrad: "#1FA15B",
      onAccent: "#062012",
      gold: "#E0B44C",
      goldText: "#F2CA6B",
      ok: "#33D17A",
      warn: "#F0AD32",
      err: "#FF6B6B",
    },
  },
  halo: {
    id: "halo",
    label: "Halo",
    fontClass: "font-sans",
    titleUppercase: false,
    radiusPx: 26,
    decor: "GLASS",
    art: "ORBITS",
    powerShape: "SQUIRCLE",
    headerPrefix: "",
    strokePx: 1,
    light: {
      bg: "#EEF0F8",
      bgSubtle: "#E3E6F3",
      surface: "#F8F9FE",
      surfaceElev: "#FFFFFF",
      label: "#111322",
      labelSec: "#454866",
      labelTer: "#5E6280",
      accent: "#4F3CC9",
      accentGrad: "#7B3FE4",
      onAccent: "#FFFFFF",
      gold: "#7B3FE4",
      goldText: "#4A2196",
      ok: "#0C6E4F",
      warn: "#8F5200",
      err: "#B31E3C",
    },
    dark: {
      bg: "#0A0B14",
      bgSubtle: "#101222",
      surface: "#15182B",
      surfaceElev: "#1E223B",
      label: "#F1F2FA",
      labelSec: "#AEB3CF",
      labelTer: "#7E84A6",
      accent: "#9B8CFF",
      accentGrad: "#C47AFF",
      onAccent: "#0E0A26",
      gold: "#C47AFF",
      goldText: "#D9A8FF",
      ok: "#3DD6A3",
      warn: "#F5B14C",
      err: "#FF6B8B",
    },
  },
  mono: {
    id: "mono",
    label: "Mono",
    fontClass: "font-display",
    titleUppercase: true,
    radiusPx: 4,
    decor: "RULE",
    art: "TYPE",
    powerShape: "SQUARE",
    headerPrefix: "",
    strokePx: 1,
    light: {
      bg: "#FAFAFA",
      bgSubtle: "#F0F0F0",
      surface: "#FFFFFF",
      surfaceElev: "#FFFFFF",
      label: "#0A0A0A",
      labelSec: "#404040",
      labelTer: "#595959",
      accent: "#0A0A0A",
      accentGrad: "#262626",
      onAccent: "#FAFAFA",
      gold: "#525252",
      goldText: "#262626",
      ok: "#14532D",
      warn: "#713F12",
      err: "#7F1D1D",
    },
    dark: {
      bg: "#0A0A0A",
      bgSubtle: "#121212",
      surface: "#161616",
      surfaceElev: "#202020",
      label: "#F5F5F5",
      labelSec: "#B5B5B5",
      labelTer: "#8A8A8A",
      accent: "#F5F5F5",
      accentGrad: "#D4D4D4",
      onAccent: "#0A0A0A",
      gold: "#A3A3A3",
      goldText: "#D4D4D4",
      ok: "#86EFAC",
      warn: "#FDE047",
      err: "#FCA5A5",
    },
  },
  vector: {
    id: "vector",
    label: "Vector",
    fontClass: "font-mono",
    titleUppercase: true,
    radiusPx: 6,
    decor: "TERMINAL",
    art: "RADAR",
    powerShape: "OCTAGON",
    headerPrefix: "// ",
    strokePx: 1.5,
    light: {
      bg: "#EFF3F0",
      bgSubtle: "#E2E9E4",
      surface: "#F8FAF8",
      surfaceElev: "#FFFFFF",
      label: "#0A1912",
      labelSec: "#354C40",
      labelTer: "#4E685B",
      accent: "#005F3A",
      accentGrad: "#00462A",
      onAccent: "#EEFFF6",
      gold: "#00695C",
      goldText: "#004D40",
      ok: "#005F3A",
      warn: "#7C4D00",
      err: "#A31621",
    },
    dark: {
      bg: "#060D09",
      bgSubtle: "#0B1610",
      surface: "#0F1E16",
      surfaceElev: "#162A1F",
      label: "#E4F5EC",
      labelSec: "#9AB8A8",
      labelTer: "#6E8F7E",
      accent: "#00E887",
      accentGrad: "#00B86B",
      onAccent: "#021A0E",
      gold: "#3CF2C6",
      goldText: "#6FF7D4",
      ok: "#00E887",
      warn: "#FFC247",
      err: "#FF5C6C",
    },
  },
  otaku: {
    id: "otaku",
    label: "Otaku",
    fontClass: "font-sans",
    titleUppercase: false,
    radiusPx: 22,
    decor: "STICKER",
    art: "BURST",
    powerShape: "BLOB",
    headerPrefix: "",
    strokePx: 2,
    light: {
      bg: "#FFF5EC",
      bgSubtle: "#FCE8D6",
      surface: "#FFFBF6",
      surfaceElev: "#FFFFFF",
      label: "#1A0E1C",
      labelSec: "#533E57",
      labelTer: "#6E5673",
      accent: "#C81E3A",
      accentGrad: "#9E122B",
      onAccent: "#FFF8F5",
      gold: "#0E6BA8",
      goldText: "#084C7A",
      ok: "#0E6B40",
      warn: "#8A4B00",
      err: "#B01030",
    },
    dark: {
      bg: "#12091A",
      bgSubtle: "#1B0F26",
      surface: "#231432",
      surfaceElev: "#2E1B42",
      label: "#FDF4FF",
      labelSec: "#C9B3D4",
      labelTer: "#9880A6",
      accent: "#FF3860",
      accentGrad: "#FF6B3D",
      onAccent: "#1F030B",
      gold: "#3CEFFF",
      goldText: "#7AF4FF",
      ok: "#3EF08E",
      warn: "#FFBE3D",
      err: "#FF5C7A",
    },
  },
  sahel: {
    id: "sahel",
    label: "Sahel",
    fontClass: "font-display",
    titleUppercase: false,
    radiusPx: 14,
    decor: "RULE",
    art: "KENTE",
    powerShape: "DIAMOND",
    headerPrefix: "◆ ",
    strokePx: 1.5,
    light: {
      bg: "#F9F1E4",
      bgSubtle: "#EFE3CE",
      surface: "#FDF8EF",
      surfaceElev: "#FFFFFF",
      label: "#231409",
      labelSec: "#5C4330",
      labelTer: "#785D47",
      accent: "#9E2F12",
      accentGrad: "#6E1E08",
      onAccent: "#FDF6EC",
      gold: "#C88A1E",
      goldText: "#6E4804",
      ok: "#1F5E34",
      warn: "#8A4E00",
      err: "#9E1B1B",
    },
    dark: {
      bg: "#140C06",
      bgSubtle: "#1E120A",
      surface: "#26180E",
      surfaceElev: "#332114",
      label: "#FAF0E1",
      labelSec: "#CCB8A1",
      labelTer: "#99856E",
      accent: "#F26B3A",
      accentGrad: "#C84B1E",
      onAccent: "#1F0902",
      gold: "#F2B84B",
      goldText: "#F7CC78",
      ok: "#5CD67D",
      warn: "#F5B342",
      err: "#FF6E5E",
    },
  },
  nebula: {
    id: "nebula",
    label: "Nebula",
    fontClass: "font-sans",
    titleUppercase: false,
    radiusPx: 28,
    decor: "GLASS",
    art: "STARS",
    powerShape: "PILL",
    headerPrefix: "✦ ",
    strokePx: 1,
    light: {
      bg: "#F3EEF9",
      bgSubtle: "#E8DFF4",
      surface: "#FAF7FE",
      surfaceElev: "#FFFFFF",
      label: "#1A1029",
      labelSec: "#4F3F68",
      labelTer: "#6A5885",
      accent: "#A61B64",
      accentGrad: "#5B21B6",
      onAccent: "#FFF5FA",
      gold: "#6D28D9",
      goldText: "#4C1D95",
      ok: "#0D6848",
      warn: "#8A4F00",
      err: "#AD1A3E",
    },
    dark: {
      bg: "#080612",
      bgSubtle: "#100B22",
      surface: "#171130",
      surfaceElev: "#211944",
      label: "#F6F0FF",
      labelSec: "#BDB0D9",
      labelTer: "#8B7CA8",
      accent: "#F472B6",
      accentGrad: "#A78BFA",
      onAccent: "#220518",
      gold: "#38BDF8",
      goldText: "#7DD3FC",
      ok: "#34D399",
      warn: "#FBBF24",
      err: "#FB7185",
    },
  },
  glacier: {
    id: "glacier",
    label: "Glacier",
    fontClass: "font-sans",
    titleUppercase: true,
    radiusPx: 10,
    decor: "SHADOW",
    art: "FACETS",
    powerShape: "HEXAGON",
    headerPrefix: "",
    strokePx: 1.25,
    light: {
      bg: "#ECF4F8",
      bgSubtle: "#DCEAF2",
      surface: "#F6FAFC",
      surfaceElev: "#FFFFFF",
      label: "#091E2A",
      labelSec: "#355364",
      labelTer: "#517082",
      accent: "#0B4F6C",
      accentGrad: "#08374C",
      onAccent: "#F2FAFF",
      gold: "#026873",
      goldText: "#014951",
      ok: "#0C6348",
      warn: "#7D4E00",
      err: "#A11D2D",
    },
    dark: {
      bg: "#050E14",
      bgSubtle: "#0A1822",
      surface: "#0F2230",
      surfaceElev: "#163042",
      label: "#E6F4FA",
      labelSec: "#9EC0D1",
      labelTer: "#6D93A6",
      accent: "#38BDF8",
      accentGrad: "#0EA5E9",
      onAccent: "#031D2B",
      gold: "#67E8F9",
      goldText: "#A5F3FC",
      ok: "#2DD4BF",
      warn: "#FBBF24",
      err: "#FB7185",
    },
  },
};

function resolveSpec(theme: string | undefined): ThemeStyleSpec {
  const key = (theme ?? "billet").toLowerCase() as AndroidThemeKey;
  return ANDROID_THEMES[key] ?? ANDROID_THEMES.billet;
}

/**
 * Motifs mathématiques SVG issus de `Guilloche.kt` et `ThemeArt.kt`.
 */
function ThemeArtSvg({
  art,
  accent,
  gold,
}: {
  art: ArtKind;
  accent: string;
  gold: string;
}) {
  if (art === "GUILLOCHE") {
    // Courbes polaires : r = R + a1*sin(f1*t) + a2*cos(f2*t) (Guilloche.kt l. 30-56)
    const rings = [0, 1, 2, 3, 4].map((k) => {
      const base = 92 * (0.46 + k * 0.12);
      const a1 = 92 * 0.045 * (k % 2 === 0 ? 1 : -1);
      const a2 = 92 * 0.025;
      const f1 = 12;
      const f2 = 24;
      const pts: string[] = [];
      for (let i = 0; i <= 180; i++) {
        const t = (i / 180) * Math.PI * 2;
        const r = base + a1 * Math.sin(f1 * t + k * 0.6) + a2 * Math.cos(f2 * t);
        const x = 100 + r * Math.cos(t);
        const y = 100 + r * Math.sin(t);
        pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
      }
      return { d: `${pts.join(" ")} Z`, stroke: k === 2 ? gold : accent, opacity: k === 2 ? 0.55 : 0.3 };
    });
    return (
      <svg viewBox="0 0 200 200" className="pointer-events-none absolute inset-0 size-full">
        {rings.map((ring, idx) => (
          <path
            key={idx}
            d={ring.d}
            fill="none"
            stroke={ring.stroke}
            strokeOpacity={ring.opacity}
            strokeWidth="1.2"
          />
        ))}
      </svg>
    );
  }

  if (art === "ORBITS") {
    return (
      <svg viewBox="0 0 200 200" className="pointer-events-none absolute inset-0 size-full">
        <circle cx="100" cy="100" r="82" fill={accent} fillOpacity="0.1" />
        {[0.5, 0.7, 0.9].map((k, i) => (
          <circle
            key={i}
            cx="100"
            cy="100"
            r={90 * k}
            fill="none"
            stroke={i === 1 ? gold : accent}
            strokeOpacity={0.35 - i * 0.06}
            strokeWidth="1.2"
          />
        ))}
        <circle cx={100 + 63 * Math.cos(-0.9)} cy={100 + 63 * Math.sin(-0.9)} r="4" fill={accent} fillOpacity="0.75" />
        <circle cx={100 + 81 * Math.cos(2.1)} cy={100 + 81 * Math.sin(2.1)} r="3" fill={gold} fillOpacity="0.75" />
      </svg>
    );
  }

  if (art === "TYPE") {
    const ticks = Array.from({ length: 60 }, (_, i) => {
      const a = (i / 60) * Math.PI * 2;
      const major = i % 5 === 0;
      const r0 = major ? 70 : 76;
      const r1 = 83;
      return {
        x1: 100 + r0 * Math.cos(a),
        y1: 100 + r0 * Math.sin(a),
        x2: 100 + r1 * Math.cos(a),
        y2: 100 + r1 * Math.sin(a),
        major,
      };
    });
    return (
      <svg viewBox="0 0 200 200" className="pointer-events-none absolute inset-0 size-full">
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke={accent}
            strokeOpacity={t.major ? 0.55 : 0.22}
            strokeWidth={t.major ? "1.6" : "0.9"}
          />
        ))}
        <circle cx="100" cy="100" r="56" fill="none" stroke={accent} strokeOpacity="0.22" strokeWidth="1" />
      </svg>
    );
  }

  if (art === "RADAR") {
    const sweepAngle = -Math.PI / 4;
    return (
      <svg viewBox="0 0 200 200" className="pointer-events-none absolute inset-0 size-full">
        {[0.38, 0.58, 0.78, 0.94].map((k, i) => (
          <circle
            key={i}
            cx="100"
            cy="100"
            r={90 * k}
            fill="none"
            stroke={accent}
            strokeOpacity="0.32"
            strokeWidth="1.1"
          />
        ))}
        <line x1="15" y1="100" x2="185" y2="100" stroke={accent} strokeOpacity="0.22" strokeWidth="1" />
        <line x1="100" y1="15" x2="100" y2="185" stroke={accent} strokeOpacity="0.22" strokeWidth="1" />
        <line
          x1="100"
          y1="100"
          x2={100 + 85 * Math.cos(sweepAngle)}
          y2={100 + 85 * Math.sin(sweepAngle)}
          stroke={gold}
          strokeOpacity="0.65"
          strokeWidth="1.8"
        />
      </svg>
    );
  }

  if (art === "BURST") {
    const rays = Array.from({ length: 24 }, (_, i) => {
      const a = (i / 24) * Math.PI * 2;
      const inner = i % 2 === 0 ? 48 : 58;
      const outer = i % 3 === 0 ? 88 : 79;
      return {
        x1: 100 + inner * Math.cos(a),
        y1: 100 + inner * Math.sin(a),
        x2: 100 + outer * Math.cos(a),
        y2: 100 + outer * Math.sin(a),
        stroke: i % 4 === 0 ? gold : accent,
        major: i % 2 === 0,
      };
    });
    const dots = Array.from({ length: 16 }, (_, i) => {
      const a = ((i + 0.5) / 16) * Math.PI * 2;
      return {
        cx: 100 + 65 * Math.cos(a),
        cy: 100 + 65 * Math.sin(a),
      };
    });
    return (
      <svg viewBox="0 0 200 200" className="pointer-events-none absolute inset-0 size-full">
        {rays.map((r, i) => (
          <line
            key={i}
            x1={r.x1}
            y1={r.y1}
            x2={r.x2}
            y2={r.y2}
            stroke={r.stroke}
            strokeOpacity={r.major ? 0.5 : 0.28}
            strokeWidth={r.major ? "2.2" : "1.1"}
          />
        ))}
        {dots.map((d, i) => (
          <circle key={i} cx={d.cx} cy={d.cy} r="2.2" fill={gold} fillOpacity="0.45" />
        ))}
      </svg>
    );
  }

  if (art === "KENTE") {
    const diamonds = [0.56, 0.74, 0.9].map((k, idx) => {
      const rad = 90 * k;
      const rot = idx % 2 === 0 ? 0 : Math.PI / 4;
      const pts = [0, 1, 2, 3].map((j) => {
        const a = rot + (j * Math.PI) / 2;
        return `${(100 + rad * Math.cos(a)).toFixed(1)},${(100 + rad * Math.sin(a)).toFixed(1)}`;
      });
      return { pts: pts.join(" "), stroke: idx === 1 ? gold : accent };
    });
    return (
      <svg viewBox="0 0 200 200" className="pointer-events-none absolute inset-0 size-full">
        {diamonds.map((d, i) => (
          <polygon
            key={i}
            points={d.pts}
            fill="none"
            stroke={d.stroke}
            strokeOpacity="0.45"
            strokeWidth="1.5"
          />
        ))}
      </svg>
    );
  }

  if (art === "STARS") {
    return (
      <svg viewBox="0 0 200 200" className="pointer-events-none absolute inset-0 size-full">
        <circle cx="100" cy="100" r="84" fill={accent} fillOpacity="0.14" />
        <ellipse cx="100" cy="100" rx="81" ry="49" fill="none" stroke={accent} strokeOpacity="0.28" strokeWidth="1.1" />
        <ellipse cx="100" cy="100" rx="52" ry="79" fill="none" stroke={gold} strokeOpacity="0.24" strokeWidth="1.1" />
      </svg>
    );
  }

  // FACETS
  const hexes = [0.52, 0.72, 0.9].map((k, ring) => {
    const rad = 90 * k;
    const rot = ring * (Math.PI / 6);
    const pts = [0, 1, 2, 3, 4, 5].map((i) => {
      const a = rot + (i * Math.PI) / 3;
      return `${(100 + rad * Math.cos(a)).toFixed(1)},${(100 + rad * Math.sin(a)).toFixed(1)}`;
    });
    return { pts: pts.join(" "), stroke: ring === 1 ? gold : accent };
  });
  return (
    <svg viewBox="0 0 200 200" className="pointer-events-none absolute inset-0 size-full">
      {hexes.map((h, i) => (
        <polygon key={i} points={h.pts} fill="none" stroke={h.stroke} strokeOpacity="0.42" strokeWidth="1.2" />
      ))}
    </svg>
  );
}

/**
 * Forme du bouton d'activation central (`PowerShape` dans `Style.kt` et `Themed.kt`).
 */
function PowerButtonShape({
  shape,
  fill,
  stroke,
  onAccent,
  logoPreviewUrl,
  appName,
}: {
  shape: PowerShapeKind;
  fill: string;
  stroke: string;
  onAccent: string;
  logoPreviewUrl?: string | null;
  appName: string;
}) {
  const clipMap: Record<PowerShapeKind, string | undefined> = {
    CIRCLE: undefined,
    SQUIRCLE: undefined,
    SQUARE: undefined,
    PILL: undefined,
    OCTAGON: "polygon(29% 0%, 71% 0%, 100% 29%, 100% 71%, 71% 100%, 29% 100%, 0% 71%, 0% 29%)",
    DIAMOND: "polygon(50% 2%, 98% 50%, 50% 98%, 2% 50%)",
    HEXAGON: "polygon(50% 2%, 95% 26%, 95% 74%, 50% 98%, 5% 74%, 5% 26%)",
    BLOB: undefined,
  };

  const radiusMap: Record<PowerShapeKind, string> = {
    CIRCLE: "9999px",
    SQUIRCLE: "26px",
    SQUARE: "6px",
    PILL: "9999px",
    OCTAGON: "0px",
    DIAMOND: "0px",
    HEXAGON: "0px",
    BLOB: "42% 58% 47% 53% / 54% 44% 56% 46%",
  };

  return (
    <div
      className="relative flex items-center justify-center shadow-md transition-transform"
      style={{
        width: shape === "PILL" ? "96px" : "86px",
        height: shape === "PILL" ? "74px" : "86px",
        background: fill,
        borderRadius: radiusMap[shape],
        clipPath: clipMap[shape],
        border: `1.5px solid ${stroke}`,
      }}
    >
      {logoPreviewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoPreviewUrl}
          alt={appName}
          className="size-10 rounded-lg object-contain"
        />
      ) : (
        <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke={onAccent} strokeWidth="2.2" strokeLinecap="round">
          <path d="M12 3v9" />
          <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
        </svg>
      )}
    </div>
  );
}

/**
 * Décor de carte (`Decor` dans `Themed.kt` : `SHADOW`, `GLASS`, `RULE`, `TERMINAL`, `STICKER`).
 */
function getCardDecorStyle(decor: DecorKind, seed: ThemeSeed, radiusPx: number): React.CSSProperties {
  if (decor === "RULE") {
    return {
      background: seed.surface,
      borderTop: `1px solid ${seed.label}28`,
      borderBottom: `1px solid ${seed.label}28`,
      borderRadius: 0,
    };
  }
  if (decor === "TERMINAL") {
    return {
      background: seed.surface,
      border: `1.25px solid ${seed.accent}55`,
      borderRadius: `${radiusPx}px`,
    };
  }
  if (decor === "STICKER") {
    return {
      background: seed.surface,
      border: `2px solid ${seed.label}`,
      borderRadius: `${radiusPx}px`,
      boxShadow: `3px 3px 0px ${seed.label}`,
    };
  }
  if (decor === "GLASS") {
    return {
      background: `${seed.surface}E6`,
      border: `1px solid ${seed.label}18`,
      borderRadius: `${radiusPx}px`,
      backdropFilter: "blur(8px)",
    };
  }
  return {
    background: seed.surface,
    border: `1px solid ${seed.label}18`,
    borderRadius: `${radiusPx}px`,
    boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
  };
}

export type PreviewScreenTab = "home" | "plans" | "welcome";

/**
 * Aperçu fidèle au code Android réel (`apps/android/app/src/main/java/cm/bouendji/vpn/ui/`).
 * Reproduit `Home.kt`, `Plans.kt` (`MemberCard` + `Bill`), `Intro.kt` (`welcome` sheet)
 * et `Shell.kt` (`TabBar` flottante) avec les palettes exactes de `Billet.kt` et les
 * ornements vectoriels de `Guilloche.kt` / `ThemeArt.kt`.
 */
export function PhonePreview({
  appName,
  displayName: displayNameProp,
  communityName = "Communauté",
  theme = "billet",
  accent,
  accentHex,
  logoPreviewUrl,
  logoUrl,
  whatsappGroupUrl,
  showWelcomePopup = false,
  compact = false,
  className,
}: PhonePreviewProps) {
  const spec = resolveSpec(theme);
  const [darkMode, setDarkMode] = React.useState(true);
  const [screen, setScreen] = React.useState<PreviewScreenTab>(showWelcomePopup ? "welcome" : "home");
  const [prevWelcome, setPrevWelcome] = React.useState(showWelcomePopup);
  if (showWelcomePopup !== prevWelcome) {
    setPrevWelcome(showWelcomePopup);
    if (showWelcomePopup) setScreen("welcome");
  }

  const rawSeed = darkMode ? spec.dark : spec.light;
  const resolvedAccent = accent ?? accentHex;
  const effectiveAccent = resolvedAccent && /^#[0-9A-Fa-f]{6}$/.test(resolvedAccent) ? resolvedAccent : rawSeed.accent;
  const seed: ThemeSeed = {
    ...rawSeed,
    accent: effectiveAccent,
  };

  const resolvedLogo = logoPreviewUrl ?? logoUrl;
  const displayName = (appName ?? displayNameProp ?? "Bouendji VPN").trim() || "Bouendji VPN";
  const displayCommunity = communityName.trim() || "Communauté";
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "BV";

  const formatHeader = (text: string) => `${spec.headerPrefix}${text.toUpperCase()}`;
  const formatTitle = (text: string) => (spec.titleUppercase ? text.toUpperCase() : text);
  const cardStyle = getCardDecorStyle(spec.decor, seed, Math.min(spec.radiusPx, 18));

  return (
    <div className={cn("flex flex-col items-center gap-2.5", className)}>
      {/* Contrôles d'inspection de l'aperçu Android */}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {(
          [
            { id: "home", label: "Accueil" },
            { id: "plans", label: "Billet NJI" },
            { id: "welcome", label: "Bienvenue" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setScreen(tab.id)}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
              screen === tab.id
                ? "bg-primary text-primary-foreground"
                : "bg-group text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setDarkMode((d) => !d)}
          className="rounded-full border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          title="Basculer entre le mode clair et sombre du thème Android"
        >
          {darkMode ? "Sombre" : "Clair"} · {spec.label}
        </button>
      </div>

      {/* Châssis Android */}
      <div
        className={cn(
          "relative flex flex-col overflow-hidden rounded-[2.4rem] border-[6px] border-zinc-900 shadow-xl select-none",
          compact ? "w-[264px]" : "w-[292px]",
          spec.fontClass,
        )}
        style={{
          background: seed.bg,
          color: seed.label,
        }}
        aria-label={`Aperçu Android de ${displayName} (thème ${spec.label})`}
      >
        {/* Barre d'état Android */}
        <div
          className="flex items-center justify-between px-5 pt-2.5 pb-1 text-[10px] font-medium"
          style={{ color: seed.labelSec }}
        >
          <span className="font-mono">20:42</span>
          <span
            className="h-2 w-12 rounded-full"
            style={{ background: `${seed.label}22` }}
          />
          <div className="flex items-center gap-1 font-mono text-[9px]">
            <span>VPN</span>
            <span>5G</span>
          </div>
        </div>

        {/* Contenu de l'écran */}
        {screen === "plans" ? (
          /* Écran Forfaits / Carte de membre NJI (`Plans.kt`) */
          <div className="flex flex-1 flex-col gap-2.5 px-3.5 pt-1 pb-16">
            <div className="flex items-center justify-between">
              <span
                className="text-base font-bold tracking-tight"
                style={{ color: seed.label }}
              >
                {formatTitle("Forfaits")}
              </span>
              <span
                className="rounded-full px-2 py-0.5 text-[9px] font-bold"
                style={{ background: `${seed.gold}28`, color: seed.goldText }}
              >
                Actif
              </span>
            </div>

            {/* MemberCard (`Banknote` + `Guilloche(Guil.SEAL)`) */}
            <div
              className="relative overflow-hidden p-3"
              style={{
                background: `linear-gradient(135deg, ${seed.surfaceElev}, ${seed.bgSubtle})`,
                border: `1px solid ${seed.gold}66`,
                borderRadius: `${Math.min(spec.radiusPx, 18)}px`,
              }}
            >
              <div className="flex items-center justify-between text-[8px] font-mono tracking-widest" style={{ color: seed.goldText }}>
                <span>CARTE DE MEMBRE</span>
                <span>SÉRIE BV-8F2A</span>
              </div>
              <p className="mt-1 text-lg font-bold tracking-tight" style={{ color: seed.label }}>
                {formatTitle("NJI")}
              </p>
              <p className="text-[10px]" style={{ color: seed.labelSec }}>
                Membre actif · expire dans 24 j
              </p>
              <div
                className="mt-2 border-t pt-1.5 font-mono text-[9px]"
                style={{ borderColor: `${seed.label}1F`, color: seed.labelTer }}
              >
                ID A19F · 4C82 · E011 · {displayName.toUpperCase().slice(0, 6)}
              </div>
            </div>

            {/* Composer mon billet (`CustomBuilder`) */}
            <div className="px-0.5 text-[9px] font-semibold tracking-wider" style={{ color: seed.labelTer }}>
              {formatHeader("Sur mesure")}
            </div>
            <div className="flex flex-col gap-1.5 p-2.5" style={cardStyle}>
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-[11px] font-semibold" style={{ color: seed.label }}>
                    Composer mon billet
                  </p>
                  <p className="text-[9px]" style={{ color: seed.labelSec }}>
                    10 Go · 14 jours
                  </p>
                </div>
                <span className="font-mono text-xs font-bold" style={{ color: seed.goldText }}>
                  1 850 FCFA
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: `${seed.label}1A` }}>
                <div className="h-full w-3/5 rounded-full" style={{ background: seed.accent }} />
              </div>
            </div>

            {/* Billets (`Bill` avec talon hachuré et perforation) */}
            <div className="px-0.5 text-[9px] font-semibold tracking-wider" style={{ color: seed.labelTer }}>
              {formatHeader("Billets")}
            </div>
            {[
              { code: "NUIT", title: "Billet Nuit 20h–04h", sub: "Illimité sur nœuds éphémères", price: "200", badge: "Nuit" },
              { code: "MOIS", title: "Forfait Mensuel 25 Go", sub: "30 jours · 2 appareils", price: "2 500", badge: "Populaire" },
            ].map((b) => (
              <div key={b.code} className="flex overflow-hidden" style={cardStyle}>
                <div
                  className="flex w-11 shrink-0 flex-col items-center justify-center border-e border-dashed py-2"
                  style={{
                    background: `${seed.accent}1A`,
                    borderColor: `${seed.label}28`,
                  }}
                >
                  <span className="font-mono text-[8px]" style={{ color: seed.labelTer }}>N°</span>
                  <span className="font-mono text-[9px] font-bold" style={{ color: seed.accent }}>
                    {b.code}
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 items-center justify-between gap-2 px-2.5 py-2">
                  <div className="min-w-0">
                    <span
                      className="inline-block rounded px-1.5 py-0.2 text-[8px] font-bold"
                      style={{ background: `${seed.gold}26`, color: seed.goldText }}
                    >
                      {b.badge}
                    </span>
                    <p className="truncate text-[11px] font-semibold" style={{ color: seed.label }}>
                      {b.title}
                    </p>
                    <p className="truncate text-[9px]" style={{ color: seed.labelSec }}>
                      {b.sub}
                    </p>
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="font-mono text-xs font-bold" style={{ color: seed.label }}>
                      {b.price}
                    </p>
                    <p className="font-mono text-[8px]" style={{ color: seed.labelTer }}>
                      FCFA
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Écran Accueil (`Home.kt`) */
          <div className="flex flex-1 flex-col items-center px-3.5 pt-1 pb-16">
            {/* Barre supérieure : Avatar à gauche + Capsule statut à droite */}
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="flex size-7 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{
                    background: `${seed.accent}22`,
                    color: seed.accent,
                    border: `1px solid ${seed.accent}44`,
                  }}
                >
                  {initials}
                </div>
                <span className="max-w-[120px] truncate text-[11px] font-semibold" style={{ color: seed.label }}>
                  {displayName}
                </span>
              </div>
              <span
                className="rounded-full px-2.5 py-0.5 text-[9px] font-bold"
                style={{ background: `${seed.gold}28`, color: seed.goldText }}
              >
                Actif
              </span>
            </div>

            {/* Salutation & statut (`StatusDot` + titre 32sp + sous-titre) */}
            <p className="mt-2 text-[10px]" style={{ color: seed.labelSec }}>
              Bonjour, Membre
            </p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span
                className="size-2 rounded-full"
                style={{
                  background: seed.ok,
                  boxShadow: `0 0 8px ${seed.ok}`,
                }}
              />
              <span className="text-lg font-bold tracking-tight" style={{ color: seed.label }}>
                {formatTitle("Protégé")}
              </span>
            </div>
            <p className="text-[10px]" style={{ color: seed.labelSec }}>
              Ton trafic passe par Francfort.
            </p>

            {/* Contrôle central `PowerControl` (154px) : `ThemeArt` + `PowerButtonShape` */}
            <div className="relative my-1.5 flex size-[148px] items-center justify-center">
              <ThemeArtSvg art={spec.art} accent={seed.accent} gold={seed.gold} />
              <PowerButtonShape
                shape={spec.powerShape}
                fill={`linear-gradient(145deg, ${seed.accent}, ${seed.accentGrad})`}
                stroke={seed.gold}
                onAccent={seed.onAccent}
                logoPreviewUrl={resolvedLogo}
                appName={displayName}
              />
            </div>

            {/* Indications sous le bouton (`Home.kt` l. 199-231) */}
            <p className="text-[10px] font-medium" style={{ color: seed.labelSec }}>
              Touche pour te déconnecter
            </p>
            <p className="mt-0.5 text-[9px]" style={{ color: seed.labelTer }}>
              14,2 Go restants sur 20 Go
            </p>
            <p className="mt-0.5 font-mono text-[11px] font-semibold" style={{ color: seed.labelSec }}>
              00:12:45
            </p>

            {/* Triplet (`Réception` | `Envoi` | `Latence`) */}
            <div className="mt-2 grid w-full grid-cols-3 gap-1 p-2 text-center" style={cardStyle}>
              <div>
                <p className="text-[8px]" style={{ color: seed.labelTer }}>Réception</p>
                <p className="font-mono text-[10px] font-bold" style={{ color: seed.label }}>18,4 Mb/s</p>
              </div>
              <div className="border-x" style={{ borderColor: `${seed.label}18` }}>
                <p className="text-[8px]" style={{ color: seed.labelTer }}>Envoi</p>
                <p className="font-mono text-[10px] font-bold" style={{ color: seed.label }}>4,2 Mb/s</p>
              </div>
              <div>
                <p className="text-[8px]" style={{ color: seed.labelTer }}>Latence</p>
                <p className="font-mono text-[10px] font-bold" style={{ color: seed.ok }}>42 ms</p>
              </div>
            </div>

            {/* Section SERVEUR (`GroupHeader` + `Group` + `ListRow`) */}
            <div className="mt-2 w-full text-start text-[8px] font-semibold tracking-wider" style={{ color: seed.labelTer }}>
              {formatHeader("Serveur")}
            </div>
            <div className="mt-1 flex w-full items-center justify-between px-2.5 py-2" style={cardStyle}>
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="grid size-6 shrink-0 place-items-center rounded-full font-mono text-[9px] font-bold"
                  style={{ background: `${seed.accent}22`, color: seed.accent }}
                >
                  DE
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-semibold" style={{ color: seed.label }}>
                    Allemagne
                  </p>
                  <p className="truncate text-[8px]" style={{ color: seed.labelSec }}>
                    Francfort · choix automatique
                  </p>
                </div>
              </div>
              <span className="font-mono text-[9px] font-semibold" style={{ color: seed.ok }}>
                42 ms ›
              </span>
            </div>
          </div>
        )}

        {/* Barre d'onglets flottante (`TabBar` de `Shell.kt` : 4 onglets `Accueil`, `Serveurs`, `Nji`, `Profil`) */}
        <div className="pointer-events-none absolute inset-x-3 bottom-2.5 z-10">
          <div
            className="grid h-11 grid-cols-4 items-center rounded-full px-1.5 shadow-lg"
            style={{
              background: `${seed.surfaceElev}EB`,
              border: `1px solid ${seed.label}1F`,
              backdropFilter: "blur(10px)",
            }}
          >
            {[
              { id: "home", label: "Accueil", active: screen !== "plans" },
              { id: "servers", label: "Serveurs", active: false },
              { id: "plans", label: "Nji", active: screen === "plans" },
              { id: "profile", label: "Profil", active: false },
            ].map((t) => (
              <div
                key={t.id}
                className="flex flex-col items-center justify-center rounded-full py-1"
                style={{
                  background: t.active ? `${seed.accent}24` : "transparent",
                  color: t.active ? seed.accent : seed.labelTer,
                }}
              >
                <span className="text-[9px] font-bold">{t.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Feuille modale de bienvenue au 1er lancement (`SheetHost` "welcome" dans `Intro.kt` l. 193-224) */}
        {screen === "welcome" ? (
          <div className="absolute inset-0 z-20 flex flex-col justify-end bg-black/55 backdrop-blur-[1px]">
            <div
              className="m-2.5 flex flex-col items-center gap-2 p-4 text-center shadow-2xl"
              style={{
                background: seed.surfaceElev,
                borderRadius: `${Math.max(spec.radiusPx, 16)}px`,
                border: `1px solid ${seed.label}22`,
              }}
            >
              <div
                className="flex size-10 items-center justify-center rounded-2xl text-xs font-bold"
                style={{ background: `${seed.accent}22`, color: seed.accent }}
              >
                {initials}
              </div>
              <p className="text-xs font-bold" style={{ color: seed.label }}>
                Bienvenue sur {displayName} !
              </p>
              <p className="text-[10px] leading-relaxed" style={{ color: seed.labelSec }}>
                Ton compte est prêt. Rejoins le groupe WhatsApp de{" "}
                <strong style={{ color: seed.label }}>{displayCommunity}</strong> pour suivre les annonces, les créneaux de nuit et l&apos;aide directe.
              </p>
              <div
                className="mt-1 flex w-full items-center justify-center gap-1.5 py-2 text-[10px] font-bold"
                style={{
                  background: whatsappGroupUrl ? seed.accent : `${seed.label}22`,
                  color: whatsappGroupUrl ? seed.onAccent : seed.labelSec,
                  borderRadius: `${Math.min(spec.radiusPx, 14)}px`,
                }}
              >
                <span>Rejoindre la communauté WhatsApp</span>
              </div>
              <button
                type="button"
                onClick={() => setScreen("plans")}
                className="w-full py-1.5 text-[10px] font-semibold"
                style={{
                  color: seed.label,
                  border: `1px solid ${seed.label}28`,
                  borderRadius: `${Math.min(spec.radiusPx, 14)}px`,
                }}
              >
                Voir les forfaits
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
