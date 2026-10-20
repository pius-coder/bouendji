// Vérifie que les champs envoyés à /register existent tous dans le schéma Zod
// de apps/api/src/routes/internal.ts, et liste ceux qu'on n'envoie pas.
import { readFileSync } from "node:fs";

const ep = readFileSync(new URL("../../../../../infra/endpoint/entrypoint.sh", import.meta.url), "utf8");
const api = readFileSync(new URL("../../../../../apps/api/src/routes/internal.ts", import.meta.url), "utf8");

const start = ep.indexOf("'{deployment_key: $deployment_key,");
const end = ep.indexOf("end)'", start);
if (start < 0 || end < 0) throw new Error("bloc jq du payload introuvable");
const program = ep.slice(start, end);

const sentKeys = [...new Set([...program.matchAll(/([a-z_]+):/g)].map((m) => m[1]))].sort();

const schema = api.split("const registerSchema = z.object({")[1].split("});")[0];
const accepted = [...new Set([...schema.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]))].sort();

const unknown = sentKeys.filter((k) => !accepted.includes(k));
const unused = accepted.filter((k) => !sentKeys.includes(k));

console.log("envoyées                :", sentKeys.join(", "));
console.log("acceptées par le schéma :", accepted.join(", "));
console.log("envoyées hors schéma    :", unknown.length ? unknown.join(", ") : "AUCUNE");
console.log("acceptées non envoyées  :", unused.join(", "));

if (unknown.length > 0) process.exit(1);
