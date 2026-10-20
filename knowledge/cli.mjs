#!/usr/bin/env node
/**
 * knowledge/cli.mjs — lecteur de la base de connaissances du projet VPN.
 * Zéro dépendance. Node >= 20.
 *
 * Chaque noeud est un fichier .md avec un front matter :
 *   ---
 *   id: cloud-run
 *   title: Cloud Run — contraintes réelles
 *   tags: [gcp, cloud-run, ttl]
 *   status: verified | decided | assumption | open | stale
 *   updated: 2026-10-20
 *   related: [endpoint-lifecycle]
 *   ---
 *
 * Commandes :
 *   context                     brief de reprise (à lire après chaque compaction)
 *   tree                        arborescence complète
 *   read <requête>              un noeud + ses descendants + ses liens
 *   find <texte>                recherche plein texte
 *   open                        toutes les décisions non tranchées
 *   recent [n]                  n noeuds les plus récemment mis à jour
 *   check                       validation (ids, statuts, liens, front matter)
 *   new <chemin> --title "..."  créer un noeud
 *   set <id> status=<statut>    changer le statut
 *   path <requête>              imprimer le chemin du fichier
 *
 * Sous-agents (dossier knowledge/agents/) :
 *   agent list                  état de tous les sous-agents
 *   agent new <slug> ...        créer un sous-agent (charte + journal)
 *   agent show <slug>           charte + dernières entrées de journal
 *   agent log <slug> <texte>    ajouter une entrée horodatée
 *   agent close <slug> <texte>  clôturer (statut done)
 *   report [--since ISO] [--write]
 *                               rapport de ce que les sous-agents ont fait
 */

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { join, relative, dirname, basename, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const STATUSES = ["verified", "decided", "assumption", "open", "stale"];
const SKIP_FILES = new Set(["README.md"]);

/* ------------------------------------------------------------------ lecture */

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
    if (entry.name === "agents" && dir === ROOT) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".md") && !SKIP_FILES.has(entry.name)) out.push(full);
  }
  return out.sort();
}

function parseList(value) {
  if (!value) return [];
  if (value.startsWith("[") && value.endsWith("]")) {
    return value
      .slice(1, -1)
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return [value.replace(/^["']|["']$/g, "")];
}

function parse(file) {
  const raw = readFileSync(file, "utf8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  const meta = {};
  let body = raw;
  if (match) {
    body = raw.slice(match[0].length);
    for (const line of match[1].split(/\r?\n/)) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
  }
  const rel = relative(ROOT, file).split(sep).join("/");
  return {
    file,
    rel,
    dir: rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : "",
    id: meta.id || basename(file, ".md"),
    title: meta.title || basename(file, ".md"),
    tags: parseList(meta.tags),
    status: meta.status || "assumption",
    updated: meta.updated || "",
    related: parseList(meta.related),
    body,
    meta,
    hasFrontMatter: Boolean(match),
  };
}

function all() {
  return walk(ROOT).map(parse);
}

/* -------------------------------------------------------------- utilitaires */

const strip = (s) => s.replace(/^#+\s*/gm, "").trim();

function firstLine(node) {
  const line = node.body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#") && !l.startsWith(">"));
  return line ? strip(line).slice(0, 180) : "(vide)";
}

function resolve(nodes, query) {
  const q = query.toLowerCase();
  const exact = nodes.filter((n) => n.id.toLowerCase() === q);
  if (exact.length) return { hits: exact, how: "id exact" };
  const byPath = nodes.filter((n) => n.rel.toLowerCase().includes(q));
  if (byPath.length === 1) return { hits: byPath, how: "chemin" };
  const byTag = nodes.filter((n) => n.tags.some((t) => t.toLowerCase() === q));
  if (byTag.length === 1) return { hits: byTag, how: "tag" };
  const pool = byPath.length ? byPath : byTag;
  if (pool.length) return { hits: pool, how: byPath.length ? "chemin" : "tag" };
  const byTitle = nodes.filter(
    (n) =>
      n.title.toLowerCase().includes(q) ||
      n.body.toLowerCase().includes(q),
  );
  return { hits: byTitle, how: "titre/corps" };
}

function children(nodes, node) {
  if (!node.dir) return nodes.filter((n) => n !== node && n.dir !== "");
  return nodes.filter((n) => n !== node && n.dir.startsWith(node.dir + "/"));
}

/* ------------------------------------------------------------------ commandes */

function cmdContext() {
  const nodes = all();
  const get = (rel) => nodes.find((n) => n.rel === rel);
  const objective = get("00-brief/objective.md");
  const header = (s) => `\n${s}\n${"-".repeat(s.length)}\n`;

  console.log("=== VPN PLATFORM — BRIEF DE REPRISE ===");
  console.log(`noeuds: ${nodes.length} | racine: ${ROOT}`);

  if (objective) {
    console.log(header("OBJECTIF"));
    console.log(strip(objective.body).split(/\r?\n/).slice(0, 12).join("\n"));
  }

  const open = nodes.filter((n) => n.status === "open");
  console.log(header(`NON TRANCHE (${open.length})`));
  for (const n of open) {
    console.log(`- [${n.id}] ${n.title}`);
    console.log(`  ${firstLine(n)}`);
  }

  const recent = nodes
    .filter((n) => n.updated)
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, 8);
  console.log(header("MIS À JOUR RÉCEMMENT"));
  for (const n of recent) console.log(`- ${n.updated}  ${n.id}  (${n.status})  ${n.title}`);

  const slugs = agentSlugs();
  if (slugs.length) {
    console.log(header(`SOUS-AGENTS (${slugs.length})`));
    for (const slug of slugs) {
      const c = agentCharter(slug);
      const last = lastEntry(slug);
      console.log(`- ${slug.padEnd(16)} ${(c?.status ?? "?").padEnd(7)} ${last ? `${last.at} · ${last.title}` : "aucune entrée"}`);
    }
    console.log("  → node knowledge/cli.mjs report   (ce qu'ils ont fait)");
  }

  console.log(header("SUITE"));
  console.log("node knowledge/cli.mjs read <id>   |   find <texte>   |   open   |   report");
  console.log("");
}

function cmdTree() {
  const nodes = all();
  const dirs = new Map();
  for (const n of nodes) {
    const d = n.dir || ".";
    if (!dirs.has(d)) dirs.set(d, []);
    dirs.get(d).push(n);
  }
  console.log(`knowledge/ (${nodes.length} noeuds)\n`);
  for (const d of [...dirs.keys()].sort()) {
    console.log(`${d}/`);
    for (const n of dirs.get(d).sort((a, b) => a.id.localeCompare(b.id))) {
      const flag = n.status === "open" ? "!" : " ";
      console.log(`  ${flag} ${n.id.padEnd(28)} ${n.status.padEnd(11)} ${n.title}`);
    }
  }
  console.log("\n(! = non tranché)");
}

function cmdRead(query) {
  const nodes = all();
  const { hits, how } = resolve(nodes, query);
  if (!hits.length) {
    console.error(`aucun noeud pour "${query}" — essaie: tree`);
    process.exit(2);
  }
  if (hits.length > 1) {
    console.log(`${hits.length} noeuds correspondent (${how}) :\n`);
    for (const n of hits) console.log(`  ${n.id.padEnd(28)} ${n.status.padEnd(11)} ${n.title}`);
    console.log("\nprécise avec l'id.");
    return;
  }
  const node = hits[0];
  console.log(`# ${node.id} — ${node.title}`);
  console.log(`fichier: ${node.rel}`);
  console.log(`statut : ${node.status} | maj: ${node.updated || "?"} | tags: ${node.tags.join(", ") || "-"}`);
  console.log("");
  console.log(node.body.trim());
  console.log("");

  const kids = children(nodes, node);
  if (kids.length) {
    console.log("--- descendants ---");
    for (const k of kids) console.log(`  ${k.id.padEnd(28)} ${k.status.padEnd(11)} ${k.title}`);
    console.log("");
  }
  if (node.related.length) {
    console.log("--- liés ---");
    for (const r of node.related) {
      const target = nodes.find((n) => n.id === r);
      console.log(`  ${r.padEnd(28)} ${target ? target.title : "(lien cassé)"}`);
    }
    console.log("");
  }
}

function cmdFind(text) {
  const q = text.toLowerCase();
  const nodes = all();
  let total = 0;
  for (const n of nodes) {
    const haystack = [n.id, n.title, n.tags.join(" "), n.body].join("\n").toLowerCase();
    if (!haystack.includes(q)) continue;
    total += 1;
    console.log(`\n${n.id}  (${n.status})  ${n.title}`);
    console.log(`  ${n.rel}`);
    const line = n.body
      .split(/\r?\n/)
      .find((l) => l.toLowerCase().includes(q));
    if (line) console.log(`  > ${line.trim().slice(0, 200)}`);
  }
  console.log(`\n${total} résultat(s).`);
}

function cmdOpen() {
  const nodes = all().filter((n) => n.status === "open");
  if (!nodes.length) return console.log("rien en attente.");
  for (const n of nodes) {
    console.log(`\n[${n.id}] ${n.title}`);
    console.log(`  ${firstLine(n)}`);
    console.log(`  → node knowledge/cli.mjs read ${n.id}`);
  }
  console.log("");
}

function cmdRecent(n) {
  const count = Number(n) || 10;
  const nodes = all()
    .filter((x) => x.updated)
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, count);
  for (const x of nodes) console.log(`${x.updated}  ${x.id.padEnd(28)} ${x.status.padEnd(11)} ${x.title}`);
}

function cmdCheck() {
  const nodes = all();
  const errors = [];
  const warnings = [];
  const ids = new Map();

  for (const n of nodes) {
    if (!n.hasFrontMatter) errors.push(`${n.rel}: front matter manquant`);
    if (!n.meta.title) errors.push(`${n.rel}: "title" manquant`);
    if (!STATUSES.includes(n.status)) errors.push(`${n.rel}: statut invalide "${n.status}"`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n.updated)) errors.push(`${n.rel}: "updated" absent ou invalide`);
    if (n.id !== basename(n.rel, ".md")) warnings.push(`${n.rel}: id "${n.id}" différent du nom de fichier`);
    if (ids.has(n.id)) errors.push(`id dupliqué "${n.id}" dans ${n.rel} et ${ids.get(n.id)}`);
    else ids.set(n.id, n.rel);
  }

  for (const n of nodes) {
    for (const r of n.related) if (!ids.has(r)) errors.push(`${n.rel}: lien cassé -> "${r}"`);
    if (n.status === "open" && !/\?/.test(n.body)) warnings.push(`${n.rel}: statut open sans question formulée`);
  }

  console.log(`noeuds: ${nodes.length} | erreurs: ${errors.length} | avertissements: ${warnings.length}`);
  for (const e of errors) console.log(`  ERREUR   ${e}`);
  for (const w of warnings) console.log(`  AVERTISSEMENT  ${w}`);
  if (errors.length) process.exit(1);
}

function cmdNew(args) {
  const rel = args.find((a) => !a.startsWith("--"));
  if (!rel) {
    console.error('usage: new 60-research/mon-sujet --title "Titre" [--tags a,b] [--status open]');
    process.exit(2);
  }
  const flag = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };
  const clean = rel.replace(/\.md$/, "");
  const file = join(ROOT, `${clean}.md`);
  if (existsSync(file)) {
    console.error(`existe déjà: ${clean}.md`);
    process.exit(3);
  }
  mkdirSync(dirname(file), { recursive: true });
  const title = flag("title", basename(clean));
  const tags = flag("tags", "");
  const status = flag("status", "open");
  const today = new Date().toISOString().slice(0, 10);
  writeFileSync(
    file,
    `---\nid: ${basename(clean)}\ntitle: ${title}\ntags: [${tags}]\nstatus: ${status}\nupdated: ${today}\nrelated: []\n---\n\n## Question\n\n?\n\n## Faits\n\n## Recommandation\n\n## Sources\n`,
    "utf8",
  );
  console.log(`créé: ${clean}.md`);
}

function cmdSet(args) {
  const id = args[0];
  const pairs = args.slice(1).filter((a) => a.includes("="));
  const nodes = all();
  const node = nodes.find((n) => n.id === id);
  if (!node) {
    console.error(`id inconnu: ${id}`);
    process.exit(2);
  }
  let raw = readFileSync(node.file, "utf8");
  for (const pair of pairs) {
    const [key, value] = pair.split("=");
    if (key === "status" && !STATUSES.includes(value)) {
      console.error(`statut invalide: ${value}`);
      process.exit(2);
    }
    if (key === "updated") continue;
    const re = new RegExp(`^${key}:.*$`, "m");
    raw = re.test(raw) ? raw.replace(re, `${key}: ${value}`) : raw.replace(/^---\r?\n/, `---\n${key}: ${value}\n`);
  }
  raw = raw.replace(/^updated:.*$/m, `updated: ${new Date().toISOString().slice(0, 10)}`);
  writeFileSync(node.file, raw, "utf8");
  console.log(`mis à jour: ${id}`);
}

function cmdPath(query) {
  const nodes = all();
  const { hits } = resolve(nodes, query);
  if (!hits.length) process.exit(2);
  if (hits.length > 1) {
    for (const n of hits) console.log(n.file);
    return;
  }
  console.log(hits[0].file);
}

/* ---------------------------------------------------------------- sous-agents */

const AGENTS = join(ROOT, "agents");

function isoNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function readIf(file) {
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

function agentSlugs() {
  if (!existsSync(AGENTS)) return [];
  return readdirSync(AGENTS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => e.name)
    .sort();
}

function agentCharter(slug) {
  const file = join(AGENTS, slug, "charter.md");
  if (!existsSync(file)) return null;
  return parse(file);
}

function agentLogEntries(slug) {
  const raw = readIf(join(AGENTS, slug, "log.md"));
  const chunks = raw.split(/^## /m).slice(1);
  return chunks.map((chunk) => {
    const lines = chunk.split(/\r?\n/);
    const head = lines[0].trim();
    const m = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s*[·—-]\s*(.+)$/.exec(head);
    return {
      at: m ? m[1] : "",
      title: m ? m[2].trim() : head,
      body: lines.slice(1).join("\n").trim(),
    };
  });
}

function agentKey(entry, names) {
  for (const line of entry.body.split(/\r?\n/)) {
    const m = /^\s*[-*]?\s*([a-zA-Zéèêàç]+)\s*:\s*(.+)$/.exec(line);
    if (!m) continue;
    if (names.includes(m[1].toLowerCase())) return m[2].trim();
  }
  return "";
}

function lastEntry(slug) {
  const entries = agentLogEntries(slug);
  return entries.length ? entries[entries.length - 1] : null;
}

function cmdAgentList() {
  const slugs = agentSlugs();
  if (!slugs.length) {
    console.log("aucun sous-agent. → node knowledge/cli.mjs agent new <slug> --title \"...\" --scope \"...\"");
    return;
  }
  console.log(`sous-agents: ${slugs.length}\n`);
  for (const slug of slugs) {
    const c = agentCharter(slug);
    const last = lastEntry(slug);
    const scope = c?.meta.scope ? c.meta.scope.replace(/^"|"$/g, "") : "?";
    console.log(`[${slug}] ${c?.title ?? "(sans charte)"}  (${c?.status ?? "?"})`);
    console.log(`   portée : ${scope.slice(0, 110)}`);
    console.log(`   dernier : ${last ? `${last.at} · ${last.title}` : "aucune entrée"}`);
  }
  console.log("");
}

function cmdAgentNew(args) {
  const slug = args.find((a) => !a.startsWith("--") && !/^\d/.test(a));
  const flag = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };
  if (!slug) {
    console.error('usage: agent new <slug> --title "..." --scope "..." [--owns a,b]');
    process.exit(2);
  }
  const dir = join(AGENTS, slug);
  if (existsSync(join(dir, "charter.md"))) {
    console.error(`sous-agent déjà créé: ${slug}`);
    process.exit(3);
  }
  mkdirSync(dir, { recursive: true });
  const title = flag("title", slug);
  const scope = flag("scope", "à préciser");
  const owns = flag("owns", "");
  const ownsList = owns ? `[${owns}]` : "[]";
  const iso = isoNow();

  writeFileSync(
    join(dir, "charter.md"),
    `---
id: ${slug}
title: ${title}
kind: agent
status: active
updated: ${today()}
scope: "${scope}"
owns: ${ownsList}
---

# Charte — ${title}

## Mission

${scope}

## Périmètre

Ce sous-agent ne touche qu'à ce qui est listé ci-dessus. Tout le reste est hors
sujet, même si ça semble lié.

## Fichiers qu'il possède

${owns ? owns.split(",").map((o) => `- \`${o.trim()}\``).join("\n") : "- (aucun nœud partagé : il produit des propositions)"}

## Interdits

1. Écrire hors de \`knowledge/agents/${slug}/\` — sauf les fichiers explicitement
   possédés ci-dessus.
2. Modifier un nœud de connaissance partagé : il **propose**, l'orchestrateur
   intègre.
3. Affirmer sans source. Ce qui n'est pas vérifié porte \`(non vérifié)\`.
4. Inventer un chiffre, une limite d'API, un nom de fichier.

## Protocole

1. **Avant** de travailler : lire les nœuds utiles
   (\`node knowledge/cli.mjs read <id>\`) et la charte.
2. **Pendant** : une entrée de journal par étape réelle, dans \`log.md\` :

   \`\`\`
   ## ${iso} · <titre court>
   - fait: ...
   - etat: ok | partiel | bloqué
   - suite: ...
   - fichiers: ...
   \`\`\`

3. **À la fin** : une entrée \`CLÔTURE\` avec le résultat, ce qui est vérifié et
   ce qui ne l'est pas, et les questions laissées ouvertes.

## Journal

Le journal est \`log.md\`, append-only, dans ce dossier.
`,
    "utf8",
  );

  writeFileSync(
    join(dir, "log.md"),
    `# Journal — ${slug}\n\n## ${iso} · Création\n- fait: charte créée\n- portée: ${scope}\n- etat: actif\n- suite: lecture des nœuds liés\n`,
    "utf8",
  );

  mkdirSync(join(dir, "notes"), { recursive: true });
  console.log(`créé: knowledge/agents/${slug}/ (charter.md, log.md, notes/)`);
}

function cmdAgentLog(args) {
  const flags = {};
  const free = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const next = args[i + 1];
      flags[args[i].slice(2)] = next && !next.startsWith("--") ? args[++i] : "";
    } else {
      free.push(args[i]);
    }
  }
  const slug = free.shift();
  const title = (free.join(" ") || flags.titre || "entrée").trim().slice(0, 90);
  if (!slug) {
    console.error('usage: agent log <slug> "<titre>" [--fait "..."] [--etat ok] [--suite "..."] [--bloque "..."]');
    process.exit(2);
  }
  const dir = join(AGENTS, slug);
  if (!existsSync(dir)) {
    console.error(`sous-agent inconnu: ${slug}`);
    process.exit(2);
  }
  const bodyLines = [];
  for (const key of ["fait", "etat", "suite", "fichiers", "bloque"]) {
    if (flags[key]) bodyLines.push(`- ${key}: ${flags[key]}`);
  }
  const body = bodyLines.join("\n");
  appendFileSync(join(dir, "log.md"), `\n## ${isoNow()} · ${title}\n${body ? `\n${body}\n` : ""}`, "utf8");
  console.log(`journal de ${slug} : entrée ajoutée`);
}

function cmdAgentShow(slug) {
  if (!slug) {
    console.error("usage: agent show <slug>");
    process.exit(2);
  }
  const c = agentCharter(slug);
  if (!c) {
    console.error(`sous-agent inconnu: ${slug}`);
    process.exit(2);
  }
  console.log(`# ${slug} — ${c.title}`);
  console.log(`statut: ${c.status} | maj: ${c.updated}`);
  console.log(`portée: ${(c.meta.scope || "").replace(/^"|"$/g, "")}`);
  console.log("");
  console.log(c.body.trim());
  const entries = agentLogEntries(slug).slice(-5);
  if (entries.length) {
    console.log("\n--- journal (5 dernières entrées) ---");
    for (const e of entries) {
      console.log(`\n## ${e.at} · ${e.title}`);
      if (e.body) console.log(e.body);
    }
  }
  console.log("");
}

function cmdAgentClose(args) {
  const slug = args[0];
  const text = args.slice(1).join(" ").trim() || "terminé";
  const c = agentCharter(slug);
  if (!c) {
    console.error(`sous-agent inconnu: ${slug}`);
    process.exit(2);
  }
  appendFileSync(join(AGENTS, slug, "log.md"), `\n## ${isoNow()} · CLÔTURE\n${text}\n`, "utf8");
  const file = join(AGENTS, slug, "charter.md");
  const raw = readFileSync(file, "utf8")
    .replace(/^status:.*$/m, "status: done")
    .replace(/^updated:.*$/m, `updated: ${today()}`);
  writeFileSync(file, raw, "utf8");
  console.log(`clôturé: ${slug}`);
}

function cmdReport(args) {
  const sinceIdx = args.indexOf("--since");
  const since = sinceIdx >= 0 ? args[sinceIdx + 1] : "";
  const write = args.includes("--write");
  const slugs = agentSlugs();
  if (!slugs.length) return console.log("aucun sous-agent.");

  const perAgent = [];
  const blocks = [];
  let total = 0;

  for (const slug of slugs) {
    const c = agentCharter(slug);
    const entries = agentLogEntries(slug).filter((e) => !since || e.at >= since);
    if (!entries.length) continue;
    total += entries.length;
    const last = entries[entries.length - 1];
    const etat = agentKey(last, ["etat", "état"]) || "?";
    const suite = agentKey(last, ["suite", "next"]);
    perAgent.push({ slug, title: c?.title ?? slug, status: c?.status ?? "?", last, etat, suite, count: entries.length });
    for (const e of entries) {
      const etat = agentKey(e, ["etat", "état"]).toLowerCase();
      const why = agentKey(e, ["bloque", "blocage", "blocked"]);
      if (why || /bloqu|blocked|échec|echec|fail/.test(etat)) {
        blocks.push({
          slug,
          at: e.at,
          title: e.title,
          why: why || e.body.split(/\r?\n/)[0],
        });
      }
    }
  }

  const stamp = isoNow();
  const out = [];
  out.push(`=== RAPPORT SOUS-AGENTS — ${stamp} ===`);
  out.push(`${slugs.length} sous-agent(s), ${total} entrée(s)${since ? ` depuis ${since}` : ""}`);
  out.push("");

  for (const a of perAgent) {
    out.push(`## ${a.slug} — ${a.title}  (${a.status}, ${a.count} entrée(s))`);
    out.push(`dernière: ${a.last.at} · ${a.last.title}`);
    out.push(`état: ${a.etat}`);
    if (a.suite) out.push(`suite: ${a.suite}`);
    out.push("");
  }

  if (blocks.length) {
    out.push("### BLOCAGES");
    for (const b of blocks) out.push(`- [${b.slug}] ${b.at} · ${b.title} — ${b.why}`);
    out.push("");
  }

  const text = out.join("\n");
  console.log(text);

  if (write) {
    const dir = join(AGENTS, "_reports");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${stamp.replace(/[:]/g, "")}.md`);
    writeFileSync(file, `# Rapport sous-agents\n\n\`\`\`\n${text}\n\`\`\`\n`, "utf8");
    console.log(`écrit: ${relative(ROOT, file).split(sep).join("/")}`);
  }
}

/* ---------------------------------------------------------------------- main */

function cmdAgent(args) {
  const [sub, ...r] = args;
  if (!sub || sub === "list") return cmdAgentList();
  if (sub === "new") return cmdAgentNew(r);
  if (sub === "log") return cmdAgentLog(r);
  if (sub === "show") return cmdAgentShow(r[0]);
  if (sub === "close") return cmdAgentClose(r);
  console.error("usage: agent list|new|log|show|close");
  process.exit(2);
}

const [cmd, ...rest] = process.argv.slice(2);
const table = {
  context: cmdContext,
  tree: cmdTree,
  read: () => cmdRead(rest[0]),
  find: () => cmdFind(rest.join(" ")),
  open: cmdOpen,
  recent: () => cmdRecent(rest[0]),
  check: cmdCheck,
  new: () => cmdNew(rest),
  set: () => cmdSet(rest),
  path: () => cmdPath(rest.join(" ")),
  agent: () => cmdAgent(rest),
  report: () => cmdReport(rest),
};

if (!cmd || !table[cmd]) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].split("/**")[1] ?? "");
  console.log("commandes: context | tree | read | find | open | recent | check | new | set | path | agent | report");
  process.exit(cmd ? 2 : 0);
}
table[cmd]();
