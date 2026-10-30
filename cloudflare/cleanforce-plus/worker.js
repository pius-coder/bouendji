// Page de téléchargement dynamique d'une marque.
//
// Le sous-domaine porte le slug : `saitrix.cleanforceplus.online` -> `saitrix`.
// Le Worker interroge le catalogue public de l'API et rend la page avec la
// version publiée, l'APK et les contacts saisis par l'administrateur.
// Chaque marque a sa propre mise en page : table THEMES, une fonction par thème,
// appelée par `render(catalog, theme)`.
//
// Tout autre hôte ou chemin répond 404, sans annuaire commun (D144).

const ROOT = "cleanforceplus.online";
const API = "https://api.numzer0.store";

/** Sous-domaine -> ligne `apps.id` et thème. Ajouter une marque = une ligne ici. */
export const APPS = {
  bouendji: { id: "f3d5ee21-55f5-4885-bf6a-ba3af77ec70b", theme: "billet", logo: "https://apps.cleanforceplus.online/brands/logos/bouendji.png" },
  teste: { id: "cb6dbc5e-4cc3-4dc0-8c06-d2ae4cfa94a9", theme: "halo" },
  goatvpn: { id: "bc625882-9c1c-469b-af8f-6610801319d8", theme: "vector", logo: "https://apps.cleanforceplus.online/brands/logos/goatvpn.png" },
  "james-pro": { id: "d73f4abe-38eb-45a9-9294-9da021e412a8", theme: "mono" },
  gregor44: { id: "e01f7a55-17fa-4a71-958d-9a6e0d338bfe", theme: "otaku" },
  "dalas-npv": { id: "32a037c3-a76b-4843-8686-c847e408df41", theme: "sahel" },
  saitrix: { id: "da24b189-1bff-459c-b7af-3ffe01468bff", theme: "nebula", logo: "https://apps.cleanforceplus.online/brands/logos/saitrix.png" },
  nevpn: { id: "ce57954c-922f-455c-a210-a7b737e892d5", theme: "glacier" },
  solo: { id: "f7bc9530-b783-4dce-9305-0465d534ea0b", theme: "ligne", logo: "https://apps.cleanforceplus.online/brands/logos/solo.png" },
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    if (!host.endsWith("." + ROOT)) return notFound();
    const sub = host.slice(0, -(ROOT.length + 1));
    const entry = APPS[sub];
    if (!entry) return notFound();
    if (url.pathname !== "/" && url.pathname !== "/index.html") return notFound();

    try {
      const response = await fetch(`${API}/v1/apps/${entry.id}/plans`, {
        headers: { accept: "application/json" },
        cf: { cacheTtl: 300, cacheEverything: true },
      });
      if (!response.ok) throw new Error(`API ${response.status}`);
      const catalog = await response.json();
      return html(render(catalog, entry.theme, { logo: entry.logo }), 200);
    } catch {
      // L'API est injoignable : on ne casse pas la page, on dit de réessayer.
      return env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
    }
  },
};

/** Logo de la marque quand il existe, sinon rien (le titre suffit). */
function logo(f) {
  return f.logo ? `<img class="brand-logo" src="${f.logo}" alt="" width="72" height="72">` : "";
}

/** Initiale ou logo, pour les sceaux et les orbes. */
function mark(f) {
  return f.logo ? `<img class="brand-logo brand-logo-round" src="${f.logo}" alt="" width="72" height="72">` : f.initial;
}

function notFound() {
  return new Response("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

function html(body, status) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    },
  });
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/** Extrait les seuls champs affichés. Aucun prix, aucun identifiant. */
export function fields(catalog, opts = {}) {
  const app = catalog?.app ?? {};
  const support = catalog?.support ?? {};
  // Le fichier est sur le R2 du même domaine : l'utilisateur ne voit qu'un nom.
  const apk = (app.updateUrl || "").replace("https://apps.numzer0.store", "https://apps.cleanforceplus.online");
  return {
    name: esc(app.name || "Application"),
    initial: esc((app.name || "A").trim().charAt(0).toUpperCase()),
    versionRaw: app.latestVersionName ? esc(app.latestVersionName) : "",
    version: app.latestVersionName ? `Version ${esc(app.latestVersionName)}` : "Version publiée",
    apk: apk ? esc(apk) : "",
    whatsapp: support.whatsappUrl ? esc(support.whatsappUrl) : "",
    group: support.groupUrl ? esc(support.groupUrl) : "",
    logo: opts.logo ? esc(opts.logo) : "",
  };
}

const HINT = "Après le téléchargement, autorise l'installation depuis ton navigateur si Android le demande.";
const REQ = "Android 8 ou plus récent · installation directe, sans Play Store";

function cta(f, cls, label = "Télécharger l'application") {
  return f.apk
    ? `<a class="${cls}" href="${f.apk}" download>${label}</a>`
    : `<p class="pending">Aucun APK publié pour l'instant.</p>`;
}

function links(f, cls, wa = "Support WhatsApp", grp = "Rejoindre la communauté") {
  return [
    f.whatsapp ? `<a class="${cls}" href="${f.whatsapp}">${wa}</a>` : "",
    f.group ? `<a class="${cls}" href="${f.group}">${grp}</a>` : "",
  ].join("");
}

/** Gabarit commun : <head>, jetons clair/sombre, socle responsive. */
function page(f, light, dark, css, body) {
  const vars = (o) => Object.entries(o).map(([k, v]) => `--${k}:${v}`).join(";");
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${f.name} — Télécharger</title>
<meta name="description" content="Téléchargez ${f.name} (${f.version}) pour Android.">
<meta name="robots" content="noindex,nofollow">
<meta name="color-scheme" content="light dark">
<style>.brand-logo{display:block;width:72px;height:72px;object-fit:contain;margin:0 0 14px}.brand-logo-round{border-radius:50%}
:root{${vars(light)}}
@media (prefers-color-scheme:dark){:root{${vars(dark)}}}
*{box-sizing:border-box}
html,body{overflow-x:hidden}
body{margin:0;min-height:100dvh;background:var(--bg);color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
a{color:inherit}
.pending{color:var(--warn,#C0392B);font-weight:600}
${css}
</style>
</head>
<body>
${body}
</body>
</html>`;
}

/* ---------- 1. billet : un billet de banque / ticket détachable ---------- */
function billet(f) {
  return page(f,
    { bg: "#F3EBDD", ink: "#2A1E12", muted: "#7A6650", paper: "#FFF8EC", accent: "#1F6B4A", line: "#C9B48F" },
    { bg: "#16110B", ink: "#F2E6D0", muted: "#B3A083", paper: "#231A10", accent: "#5DC08F", line: "#5A4630" },
    `main{max-width:720px;margin:0 auto;padding:40px 16px}
.ticket{display:grid;grid-template-columns:1fr 200px;background:var(--paper);border:2px solid var(--line);border-radius:6px;position:relative}
.ticket::before{content:"";position:absolute;inset:8px;border:1px dashed var(--line);border-radius:3px;pointer-events:none}
.body{padding:28px 24px;border-right:2px dashed var(--line)}
.serial{font-family:ui-monospace,Consolas,monospace;font-size:12px;letter-spacing:.2em;color:var(--muted)}
h1{font-family:Georgia,"Times New Roman",serif;font-size:clamp(30px,7vw,46px);margin:10px 0 4px;font-weight:700}
.ver{color:var(--muted);margin:0 0 18px;font-style:italic;font-family:Georgia,serif}
.seal{width:84px;height:84px;color:var(--accent)}
.stub{padding:24px 18px;display:flex;flex-direction:column;justify-content:center;gap:10px;text-align:center}
.stub small{font-size:11px;text-transform:uppercase;letter-spacing:.15em;color:var(--muted)}
.dl{display:block;background:var(--accent);color:var(--paper);padding:14px 10px;text-decoration:none;font-weight:700;border-radius:3px}
.alt{display:block;font-size:13px;padding:8px;border:1px solid var(--line);text-decoration:none;border-radius:3px}
.foot{margin-top:18px;font-size:13px;color:var(--muted);line-height:1.6}
@media (max-width:560px){.ticket{grid-template-columns:1fr}.body{border-right:0;border-bottom:2px dashed var(--line)}}`,
    `<main>
<div class="ticket">
  <section class="body">
    <div class="serial">N° ${f.versionRaw || "—"} · ANDROID</div>
    ${logo(f)}<h1>${f.name}</h1>
    <p class="ver">${f.version}</p>
    <svg class="seal" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="50" cy="50" r="36" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="3 3"/>${f.logo ? `<image href="${f.logo}" x="22" y="22" width="56" height="56"/>` : ""}<text x="50" y="60" text-anchor="middle" font-family="Georgia,serif" font-size="30" fill="currentColor">${f.logo ? "" : f.initial}</text></svg>
  </section>
  <aside class="stub">
    <small>Coupon d'installation</small>
    ${cta(f, "dl", "Télécharger")}
    ${links(f, "alt")}
  </aside>
</div>
<p class="foot">${HINT}<br>${REQ}</p>
</main>`);
}

/* ---------- 2. halo : centrage absolu, anneaux concentriques ---------- */
function halo(f) {
  return page(f,
    { bg: "#F4F6FF", ink: "#141833", muted: "#5D6390", accent: "#6C5CE7", ring: "#C9C4FA", onacc: "#fff" },
    { bg: "#0A0C1E", ink: "#ECEBFF", muted: "#9EA2CC", accent: "#9B8CFF", ring: "#2C2860", onacc: "#120A2A" },
    `main{min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:32px 16px;text-align:center}
.orb{position:relative;width:min(300px,80vw);aspect-ratio:1;display:grid;place-items:center}
.orb svg{position:absolute;inset:0;width:100%;height:100%;color:var(--ring)}
.core{width:42%;aspect-ratio:1;border-radius:50%;background:var(--accent);color:var(--onacc);display:grid;place-items:center;font-size:44px;font-weight:800;box-shadow:0 0 60px var(--accent)}
h1{font-size:clamp(28px,7vw,40px);margin:24px 0 4px;letter-spacing:-.02em}
.ver{color:var(--muted);margin:0 0 22px}
.dl{display:inline-block;padding:16px 36px;border-radius:999px;background:var(--accent);color:var(--onacc);font-weight:700;text-decoration:none}
.row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:14px}
.alt{padding:10px 16px;border-radius:999px;border:1px solid var(--ring);text-decoration:none;font-size:14px}
.foot{max-width:420px;color:var(--muted);font-size:13px;line-height:1.6;margin-top:22px}`,
    `<main>
<div class="orb"><svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="100" cy="100" r="78" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="100" cy="100" r="60" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2 6"/></svg><div class="core">${mark(f)}</div></div>
${logo(f)}<h1>${f.name}</h1>
<p class="ver">${f.version}</p>
${cta(f, "dl")}
<div class="row">${links(f, "alt")}</div>
<p class="foot">${HINT}<br>${REQ}</p>
</main>`);
}

/* ---------- 3. mono : terminal, aligné à gauche, monospace ---------- */
function mono(f) {
  return page(f,
    { bg: "#FAFAFA", ink: "#111", muted: "#666", accent: "#111", line: "#DDD", onacc: "#FAFAFA" },
    { bg: "#0B0B0B", ink: "#EDEDED", muted: "#8A8A8A", accent: "#EDEDED", line: "#262626", onacc: "#0B0B0B" },
    `body{font-family:ui-monospace,"SF Mono",Consolas,Menlo,monospace}
main{max-width:640px;margin:0 auto;padding:48px 16px}
.bar{display:flex;justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:10px;font-size:12px;color:var(--muted)}
h1{font-size:clamp(26px,8vw,48px);margin:36px 0 0;font-weight:700;letter-spacing:-.04em;word-break:break-word}
.ver{color:var(--muted);margin:6px 0 32px}
.ver::before{content:"$ version → "}
.dl{display:block;border:2px solid var(--accent);background:var(--accent);color:var(--onacc);padding:16px;text-decoration:none;font-weight:700}
.dl::before{content:"> "}
dl{margin:28px 0;display:grid;grid-template-columns:auto 1fr;gap:8px 16px;font-size:14px}
dt{color:var(--muted)}dd{margin:0;word-break:break-word}
.alt{display:block;padding:10px 0;border-bottom:1px dashed var(--line);text-decoration:none;font-size:14px}
.alt::before{content:"→ "}
.foot{font-size:12px;color:var(--muted);line-height:1.7}`,
    `<main>
<div class="bar"><span>${f.name.toLowerCase()}</span><span>android</span></div>
${logo(f)}<h1>${f.name}</h1>
<p class="ver">${f.versionRaw || "publiée"}</p>
${cta(f, "dl", "telecharger.apk")}
<dl><dt>cible</dt><dd>Android 8+</dd><dt>source</dt><dd>installation directe</dd><dt>store</dt><dd>aucun</dd></dl>
${links(f, "alt", "support --whatsapp", "communaute --join")}
<p class="foot"># ${HINT}</p>
</main>`);
}

/* ---------- 4. vector : deux colonnes, formes anguleuses ---------- */
function vector(f) {
  return page(f,
    { bg: "#F2F5F7", ink: "#0E1A22", muted: "#4D6170", accent: "#00B37E", panel: "#0E1A22", onpanel: "#F2F5F7" },
    { bg: "#060C10", ink: "#E3EEF3", muted: "#86A0AE", accent: "#19E59D", panel: "#0F1E26", onpanel: "#E3EEF3" },
    `main{display:grid;grid-template-columns:1.1fr 1fr;min-height:100dvh}
.art{background:var(--panel);color:var(--onpanel);position:relative;overflow:hidden;display:flex;align-items:flex-end;padding:32px 16px 32px 32px;clip-path:polygon(0 0,100% 0,88% 100%,0 100%)}
.art svg{position:absolute;inset:0;width:100%;height:100%;color:var(--accent);opacity:.9}
.art h1{position:relative;font-size:clamp(32px,7vw,64px);margin:0;line-height:.95;text-transform:uppercase;letter-spacing:-.03em}
.side{padding:40px 16px;display:flex;flex-direction:column;justify-content:center;gap:12px;max-width:420px}
.tag{font-size:12px;font-weight:700;letter-spacing:.2em;color:var(--accent);text-transform:uppercase}
.ver{font-size:22px;font-weight:700;margin:0}
.dl{display:block;background:var(--accent);color:#03130D;padding:16px 20px;font-weight:800;text-decoration:none;clip-path:polygon(0 0,100% 0,94% 100%,0 100%);text-transform:uppercase}
.alt{display:block;border-left:4px solid var(--accent);padding:8px 12px;text-decoration:none}
.foot{color:var(--muted);font-size:13px;line-height:1.6}
@media (max-width:720px){main{grid-template-columns:1fr}.art{min-height:260px;clip-path:polygon(0 0,100% 0,100% 82%,0 100%);padding:24px 16px 56px}}`,
    `<main>
<section class="art"><svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><polygon points="40,40 200,20 160,180" fill="none" stroke="currentColor" stroke-width="2"/><polygon points="220,120 380,80 300,300" fill="currentColor" opacity=".25"/><line x1="0" y1="360" x2="400" y2="200" stroke="currentColor" stroke-width="1"/><circle cx="200" cy="20" r="5" fill="currentColor"/><circle cx="160" cy="180" r="5" fill="currentColor"/><circle cx="300" cy="300" r="5" fill="currentColor"/></svg>${logo(f)}<h1>${f.name}</h1></section>
<section class="side">
  <span class="tag">Android · APK</span>
  <p class="ver">${f.version}</p>
  ${cta(f, "dl")}
  ${links(f, "alt")}
  <p class="foot">${HINT}<br>${REQ}</p>
</section>
</main>`);
}

/* ---------- 5. otaku : planche de manga, cases ---------- */
function otaku(f) {
  return page(f,
    { bg: "#FFFFFF", ink: "#111", muted: "#555", accent: "#FF2E63", pop: "#FFE45E", frame: "#111" },
    { bg: "#121212", ink: "#F5F5F5", muted: "#AAA", accent: "#FF4F7E", pop: "#3A3300", frame: "#F5F5F5" },
    `main{max-width:760px;margin:0 auto;padding:24px 16px;display:grid;grid-template-columns:repeat(6,1fr);gap:10px}
.p{border:4px solid var(--frame);padding:18px;position:relative;min-width:0}
.title{grid-column:1/5;background:var(--accent);color:#fff;transform:rotate(-1deg)}
.title h1{font-size:clamp(28px,8vw,54px);margin:0;font-weight:900;font-style:italic;line-height:1}
.ver{grid-column:5/7;background:var(--pop);display:grid;place-items:center;text-align:center;font-weight:900}
.burst{grid-column:1/4;display:grid;place-items:center}
.burst svg{width:100%;max-width:220px;color:var(--accent)}
.act{grid-column:4/7;display:flex;flex-direction:column;gap:10px;justify-content:center}
.bubble{background:var(--bg);border:3px solid var(--frame);border-radius:20px;padding:12px;font-size:14px;line-height:1.5;grid-column:1/7}
.dl{display:block;background:var(--frame);color:var(--bg);text-align:center;padding:16px;font-weight:900;text-decoration:none;text-transform:uppercase;box-shadow:6px 6px 0 var(--accent)}
.alt{display:block;border:3px solid var(--frame);padding:10px;text-align:center;text-decoration:none;font-weight:700}
@media (max-width:560px){.title,.ver,.burst,.act{grid-column:1/7}.burst svg{max-width:160px}}`,
    `<main>
<div class="p title">${logo(f)}<h1>${f.name}!</h1></div>
<div class="p ver">${f.version}</div>
<div class="p burst"><svg viewBox="0 0 200 200" aria-hidden="true"><polygon points="100,5 120,70 190,50 135,100 195,150 120,130 100,195 80,130 5,150 65,100 10,50 80,70" fill="currentColor"/><text x="100" y="115" text-anchor="middle" font-size="44" font-weight="900" fill="#fff">GO</text></svg></div>
<div class="p act">${cta(f, "dl", "Télécharger")}${links(f, "alt")}</div>
<p class="bubble">${HINT} — ${REQ}</p>
</main>`);
}

/* ---------- 6. sahel : bandes horizontales, soleil, terre ---------- */
function sahel(f) {
  return page(f,
    { bg: "#FBF1E1", ink: "#3B1F0E", muted: "#8A5A3A", accent: "#C8551B", sand: "#EED3A6", band: "#E5A04A" },
    { bg: "#1A0F08", ink: "#F6E3C8", muted: "#C49A74", accent: "#F07A3A", sand: "#2B1A0E", band: "#7A4415" },
    `header{background:linear-gradient(var(--band),var(--accent));padding:40px 16px 0;text-align:center;color:#FFF7EA}
header svg{width:140px;height:70px;display:block;margin:0 auto}
header h1{font-family:Georgia,serif;font-size:clamp(30px,8vw,52px);margin:16px 0 0;padding-bottom:24px}
.stripes{height:18px;background:repeating-linear-gradient(90deg,var(--ink) 0 18px,var(--sand) 18px 36px,var(--accent) 36px 54px)}
main{max-width:640px;margin:0 auto;padding:28px 16px}
.ver{text-align:center;color:var(--muted);font-size:17px;margin:0 0 20px}
.dl{display:block;text-align:center;background:var(--ink);color:var(--bg);padding:18px;border-radius:14px 14px 40px 40px;font-weight:700;text-decoration:none;font-size:18px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
.alt{display:block;background:var(--sand);padding:14px;border-radius:12px;text-decoration:none;text-align:center;font-size:14px}
.foot{color:var(--muted);font-size:13px;line-height:1.6;text-align:center;margin-top:22px}
@media (max-width:420px){.grid{grid-template-columns:1fr}}`,
    `<header><svg viewBox="0 0 140 70" aria-hidden="true"><circle cx="70" cy="70" r="40" fill="#FFF3D6"/><g stroke="#FFF3D6" stroke-width="3"><line x1="70" y1="0" x2="70" y2="20"/><line x1="20" y1="20" x2="34" y2="34"/><line x1="120" y1="20" x2="106" y2="34"/><line x1="0" y1="60" x2="22" y2="62"/><line x1="140" y1="60" x2="118" y2="62"/></g></svg>${logo(f)}<h1>${f.name}</h1></header>
<div class="stripes"></div>
<main>
<p class="ver">${f.version}</p>
${cta(f, "dl")}
<div class="grid">${links(f, "alt")}</div>
<p class="foot">${HINT}<br>${REQ}</p>
</main>`);
}

/* ---------- 7. nebula : plein écran étoilé, carte de verre en bas ---------- */
function nebula(f) {
  const stars = Array.from({ length: 40 }, (_, i) =>
    `<circle cx="${(i * 97) % 400}" cy="${(i * 61) % 400}" r="${(i % 3) * 0.6 + 0.5}"/>`).join("");
  return page(f,
    { bg: "#E9E4FF", ink: "#1B1240", muted: "#5B4F8A", accent: "#B347FF", glass: "rgba(255,255,255,.6)", star: "#7A5BD6" },
    { bg: "#05030F", ink: "#F3EEFF", muted: "#A79BD0", accent: "#C77DFF", glass: "rgba(30,18,70,.55)", star: "#FFFFFF" },
    `body{background:radial-gradient(60% 50% at 70% 20%,color-mix(in srgb,var(--accent) 45%,transparent),transparent),radial-gradient(50% 40% at 20% 60%,color-mix(in srgb,#3AA0FF 30%,transparent),transparent),var(--bg)}
.sky{position:fixed;inset:0;width:100%;height:100%;fill:var(--star);opacity:.7;z-index:0}
main{position:relative;z-index:1;min-height:100dvh;display:flex;flex-direction:column;justify-content:space-between;padding:24px 16px;max-width:560px;margin:0 auto}
.top{font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)}
h1{font-size:clamp(40px,13vw,88px);margin:0;line-height:.9;font-weight:200;letter-spacing:-.04em}
.card{background:var(--glass);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent);border-radius:24px;padding:20px}
.ver{margin:0 0 14px;color:var(--muted)}
.dl{display:block;text-align:center;padding:16px;border-radius:16px;background:linear-gradient(90deg,var(--accent),#3AA0FF);color:#fff;font-weight:700;text-decoration:none}
.row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.alt{flex:1 1 140px;text-align:center;padding:10px;border-radius:12px;border:1px solid color-mix(in srgb,var(--ink) 20%,transparent);text-decoration:none;font-size:13px}
.foot{font-size:12px;color:var(--muted);line-height:1.6;margin:14px 0 0}`,
    `<svg class="sky" viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${stars}</svg>
<main>
<div class="top">Android · Orbite</div>
${logo(f)}<h1>${f.name}</h1>
<div class="card">
  <p class="ver">${f.version}</p>
  ${cta(f, "dl")}
  <div class="row">${links(f, "alt")}</div>
  <p class="foot">${HINT}<br>${REQ}</p>
</div>
</main>`);
}

/* ---------- 8. glacier : guide d'installation en étapes ---------- */
function glacier(f) {
  return page(f,
    { bg: "#EAF4FA", ink: "#0B2A3C", muted: "#4F7387", accent: "#1C8FD1", ice: "#FFFFFF", edge: "#BFDCEC" },
    { bg: "#071722", ink: "#E2F2FB", muted: "#87AFC4", accent: "#4FC3F7", ice: "#0D2433", edge: "#1C3D52" },
    `body{background:linear-gradient(180deg,var(--bg),color-mix(in srgb,var(--accent) 12%,var(--bg)))}
main{max-width:860px;margin:0 auto;padding:40px 16px;display:grid;grid-template-columns:1fr 1.2fr;gap:28px;align-items:start}
.peak{color:var(--accent);width:100%;max-width:260px}
h1{font-size:clamp(30px,7vw,48px);margin:12px 0 4px;letter-spacing:-.02em}
.ver{color:var(--muted);margin:0 0 20px}
.dl{display:block;text-align:center;background:var(--accent);color:#fff;padding:16px;border-radius:10px;font-weight:700;text-decoration:none}
ol{list-style:none;margin:0;padding:0;display:grid;gap:12px;counter-reset:s}
li{background:var(--ice);border:1px solid var(--edge);border-radius:14px;padding:16px 16px 16px 60px;position:relative;counter-increment:s;line-height:1.5}
li::before{content:counter(s);position:absolute;left:16px;top:14px;width:30px;height:30px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;font-weight:700}
li strong{display:block}
li span{color:var(--muted);font-size:14px}
.alt{display:inline-block;margin:6px 8px 0 0;color:var(--accent);font-weight:600;font-size:14px}
.foot{color:var(--muted);font-size:12px;margin-top:14px}
@media (max-width:680px){main{grid-template-columns:1fr}}`,
    `<main>
<section>
  <svg class="peak" viewBox="0 0 260 120" aria-hidden="true"><polygon points="0,120 80,30 120,70 170,10 260,120" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><polyline points="150,36 170,10 190,40 178,34 166,44" fill="currentColor" opacity=".35"/></svg>
  ${logo(f)}<h1>${f.name}</h1>
  <p class="ver">${f.version}</p>
  ${cta(f, "dl")}
</section>
<ol>
  <li><strong>Télécharger l'APK</strong><span>Le fichier arrive dans le dossier Téléchargements.</span></li>
  <li><strong>Autoriser l'installation</strong><span>${HINT}</span></li>
  <li><strong>Ouvrir et se connecter</strong><span>${REQ}</span></li>
  ${f.whatsapp || f.group ? `<li><strong>Besoin d'aide ?</strong>${links(f, "alt")}</li>` : ""}
</ol>
</main>`);
}

/* ---------- 9. ligne : Solo, minimal, filets fins, bleu #0A5CF0 ---------- */
function ligne(f) {
  return page(f,
    { bg: "#FFFFFF", ink: "#0B1220", muted: "#5A6478", accent: "#0A5CF0", rule: "#E3E7EF" },
    { bg: "#0A0E17", ink: "#EEF2FA", muted: "#8E98AD", accent: "#3D7FFF", rule: "#1E2636" },
    `main{max-width:560px;margin:0 auto;padding:32px 16px}
.head{display:flex;align-items:center;gap:14px;padding-bottom:20px;border-bottom:1px solid var(--rule)}
.mark{width:56px;height:56px;border-radius:14px;border:1.5px solid var(--accent);display:grid;place-items:center;overflow:hidden;color:var(--accent);font-weight:700;font-size:24px;flex:none}
.mark img{width:100%;height:100%;object-fit:cover}
h1{font-size:24px;margin:0;font-weight:600}
.ver{margin:2px 0 0;color:var(--muted);font-size:14px}
.row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:18px 0;border-bottom:1px solid var(--rule);text-decoration:none}
.row b{font-weight:500}.row i{font-style:normal;color:var(--accent)}
.dl{display:flex;justify-content:space-between;margin:24px 0 8px;padding:16px 18px;border-radius:12px;background:var(--accent);color:#fff;text-decoration:none;font-weight:600}
.dl::after{content:"↓"}
.line{height:2px;background:var(--accent);width:48px;margin:28px 0 12px}
.foot{color:var(--muted);font-size:13px;line-height:1.6;margin:0}`,
    `<main>
<div class="head">
  <div class="mark">${f.logo ? `<img src="${f.logo}" alt="">` : f.initial}</div>
  <div>${logo(f)}<h1>${f.name}</h1><p class="ver">${f.version}</p></div>
</div>
${cta(f, "dl")}
${f.whatsapp ? `<a class="row" href="${f.whatsapp}"><b>Support WhatsApp</b><i>→</i></a>` : ""}
${f.group ? `<a class="row" href="${f.group}"><b>Rejoindre la communauté</b><i>→</i></a>` : ""}
<div class="line"></div>
<p class="foot">${HINT}<br>${REQ}</p>
</main>`);
}

export const THEMES = { billet, halo, mono, vector, otaku, sahel, nebula, glacier, ligne };

/** Rend la page d'une marque. Thème inconnu -> halo. */
export function render(catalog, theme = "halo", opts = {}) {
  const fn = THEMES[theme] ?? THEMES.halo;
  return fn(fields(catalog, opts));
}
