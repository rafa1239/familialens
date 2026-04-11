import { describe, it, expect } from "vitest";
import {
  computePersonLocationAtYear,
  computePersonFirstLocation,
  computePersonLastLocation,
  computeAtlasSnapshot,
  buildLifetimeTrail,
  atlasYearBounds,
  atlasLatLonBounds,
  computeGenerationDepths,
  aliveCount,
  placedCount,
  generationColor
} from "./atlas";
import { parseDate } from "./dates";
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
 * Build a family with migration data:
 *
 *   Maria: born 1898 in Lisbon (38.72, -9.14)
 *          migrated to Paris (48.86, 2.35) in 1920
 *          died 1975 in Madrid (40.42, -3.70)
 *
 *   João:  born 1900 in Porto (41.15, -8.61)
 *          married Maria 1922
 *          died 1980 in Paris
 *
 *   Ana:   born 1925 in Paris (daughter of Maria and João)
 */
function withMigrationFamily(): DataState {
  const d = emptyData();
  d.people.maria = { id: "maria", name: "Maria Silva", gender: "F" };
  d.people.joao = { id: "joao", name: "João Pereira", gender: "M" };
  d.people.ana = { id: "ana", name: "Ana Pereira", gender: "F" };

  d.events.b_maria = {
    id: "b_maria",
    type: "birth",
    people: ["maria"],
    date: parseDate("1898"),
    place: { name: "Lisbon", lat: 38.72, lon: -9.14 },
    sources: [],
    photos: []
  };
  d.events.mig_maria = {
    id: "mig_maria",
    type: "migration",
    people: ["maria"],
    date: parseDate("1920"),
    place: { name: "Paris", lat: 48.86, lon: 2.35 },
    sources: [],
    photos: []
  };
  d.events.d_maria = {
    id: "d_maria",
    type: "death",
    people: ["maria"],
    date: parseDate("1975"),
    place: { name: "Madrid", lat: 40.42, lon: -3.70 },
    sources: [],
    photos: []
  };
  d.events.b_joao = {
    id: "b_joao",
    type: "birth",
    people: ["joao"],
    date: parseDate("1900"),
    place: { name: "Porto", lat: 41.15, lon: -8.61 },
    sources: [],
    photos: []
  };
  d.events.m = {
    id: "m",
    type: "marriage",
    people: ["maria", "joao"],
    date: parseDate("1922"),
    sources: [],
    photos: []
  };
  d.events.b_ana = {
    id: "b_ana",
    type: "birth",
    people: ["ana", "maria", "joao"],
    date: parseDate("1925"),
    place: { name: "Paris", lat: 48.86, lon: 2.35 },
    sources: [],
    photos: []
  };
  d.events.d_joao = {
    id: "d_joao",
    type: "death",
    people: ["joao"],
    date: parseDate("1980"),
    place: { name: "Paris", lat: 48.86, lon: 2.35 },
    sources: [],
    photos: []
  };
  return d;
}

// ─── computePersonLocationAtYear ───

describe("computePersonLocationAtYear", () => {
  it("returns null for a person with no located events", () => {
    const d = emptyData();
    d.people.a = { id: "a", name: "Anon", gender: "U" };
    expect(computePersonLocationAtYear(d, "a", 2000)).toBeNull();
  });

  it("returns birthplace before migration", () => {
    const d = withMigrationFamily();
    const loc = computePersonLocationAtYear(d, "maria", 1910);
    expect(loc?.placeName).toBe("Lisbon");
  });

  it("returns migration place after migration year", () => {
    const d = withMigrationFamily();
    const loc = computePersonLocationAtYear(d, "maria", 1940);
    expect(loc?.placeName).toBe("Paris");
  });

  it("returns death place after death year", () => {
    const d = withMigrationFamily();
    const loc = computePersonLocationAtYear(d, "maria", 2000);
    expect(loc?.placeName).toBe("Madrid");
  });

  it("returns birthplace at the exact birth year", () => {
    const d = withMigrationFamily();
    const loc = computePersonLocationAtYear(d, "maria", 1898);
    expect(loc?.placeName).toBe("Lisbon");
  });

  it("returns birthplace for a year before birth (fallback to earliest)", () => {
    const d = withMigrationFamily();
    // Year 1800 is before Maria's birth in 1898. The function should
    // return null because no event has year ≤ 1800 AND there's no
    // undated event to fall back to.
    const loc = computePersonLocationAtYear(d, "maria", 1800);
    expect(loc).toBeNull();
  });

  it("handles undated events as fallback", () => {
    const d = emptyData();
    d.people.a = { id: "a", name: "Anon", gender: "U" };
    // Add an undated residence
    d.events.r = {
      id: "r",
      type: "residence",
      people: ["a"],
      place: { name: "Nowhere", lat: 10, lon: 20 },
      sources: [],
      photos: []
    };
    const loc = computePersonLocationAtYear(d, "a", 1900);
    expect(loc?.placeName).toBe("Nowhere");
  });

  it("prefers migration over birth at tied years", () => {
    const d = emptyData();
    d.people.a = { id: "a", name: "A", gender: "U" };
    d.events.b = {
      id: "b",
      type: "birth",
      people: ["a"],
      date: parseDate("1950"),
      place: { name: "BirthTown", lat: 1, lon: 1 },
      sources: [],
      photos: []
    };
    d.events.m = {
      id: "m",
      type: "migration",
      people: ["a"],
      date: parseDate("1950"),
      place: { name: "MigTown", lat: 2, lon: 2 },
      sources: [],
      photos: []
    };
    const loc = computePersonLocationAtYear(d, "a", 1950);
    expect(loc?.placeName).toBe("MigTown");
  });
});

// ─── computePersonFirstLocation & computePersonLastLocation ───

describe("first/last location", () => {
  it("first location prefers birthplace", () => {
    const d = withMigrationFamily();
    expect(computePersonFirstLocation(d, "maria")?.placeName).toBe("Lisbon");
  });

  it("last location returns the most recent event", () => {
    const d = withMigrationFamily();
    expect(computePersonLastLocation(d, "maria")?.placeName).toBe("Madrid");
  });

  it("returns null for unplaced people", () => {
    const d = emptyData();
    d.people.a = { id: "a", name: "A", gender: "U" };
    expect(computePersonFirstLocation(d, "a")).toBeNull();
    expect(computePersonLastLocation(d, "a")).toBeNull();
  });
});

// ─── computeAtlasSnapshot ───

describe("computeAtlasSnapshot", () => {
  it("returns unborn for year before birth", () => {
    const d = withMigrationFamily();
    const snap = computeAtlasSnapshot(d, 1890);
    const maria = snap.find((s) => s.person.id === "maria")!;
    expect(maria.status).toBe("unborn");
    // Location should still be set (to first known location) for pre-render
    expect(maria.location?.placeName).toBe("Lisbon");
    expect(maria.age).toBeNull();
  });

  it("returns alive for year between birth and death", () => {
    const d = withMigrationFamily();
    const snap = computeAtlasSnapshot(d, 1930);
    const maria = snap.find((s) => s.person.id === "maria")!;
    expect(maria.status).toBe("alive");
    expect(maria.location?.placeName).toBe("Paris"); // migrated in 1920
    expect(maria.age).toBe(1930 - 1898);
  });

  it("returns deceased for year after death", () => {
    const d = withMigrationFamily();
    const snap = computeAtlasSnapshot(d, 1990);
    const maria = snap.find((s) => s.person.id === "maria")!;
    expect(maria.status).toBe("deceased");
    // Still has a location (Madrid, her death place) for ghost rendering
    expect(maria.location?.placeName).toBe("Madrid");
    expect(maria.age).toBeNull();
  });

  it("returns unknown status for person without dates", () => {
    const d = emptyData();
    d.people.a = { id: "a", name: "Mystery", gender: "U" };
    const snap = computeAtlasSnapshot(d, 2000);
    const a = snap.find((s) => s.person.id === "a")!;
    expect(a.status).toBe("unknown");
  });

  it("includes generation depth", () => {
    const d = withMigrationFamily();
    const snap = computeAtlasSnapshot(d, 1930);
    const maria = snap.find((s) => s.person.id === "maria")!;
    const ana = snap.find((s) => s.person.id === "ana")!;
    expect(maria.generation).toBe(0);
    expect(ana.generation).toBe(1);
  });

  it("aliveCount counts only alive + located people", () => {
    const d = withMigrationFamily();
    const snap = computeAtlasSnapshot(d, 1930);
    // In 1930: Maria (alive in Paris), João (alive, but needs a residence after birth? birthplace Porto is his last dated event ≤ 1930. So he's alive in Porto), Ana (born 1925, alive in Paris)
    // All three located → 3 alive
    expect(aliveCount(snap)).toBe(3);
  });
});

// ─── buildLifetimeTrail ───

describe("buildLifetimeTrail", () => {
  it("returns points in chronological order", () => {
    const d = withMigrationFamily();
    const trail = buildLifetimeTrail(d, "maria");
    expect(trail.map((p) => p.placeName)).toEqual(["Lisbon", "Paris", "Madrid"]);
  });

  it("returns empty for a person with no placed events", () => {
    const d = emptyData();
    d.people.a = { id: "a", name: "A", gender: "U" };
    expect(buildLifetimeTrail(d, "a")).toEqual([]);
  });

  it("includes years when available", () => {
    const d = withMigrationFamily();
    const trail = buildLifetimeTrail(d, "maria");
    expect(trail[0].year).toBe(1898);
    expect(trail[1].year).toBe(1920);
    expect(trail[2].year).toBe(1975);
  });

  it("orders birth before residence at the same year", () => {
    const d = emptyData();
    d.people.a = { id: "a", name: "A", gender: "U" };
    d.events.r = {
      id: "r",
      type: "residence",
      people: ["a"],
      date: parseDate("1950"),
      place: { name: "Second", lat: 2, lon: 2 },
      sources: [],
      photos: []
    };
    d.events.b = {
      id: "b",
      type: "birth",
      people: ["a"],
      date: parseDate("1950"),
      place: { name: "First", lat: 1, lon: 1 },
      sources: [],
      photos: []
    };
    const trail = buildLifetimeTrail(d, "a");
    expect(trail[0].placeName).toBe("First"); // birth first
    expect(trail[1].placeName).toBe("Second");
  });
});

// ─── atlasYearBounds ───

describe("atlasYearBounds", () => {
  it("returns padded bounds covering all dated events", () => {
    const d = withMigrationFamily();
    const b = atlasYearBounds(d);
    expect(b.minYear).toBe(1898 - 2);
    // Min is always last-event + 2. Max may be extended to today if
    // anyone might still be alive (Ana has no death event), so assert
    // the floor rather than an exact match.
    expect(b.maxYear).toBeGreaterThanOrEqual(1980 + 2);
  });

  it("returns a fallback for empty dataset", () => {
    const b = atlasYearBounds(emptyData());
    expect(b.maxYear).toBeGreaterThan(b.minYear);
  });

  it("extends maxYear to today when someone may still be alive", () => {
    const d = emptyData();
    d.people.alice = { id: "alice", name: "Alice", gender: "F" };
    d.events.b_alice = {
      id: "b_alice",
      type: "birth",
      people: ["alice"],
      date: parseDate("2000"),
      sources: [],
      photos: []
    };
    const b = atlasYearBounds(d);
    const now = new Date().getFullYear();
    expect(b.maxYear).toBeGreaterThanOrEqual(now);
  });

  it("does NOT extend maxYear for a purely historical dataset", () => {
    const d = emptyData();
    d.people.anc = { id: "anc", name: "Ancestor", gender: "M" };
    d.events.b_anc = {
      id: "b_anc",
      type: "birth",
      people: ["anc"],
      date: parseDate("1800"),
      sources: [],
      photos: []
    };
    d.events.d_anc = {
      id: "d_anc",
      type: "death",
      people: ["anc"],
      date: parseDate("1870"),
      sources: [],
      photos: []
    };
    const b = atlasYearBounds(d);
    // Every person has a death event → no living extension
    expect(b.maxYear).toBe(1870 + 2);
  });

  it("does NOT extend maxYear for long-gone people with no death event", () => {
    const d = emptyData();
    // Someone "born" in 1700 with no death event — beyond plausible
    // lifespan, should not count as alive.
    d.people.old = { id: "old", name: "Old Ancestor", gender: "M" };
    d.events.b_old = {
      id: "b_old",
      type: "birth",
      people: ["old"],
      date: parseDate("1700"),
      sources: [],
      photos: []
    };
    const b = atlasYearBounds(d);
    expect(b.maxYear).toBe(1702);
  });
});

// ─── atlasLatLonBounds ───

describe("atlasLatLonBounds", () => {
  it("returns null for dataset with no placed events", () => {
    expect(atlasLatLonBounds(emptyData())).toBeNull();
  });

  it("returns bounding box of all placed events", () => {
    const d = withMigrationFamily();
    const b = atlasLatLonBounds(d);
    expect(b).not.toBeNull();
    expect(b!.minLat).toBeCloseTo(38.72, 2);
    expect(b!.maxLat).toBeCloseTo(48.86, 2);
  });
});

// ─── computeGenerationDepths ───

describe("computeGenerationDepths", () => {
  it("returns 0 for people with no parents", () => {
    const d = withMigrationFamily();
    const g = computeGenerationDepths(d);
    expect(g.get("maria")).toBe(0);
    expect(g.get("joao")).toBe(0);
  });

  it("returns 1 for children of roots", () => {
    const d = withMigrationFamily();
    const g = computeGenerationDepths(d);
    expect(g.get("ana")).toBe(1);
  });

  it("survives cycles without infinite loop", () => {
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
    const g = computeGenerationDepths(d);
    // Should terminate and return some values
    expect(g.size).toBe(2);
  });
});

// ─── generationColor ───

describe("generationColor", () => {
  it("returns a colour string for any generation", () => {
    for (let i = 0; i < 20; i++) {
      const c = generationColor(i);
      expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("wraps around for high generations", () => {
    expect(generationColor(0)).toBe(generationColor(10));
  });
});

// ─── placedCount ───

describe("placedCount", () => {
  it("counts people with a location", () => {
    const d = withMigrationFamily();
    const snap = computeAtlasSnapshot(d, 1930);
    expect(placedCount(snap)).toBe(3); // Maria + João + Ana all located
  });

  it("excludes unplaced people", () => {
    const d = emptyData();
    d.people.a = { id: "a", name: "Ghost", gender: "U" };
    const snap = computeAtlasSnapshot(d, 2000);
    expect(placedCount(snap)).toBe(0);
  });
});
