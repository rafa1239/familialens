import { describe, it, expect } from "vitest";
import { findRelationship } from "./pathfinder";
import type { DataState } from "./types";
import { SCHEMA_VERSION } from "./types";

function emptyData(): DataState {
  return {
    schemaVersion: SCHEMA_VERSION,
    datasetId: "t",
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    people: {},
    events: {},
    sources: {}
  };
}

/**
 * Build a family:
 *   gf + gm → dad + uncle
 *   dad + mom → me + sis
 *   uncle + aunt → cousin
 *   mom has sister aunt2 (mgm is her mom and me's maternal grandmother)
 *
 * Expanded to give enough coverage for cousin/uncle/grand variants.
 */
function buildFamily(): DataState {
  const d = emptyData();
  const p = (id: string, name: string, gender: "M" | "F" | "U") => {
    d.people[id] = { id, name, gender };
  };
  const birth = (child: string, ...parents: string[]) => {
    const eid = `b_${child}`;
    d.events[eid] = {
      id: eid,
      type: "birth",
      people: [child, ...parents],
      sources: [],
      photos: []
    };
  };
  const marriage = (a: string, b: string) => {
    const eid = `m_${a}_${b}`;
    d.events[eid] = {
      id: eid,
      type: "marriage",
      people: [a, b],
      sources: [],
      photos: []
    };
  };

  p("gf", "Grandfather", "M");
  p("gm", "Grandmother", "F");
  p("dad", "Dad", "M");
  p("uncle", "Uncle", "M");
  p("mom", "Mom", "F");
  p("aunt", "Aunt", "F");    // uncle's wife
  p("me", "Me", "U");
  p("sis", "Sister", "F");
  p("cousin", "Cousin", "U");

  birth("dad", "gf", "gm");
  birth("uncle", "gf", "gm");
  birth("me", "dad", "mom");
  birth("sis", "dad", "mom");
  birth("cousin", "uncle", "aunt");

  marriage("gf", "gm");
  marriage("dad", "mom");
  marriage("uncle", "aunt");

  return d;
}

describe("findRelationship", () => {
  it("same person", () => {
    const d = buildFamily();
    const r = findRelationship(d, "me", "me");
    expect(r.kind).toBe("self");
  });

  it("spouses", () => {
    const d = buildFamily();
    const r = findRelationship(d, "gf", "gm");
    expect(r.kind).toBe("spouse");
    expect(r.aIsToB).toContain("husband");
    expect(r.bIsToA).toContain("wife");
  });

  it("parent → child", () => {
    const d = buildFamily();
    const r = findRelationship(d, "dad", "me");
    expect(r.kind).toBe("ancestor");
    expect(r.shortLabel).toBe("father");
    expect(r.aIsToB).toContain("father");
    expect(r.generationsA).toBe(0);
    expect(r.generationsB).toBe(1);
  });

  it("child → parent", () => {
    const d = buildFamily();
    const r = findRelationship(d, "me", "dad");
    expect(r.kind).toBe("descendant");
    // Me has gender "U" → "child"
    expect(r.shortLabel).toBe("child");
  });

  it("grandparent labels", () => {
    const d = buildFamily();
    const r = findRelationship(d, "gf", "me");
    expect(r.kind).toBe("ancestor");
    expect(r.shortLabel).toBe("grandfather");
    expect(r.generationsB).toBe(2);
  });

  it("grandchild labels", () => {
    const d = buildFamily();
    const r = findRelationship(d, "me", "gm");
    expect(r.kind).toBe("descendant");
    // Me is U gender → grandchild
    expect(r.shortLabel).toBe("grandchild");
  });

  it("siblings", () => {
    const d = buildFamily();
    const r = findRelationship(d, "me", "sis");
    expect(r.kind).toBe("sibling");
    // sis is female → 'sister' when describing sis, but "me" is "sibling"
    expect(r.aIsToB).toContain("sibling");
    expect(r.bIsToA).toContain("sister");
  });

  it("uncle", () => {
    const d = buildFamily();
    const r = findRelationship(d, "uncle", "me");
    expect(r.kind).toBe("pibling");
    expect(r.shortLabel).toBe("uncle");
  });

  it("niece/nephew", () => {
    const d = buildFamily();
    const r = findRelationship(d, "me", "uncle");
    expect(r.kind).toBe("nibling");
    expect(r.shortLabel).toContain("niece or nephew");
  });

  it("first cousins", () => {
    const d = buildFamily();
    const r = findRelationship(d, "me", "cousin");
    expect(r.kind).toBe("cousin");
    expect(r.shortLabel).toBe("1st cousin");
  });

  it("unrelated people return 'unrelated'", () => {
    const d = emptyData();
    d.people.a = { id: "a", name: "Alice", gender: "F" };
    d.people.b = { id: "b", name: "Bob", gender: "M" };
    const r = findRelationship(d, "a", "b");
    expect(r.kind).toBe("unrelated");
  });

  it("second cousins (3 generations deep)", () => {
    const d = emptyData();
    // Common ancestors: gga + ggb
    const add = (id: string) =>
      (d.people[id] = { id, name: id, gender: "U" });
    ["gga", "ga1", "ga2", "a", "b", "gb1", "gb2", "ggb2"].forEach(add);
    // Actually let me set up a simpler 2nd cousin:
    // CommonAncestor → parentA → a_parent → A
    //                → parentB → b_parent → B
    const d2 = emptyData();
    const people = ["ca", "a1", "a2", "A", "b1", "b2", "B"];
    for (const id of people) d2.people[id] = { id, name: id, gender: "U" };
    d2.events.b_a1 = { id: "b_a1", type: "birth", people: ["a1", "ca"], sources: [], photos: [] };
    d2.events.b_b1 = { id: "b_b1", type: "birth", people: ["b1", "ca"], sources: [], photos: [] };
    d2.events.b_a2 = { id: "b_a2", type: "birth", people: ["a2", "a1"], sources: [], photos: [] };
    d2.events.b_b2 = { id: "b_b2", type: "birth", people: ["b2", "b1"], sources: [], photos: [] };
    d2.events.b_A = { id: "b_A", type: "birth", people: ["A", "a2"], sources: [], photos: [] };
    d2.events.b_B = { id: "b_B", type: "birth", people: ["B", "b2"], sources: [], photos: [] };

    const r = findRelationship(d2, "A", "B");
    expect(r.kind).toBe("cousin");
    expect(r.shortLabel).toBe("2nd cousin");
    expect(r.generationsA).toBe(3);
    expect(r.generationsB).toBe(3);
  });

  it("cousin once removed", () => {
    // Set up so A and B are 1st cousins + 1 removed
    const d = emptyData();
    const people = ["ca", "a1", "b1", "A", "B"];
    for (const id of people) d.people[id] = { id, name: id, gender: "U" };
    d.events.e1 = { id: "e1", type: "birth", people: ["a1", "ca"], sources: [], photos: [] };
    d.events.e2 = { id: "e2", type: "birth", people: ["b1", "ca"], sources: [], photos: [] };
    d.events.e3 = { id: "e3", type: "birth", people: ["A", "a1"], sources: [], photos: [] };
    d.events.e4 = { id: "e4", type: "birth", people: ["B", "A"], sources: [], photos: [] };

    // Now:
    //   A is grandchild of ca (depth 2)
    //   B is great-grandchild of ca (depth 3)
    //   Wait that's via a1, b1 isn't in B's chain.
    // Let me redo: B is A's child, so B is great-grandchild of ca via A
    // A vs B: A is B's parent → ancestor/descendant, not cousin
    //
    // Let me set up differently:
    // ca → a1 → A
    // ca → b1 → B → C
    // Now C vs A: A is grandchild of ca (2), C is great-grandchild of ca (3) via b1→B→C
    // But A and C share ca. A depth = 2, C depth = 3. min - 1 = 1 → 1st cousin, |2-3|=1 removed → 1st cousin once removed.
    const d2 = emptyData();
    const people2 = ["ca", "a1", "b1", "A", "B", "C"];
    for (const id of people2) d2.people[id] = { id, name: id, gender: "U" };
    d2.events.e1 = { id: "e1", type: "birth", people: ["a1", "ca"], sources: [], photos: [] };
    d2.events.e2 = { id: "e2", type: "birth", people: ["b1", "ca"], sources: [], photos: [] };
    d2.events.e3 = { id: "e3", type: "birth", people: ["A", "a1"], sources: [], photos: [] };
    d2.events.e4 = { id: "e4", type: "birth", people: ["B", "b1"], sources: [], photos: [] };
    d2.events.e5 = { id: "e5", type: "birth", people: ["C", "B"], sources: [], photos: [] };

    const r = findRelationship(d2, "A", "C");
    expect(r.kind).toBe("cousin");
    expect(r.shortLabel).toBe("1st cousin once removed");
  });

  it("returns a path from A through LCA to B", () => {
    const d = buildFamily();
    const r = findRelationship(d, "me", "cousin");
    // Path should be [me, dad, gf/gm (LCA), uncle, cousin] — 5 people
    expect(r.path.length).toBe(5);
    expect(r.path[0]).toBe("me");
    expect(r.path[r.path.length - 1]).toBe("cousin");
  });

  it("gendered spouse labels", () => {
    const d = buildFamily();
    const r1 = findRelationship(d, "gf", "gm");
    expect(r1.aIsToB).toContain("husband"); // gf is husband
    expect(r1.bIsToA).toContain("wife");    // gm is wife
  });
});
