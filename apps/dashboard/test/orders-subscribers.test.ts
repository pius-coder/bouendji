import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupByUser } from "@/components/subscribers/subscriber-groups";

describe("groupByUser (appareils et commandes par abonné)", () => {
  it("regroupe les lignes par userId sans mélanger les abonnés", () => {
    const devices = [
      { deviceId: "d1", userId: "u1" },
      { deviceId: "d2", userId: "u2" },
      { deviceId: "d3", userId: "u1" },
    ];
    const groups = groupByUser(devices);
    assert.deepEqual(
      groups.get("u1")?.map((d) => d.deviceId),
      ["d1", "d3"],
    );
    assert.deepEqual(
      groups.get("u2")?.map((d) => d.deviceId),
      ["d2"],
    );
  });

  it("garde l'ordre d'entrée à l'intérieur d'un groupe", () => {
    const orders = [
      { id: "o3", userId: "u1" },
      { id: "o1", userId: "u1" },
      { id: "o2", userId: "u1" },
    ];
    assert.deepEqual(
      groupByUser(orders).get("u1")?.map((o) => o.id),
      ["o3", "o1", "o2"],
    );
  });

  it("ne renvoie rien pour un abonné sans ligne (le serveur retombe alors sur une liste vide)", () => {
    const groups = groupByUser([{ id: "o1", userId: "u1" }]);
    assert.equal(groups.get("u-absent"), undefined);
  });

  it("accepte une liste vide sans erreur", () => {
    assert.equal(groupByUser([]).size, 0);
  });
});
