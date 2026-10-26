#!/usr/bin/env node
/**
 * Injection de marque.
 *
 * Une marque n'est pas un réglage : c'est un fichier source réécrit avant la
 * compilation. Ce script prend un manifeste JSON, valide tout ce qui peut
 * casser un build ou une session réseau, puis réécrit **deux** choses :
 *
 *   - `apps/android/app/src/main/java/.../brand/BrandTokens.kt` (valeurs seules)
 *   - `apps/android/brand.properties` (`applicationId`, libellé, versions)
 *
 * Il refuse de produire un build dont l'URL d'API ou le package est invalide :
 * un APK qui démarre puis échoue à l'enrôlement coûte plus cher qu'un build
 * rouge.
 *
 * Usage :
 *   node tools/inject-brand.mjs --spec brand.json --root apps/android
 *   node tools/inject-brand.mjs --spec - --root apps/android   (stdin)
 *
 * Aucune dépendance. Sortie 78 en cas de manifeste invalide.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const THEMES = new Set(["billet", "halo", "mono", "vector", "otaku", "sahel", "nebula", "glacier"]);
const JAVA_RESERVED = new Set([
  "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const",
  "continue", "default", "do", "double", "else", "enum", "extends", "final", "finally", "float",
  "for", "goto", "if", "implements", "import", "instanceof", "int", "interface", "long", "native",
  "new", "package", "private", "protected", "public", "return", "short", "static", "strictfp",
  "super", "switch", "synchronized", "this", "throw", "throws", "transient", "try", "void",
  "volatile", "while", "true", "false", "null",
]);

function die(message, code = 78) {
  console.error(`marque invalide : ${message}`);
  process.exit(code);
}

function parseArgs(argv) {
  const args = { spec: null, root: "apps/android" };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--spec") args.spec = argv[++i];
    else if (flag === "--root") args.root = argv[++i];
    else die(`argument inconnu : ${flag}`, 64);
  }
  if (!args.spec) die("--spec est requis", 64);
  return args;
}

function readSpec(spec) {
  const raw = (spec === "-" ? readFileSync(0, "utf8") : readFileSync(spec, "utf8")).replace(/^\uFEFF/, "");
  try {
    return JSON.parse(raw);
  } catch (err) {
    die(`JSON illisible (${err.message})`);
  }
}

function validated(spec) {
  const out = {};

  if (typeof spec.theme !== "string" || !THEMES.has(spec.theme.toLowerCase())) {
    die(`theme doit être l'un de ${[...THEMES].join(", ")}`);
  }
  out.theme = spec.theme.toLowerCase();

  const name = typeof spec.appName === "string" ? spec.appName.trim() : "";
  if (name.length < 2 || name.length > 40) die("appName doit contenir de 2 à 40 caractères");
  out.appName = name;

  const pkg = typeof spec.packageName === "string" ? spec.packageName.trim() : "";
  const segments = pkg.split(".");
  if (segments.length < 2) die("packageName doit contenir au moins deux segments");
  for (const segment of segments) {
    if (!/^[a-z][a-z0-9_]*$/.test(segment)) {
      die(`packageName : segment invalide « ${segment} » (minuscules, chiffres, _ ; doit commencer par une lettre)`);
    }
    if (JAVA_RESERVED.has(segment)) die(`packageName : « ${segment} » est un mot réservé Java`);
  }
  if (pkg === "cm.bouendji.vpn" && !spec.allowDefaultPackage) {
    die("packageName est encore celui de la marque de référence ; fournissez le vôtre");
  }
  out.packageName = pkg;

  let url;
  try {
    url = new URL(spec.apiBaseUrl);
  } catch {
    die("apiBaseUrl n'est pas une URL absolue");
  }
  if (url.protocol !== "https:") die("apiBaseUrl doit être en https");
  if ((url.pathname && url.pathname !== "/") || url.search || url.hash) {
    die("apiBaseUrl ne doit porter ni chemin, ni query, ni fragment (la signature couvre le chemin exact)");
  }
  if (url.hostname.endsWith(".invalid")) die("apiBaseUrl pointe encore un domaine .invalid");
  out.apiBaseUrl = `https://${url.host}`;

  const appId = typeof spec.appId === "string" ? spec.appId.trim() : "";
  if (!/^[0-9a-fA-F-]{20,40}$/.test(appId) && !/^[0-9A-HJKMNP-TV-Z]{20,40}$/.test(appId)) {
    die("appId doit être l'identifiant de la ligne apps (UUID ou ULID)");
  }
  out.appId = appId;

  if (spec.supportUrl !== undefined && spec.supportUrl !== null && spec.supportUrl !== "") {
    let support;
    try {
      support = new URL(spec.supportUrl);
    } catch {
      die("supportUrl n'est pas une URL absolue");
    }
    if (!["https:", "mailto:", "tel:"].includes(support.protocol)) {
      die("supportUrl doit être https, mailto ou tel");
    }
    if (support.hostname.endsWith(".invalid")) die("supportUrl pointe encore un domaine .invalid");
    out.supportUrl = support.toString();
  } else {
    die("supportUrl est requis : c'est le contact affiché quand plus rien ne passe (D19)");
  }

  if (spec.accent === undefined || spec.accent === null) {
    out.accent = null;
  } else if (typeof spec.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(spec.accent)) {
    out.accent = spec.accent.toUpperCase();
  } else {
    die("accent doit être #RRGGBB ou null");
  }

  const key = spec.offlineBundleSigningKeyB64 ?? "";
  if (typeof key !== "string") die("offlineBundleSigningKeyB64 doit être une chaîne");
  if (key.length > 0 && !/^[A-Za-z0-9+/]+={0,2}$/.test(key)) {
    die("offlineBundleSigningKeyB64 doit être du base64");
  }
  out.offlineBundleSigningKeyB64 = key;

  // Mot de la carte de membre (« NJI » chez Bouendji) : court, en capitales.
  const memberWord = String(spec.memberWord ?? "").trim().toUpperCase();
  if (memberWord && !/^[\p{L}0-9 ]{2,12}$/u.test(memberWord)) die("memberWord : 2 à 12 lettres ou chiffres");
  out.memberWord = memberWord;

  // Liens de communauté : facultatifs, https seulement (WhatsApp, Telegram).
  for (const field of ["communityWhatsappUrl", "communityTelegramUrl"]) {
    const raw = spec[field];
    if (raw === undefined || raw === null || raw === "") {
      out[field] = "";
      continue;
    }
    let link;
    try {
      link = new URL(raw);
    } catch {
      die(`${field} n'est pas une URL absolue`);
    }
    if (link.protocol !== "https:") die(`${field} doit être en https`);
    out[field] = link.toString();
  }

  // Numéro WhatsApp de contact de la communauté : facultatif, chiffres seuls
  // (+ en tête accepté). L'API le normalise déjà ; on refait la règle ici.
  const contactWhatsapp = String(spec.contactWhatsapp ?? "").replace(/[\s-]/g, "");
  if (contactWhatsapp && !/^\+?\d{8,15}$/.test(contactWhatsapp)) {
    die("contactWhatsapp : 8 à 15 chiffres, + facultatif en tête");
  }
  out.contactWhatsapp = contactWhatsapp;

  // Référence du logo : URL https, ou clé R2 relative (ex. brands/marque/logo.png).
  // Le fichier lui-même n'est pas lu ici : la référence est écrite dans
  // brand.properties pour que la pipeline sache quoi récupérer.
  const logoRef = String(spec.logoRef ?? "").trim();
  if (logoRef) {
    const isHttps = logoRef.startsWith("https://");
    const isKey = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,511}$/.test(logoRef) && !logoRef.includes("..");
    if (logoRef.length > 512 || /[\u0000-\u001f\u007f]/.test(logoRef) || (!isHttps && !isKey)) {
      die("logoRef : URL https ou clé R2 relative attendue");
    }
  }
  out.logoRef = logoRef;

  const locale = (spec.defaultLocale ?? "fr").toLowerCase();
  if (!/^[a-z]{2}$/.test(locale)) die("defaultLocale doit être deux lettres minuscules");
  out.defaultLocale = locale;

  const versionCode = Number(spec.versionCode ?? 1);
  if (!Number.isInteger(versionCode) || versionCode < 1 || versionCode > 2_100_000_000) {
    die("versionCode doit être un entier positif");
  }
  out.versionCode = versionCode;

  const versionName = String(spec.versionName ?? "1.0.0").trim();
  if (!/^\d+(\.\d+){0,3}([-+][0-9A-Za-z.-]+)?$/.test(versionName)) {
    die("versionName doit ressembler à 1.0.0");
  }
  out.versionName = versionName;
  out.appVersion = versionName;

  return out;
}

/** Échappe une valeur pour l'insérer dans un littéral Kotlin entre guillemets. */
function kotlin(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$");
}

function replaceConst(source, name, type, literal) {
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // `accent` est nullable : Kotlin interdit `const` sur un type nullable, donc `val` seul.
  const pattern = new RegExp(`((?:const )?val) ${escape(name)}: ${escape(type)} = [^\\n]+`);
  if (!pattern.test(source)) die(`BrandTokens.kt : constante ${name} introuvable`);
  return source.replace(pattern, (_, prefix) => `${prefix} ${name}: ${type} = ${literal}`);
}

function writeBrandTokens(path, brand) {
  if (!existsSync(path)) die(`BrandTokens.kt introuvable : ${path}`);
  let source = readFileSync(path, "utf8");

  source = replaceConst(source, "themeId", "String", `"${brand.theme}"`);
  source = replaceConst(source, "appName", "String", `"${kotlin(brand.appName)}"`);
  source = replaceConst(source, "packageName", "String", `"${brand.packageName}"`);
  source = replaceConst(source, "apiBaseUrl", "String", `"${brand.apiBaseUrl}"`);
  source = replaceConst(source, "appId", "String", `"${brand.appId}"`);
  source = replaceConst(source, "supportUrl", "String", `"${kotlin(brand.supportUrl)}"`);
  source = replaceConst(source, "accent", "String?", brand.accent === null ? "null" : `"${brand.accent}"`);
  source = replaceConst(source, "offlineBundleSigningKeyB64", "String", `"${brand.offlineBundleSigningKeyB64}"`);
  source = replaceConst(source, "defaultLocale", "String", `"${brand.defaultLocale}"`);
  source = replaceConst(source, "appVersion", "String", `"${brand.appVersion}"`);
  source = replaceConst(source, "memberWord", "String", `"${kotlin(brand.memberWord)}"`);
  source = replaceConst(source, "communityWhatsappUrl", "String", `"${kotlin(brand.communityWhatsappUrl)}"`);
  source = replaceConst(source, "communityTelegramUrl", "String", `"${kotlin(brand.communityTelegramUrl)}"`);

  writeFileSync(path, source, "utf8");
  return source;
}

function writeBrandProperties(path, brand) {
  const lines = [
    "# Genere par tools/inject-brand.mjs - ne pas editer a la main.",
    `packageName=${brand.packageName}`,
    `appName=${brand.appName}`,
    `versionCode=${brand.versionCode}`,
    `versionName=${brand.versionName}`,
    `theme=${brand.theme}`,
    `contactWhatsapp=${brand.contactWhatsapp}`,
    `logoRef=${brand.logoRef}`,
    "",
  ];
  writeFileSync(path, lines.join("\n"), "utf8");
  return lines.join("\n");
}

/** Relit ce qui vient d'être écrit : un remplacement silencieux raté est pire qu'une erreur. */
function verify(tokensPath, brand) {
  const source = readFileSync(tokensPath, "utf8");
  const expectations = [
    ["themeId", `const val themeId: String = "${brand.theme}"`],
    ["appName", `const val appName: String = "${kotlin(brand.appName)}"`],
    ["packageName", `const val packageName: String = "${brand.packageName}"`],
    ["apiBaseUrl", `const val apiBaseUrl: String = "${brand.apiBaseUrl}"`],
    ["appId", `const val appId: String = "${brand.appId}"`],
  ];
  for (const [field, expected] of expectations) {
    if (!source.includes(expected)) die(`vérification échouée : ${field} n'a pas été écrit`);
  }
}

const args = parseArgs(process.argv.slice(2));
const brand = validated(readSpec(args.spec));

const tokensPath = join(
  args.root,
  "app/src/main/java/cm/bouendji/vpn/brand/BrandTokens.kt",
);
const propertiesPath = join(args.root, "brand.properties");

writeBrandTokens(tokensPath, brand);
writeBrandProperties(propertiesPath, brand);
verify(tokensPath, brand);

console.log(`marque injectée      ${brand.packageName}`);
console.log(`  thème              ${brand.theme}`);
console.log(`  nom                ${brand.appName}`);
console.log(`  api                ${brand.apiBaseUrl}`);
console.log(`  version            ${brand.versionName} (${brand.versionCode})`);
console.log(`  contact            ${brand.supportUrl}`);
console.log(`  accent             ${brand.accent ?? "celui du thème"}`);
console.log(`  hors-ligne         ${brand.offlineBundleSigningKeyB64 ? "clé fournie" : "désactivé"}`);
