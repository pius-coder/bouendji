// Vérifie que config.example.json respecte l'inbound attendu, et que le bloc
// jq de l'entrypoint produit EXACTEMENT la même structure (les clés nues de jq
// sont quotées puis parsées ; les variables $uuid/$path/$port sont remplacées
// par les valeurs de l'exemple). Ne remplace pas `xray run -test`, qui exige
// le binaire, mais attrape une virgule en trop ou une clé mal orthographiée.
import { readFileSync } from "node:fs";

const cfg = JSON.parse(
  readFileSync(new URL("../../../../../infra/endpoint/config.example.json", import.meta.url), "utf8"),
);
const ep = readFileSync(new URL("../../../../../infra/endpoint/entrypoint.sh", import.meta.url), "utf8");

const failures = [];
const check = (label, cond) => {
  if (!cond) failures.push(label);
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
};

const inbound = cfg.inbounds?.[0] ?? {};
check("example: un seul inbound, protocole vless", cfg.inbounds.length === 1 && inbound.protocol === "vless");
check("example: listen 0.0.0.0", inbound.listen === "0.0.0.0");
check("example: port numérique", Number.isInteger(inbound.port));
check("example: decryption none", inbound.settings?.decryption === "none");
check("example: un seul client, email shared", inbound.settings?.clients?.length === 1 && inbound.settings.clients[0].email === "shared");
check(
  "example: client id = UUID 36 caractères",
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(inbound.settings?.clients?.[0]?.id ?? ""),
);
check("example: network ws + security none", inbound.streamSettings?.network === "ws" && inbound.streamSettings?.security === "none");
check("example: wsSettings.path commence par /", (inbound.streamSettings?.wsSettings?.path ?? "").startsWith("/"));
check("example: journal d'accès désactivé", cfg.log?.access === "none");
check("example: routage vers un outbound existant", cfg.outbounds.some((o) => o.tag === cfg.routing?.rules?.[0]?.outboundTag));
check("example: métadonnées cloud bloquées (169.254/16)", cfg.routing?.rules?.[0]?.ip?.includes("169.254.0.0/16"));

check("entrypoint: même listen", ep.includes('listen: "0.0.0.0"'));
check("entrypoint: même decryption", ep.includes('decryption: "none"'));
check("entrypoint: même email", ep.includes('email: "shared"'));
check("entrypoint: même transport", ep.includes('network: "ws"') && ep.includes('security: "none"'));
check("entrypoint: access log désactivé", ep.includes('access: "none"'));
check("entrypoint: jq -n, jamais un gabarit à trous", ep.includes("jq -n") && !ep.includes("<<<"));
check("entrypoint: config jamais affichée", !/cat\s+"?\$CONFIG_PATH/.test(ep));

// --- structure produite par le bloc jq, comparée à l'exemple --------------
const anchor = ep.indexOf('--argjson port "$PORT"');
const startBrace = ep.indexOf("{", ep.indexOf("\n", anchor));
const endBrace = ep.indexOf("}'", startBrace);
if (startBrace < 0 || endBrace < 0) throw new Error("bloc jq de configuration introuvable");

let program = ep.slice(startBrace, endBrace + 1);
program = program
  .replace(/\$uuid/g, JSON.stringify(inbound.settings.clients[0].id))
  .replace(/\$path/g, JSON.stringify(inbound.streamSettings.wsSettings.path))
  .replace(/\$port/g, String(inbound.port))
  // clés nues de jq -> clés JSON
  .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');

let generated;
try {
  generated = JSON.parse(program);
} catch (err) {
  check(`bloc jq parsable (${err.message})`, false);
  generated = null;
}

if (generated) {
  const same = JSON.stringify(generated, Object.keys(generated).sort()) === JSON.stringify(cfg, Object.keys(cfg).sort());
  check("structure générée identique à config.example.json", same);
  if (!same) console.log(JSON.stringify(generated, null, 2));
}

if (failures.length > 0) {
  console.error(`\n${failures.length} invariant(s) cassé(s)`);
  process.exit(1);
}
console.log("\nconfig.example.json et le bloc jq sont cohérents");
