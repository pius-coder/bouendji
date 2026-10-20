#!/usr/bin/env node
/**
 * Paire de clés du fichier hors-ligne.
 *
 * Une seule clé pour toute la plateforme : l'application doit pouvoir vérifier
 * un fichier sans réseau, donc la clé publique est **épinglée dans l'APK** au
 * build. La rotation d'une clé est donc une nouvelle version de l'application —
 * ce n'est pas une clé qu'on change à chaud.
 *
 * Usage :
 *   node tools/offline-keygen.mjs            # affiche les deux valeurs
 *   node tools/offline-keygen.mjs --out dir  # écrit dir/offline-private.b64 et dir/offline-public.b64
 *
 * Ne jamais committer la sortie privée. `offline-private.b64` va dans le
 * gestionnaire de secrets (variable `OFFLINE_BUNDLE_SIGNING_KEY` du service).
 */
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const outDir = outIndex >= 0 ? args[outIndex + 1] : null;
if (outIndex >= 0 && !outDir) {
  console.error("--out attend un répertoire");
  process.exit(64);
}

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const privateB64 = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const publicB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");

if (outDir) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "offline-private.b64"), `${privateB64}\n`, { encoding: "utf8", mode: 0o600 });
  writeFileSync(join(outDir, "offline-public.b64"), `${publicB64}\n`, "utf8");
  console.log(`écrit ${join(outDir, "offline-private.b64")} (secret) et offline-public.b64`);
  console.log("la clé publique va dans BrandTokens.offlineBundleSigningKeyB64 (manifeste de marque)");
} else {
  console.log(`OFFLINE_BUNDLE_SIGNING_KEY=${privateB64}`);
  console.log(`offlineBundleSigningKeyB64=${publicB64}`);
}
