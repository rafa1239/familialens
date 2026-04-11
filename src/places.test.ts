import { describe, it, expect } from "vitest";
import {
  extractPlaces,
  suggestPlaces,
  findNearDuplicates,
  normalizeName,
  levenshtein,
  type PlaceAggregate
} from "./places";
import type { DataState } from "./types";
import { SCHEMA_VERSION } from "./types";

function emptyData(): DataState {
  return {
    schemaVersion: SCHEMA_VERSION,
    datasetId: "t",
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    people: {
      p1: { id: "p1", name: "Alice", gender: "F" }
    },
    events: {},
    sources: {}
  };
}

function addEvent(
  data: DataState,
  id: string,
  placeName: string | null,
  lat?: number,
  lon?: number
) {
  data.events[id] = {
    id,
    type: "birth",
    people: ["p1"],
    place: placeName ? { name: placeName, lat, lon } : undefined,
    sources: [],
    photos: []
  };
}

// ─── levenshtein ────────────────────────────────────

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
  });
  it("returns length when one is empty", () => {
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
  });
  it("counts single substitution", () => {
    expect(levenshtein("cat", "cut")).toBe(1);
  });
  it("counts insertion and deletion", () => {
    expect(levenshtein("cat", "cats")).toBe(1);
    expect(levenshtein("cats", "cat")).toBe(1);
  });
  it("distance between Lisbon and Lisboa", () => {
    // Lisbon → Lisboa: swap 'n' with 'a' plus insert? Actually:
    // Lisbon (6) vs Lisboa (6): positions 0-4 match (lisbo), then n vs a.
    // One substitution.
    expect(levenshtein("lisbon", "lisboa")).toBe(1);
  });
  it("distance between Oporto and Porto", () => {
    expect(levenshtein("oporto", "porto")).toBe(1);
  });
});

// ─── normalizeName ──────────────────────────────────

describe("normalizeName", () => {
  it("lowercases", () => {
    expect(normalizeName("LISBON")).toBe("lisbon");
  });
  it("drops everything after first comma", () => {
    expect(normalizeName("Lisbon, Portugal")).toBe("lisbon");
  });
  it("strips punctuation", () => {
    expect(normalizeName("São Paulo!")).toBe("são paulo");
  });
  it("collapses whitespace", () => {
    expect(normalizeName("  New   York  ")).toBe("new york");
  });
  it("handles empty input", () => {
    expect(normalizeName("")).toBe("");
  });
});

// ─── extractPlaces ──────────────────────────────────

describe("extractPlaces", () => {
  it("returns empty list when there are no events with places", () => {
    expect(extractPlaces(emptyData())).toEqual([]);
  });

  it("aggregates by exact name", () => {
    const d = emptyData();
    addEvent(d, "e1", "Lisbon");
    addEvent(d, "e2", "Lisbon");
    addEvent(d, "e3", "Porto");
    const places = extractPlaces(d);
    expect(places).toHaveLength(2);
    const lisbon = places.find((p) => p.name === "Lisbon")!;
    const porto = places.find((p) => p.name === "Porto")!;
    expect(lisbon.eventCount).toBe(2);
    expect(porto.eventCount).toBe(1);
  });

  it("sorts by event count descending", () => {
    const d = emptyData();
    addEvent(d, "e1", "A");
    addEvent(d, "e2", "B");
    addEvent(d, "e3", "B");
    addEvent(d, "e4", "B");
    addEvent(d, "e5", "A");
    const places = extractPlaces(d);
    expect(places[0].name).toBe("B");
    expect(places[1].name).toBe("A");
  });

  it("preserves coordinates from the first event that has them", () => {
    const d = emptyData();
    addEvent(d, "e1", "Lisbon"); // no coords
    addEvent(d, "e2", "Lisbon", 38.72, -9.14);
    addEvent(d, "e3", "Lisbon", 99, 99); // should NOT override
    const places = extractPlaces(d);
    expect(places[0].lat).toBe(38.72);
    expect(places[0].lon).toBe(-9.14);
  });

  it("ignores events with no place", () => {
    const d = emptyData();
    addEvent(d, "e1", null);
    addEvent(d, "e2", "Porto");
    expect(extractPlaces(d)).toHaveLength(1);
  });

  it("ignores empty-string place names", () => {
    const d = emptyData();
    addEvent(d, "e1", "   ");
    expect(extractPlaces(d)).toHaveLength(0);
  });
});

// ─── suggestPlaces ──────────────────────────────────

describe("suggestPlaces", () => {
  const places: PlaceAggregate[] = [
    { name: "Lisbon, Portugal", eventCount: 5, eventIds: [] },
    { name: "Lisboa", eventCount: 2, eventIds: [] },
    { name: "Porto", eventCount: 3, eventIds: [] },
    { name: "Paris, France", eventCount: 4, eventIds: [] },
    { name: "Lisboa, Spain", eventCount: 1, eventIds: [] } // hypothetical distractor
  ];

  it("returns top N when query is empty", () => {
    const result = suggestPlaces("", places, 3);
    expect(result).toHaveLength(3);
  });

  it("returns only Lis* matches for query 'lis'", () => {
    const result = suggestPlaces("lis", places);
    const names = result.map((p) => p.name);
    expect(names).toContain("Lisbon, Portugal");
    expect(names).toContain("Lisboa");
    // Paris does not start with or contain "lis"
    expect(names).not.toContain("Paris, France");
  });

  it("orders prefix matches by event count", () => {
    const result = suggestPlaces("lis", places);
    // Lisbon (5) should come before Lisboa (2) — same score, higher count
    expect(result[0].name).toBe("Lisbon, Portugal");
  });

  it("is case-insensitive", () => {
    expect(suggestPlaces("PORTO", places)[0].name).toBe("Porto");
  });

  it("finds fuzzy matches for typos", () => {
    // "lsbon" has distance 1 from "lisbon" — should match Lisbon
    const result = suggestPlaces("lsbon", places);
    expect(result.some((p) => p.name.toLowerCase().includes("lisb"))).toBe(true);
  });

  it("ranks exact match highest", () => {
    const result = suggestPlaces("Porto", places);
    expect(result[0].name).toBe("Porto");
  });
});

// ─── findNearDuplicates ─────────────────────────────

describe("findNearDuplicates", () => {
  it("returns empty when all places are unique", () => {
    const places: PlaceAggregate[] = [
      { name: "Lisbon", eventCount: 2, eventIds: [] },
      { name: "Porto", eventCount: 1, eventIds: [] },
      { name: "Tokyo", eventCount: 3, eventIds: [] }
    ];
    expect(findNearDuplicates(places)).toHaveLength(0);
  });

  it("groups exact normalized matches", () => {
    const places: PlaceAggregate[] = [
      { name: "Lisbon", eventCount: 3, eventIds: [] },
      { name: "lisbon", eventCount: 1, eventIds: [] },
      { name: "LISBON.", eventCount: 2, eventIds: [] }
    ];
    const groups = findNearDuplicates(places);
    expect(groups).toHaveLength(1);
    expect(groups[0].canonical.name).toBe("Lisbon"); // most events
    expect(groups[0].duplicates).toHaveLength(2);
  });

  it("groups by ignoring country suffix", () => {
    const places: PlaceAggregate[] = [
      { name: "Lisbon", eventCount: 5, eventIds: [] },
      { name: "Lisbon, Portugal", eventCount: 2, eventIds: [] }
    ];
    const groups = findNearDuplicates(places);
    expect(groups).toHaveLength(1);
  });

  it("detects Lisbon vs Lisboa via fuzzy", () => {
    const places: PlaceAggregate[] = [
      { name: "Lisbon", eventCount: 4, eventIds: [] },
      { name: "Lisboa", eventCount: 2, eventIds: [] }
    ];
    const groups = findNearDuplicates(places);
    expect(groups).toHaveLength(1);
    expect(groups[0].canonical.name).toBe("Lisbon");
    expect(groups[0].duplicates[0].name).toBe("Lisboa");
  });

  it("does NOT merge clearly different places", () => {
    const places: PlaceAggregate[] = [
      { name: "Lisbon", eventCount: 3, eventIds: [] },
      { name: "London", eventCount: 2, eventIds: [] }
    ];
    // Lisbon / London share length 6 but distance is 3 — not similar enough
    const groups = findNearDuplicates(places);
    expect(groups).toHaveLength(0);
  });

  it("picks canonical with most events", () => {
    const places: PlaceAggregate[] = [
      { name: "Lisboa", eventCount: 1, eventIds: [] },
      { name: "Lisbon", eventCount: 10, eventIds: [] }
    ];
    const groups = findNearDuplicates(places);
    expect(groups[0].canonical.name).toBe("Lisbon");
  });

  it("prefers canonical with coordinates when counts tie", () => {
    const places: PlaceAggregate[] = [
      { name: "Lisbon", eventCount: 2, eventIds: [] },
      { name: "lisbon", eventCount: 2, eventIds: [], lat: 38.72, lon: -9.14 }
    ];
    const groups = findNearDuplicates(places);
    expect(groups[0].canonical.lat).toBe(38.72);
  });
});
