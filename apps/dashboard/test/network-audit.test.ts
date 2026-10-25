import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditValueRows, MAX_VALUE_LENGTH, truncateText } from "@/components/audit/audit-diff";

describe("journal : mise à plat avant / après", () => {
  it("valeur absente : aucune ligne (le tiroir affiche la mention « non renseigné »)", () => {
    assert.deepEqual(auditValueRows(null), []);
    assert.deepEqual(auditValueRows(undefined), []);
  });

  it("objet plat : une ligne par champ, dans l'ordre reçu, « — » pour null", () => {
    assert.deepEqual(auditValueRows({ name: "Oregon", commissionBps: 3000, note: null }), [
      { key: "name", value: "Oregon" },
      { key: "commissionBps", value: "3000" },
      { key: "note", value: "—" },
    ]);
  });

  it("objet imbriqué : chemin pointé, puis résumé au-delà de la profondeur 3", () => {
    assert.deepEqual(auditValueRows({ a: { b: 1 }, c: "x" }), [
      { key: "a.b", value: "1" },
      { key: "c", value: "x" },
    ]);
    assert.deepEqual(auditValueRows({ a: { b: { c: { d: { e: 1 } } } } }), [{ key: "a.b.c.d", value: "1 champ" }]);
  });

  it("valeur longue : tronquée avec « … », longueur bornée", () => {
    const long = "x".repeat(500);
    const [row] = auditValueRows({ text: long });
    assert.equal(row.value.length, MAX_VALUE_LENGTH);
    assert.ok(row.value.endsWith("…"));
    assert.equal(truncateText("court"), "court");
  });

  it("tableaux : scalaires joints, objets résumés en nombre d'éléments", () => {
    assert.deepEqual(auditValueRows({ ids: ["a", "b"], rows: [{ x: 1 }, { y: 2 }] }), [
      { key: "ids", value: "a, b" },
      { key: "rows", value: "2 éléments" },
    ]);
  });

  it("valeur scalaire seule : une ligne « valeur »", () => {
    assert.deepEqual(auditValueRows("actif"), [{ key: "valeur", value: "actif" }]);
    assert.deepEqual(auditValueRows({}), [{ key: "valeur", value: "(vide)" }]);
  });
});
