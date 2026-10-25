import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildNav, buildSections, resolveSection } from "@/components/shell/nav-model";
import {
  countCreatedIn,
  dailySeries,
  payoutsNeedingAttention,
  previousWindowSales,
  summarizePool,
  summarizeSales,
  windowDays,
} from "@/lib/home-metrics";
import { parseHomeOpen, serializeHome } from "@/server/query/home.params";
import { KIT_DEVICES, kitTable } from "@/server/query/kit.params";
import { applyTableQuery, parseSort } from "@/server/query/table";
import type { AdminMe } from "@/server/services/admin-auth/admin-auth.schema";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 24, 12);
const iso = (daysAgo: number) => new Date(NOW - daysAgo * DAY).toISOString();

const sortOpts = {
  search: (d: (typeof KIT_DEVICES)[number]) => `${d.name} ${d.owner} ${d.id}`,
  sort: {
    name: (d: (typeof KIT_DEVICES)[number]) => d.name,
    platform: (d: (typeof KIT_DEVICES)[number]) => d.platform,
    status: (d: (typeof KIT_DEVICES)[number]) => d.status,
    lastSeen: (d: (typeof KIT_DEVICES)[number]) => d.lastSeenAt,
    sessions: (d: (typeof KIT_DEVICES)[number]) => d.sessions,
  },
  filters: {
    status: (d: (typeof KIT_DEVICES)[number], v: string) => d.status === v,
    platform: (d: (typeof KIT_DEVICES)[number], v: string) => d.platform === v,
  },
};

describe("table : paramètres d'URL", () => {
  it("préfixe chaque clé et n'écrit pas les valeurs par défaut", () => {
    assert.equal(kitTable.urlKeys.sort, "k_sort");
    assert.equal(kitTable.urlKeys.status, "k_status");
    assert.equal(kitTable.serialize({ page: 1, sort: "lastSeen.desc", size: 25 }), "");
    assert.equal(kitTable.serialize({ page: 2, status: "active" }), "?k_page=2&k_status=active");
  });

  it("relit l'URL côté serveur", async () => {
    const state = await kitTable.load(Promise.resolve({ k_sort: "name.asc", k_page: "3", k_q: "pixel" }));
    assert.equal(state.sort, "name.asc");
    assert.equal(state.page, 3);
    assert.equal(state.q, "pixel");
    assert.equal(state.size, 25);
  });

  it("refuse un tri inconnu", () => {
    assert.deepEqual(parseSort("hack.asc", ["name"], { key: "name", dir: "desc" }), { key: "name", dir: "desc" });
    assert.deepEqual(parseSort("name.sideways", ["name"], { key: "name", dir: "desc" }), { key: "name", dir: "desc" });
  });
});

describe("table : recherche, filtres, tri, pagination", () => {
  const base = { q: "", sort: "lastSeen.desc", page: 1, size: 25 };

  it("pagine et compte le total filtré", () => {
    const r = applyTableQuery(KIT_DEVICES, kitTable, base, sortOpts);
    assert.equal(r.total, KIT_DEVICES.length);
    assert.equal(r.rows.length, 25);
    assert.equal(r.pageCount, Math.ceil(KIT_DEVICES.length / 25));
  });

  it("borne la page demandée", () => {
    const r = applyTableQuery(KIT_DEVICES, kitTable, { ...base, page: 999 }, sortOpts);
    assert.equal(r.page, r.pageCount);
  });

  it("ignore une taille de page non proposée", () => {
    const r = applyTableQuery(KIT_DEVICES, kitTable, { ...base, size: 7 }, sortOpts);
    assert.equal(r.size, 25);
  });

  it("filtre et cherche sans tenir compte des accents ni de la casse", () => {
    const r = applyTableQuery(KIT_DEVICES, kitTable, { ...base, q: "ERIC", status: "active" }, sortOpts);
    assert.ok(r.total > 0);
    assert.ok(r.filtered.every((d) => d.owner === "Éric Tchamba" && d.status === "active"));
  });

  it("trie dans les deux sens et laisse les valeurs absentes à la fin", () => {
    const asc = applyTableQuery(KIT_DEVICES, kitTable, { ...base, sort: "lastSeen.asc", size: 100 }, sortOpts).rows;
    const desc = applyTableQuery(KIT_DEVICES, kitTable, { ...base, sort: "lastSeen.desc", size: 100 }, sortOpts).rows;
    assert.equal(asc.at(-1)?.lastSeenAt, null);
    assert.equal(desc.at(-1)?.lastSeenAt, null);
    assert.ok(asc[0].lastSeenAt! < asc[1].lastSeenAt!);
    assert.ok(desc[0].lastSeenAt! > desc[1].lastSeenAt!);
  });
});

describe("accueil : calculs", () => {
  const since = NOW - 30 * DAY;

  it("compte les ventes payées de la période et additionne les montants", () => {
    const s = summarizeSales(
      [
        {
          items: [
            { status: "paid", amountXaf: 2000, createdAt: iso(2), paidAt: iso(2) },
            { status: "paid", amountXaf: 3000, createdAt: iso(40), paidAt: iso(40) },
            { status: "pending", amountXaf: 9000, createdAt: iso(1), paidAt: null },
          ],
        },
      ],
      since,
    );
    assert.deepEqual(s, { paidCount: 1, amountXaf: 2000, truncated: false });
  });

  it("signale une page tronquée dans la période", () => {
    const s = summarizeSales([{ items: [{ status: "paid", createdAt: iso(3), paidAt: iso(3) }], nextCursor: "c" }], since);
    assert.equal(s.truncated, true);
    assert.equal(s.amountXaf, null, "montants masqués pour ce rôle : pas de 0 inventé");
  });

  it("variation : nulle quand la fenêtre précédente n'est pas chargée", () => {
    assert.equal(previousWindowSales([{ items: [{ status: "paid", createdAt: iso(10), paidAt: iso(10) }], nextCursor: "c" }], since, 30), null);
    assert.deepEqual(previousWindowSales([{ items: [{ status: "paid", amountXaf: 500, createdAt: iso(45), paidAt: iso(45) }] }], since, 30), { paidCount: 1, amountXaf: 500 });
  });

  it("série quotidienne sans trou", () => {
    const days = windowDays(NOW, 7);
    assert.equal(days.length, 7);
    assert.equal(days.at(-1), new Date(NOW).toISOString().slice(0, 10));
    const values = dailySeries([{ at: iso(0) }, { at: iso(0) }, { at: iso(3) }, { at: iso(30) }], days, (i) => i.at);
    assert.deepEqual(values, [0, 0, 0, 1, 0, 0, 2]);
  });

  it("abonnés : plafond de l'API signalé", () => {
    const full = Array.from({ length: 100 }, () => ({ createdAt: iso(1) }));
    assert.deepEqual(countCreatedIn(full, since, 100), { count: 100, truncated: true });
    assert.deepEqual(countCreatedIn([{ createdAt: iso(1) }, { createdAt: null }], since, 100), { count: 1, truncated: false });
  });

  it("réseau et file à traiter", () => {
    assert.deepEqual(summarizePool([{ health: "down", status: "active" }, { health: "healthy", status: "active" }]), { total: 2, healthy: 1, down: 1 });
    const order = payoutsNeedingAttention([
      { id: "a", status: "pending", createdAt: iso(1) },
      { id: "b", status: "paid", createdAt: iso(1) },
      { id: "c", status: "needs_review", createdAt: iso(2) },
    ]).map((p) => p.id);
    assert.deepEqual(order, ["c", "a"]);
  });

  it("paramètre d'ouverture de la file", () => {
    assert.deepEqual(parseHomeOpen("payout:p_1"), { kind: "payout", id: "p_1" });
    assert.equal(parseHomeOpen("x:1"), null);
    assert.equal(serializeHome({ period: "30j", open: null }), "");
    assert.equal(serializeHome({ period: "7j", open: "endpoint:e1" }), "?h_period=7j&h_open=endpoint:e1");
  });
});

describe("shell : sections", () => {
  const owner: AdminMe = { adminId: "a", email: "o@x", name: "O", platformRole: "owner", memberships: [] };
  it("range toutes les entrées de la navigation, deux niveaux", () => {
    const nav = buildNav(owner, "c1");
    const sections = buildSections(nav, "c1");
    const flat = sections.flatMap((s) => s.items.map((i) => i.href)).sort();
    assert.deepEqual(flat, [...nav.primary, ...nav.more].map((i) => i.href).sort());
    assert.deepEqual(sections.map((s) => s.key), ["pilot", "community", "money", "platform"]);
  });
  it("résout la section active par le plus long préfixe", () => {
    const sections = buildSections(buildNav(owner, "c1"), "c1");
    assert.equal(resolveSection(sections, "/c1/orders").section?.key, "community");
    assert.equal(resolveSection(sections, "/").item?.href, "/");
    assert.equal(resolveSection(sections, "/payouts").section?.key, "money");
  });
});
