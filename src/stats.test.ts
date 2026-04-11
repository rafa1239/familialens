import { describe, it, expect } from "vitest";
import { computeStats, aliveAtYear, datasetYearBounds } from "./stats";
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

function withFamily(): DataState {
  const d = emptyData();
  d.people.gf = { id: "gf", name: "George Smith", gender: "M" };
  d.people.gm = { id: "gm", name: "Grace Smith", gender: "F" };
  d.people.dad = { id: "dad", name: "David Smith", gender: "M" };
  d.people.mom = { id: "mom", name: "Diana Jones", gender: "F" };
  d.people.kid = { id: "kid", name: "Eva Smith", gender: "F" };

  d.events.b_gf = {
    id: "b_gf",
    type: "birth",
    people: ["gf"],
    date: parseDate("1920"),
    place: { name: "Lisbon" },
    sources: [],
    photos: []
  };
  d.events.d_gf = {
    id: "d_gf",
    type: "death",
    people: ["gf"],
    date: parseDate("1990"),
    place: { name: "Lisbon" },
    sources: [],
    photos: []
  };
  d.events.b_gm = {
    id: "b_gm",
    type: "birth",
    people: ["gm"],
    date: parseDate("1922"),
    sources: [],
    photos: []
  };
  d.events.b_dad = {
    id: "b_dad",
    type: "birth",
    people: ["dad", "gf", "gm"],
    date: parseDate("1950"),
    place: { name: "Porto" },
    sources: [],
    photos: []
  };
  d.events.b_mom = {
    id: "b_mom",
    type: "birth",
    people: ["mom"],
    date: parseDate("1955"),
    sources: [],
    photos: []
  };
  d.events.b_kid = {
    id: "b_kid",
    type: "birth",
    people: ["kid", "dad", "mom"],
    date: parseDate("1985"),
    place: { name: "Lisbon" },
    sources: [],
    photos: []
  };
  d.events.m_gp = {
    id: "m_gp",
    type: "marriage",
    people: ["gf", "gm"],
    date: parseDate("1945"),
    sources: [],
    photos: []
  };
  return d;
}

describe("computeStats", () => {
  it("returns zeros for an empty dataset", () => {
    const stats = computeStats(emptyData());
    expect(stats.totals.people).toBe(0);
    expect(stats.totals.events).toBe(0);
    expect(stats.yearRange.earliest).toBeNull();
    expect(stats.yearRange.latest).toBeNull();
    expect(stats.generations).toBe(0);
  });

  it("counts people, events, and places", () => {
    const d = withFamily();
    const stats = computeStats(d);
    expect(stats.totals.people).toBe(5);
    // 5 births + 1 death + 1 marriage = 7 events
    expect(stats.totals.events).toBe(7);
    expect(stats.totals.places).toBe(2); // Lisbon + Porto
  });

  it("computes year range", () => {
    const stats = computeStats(withFamily());
    expect(stats.yearRange.earliest).toBe(1920);
    expect(stats.yearRange.latest).toBe(1990);
  });

  it("counts generations", () => {
    const stats = computeStats(withFamily());
    // gf/gm → dad → kid = 3 generations
    expect(stats.generations).toBe(3);
  });

  it("classifies living vs deceased", () => {
    const stats = computeStats(withFamily());
    // gf has death event → deceased
    // gm, dad, mom, kid have birth but no death → living
    expect(stats.demographics.deceased).toBe(1);
    expect(stats.demographics.living).toBe(4);
    expect(stats.demographics.unknown).toBe(0);
  });

  it("returns top places sorted by event count", () => {
    const stats = computeStats(withFamily());
    expect(stats.topPlaces[0].name).toBe("Lisbon"); // 3 events
    expect(stats.topPlaces[0].count).toBe(3);
    expect(stats.topPlaces[1].name).toBe("Porto"); // 1 event
  });

  it("returns top surnames", () => {
    const stats = computeStats(withFamily());
    // Smith appears 4 times (gf, gm, dad, kid)
    const smith = stats.topSurnames.find((s) => s.surname === "Smith");
    expect(smith?.count).toBe(4);
    const jones = stats.topSurnames.find((s) => s.surname === "Jones");
    expect(jones?.count).toBe(1);
  });

  it("groups events by type", () => {
    const stats = computeStats(withFamily());
    const births = stats.eventsByType.find((e) => e.type === "birth");
    const deaths = stats.eventsByType.find((e) => e.type === "death");
    const marriages = stats.eventsByType.find((e) => e.type === "marriage");
    expect(births?.count).toBe(5);
    expect(deaths?.count).toBe(1);
    expect(marriages?.count).toBe(1);
  });

  it("reports data quality metrics", () => {
    const d = emptyData();
    d.people.a = { id: "a", name: "Alice", gender: "F" }; // no birth date
    d.people.b = { id: "b", name: "", gender: "U" };      // no name, isolated
    d.people.c = { id: "c", name: "Carl", gender: "M" };  // has birth
    d.events.bc = {
      id: "bc",
      type: "birth",
      people: ["c"],
      date: parseDate("1950"),
      sources: [],
      photos: []
    };
    const stats = computeStats(d);
    expect(stats.dataQuality.missingBirthDate).toBe(2); // a, b
    expect(stats.dataQuality.missingName).toBe(1);      // b
    expect(stats.dataQuality.isolatedPeople).toBe(2);   // a, b (no events)
  });
});

describe("aliveAtYear", () => {
  it("returns alive when born before and no death recorded", () => {
    const d = withFamily();
    expect(aliveAtYear(d, "dad", 2000)).toBe("alive");
  });

  it("returns deceased when after death", () => {
    const d = withFamily();
    expect(aliveAtYear(d, "gf", 2000)).toBe("deceased"); // gf died in 1990
  });

  it("returns alive when year equals death year", () => {
    const d = withFamily();
    expect(aliveAtYear(d, "gf", 1990)).toBe("alive");
  });

  it("returns unborn when year is before birth", () => {
    const d = withFamily();
    expect(aliveAtYear(d, "kid", 1980)).toBe("unborn"); // kid born 1985
  });

  it("returns unknown when no date info", () => {
    const d = emptyData();
    d.people.ghost = { id: "ghost", name: "Ghost", gender: "U" };
    expect(aliveAtYear(d, "ghost", 1990)).toBe("unknown");
  });
});

describe("datasetYearBounds", () => {
  it("returns null for empty data", () => {
    expect(datasetYearBounds(emptyData())).toBeNull();
  });

  it("returns the min and max years", () => {
    const bounds = datasetYearBounds(withFamily());
    expect(bounds).toEqual({ min: 1920, max: 1990 });
  });
});
