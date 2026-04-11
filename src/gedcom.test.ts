import { describe, it, expect } from "vitest";
import { exportGedcom, parseGedcom } from "./gedcom";
import type { DataState, FamilyEvent } from "./types";
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

describe("gedcom export", () => {
  it("produces a valid header and trailer", () => {
    const text = exportGedcom(emptyData());
    expect(text.startsWith("0 HEAD")).toBe(true);
    expect(text.trimEnd().endsWith("0 TRLR")).toBe(true);
    expect(text).toContain("1 GEDC");
    expect(text).toContain("2 VERS 5.5");
  });

  it("exports a person with birth and death", () => {
    const d = emptyData();
    d.people.p1 = { id: "p1", name: "John Doe", gender: "M" };
    d.events.b = {
      id: "b",
      type: "birth",
      people: ["p1"],
      date: { display: "1950", sortKey: 1950, precision: "year", iso: "1950" },
      place: { name: "Lisbon, Portugal" },
      sources: [],
      photos: []
    };
    d.events.de = {
      id: "de",
      type: "death",
      people: ["p1"],
      date: { display: "2020", sortKey: 2020, precision: "year", iso: "2020" },
      sources: [],
      photos: []
    };
    const text = exportGedcom(d);
    expect(text).toContain("0 @I1@ INDI");
    expect(text).toContain("1 NAME John /Doe/");
    expect(text).toContain("1 SEX M");
    expect(text).toContain("1 BIRT");
    expect(text).toContain("2 DATE 1950");
    expect(text).toContain("2 PLAC Lisbon, Portugal");
    expect(text).toContain("1 DEAT");
    expect(text).toContain("2 DATE 2020");
  });

  it("creates a FAM record for a marriage with HUSB/WIFE", () => {
    const d = emptyData();
    d.people.a = { id: "a", name: "Alice Smith", gender: "F" };
    d.people.b = { id: "b", name: "Bob Smith", gender: "M" };
    d.events.m = {
      id: "m",
      type: "marriage",
      people: ["a", "b"],
      sources: [],
      photos: []
    };
    const text = exportGedcom(d);
    expect(text).toMatch(/0 @F1@ FAM/);
    expect(text).toMatch(/1 HUSB @I\d@/);
    expect(text).toMatch(/1 WIFE @I\d@/);
    expect(text).toContain("1 MARR");
  });

  it("links children to a family via FAMC/FAMS", () => {
    const d = emptyData();
    d.people.dad = { id: "dad", name: "Dad", gender: "M" };
    d.people.mom = { id: "mom", name: "Mom", gender: "F" };
    d.people.kid = { id: "kid", name: "Kid", gender: "U" };
    d.events.birth = {
      id: "birth",
      type: "birth",
      people: ["kid", "dad", "mom"],
      sources: [],
      photos: []
    };
    const text = exportGedcom(d);
    expect(text).toContain("1 CHIL");
    expect(text).toContain("1 FAMC");
    expect(text).toContain("1 FAMS");
  });

  it("writes lat/lon coordinates for placed events", () => {
    const d = emptyData();
    d.people.p1 = { id: "p1", name: "John Doe", gender: "M" };
    d.events.b = {
      id: "b",
      type: "birth",
      people: ["p1"],
      place: { name: "Lisbon", lat: 38.72, lon: -9.14 },
      sources: [],
      photos: []
    };
    const text = exportGedcom(d);
    expect(text).toContain("3 MAP");
    expect(text).toContain("4 LATI N38.720000");
    expect(text).toContain("4 LONG W9.140000");
  });
});

describe("gedcom parse", () => {
  it("rejects non-GEDCOM content", () => {
    const result = parseGedcom("not a gedcom file");
    expect(result.ok).toBe(false);
  });

  it("parses a minimal person", () => {
    const ged = [
      "0 HEAD",
      "1 GEDC",
      "2 VERS 5.5",
      "0 @I1@ INDI",
      "1 NAME John /Doe/",
      "1 SEX M",
      "1 BIRT",
      "2 DATE 1950",
      "2 PLAC Lisbon",
      "0 TRLR"
    ].join("\n");
    const result = parseGedcom(ged);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.data.people)).toHaveLength(1);
    const person = Object.values(result.data.people)[0];
    expect(person.name).toBe("John Doe");
    expect(person.surname).toBe("Doe");
    expect(person.gender).toBe("M");

    const events = Object.values(result.data.events);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("birth");
    expect(events[0].date?.sortKey).toBe(1950);
    expect(events[0].place?.name).toBe("Lisbon");
  });

  it("parses a family with children", () => {
    const ged = [
      "0 HEAD",
      "1 GEDC",
      "2 VERS 5.5",
      "0 @I1@ INDI",
      "1 NAME Dad /Smith/",
      "1 SEX M",
      "1 FAMS @F1@",
      "0 @I2@ INDI",
      "1 NAME Mom /Jones/",
      "1 SEX F",
      "1 FAMS @F1@",
      "0 @I3@ INDI",
      "1 NAME Kid /Smith/",
      "1 FAMC @F1@",
      "0 @F1@ FAM",
      "1 HUSB @I1@",
      "1 WIFE @I2@",
      "1 CHIL @I3@",
      "1 MARR",
      "2 DATE 1970",
      "0 TRLR"
    ].join("\n");
    const result = parseGedcom(ged);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(Object.keys(result.data.people)).toHaveLength(3);

    const kid = Object.values(result.data.people).find((p) => p.name === "Kid Smith")!;
    expect(kid).toBeDefined();

    // Kid should have a birth event that lists both parents
    const kidBirth = Object.values(result.data.events).find(
      (e) => e.type === "birth" && e.people[0] === kid.id
    )!;
    expect(kidBirth).toBeDefined();
    expect(kidBirth.people).toHaveLength(3); // kid + 2 parents

    // There should be a marriage event
    const marriages = Object.values(result.data.events).filter(
      (e) => e.type === "marriage"
    );
    expect(marriages).toHaveLength(1);
    expect(marriages[0].date?.sortKey).toBe(1970);
  });
});

describe("gedcom round-trip", () => {
  it("preserves people, events and family structure", () => {
    const original = emptyData();
    original.people.gf = { id: "gf", name: "Grandfather Smith", gender: "M" };
    original.people.gm = { id: "gm", name: "Grandmother Smith", gender: "F" };
    original.people.dad = { id: "dad", name: "Dad Smith", gender: "M" };
    original.events.b1 = {
      id: "b1",
      type: "birth",
      people: ["dad", "gf", "gm"],
      date: { display: "1950", sortKey: 1950, precision: "year", iso: "1950" },
      sources: [],
      photos: []
    };
    original.events.m1 = {
      id: "m1",
      type: "marriage",
      people: ["gf", "gm"],
      date: { display: "1945", sortKey: 1945, precision: "year", iso: "1945" },
      sources: [],
      photos: []
    };

    const text = exportGedcom(original);
    const result = parseGedcom(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(Object.keys(result.data.people)).toHaveLength(3);
    // Dad's birth should list both grandparents
    const names = Object.values(result.data.people).map((p) => p.name).sort();
    expect(names).toEqual(["Dad Smith", "Grandfather Smith", "Grandmother Smith"]);

    const birthEvents = Object.values(result.data.events).filter(
      (e) => e.type === "birth"
    );
    const dadBirth = birthEvents.find((e) => e.people.length === 3);
    expect(dadBirth).toBeDefined();
    expect(dadBirth?.date?.sortKey).toBe(1950);

    const marriageEvents = Object.values(result.data.events).filter(
      (e) => e.type === "marriage"
    );
    expect(marriageEvents).toHaveLength(1);
    expect(marriageEvents[0].date?.sortKey).toBe(1945);
  });
});
