import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { bffTargetPath } from "../src/lib/bff-allowlist";

describe("liste blanche BFF avec préfixe /v1/admin", () => {
  it("accepte les chemins envoyés par le navigateur", () => {
    assert.equal(bffTargetPath(["v1", "admin", "users", "u_1", "manual-grants", "options"]), "/v1/admin/users/u_1/manual-grants/options");
    assert.equal(bffTargetPath(["v1", "admin", "search"]), "/v1/admin/search");
    assert.equal(bffTargetPath(["v1", "admin", "apps", "a_1", "coupon-types"]), "/v1/admin/apps/a_1/coupon-types");
  });
  it("refuse toujours ce qui sort de la liste", () => {
    assert.equal(bffTargetPath(["v1", "admin", "secrets"]), null);
    assert.equal(bffTargetPath(["v1", "admin"]), null);
    assert.equal(bffTargetPath(["v1", "admin", "users", "..", "x"]), null);
  });
});
