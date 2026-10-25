import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { brandMissingText, formatVersion, SHA256_SHORT_LENGTH, shortSha256 } from "@/components/builds/builds-format";

describe("page Applications : version", () => {
  it("nom et numéro Android : « 1.0.0 (3) »", () => {
    assert.equal(formatVersion("1.0.0", 3), "1.0.0 (3)");
  });

  it("sans nom : le numéro seul ; sans numéro : le nom seul ; rien : un tiret", () => {
    assert.equal(formatVersion(null, 7), "code 7");
    assert.equal(formatVersion("  2.1  ", null), "2.1");
    assert.equal(formatVersion("", undefined), "—");
  });
});

describe("page Applications : empreinte SHA-256", () => {
  // 64 caractères hexadécimaux factices (aucune empreinte réelle n'est recopiée ici).
  const sha = "02e7389d0c1f" + "a".repeat(52);

  it("abrège aux 12 premiers caractères, en minuscules", () => {
    assert.equal(SHA256_SHORT_LENGTH, 12);
    assert.equal(shortSha256(sha), sha.slice(0, 12));
    assert.equal(shortSha256(sha.toUpperCase()), sha.slice(0, 12));
  });

  it("absente ou vide : rien à afficher", () => {
    assert.equal(shortSha256(null), null);
    assert.equal(shortSha256("   "), null);
  });
});

describe("page Applications : marque incomplète", () => {
  it("nomme les champs manquants en français ; un champ inconnu passe tel quel", () => {
    assert.equal(brandMissingText(["appName", "supportUrl"]), "nom de l'application, lien d'assistance");
    assert.equal(brandMissingText(["packageName", "champInconnu"]), "identifiant de paquet, champInconnu");
    assert.equal(brandMissingText([]), "");
  });
});
