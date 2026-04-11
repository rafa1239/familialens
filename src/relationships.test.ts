import { describe, it, expect } from "vitest";
import {
  getParents,
  getChildren,
  getSpouses,
  getSiblings,
  isSpouseOf,
  isParentOf,
  wouldCreateCycle,
  findBirthEvent,
  findDeathEvent
} from "./relationships";
import type { DataState } from "./types";
import { SCHEMA_VERSION } from "./types";

function family(): DataState {
  return {
    schemaVersion: SCHEMA_VERSION,
    datasetId: "t",
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    people: {
      gf: { id: "gf", name: "GF", gender: "M" },
      gm: { id: "gm", name: "GM", gender: "F" },
      dad: { id: "dad", name: "Dad", gender: "M" },
      mom: { id: "mom", name: "Mom", gender: "F" },
      kid1: { id: "kid1", name: "Kid1", gender: "U" },
      kid2: { id: "kid2", name: "Kid2", gender: "U" }
    },
    events: {
      b_dad: {
        id: "b_dad",
        type: "birth",
        people: ["dad", "gf", "gm"],
        sources: [],
        photos: []
      },
      b_kid1: {
        id: "b_kid1",
        type: "birth",
        people: ["kid1", "dad", "mom"],
        sources: [],
        photos: []
      },
      b_kid2: {
        id: "b_kid2",
        type: "birth",
        people: ["kid2", "dad", "mom"],
        sources: [],
        photos: []
      },
      m_gp: {
        id: "m_gp",
        type: "marriage",
        people: ["gf", "gm"],
        sources: [],
        photos: []
      },
      m_parents: {
        id: "m_parents",
        type: "marriage",
        people: ["dad", "mom"],
        sources: [],
        photos: []
      }
    },
    sources: {}
  };
}

describe("getParents", () => {
  it("returns parents from the birth event", () => {
    const d = family();
    const parents = getParents(d, "kid1").map((p) => p.id).sort();
    expect(parents).toEqual(["dad", "mom"]);
  });

  it("returns empty for a person with no birth event", () => {
    const d = family();
    expect(getParents(d, "gf")).toEqual([]);
  });
});

describe("getChildren", () => {
  it("returns all children whose birth event lists the person", () => {
    const d = family();
    const kids = getChildren(d, "dad").map((p) => p.id).sort();
    expect(kids).toEqual(["kid1", "kid2"]);
  });

  it("returns empty for a person with no children", () => {
    const d = family();
    expect(getChildren(d, "kid1")).toEqual([]);
  });
});

describe("getSpouses", () => {
  it("returns spouses from marriage events", () => {
    const d = family();
    expect(getSpouses(d, "gf").map((p) => p.id)).toEqual(["gm"]);
    expect(getSpouses(d, "dad").map((p) => p.id)).toEqual(["mom"]);
  });
});

describe("getSiblings", () => {
  it("returns people who share at least one parent", () => {
    const d = family();
    const sibs = getSiblings(d, "kid1").map((p) => p.id);
    expect(sibs).toEqual(["kid2"]);
  });

  it("returns empty when there are no shared parents", () => {
    const d = family();
    expect(getSiblings(d, "gf")).toEqual([]);
  });
});

describe("isSpouseOf / isParentOf", () => {
  it("detects spouses", () => {
    const d = family();
    expect(isSpouseOf(d, "gf", "gm")).toBe(true);
    expect(isSpouseOf(d, "gm", "gf")).toBe(true);
    expect(isSpouseOf(d, "gf", "dad")).toBe(false);
  });

  it("detects parents", () => {
    const d = family();
    expect(isParentOf(d, "dad", "kid1")).toBe(true);
    expect(isParentOf(d, "kid1", "dad")).toBe(false);
    expect(isParentOf(d, "gf", "dad")).toBe(true);
  });
});

describe("findBirthEvent / findDeathEvent", () => {
  it("returns the birth event where the person is people[0]", () => {
    const d = family();
    const b = findBirthEvent(d, "dad");
    expect(b).not.toBeNull();
    expect(b?.id).toBe("b_dad");
  });

  it("returns null if no birth event exists for the person", () => {
    const d = family();
    expect(findBirthEvent(d, "gf")).toBeNull();
  });

  it("does not return a birth event where the person is a parent", () => {
    const d = family();
    // `dad` is people[1] in kid1's birth event but only people[0] in his own
    const b = findBirthEvent(d, "dad");
    expect(b?.id).toBe("b_dad");
  });

  it("findDeathEvent returns null when no death is recorded", () => {
    const d = family();
    expect(findDeathEvent(d, "dad")).toBeNull();
  });
});

describe("wouldCreateCycle", () => {
  it("rejects self-as-parent", () => {
    const d = family();
    expect(wouldCreateCycle(d, "kid1", "kid1")).toBe(true);
  });

  it("rejects making a descendant into an ancestor", () => {
    const d = family();
    // kid1's parent = dad. Now try to make kid1 a parent of dad → cycle.
    expect(wouldCreateCycle(d, "kid1", "dad")).toBe(true);
    // Even further: kid1 parent of gf would create cycle (gf → dad → kid1)
    expect(wouldCreateCycle(d, "kid1", "gf")).toBe(true);
  });

  it("allows unrelated people", () => {
    const d = family();
    // Making mom a parent of dad is not a cycle (even if weird).
    expect(wouldCreateCycle(d, "mom", "dad")).toBe(false);
  });

  it("allows adding a second parent to a child", () => {
    const d = family();
    // kid1 already has dad+mom. If we were to add gf as a parent of kid1:
    // gf → dad (already) and gf → kid1 would be added. Not a cycle.
    expect(wouldCreateCycle(d, "gf", "kid1")).toBe(false);
  });
});
