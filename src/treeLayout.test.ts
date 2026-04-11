import { describe, it, expect } from "vitest";
import { computeTreeLayout, TREE_CONSTANTS } from "./treeLayout";
import type { DataState } from "./types";
import { SCHEMA_VERSION } from "./types";

function emptyData(): DataState {
  return {
    schemaVersion: SCHEMA_VERSION,
    datasetId: "test",
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    people: {},
    events: {},
    sources: {}
  };
}

describe("computeTreeLayout", () => {
  it("returns empty layout for empty dataset", () => {
    const layout = computeTreeLayout(emptyData());
    expect(layout.nodes).toHaveLength(0);
    expect(layout.edges).toHaveLength(0);
    expect(layout.units).toHaveLength(0);
  });

  it("places a single person at generation 0", () => {
    const d = emptyData();
    d.people.a = { id: "a", name: "Alice", gender: "F" };
    const layout = computeTreeLayout(d);
    expect(layout.nodes).toHaveLength(1);
    expect(layout.nodes[0].generation).toBe(0);
    expect(layout.units).toHaveLength(1);
    expect(layout.units[0].members).toEqual(["a"]);
  });

  it("puts children below parents", () => {
    const d = emptyData();
    d.people.dad = { id: "dad", name: "Dad", gender: "M" };
    d.people.kid = { id: "kid", name: "Kid", gender: "U" };
    d.events.birth = {
      id: "birth",
      type: "birth",
      people: ["kid", "dad"],
      sources: [],
      photos: []
    };
    const layout = computeTreeLayout(d);
    const dad = layout.nodes.find((n) => n.id === "dad")!;
    const kid = layout.nodes.find((n) => n.id === "kid")!;
    expect(dad.generation).toBe(0);
    expect(kid.generation).toBe(1);
    expect(kid.y).toBeGreaterThan(dad.y);
  });

  it("puts spouses in the same generation and same y", () => {
    const d = emptyData();
    d.people.a = { id: "a", name: "A", gender: "M" };
    d.people.b = { id: "b", name: "B", gender: "F" };
    d.events.m = {
      id: "m",
      type: "marriage",
      people: ["a", "b"],
      sources: [],
      photos: []
    };
    const layout = computeTreeLayout(d);
    const a = layout.nodes.find((n) => n.id === "a")!;
    const b = layout.nodes.find((n) => n.id === "b")!;
    expect(a.generation).toBe(b.generation);
    expect(a.y).toBe(b.y);
  });

  it("groups spouses into a single unit", () => {
    const d = emptyData();
    d.people.a = { id: "a", name: "A", gender: "M" };
    d.people.b = { id: "b", name: "B", gender: "F" };
    d.events.m = {
      id: "m",
      type: "marriage",
      people: ["a", "b"],
      sources: [],
      photos: []
    };
    const layout = computeTreeLayout(d);
    expect(layout.units).toHaveLength(1);
    expect(new Set(layout.units[0].members)).toEqual(new Set(["a", "b"]));
    // Both nodes share the same unit id
    const aNode = layout.nodes.find((n) => n.id === "a")!;
    const bNode = layout.nodes.find((n) => n.id === "b")!;
    expect(aNode.unitId).toBe(bNode.unitId);
  });

  it("positions couple members side-by-side with COUPLE_GAP", () => {
    const d = emptyData();
    d.people.a = { id: "a", name: "A", gender: "M" };
    d.people.b = { id: "b", name: "B", gender: "F" };
    d.events.m = {
      id: "m",
      type: "marriage",
      people: ["a", "b"],
      sources: [],
      photos: []
    };
    const layout = computeTreeLayout(d);
    const a = layout.nodes.find((n) => n.id === "a")!;
    const b = layout.nodes.find((n) => n.id === "b")!;
    // Difference in x should be exactly NODE_W + COUPLE_GAP
    const dx = Math.abs(a.x - b.x);
    expect(dx).toBeCloseTo(TREE_CONSTANTS.NODE_W + TREE_CONSTANTS.COUPLE_GAP, 2);
  });

  it("generates parent edges from birth events", () => {
    const d = emptyData();
    d.people.p = { id: "p", name: "Parent", gender: "M" };
    d.people.c = { id: "c", name: "Child", gender: "U" };
    d.events.birth = {
      id: "birth",
      type: "birth",
      people: ["c", "p"],
      sources: [],
      photos: []
    };
    const layout = computeTreeLayout(d);
    const parentEdges = layout.edges.filter((e) => e.type === "parent");
    expect(parentEdges).toHaveLength(1);
    expect(parentEdges[0]).toEqual({ type: "parent", from: "p", to: "c" });
  });

  it("generates one spouse edge per marriage", () => {
    const d = emptyData();
    d.people.a = { id: "a", name: "A", gender: "M" };
    d.people.b = { id: "b", name: "B", gender: "F" };
    d.events.m = {
      id: "m",
      type: "marriage",
      people: ["a", "b"],
      sources: [],
      photos: []
    };
    const layout = computeTreeLayout(d);
    expect(layout.edges.filter((e) => e.type === "spouse")).toHaveLength(1);
  });

  it("handles three generations with multiple parents", () => {
    const d = emptyData();
    d.people.gf = { id: "gf", name: "GF", gender: "M" };
    d.people.gm = { id: "gm", name: "GM", gender: "F" };
    d.people.dad = { id: "dad", name: "Dad", gender: "M" };
    d.people.mom = { id: "mom", name: "Mom", gender: "F" };
    d.people.kid = { id: "kid", name: "Kid", gender: "U" };
    d.events.b1 = {
      id: "b1",
      type: "birth",
      people: ["dad", "gf", "gm"],
      sources: [],
      photos: []
    };
    d.events.b2 = {
      id: "b2",
      type: "birth",
      people: ["kid", "dad", "mom"],
      sources: [],
      photos: []
    };
    d.events.m1 = { id: "m1", type: "marriage", people: ["gf", "gm"], sources: [], photos: [] };
    d.events.m2 = { id: "m2", type: "marriage", people: ["dad", "mom"], sources: [], photos: [] };

    const layout = computeTreeLayout(d);
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));

    expect(byId.get("gf")!.generation).toBe(0);
    expect(byId.get("gm")!.generation).toBe(0);
    expect(byId.get("dad")!.generation).toBe(1);
    expect(byId.get("mom")!.generation).toBe(1);
    expect(byId.get("kid")!.generation).toBe(2);

    // Three distinct y positions
    const ys = new Set(layout.nodes.map((n) => n.y));
    expect(ys.size).toBe(3);

    // Spouse and parent edges
    expect(layout.edges.filter((e) => e.type === "parent")).toHaveLength(4);
    expect(layout.edges.filter((e) => e.type === "spouse")).toHaveLength(2);

    // Grandparents + parents = 2 couple units; kid = 1 single unit = 3 units
    expect(layout.units).toHaveLength(3);
  });

  it("attaches birth/death years to nodes from events", () => {
    const d = emptyData();
    d.people.a = { id: "a", name: "A", gender: "M" };
    d.events.b = {
      id: "b",
      type: "birth",
      people: ["a"],
      date: { display: "1950", sortKey: 1950, precision: "year", iso: "1950" },
      sources: [],
      photos: []
    };
    d.events.de = {
      id: "de",
      type: "death",
      people: ["a"],
      date: { display: "2020", sortKey: 2020, precision: "year", iso: "2020" },
      sources: [],
      photos: []
    };
    const layout = computeTreeLayout(d);
    const a = layout.nodes[0];
    expect(a.birthYear).toBe(1950);
    expect(a.deathYear).toBe(2020);
  });

  it("survives a cycle without infinite recursion", () => {
    const d = emptyData();
    d.people.a = { id: "a", name: "A", gender: "U" };
    d.people.b = { id: "b", name: "B", gender: "U" };
    d.events.ba = {
      id: "ba",
      type: "birth",
      people: ["a", "b"],
      sources: [],
      photos: []
    };
    d.events.bb = {
      id: "bb",
      type: "birth",
      people: ["b", "a"],
      sources: [],
      photos: []
    };
    const layout = computeTreeLayout(d);
    expect(layout.nodes).toHaveLength(2);
  });

  it("places multiple root units side-by-side without overlap", () => {
    // Two completely unrelated people at generation 0
    const d = emptyData();
    d.people.a = { id: "a", name: "Alice", gender: "F" };
    d.people.b = { id: "b", name: "Bob", gender: "M" };
    const layout = computeTreeLayout(d);
    const a = layout.nodes.find((n) => n.id === "a")!;
    const b = layout.nodes.find((n) => n.id === "b")!;
    const dx = Math.abs(a.x - b.x);
    // Two separate root units should be at least NODE_W + FOREST_GAP apart
    expect(dx).toBeGreaterThanOrEqual(TREE_CONSTANTS.NODE_W);
  });

  it("places sibling subtrees without horizontal overlap", () => {
    // Two siblings, each with their own child (so each subtree has width)
    const d = emptyData();
    d.people.dad = { id: "dad", name: "Dad", gender: "M" };
    d.people.s1 = { id: "s1", name: "Sibling1", gender: "U" };
    d.people.s2 = { id: "s2", name: "Sibling2", gender: "U" };
    d.people.gc1 = { id: "gc1", name: "GrandChild1", gender: "U" };
    d.people.gc2 = { id: "gc2", name: "GrandChild2", gender: "U" };
    d.events.b1 = { id: "b1", type: "birth", people: ["s1", "dad"], sources: [], photos: [] };
    d.events.b2 = { id: "b2", type: "birth", people: ["s2", "dad"], sources: [], photos: [] };
    d.events.b3 = { id: "b3", type: "birth", people: ["gc1", "s1"], sources: [], photos: [] };
    d.events.b4 = { id: "b4", type: "birth", people: ["gc2", "s2"], sources: [], photos: [] };

    const layout = computeTreeLayout(d);
    const gc1 = layout.nodes.find((n) => n.id === "gc1")!;
    const gc2 = layout.nodes.find((n) => n.id === "gc2")!;
    // Grandchildren must not overlap
    const dx = Math.abs(gc1.x - gc2.x);
    expect(dx).toBeGreaterThanOrEqual(TREE_CONSTANTS.NODE_W);
  });

  it("centers a parent over its children", () => {
    const d = emptyData();
    d.people.dad = { id: "dad", name: "Dad", gender: "M" };
    d.people.c1 = { id: "c1", name: "C1", gender: "U" };
    d.people.c2 = { id: "c2", name: "C2", gender: "U" };
    d.events.b1 = { id: "b1", type: "birth", people: ["c1", "dad"], sources: [], photos: [] };
    d.events.b2 = { id: "b2", type: "birth", people: ["c2", "dad"], sources: [], photos: [] };

    const layout = computeTreeLayout(d);
    const dad = layout.nodes.find((n) => n.id === "dad")!;
    const c1 = layout.nodes.find((n) => n.id === "c1")!;
    const c2 = layout.nodes.find((n) => n.id === "c2")!;
    const childrenMid = (c1.x + c2.x) / 2;
    expect(dad.x).toBeCloseTo(childrenMid, 1);
  });
});
