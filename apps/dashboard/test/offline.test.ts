import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { offlineFileStatus, shortId } from "@/components/offline/offline-status";

const NOW = Date.parse("2026-10-25T12:00:00.000Z");
const LATER = "2026-10-25T13:00:00.000Z";
const EARLIER = "2026-10-25T11:00:00.000Z";

describe("fichiers de secours : état affiché", () => {
  it("non consommé et échéance future : valide", () => {
    assert.equal(offlineFileStatus({ notAfter: LATER, consumedAt: null }, NOW), "valid");
  });

  it("échéance passée et non consommé : expiré", () => {
    assert.equal(offlineFileStatus({ notAfter: EARLIER, consumedAt: null }, NOW), "expired");
  });

  it("échéance exactement maintenant : encore valide (même règle que l'API)", () => {
    assert.equal(offlineFileStatus({ notAfter: "2026-10-25T12:00:00.000Z", consumedAt: null }, NOW), "valid");
  });

  it("consommé l'emporte sur expiré", () => {
    assert.equal(
      offlineFileStatus({ notAfter: EARLIER, consumedAt: "2026-10-25T11:30:00.000Z" }, NOW),
      "consumed",
    );
  });

  it("consommé et encore dans les délais : consommé", () => {
    assert.equal(offlineFileStatus({ notAfter: LATER, consumedAt: "2026-10-25T12:05:00.000Z" }, NOW), "consumed");
  });
});

describe("fichiers de secours : identifiant court", () => {
  it("affiche les huit premiers caractères", () => {
    assert.equal(shortId("0d6a3c1e-2b4f-4c8a-9e7d-1f2a3b4c5d6e"), "0d6a3c1e");
  });
});
