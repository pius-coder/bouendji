// Page de téléchargement dynamique d'une marque.
//
// Le sous-domaine porte le slug : `saitrix.cleanforceplus.online` →
// `saitrix`. Le Worker interroge le catalogue public de l'API et rend la page
// avec la version publiée, l'APK et les contacts saisis par l'administrateur.
// Aucune page HTML à réécrire lors d'une nouvelle version.
//
// Tout autre hôte ou chemin répond 404, sans annuaire commun (D144).

const ROOT = "cleanforceplus.online";
const API = "https://api.numzer0.store";

/** Sous-domaine → ligne `apps.id`. Ajouter une marque = une ligne ici. */
const APPS = {
  bouendji: "f3d5ee21-55f5-4885-bf6a-ba3af77ec70b",
  teste: "cb6dbc5e-4cc3-4dc0-8c06-d2ae4cfa94a9",
  goatvpn: "bc625882-9c1c-469b-af8f-6610801319d8",
  "james-pro": "d73f4abe-38eb-45a9-9294-9da021e412a8",
  gregor44: "e01f7a55-17fa-4a71-958d-9a6e0d338bfe",
  "dalas-npv": "32a037c3-a76b-4843-8686-c847e408df41",
  saitrix: "da24b189-1bff-459c-b7af-3ffe01468bff",
  nevpn: "ce57954c-922f-455c-a210-a7b737e892d5",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();
    if (!host.endsWith("." + ROOT)) return notFound();
    const sub = host.slice(0, -(ROOT.length + 1));
    const appId = APPS[sub];
    if (!appId) return notFound();
    if (url.pathname !== "/" && url.pathname !== "/index.html") return notFound();

    try {
      const response = await fetch(`${API}/v1/apps/${appId}/plans`, {
        headers: { accept: "application/json" },
        cf: { cacheTtl: 300, cacheEverything: true },
      });
      if (!response.ok) throw new Error(`API ${response.status}`);
      const catalog = await response.json();
      return html(render(catalog), 200);
    } catch {
      // L'API est injoignable : on ne casse pas la page, on dit de réessayer.
      return env.ASSETS.fetch(new Request(new URL("/index.html", url), request));
    }
  },
};

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

function render(catalog) {
  const app = catalog.app ?? {};
  const support = catalog.support ?? {};
  const name = esc(app.name || "Application");
  const version = app.latestVersionName ? `Version ${esc(app.latestVersionName)}` : "Version publiée";
  // Le fichier est sur le R2 du même domaine : l'utilisateur ne voit qu'un nom.
  const apk = (app.updateUrl || "").replace("https://apps.numzer0.store", "https://apps.cleanforceplus.online");
  const whatsapp = support.whatsappUrl
    ? `<a class="secondary" href="${esc(support.whatsappUrl)}">Contacter le support sur WhatsApp</a>`
    : "";
  const group = support.groupUrl
    ? `<a class="secondary" href="${esc(support.groupUrl)}">Rejoindre la communauté</a>`
    : "";
  const button = apk
    ? `<a class="cta" href="${esc(apk)}">Télécharger l'application</a>`
    : `<p class="pending">Aucun APK publié pour l'instant.</p>`;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${name} — Télécharger</title>
<meta name="description" content="Téléchargez ${name} (${version}) pour Android.">
<meta name="robots" content="noindex,nofollow">
<style>
:root{--bg:#070B1A;--surface:#111731;--ink:#F1F0FF;--muted:#A4A6C4;--accent:#8B5CF6;--on-accent:#120A2A}
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:24px;
background:radial-gradient(1200px 600px at 50% -10%,#221A4A 0%,var(--bg) 60%);color:var(--ink);
font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{width:100%;max-width:520px;background:color-mix(in srgb,var(--surface) 92%,transparent);
border:1px solid #262C55;border-radius:28px;padding:34px 26px;text-align:center;
box-shadow:0 30px 80px rgba(0,0,0,.45)}
.badge{display:inline-block;padding:6px 12px;border-radius:999px;background:#1C2247;color:var(--muted);
font-size:12px;letter-spacing:.08em;text-transform:uppercase}
h1{font-size:clamp(28px,7vw,40px);line-height:1.1;margin:16px 0 6px;letter-spacing:-.02em}
.version{margin:0 0 24px;color:var(--muted);font-size:15px}
.cta{display:block;padding:16px 22px;border-radius:999px;background:var(--accent);color:var(--on-accent);
font-weight:700;font-size:17px;text-decoration:none;margin:8px 0 12px}
.secondary{display:block;padding:12px 18px;border-radius:999px;border:1px solid #2F3663;color:var(--ink);
text-decoration:none;font-size:14px;margin:8px 0}
.hint{color:var(--muted);font-size:13px;line-height:1.5;margin:14px 0 0}
.pending{color:#FFB4B4;font-size:15px}
footer{margin-top:22px;color:#6F7392;font-size:12px}
</style>
</head>
<body>
<main>
  <span class="badge">Application Android</span>
  <h1>${name}</h1>
  <p class="version">${version}</p>
  ${button}
  ${whatsapp}
  ${group}
  <p class="hint">Après le téléchargement, autorise l'installation depuis ton navigateur si Android le demande.</p>
  <footer>Android 12 ou plus récent · installation directe, sans Play Store</footer>
</main>
</body>
</html>`;
}
