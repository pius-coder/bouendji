#!/usr/bin/env node
/**
 * Logo et illustration d'une marque, en SVG, à partir de son manifeste.
 *
 * Une marque sans `tools/brands/<slug>/icon.png` recevait l'icône par défaut du
 * dépôt (la mascotte Bouendji) : toutes les apps se ressemblaient. Ce script
 * dessine, pour chaque marque, un emblème propre :
 *   - la forme vient du thème (billet : sceau guilloché ; halo : orbe ;
 *     mono : tampon éditorial ; vector : octogone de terminal ; otaku : éclat manga) ;
 *   - le centre porte les initiales de la marque ;
 *   - un détail (nombre de rayons, angle, motif) dérive du nom : deux marques
 *     du même thème n'ont pas le même logo.
 *
 * Sorties : <out>/icon.svg (512×512, fond plein, pour l'icône du lanceur) et
 * <out>/mascot.svg (illustration sans fond, affichée dans l'app).
 * Le workflow les convertit en PNG (rsvg-convert) puis appelle make-icons.py.
 *
 * Usage : node tools/make-logo.mjs --spec tools/brands/<slug>.json --out <dossier>
 * Aucune dépendance.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const specPath = arg("spec");
const out = arg("out");
if (!specPath || !out) {
  console.error("usage : node tools/make-logo.mjs --spec <manifeste.json> --out <dossier>");
  process.exit(64);
}
const spec = JSON.parse(readFileSync(specPath, "utf8"));
const name = String(spec.appName ?? "").trim() || "VPN";
const theme = String(spec.theme ?? "billet");

/* ------------------------------------------------------------- utilitaires */

/** Initiales : deux premières lettres des deux premiers mots, sinon les deux premières lettres. */
export function initialsOf(value) {
  const words = value.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  const raw = words.length >= 2 ? words[0][0] + words[1][0] : (words[0] ?? "V").slice(0, 2);
  return raw.toUpperCase();
}

/** Graine stable tirée du nom (FNV-1a). */
function seedOf(value) {
  let h = 0x811c9dc5;
  for (const ch of value) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const f = (n) => Number(n.toFixed(2));
const seed = seedOf(name);
const pick = (list, salt = 0) => list[(seed >>> salt) % list.length];
const ini = esc(initialsOf(name));

/* Couleurs : palettes sombres des thèmes (ui/theme/Billet.kt). */
const PALETTES = {
  billet: { bg: "#0F1D14", bg2: "#1B2D20", ink: "#C3E5AE", accent: "#8CC56E", gold: "#C9A24E" },
  halo: { bg: "#070A12", bg2: "#15233D", ink: "#F3F7FF", accent: "#4C9BFF", gold: "#38BDF8" },
  mono: { bg: "#F6F3EC", bg2: "#EDE8DC", ink: "#141210", accent: "#141210", gold: "#8A7444" },
  vector: { bg: "#04070A", bg2: "#08130F", ink: "#C9FFDA", accent: "#39FF88", gold: "#22C55E" },
  otaku: { bg: "#FF4D7D", bg2: "#E11D5A", ink: "#101014", accent: "#FFFFFF", gold: "#FACC15" },
  sahel: { bg: "#3A1F12", bg2: "#C2541B", ink: "#FFE8D2", accent: "#F08A3E", gold: "#E8B34B", indigo: "#2F4FA8" },
  nebula: { bg: "#0B0716", bg2: "#2A1B4F", ink: "#F2EDFF", accent: "#A78BFA", gold: "#F472B6" },
  glacier: { bg: "#EAF8FF", bg2: "#BFEAF7", ink: "#0B2233", accent: "#0891B2", gold: "#5CE1FF" },
};
const p = PALETTES[theme] ?? PALETTES.billet;

const FONTS = {
  serif: "'DejaVu Serif', 'Noto Serif', Georgia, serif",
  sans: "'DejaVu Sans', 'Noto Sans', Arial, sans-serif",
  mono: "'DejaVu Sans Mono', 'Noto Sans Mono', monospace",
};

function polar(cx, cy, r, deg) {
  const a = (deg * Math.PI) / 180;
  return [f(cx + r * Math.cos(a)), f(cy + r * Math.sin(a))];
}

/* ------------------------------------------------------------ emblèmes */

/** Emblème centré en (256, 256), rayon utile ~190. Renvoie du SVG. */
function emblem() {
  const size = ini.length > 1 ? 150 : 210;
  switch (theme) {
    case "halo": {
      const orbits = 3 + (seed % 3);
      const tilt = seed % 60;
      let g = `<defs><radialGradient id="orb" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="${p.ink}"/><stop offset=".45" stop-color="${p.accent}"/><stop offset="1" stop-color="${p.bg2}"/></radialGradient>
<radialGradient id="glow"><stop offset="0" stop-color="${p.accent}" stop-opacity=".55"/><stop offset="1" stop-color="${p.accent}" stop-opacity="0"/></radialGradient></defs>
<circle cx="256" cy="256" r="230" fill="url(#glow)"/>`;
      for (let i = 0; i < orbits; i++) {
        g += `<ellipse cx="256" cy="256" rx="${200 - i * 14}" ry="${70 + i * 22}" fill="none" stroke="${p.gold}" stroke-opacity="${f(0.75 - i * 0.12)}" stroke-width="5" transform="rotate(${tilt + i * (180 / orbits)} 256 256)"/>`;
      }
      g += `<circle cx="256" cy="256" r="118" fill="url(#orb)"/>`;
      const [sx, sy] = polar(256, 256, 196, tilt + 30);
      g += `<circle cx="${sx}" cy="${sy}" r="15" fill="${p.ink}"/>`;
      g += `<text x="256" y="256" dy=".35em" text-anchor="middle" font-family="${FONTS.sans}" font-weight="300" font-size="${size * 0.72}" fill="${p.bg}" letter-spacing="-4">${ini}</text>`;
      return g;
    }
    case "mono": {
      const ticks = 48;
      let g = `<circle cx="256" cy="256" r="214" fill="none" stroke="${p.ink}" stroke-width="14"/>
<circle cx="256" cy="256" r="184" fill="none" stroke="${p.ink}" stroke-width="3"/>`;
      for (let i = 0; i < ticks; i++) {
        const long = i % 4 === 0;
        const [x1, y1] = polar(256, 256, 184, (i * 360) / ticks);
        const [x2, y2] = polar(256, 256, long ? 160 : 170, (i * 360) / ticks);
        g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${p.ink}" stroke-width="${long ? 5 : 2}"/>`;
      }
      g += `<rect x="146" y="${256 - 4}" width="220" height="8" fill="${p.ink}" transform="rotate(${-8 + (seed % 17)} 256 256)" opacity=".12"/>`;
      g += `<text x="256" y="256" dy=".36em" text-anchor="middle" font-family="${FONTS.serif}" font-weight="900" font-size="${size * 0.82}" fill="${p.ink}">${ini}</text>`;
      return g;
    }
    case "vector": {
      const pts = [];
      for (let i = 0; i < 8; i++) pts.push(polar(256, 256, 214, 22.5 + i * 45).join(","));
      const inner = [];
      for (let i = 0; i < 8; i++) inner.push(polar(256, 256, 180, 22.5 + i * 45).join(","));
      const blips = 2 + (seed % 3);
      let g = `<polygon points="${pts.join(" ")}" fill="${p.bg2}" stroke="${p.accent}" stroke-width="8"/>
<polygon points="${inner.join(" ")}" fill="none" stroke="${p.accent}" stroke-opacity=".45" stroke-width="2" stroke-dasharray="10 8"/>
<line x1="70" y1="256" x2="442" y2="256" stroke="${p.accent}" stroke-opacity=".25" stroke-width="2"/>
<line x1="256" y1="70" x2="256" y2="442" stroke="${p.accent}" stroke-opacity=".25" stroke-width="2"/>`;
      for (let i = 0; i < blips; i++) {
        const [x, y] = polar(256, 256, 120 + ((seed >>> (i * 4)) % 50), (seed >>> (i * 3)) % 360);
        g += `<circle cx="${x}" cy="${y}" r="7" fill="${p.accent}"/>`;
      }
      g += `<text x="256" y="256" dy=".36em" text-anchor="middle" font-family="${FONTS.mono}" font-weight="700" font-size="${size * 0.74}" fill="${p.accent}">${ini}</text>`;
      g += `<text x="256" y="368" text-anchor="middle" font-family="${FONTS.mono}" font-size="26" fill="${p.accent}" fill-opacity=".7">&gt;_</text>`;
      return g;
    }
    case "otaku": {
      const rays = 12 + (seed % 5) * 2;
      const turn = seed % 30;
      const star = [];
      for (let i = 0; i < rays * 2; i++) star.push(polar(256, 256, i % 2 ? 150 : 228, turn + (i * 180) / rays).join(","));
      let g = `<polygon points="${star.join(" ")}" fill="${p.ink}" transform="translate(10 12)"/>
<polygon points="${star.join(" ")}" fill="${p.gold}" stroke="${p.ink}" stroke-width="8" stroke-linejoin="round"/>
<circle cx="256" cy="256" r="128" fill="${p.accent}" stroke="${p.ink}" stroke-width="8"/>`;
      g += `<text x="262" y="262" dy=".36em" text-anchor="middle" font-family="${FONTS.sans}" font-weight="900" font-size="${size * 0.7}" fill="${p.ink}">${ini}</text>`;
      g += `<text x="256" y="256" dy=".36em" text-anchor="middle" font-family="${FONTS.sans}" font-weight="900" font-size="${size * 0.7}" fill="${p.bg}" stroke="${p.ink}" stroke-width="5" paint-order="stroke">${ini}</text>`;
      return g;
    }
    case "sahel": {
      // Masque-bouclier : losanges imbriqués, chevrons de tissage, initiales au centre.
      const bands = 3 + (seed % 3);
      let g = `<defs><linearGradient id="earth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.accent}"/><stop offset="1" stop-color="${p.bg2}"/></linearGradient></defs>
<path d="M256 34 L470 256 L256 478 L42 256 Z" fill="url(#earth)" stroke="${p.gold}" stroke-width="10" stroke-linejoin="round"/>
<path d="M256 92 L412 256 L256 420 L100 256 Z" fill="${p.bg}" stroke="${p.gold}" stroke-width="4"/>`;
      for (let i = 0; i < bands; i++) {
        const y = 128 + i * 22;
        let d = "";
        for (let x = 176 + i * 8; x < 336 - i * 8; x += 20) d += `M${x} ${y + 10} L${x + 10} ${y} L${x + 20} ${y + 10} `;
        g += `<path d="${d}" fill="none" stroke="${p.indigo}" stroke-width="4" stroke-linecap="round"/>`;
      }
      for (let i = 0; i < bands; i++) {
        const y = 384 - i * 22;
        let d = "";
        for (let x = 176 + i * 8; x < 336 - i * 8; x += 20) d += `M${x} ${y - 10} L${x + 10} ${y} L${x + 20} ${y - 10} `;
        g += `<path d="${d}" fill="none" stroke="${p.indigo}" stroke-width="4" stroke-linecap="round"/>`;
      }
      g += `<circle cx="104" cy="256" r="10" fill="${p.gold}"/><circle cx="408" cy="256" r="10" fill="${p.gold}"/>`;
      g += `<text x="256" y="256" dy=".36em" text-anchor="middle" font-family="${FONTS.serif}" font-weight="700" font-size="${size * 0.62}" fill="${p.ink}">${ini}</text>`;
      return g;
    }
    case "nebula": {
      // Planète à anneau dans une nébuleuse, étoiles semées à partir du nom.
      let g = `<defs><radialGradient id="neb" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="${p.gold}" stop-opacity=".9"/><stop offset=".45" stop-color="${p.accent}" stop-opacity=".55"/><stop offset="1" stop-color="${p.bg2}" stop-opacity="0"/></radialGradient>
<linearGradient id="planet" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.accent}"/><stop offset="1" stop-color="${p.bg2}"/></linearGradient></defs>
<circle cx="256" cy="256" r="236" fill="url(#neb)"/>`;
      for (let i = 0; i < 22; i++) {
        const [x, y] = polar(256, 256, 60 + ((seed >>> (i % 24)) % 170), (i * 137.5 + (seed % 90)) % 360);
        const big = i % 6 === 0;
        g += big
          ? `<path d="M${x} ${y - 12} Q${x} ${y} ${x + 12} ${y} Q${x} ${y} ${x} ${y + 12} Q${x} ${y} ${x - 12} ${y} Q${x} ${y} ${x} ${y - 12}Z" fill="${p.ink}"/>`
          : `<circle cx="${x}" cy="${y}" r="${f(1.6 + (i % 3))}" fill="${p.ink}" opacity=".85"/>`;
      }
      const tilt = -20 - (seed % 25);
      g += `<ellipse cx="256" cy="256" rx="190" ry="44" fill="none" stroke="${p.gold}" stroke-width="10" transform="rotate(${tilt} 256 256)" opacity=".9"/>
<circle cx="256" cy="256" r="112" fill="url(#planet)"/>
<path d="M66 256 A190 44 0 0 0 446 256" fill="none" stroke="${p.gold}" stroke-width="10" transform="rotate(${tilt} 256 256)"/>`;
      g += `<text x="256" y="256" dy=".36em" text-anchor="middle" font-family="${FONTS.sans}" font-weight="800" font-size="${size * 0.62}" fill="${p.ink}" letter-spacing="-3">${ini}</text>`;
      return g;
    }
    case "glacier": {
      // Cristal hexagonal à facettes, reflets froids.
      const outer = [], inner = [];
      for (let i = 0; i < 6; i++) {
        outer.push(polar(256, 256, 220, -90 + i * 60));
        inner.push(polar(256, 256, 124, -90 + i * 60 + (seed % 2 ? 0 : 30)));
      }
      let g = `<defs><linearGradient id="ice" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".5" stop-color="${p.bg2}"/><stop offset="1" stop-color="${p.accent}"/></linearGradient></defs>
<polygon points="${outer.map((q) => q.join(",")).join(" ")}" fill="url(#ice)" stroke="${p.accent}" stroke-width="6" stroke-linejoin="round"/>`;
      for (let i = 0; i < 6; i++) {
        const o = outer[i], n = inner[i], o2 = outer[(i + 1) % 6];
        const shade = (i + seed) % 3 === 0 ? "#FFFFFF" : (i + seed) % 3 === 1 ? p.gold : p.bg2;
        g += `<polygon points="${o.join(",")} ${o2.join(",")} ${inner[(i + 1) % 6].join(",")} ${n.join(",")}" fill="${shade}" fill-opacity=".45" stroke="${p.accent}" stroke-width="2"/>`;
      }
      g += `<polygon points="${inner.map((q) => q.join(",")).join(" ")}" fill="#FFFFFF" fill-opacity=".85" stroke="${p.accent}" stroke-width="3"/>`;
      g += `<text x="256" y="256" dy=".36em" text-anchor="middle" font-family="${FONTS.sans}" font-weight="200" font-size="${size * 0.58}" fill="${p.ink}" letter-spacing="6">${ini}</text>`;
      return g;
    }
    default: {
      // Billet : sceau guilloché.
      const petals = 10 + (seed % 7);
      let g = `<circle cx="256" cy="256" r="216" fill="${p.bg2}" stroke="${p.gold}" stroke-width="6"/>`;
      let d = "";
      for (let i = 0; i <= 360; i += 2) {
        const r = 170 + 22 * Math.sin((i * petals * Math.PI) / 180);
        const [x, y] = polar(256, 256, r, i);
        d += `${i ? "L" : "M"}${x} ${y}`;
      }
      g += `<path d="${d}Z" fill="none" stroke="${p.ink}" stroke-opacity=".55" stroke-width="2.5"/>`;
      g += `<circle cx="256" cy="256" r="124" fill="${p.bg}" stroke="${p.gold}" stroke-width="3"/>`;
      g += `<text x="256" y="256" dy=".36em" text-anchor="middle" font-family="${FONTS.serif}" font-weight="600" font-size="${size * 0.74}" fill="${p.ink}">${ini}</text>`;
      return g;
    }
  }
}

function iconSvg() {
  const bg =
    theme === "otaku"
      ? `<rect width="512" height="512" fill="${p.bg}"/>${halftone()}`
      : theme === "vector"
        ? `<rect width="512" height="512" fill="${p.bg}"/>${grid()}`
        : `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${p.bg2}"/><stop offset="1" stop-color="${p.bg}"/></linearGradient></defs><rect width="512" height="512" fill="url(#bg)"/>`;
  // L'emblème est réduit à 78 % : la zone sûre d'une icône adaptative est le cercle central.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${bg}<g transform="translate(56 56) scale(.78)">${emblem()}</g></svg>\n`;
}

function mascotSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${emblem()}</svg>\n`;
}

function grid() {
  let g = "";
  for (let i = 0; i <= 512; i += 32) {
    g += `<line x1="${i}" y1="0" x2="${i}" y2="512" stroke="${p.accent}" stroke-opacity=".08"/><line x1="0" y1="${i}" x2="512" y2="${i}" stroke="${p.accent}" stroke-opacity=".08"/>`;
  }
  return g;
}

function halftone() {
  let g = "";
  for (let y = 0; y <= 512; y += 24) {
    for (let x = (y / 24) % 2 ? 12 : 0; x <= 512; x += 24) {
      const k = (x / 512 + (1 - y / 512)) / 2;
      g += `<circle cx="${x}" cy="${y}" r="${f(1.5 + k * 5)}" fill="${p.bg2}"/>`;
    }
  }
  return g;
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, "icon.svg"), iconSvg());
writeFileSync(join(out, "mascot.svg"), mascotSvg());
console.log(`logo ${theme} « ${initialsOf(name)} » → ${out}`);
