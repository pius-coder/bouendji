/**
 * Thèmes d'accent (D103, D106) : seule la couleur primaire change. Préférence par
 * navigateur (localStorage), posée sur <html data-accent> AVANT le premier rendu
 * par `ACCENT_BOOT_SCRIPT` : le shell reste statique et sans flash.
 */
export const ACCENTS = [
  { value: "rose", label: "Rose", swatch: "#db2777" },
  { value: "vert", label: "Vert", swatch: "#15803d" },
  { value: "rouge", label: "Rouge", swatch: "#dc2626" },
] as const;

export type Accent = (typeof ACCENTS)[number]["value"];

export const ACCENT_STORAGE_KEY = "console-accent";
export const DEFAULT_ACCENT: Accent = "rose";

export function isAccent(value: unknown): value is Accent {
  return ACCENTS.some((a) => a.value === value);
}

/** Exécuté dans <head> : lit la préférence, l'applique, ne casse rien si le stockage est bloqué. */
export const ACCENT_BOOT_SCRIPT = `try{var a=localStorage.getItem(${JSON.stringify(ACCENT_STORAGE_KEY)});if(${JSON.stringify(
  ACCENTS.map((a) => a.value),
)}.indexOf(a)>-1)document.documentElement.dataset.accent=a;}catch(e){}`;
