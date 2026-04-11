import { describe, it, expect } from "vitest";
import { generateStory } from "./story";
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

describe("generateStory", () => {
  it("returns empty string for missing person", () => {
    expect(generateStory(emptyData(), "ghost")).toBe("");
  });

  it("returns a placeholder sentence when there's no info", () => {
    const d = emptyData();
    d.people.p = { id: "p", name: "Maria", gender: "F" };
    const story = generateStory(d, "p");
    expect(story).toContain("Maria");
    expect(story).toContain("story");
  });

  it("builds a birth sentence from year alone", () => {
    const d = emptyData();
    d.people.p = { id: "p", name: "Maria", gender: "F" };
    d.events.b = {
      id: "b",
      type: "birth",
      people: ["p"],
      date: parseDate("1950"),
      sources: [],
      photos: []
    };
    const story = generateStory(d, "p");
    expect(story).toBe("Maria was born in 1950.");
  });

  it("includes place and parents in birth sentence", () => {
    const d = emptyData();
    d.people.p = { id: "p", name: "Maria", gender: "F" };
    d.people.dad = { id: "dad", name: "João", gender: "M" };
    d.people.mom = { id: "mom", name: "Ana", gender: "F" };
    d.events.b = {
      id: "b",
      type: "birth",
      people: ["p", "dad", "mom"],
      date: parseDate("1950"),
      place: { name: "Lisbon" },
      sources: [],
      photos: []
    };
    const story = generateStory(d, "p");
    expect(story).toContain("in 1950");
    expect(story).toContain("in Lisbon");
    expect(story).toContain("João");
    expect(story).toContain("Ana");
  });

  it("uses 'on' for exact date, 'in' for year-only", () => {
    const d = emptyData();
    d.people.p = { id: "p", name: "M", gender: "F" };
    d.events.b = {
      id: "b",
      type: "birth",
      people: ["p"],
      date: parseDate("1950-03-15"),
      sources: [],
      photos: []
    };
    const story = generateStory(d, "p");
    expect(story).toContain("on 15 March 1950");
  });

  it("uses 'around' for circa dates", () => {
    const d = emptyData();
    d.people.p = { id: "p", name: "M", gender: "F" };
    d.events.b = {
      id: "b",
      type: "birth",
      people: ["p"],
      date: parseDate("c. 1890"),
      sources: [],
      photos: []
    };
    const story = generateStory(d, "p");
    expect(story).toContain("around 1890");
  });

  it("narrates a marriage event with spouse", () => {
    const d = emptyData();
    d.people.p = { id: "p", name: "Maria", gender: "F" };
    d.people.s = { id: "s", name: "João", gender: "M" };
    d.events.m = {
      id: "m",
      type: "marriage",
      people: ["p", "s"],
      date: parseDate("1970"),
      place: { name: "Porto" },
      sources: [],
      photos: []
    };
    const story = generateStory(d, "p");
    expect(story).toContain("She married João");
    expect(story).toContain("in 1970");
    expect(story).toContain("in Porto");
  });

  it("uses gendered pronouns", () => {
    const d = emptyData();
    d.people.m = { id: "m", name: "Maria", gender: "F" };
    d.people.s = { id: "s", name: "João", gender: "M" };
    d.events.m = {
      id: "m",
      type: "marriage",
      people: ["m", "s"],
      date: parseDate("1970"),
      sources: [],
      photos: []
    };
    expect(generateStory(d, "m")).toContain("She married");
    expect(generateStory(d, "s")).toContain("He married");
  });

  it("summarizes children with birth years", () => {
    const d = emptyData();
    d.people.p = { id: "p", name: "Maria", gender: "F" };
    d.people.k1 = { id: "k1", name: "Ana", gender: "F" };
    d.people.k2 = { id: "k2", name: "Pedro", gender: "M" };
    d.events.b1 = {
      id: "b1",
      type: "birth",
      people: ["k1", "p"],
      date: parseDate("1975"),
      sources: [],
      photos: []
    };
    d.events.b2 = {
      id: "b2",
      type: "birth",
      people: ["k2", "p"],
      date: parseDate("1978"),
      sources: [],
      photos: []
    };
    const story = generateStory(d, "p");
    expect(story).toContain("two children");
    expect(story).toContain("Ana (1975)");
    expect(story).toContain("Pedro (1978)");
  });

  it("narrates a death with computed age", () => {
    const d = emptyData();
    d.people.p = { id: "p", name: "Maria", gender: "F" };
    d.events.b = {
      id: "b",
      type: "birth",
      people: ["p"],
      date: parseDate("1898"),
      sources: [],
      photos: []
    };
    d.events.de = {
      id: "de",
      type: "death",
      people: ["p"],
      date: parseDate("1975"),
      place: { name: "Lisbon" },
      sources: [],
      photos: []
    };
    const story = generateStory(d, "p");
    expect(story).toContain("She died");
    expect(story).toContain("in 1975");
    expect(story).toContain("in Lisbon");
    expect(story).toContain("age of 77");
  });

  it("includes migration and occupation events", () => {
    const d = emptyData();
    d.people.p = { id: "p", name: "Maria", gender: "F" };
    d.events.mig = {
      id: "mig",
      type: "migration",
      people: ["p"],
      date: parseDate("1960"),
      place: { name: "Brazil" },
      sources: [],
      photos: []
    };
    d.events.occ = {
      id: "occ",
      type: "occupation",
      people: ["p"],
      notes: "teacher",
      sources: [],
      photos: []
    };
    const story = generateStory(d, "p");
    expect(story).toContain("moved to Brazil");
    expect(story).toContain("worked as a teacher");
  });

  it("orders middle events by date", () => {
    const d = emptyData();
    d.people.p = { id: "p", name: "M", gender: "F" };
    d.people.s = { id: "s", name: "John", gender: "M" };
    d.events.mig = {
      id: "mig",
      type: "migration",
      people: ["p"],
      date: parseDate("1960"),
      place: { name: "Paris" },
      sources: [],
      photos: []
    };
    d.events.m = {
      id: "m",
      type: "marriage",
      people: ["p", "s"],
      date: parseDate("1955"),
      sources: [],
      photos: []
    };
    const story = generateStory(d, "p");
    // Marriage (1955) should appear before migration (1960)
    const marriageIdx = story.indexOf("married");
    const migrationIdx = story.indexOf("moved");
    expect(marriageIdx).toBeGreaterThan(-1);
    expect(migrationIdx).toBeGreaterThan(-1);
    expect(marriageIdx).toBeLessThan(migrationIdx);
  });

  it("uses 'they' pronoun for unknown gender", () => {
    const d = emptyData();
    d.people.p = { id: "p", name: "Alex", gender: "U" };
    d.events.b = {
      id: "b",
      type: "birth",
      people: ["p"],
      date: parseDate("1950"),
      sources: [],
      photos: []
    };
    d.events.de = {
      id: "de",
      type: "death",
      people: ["p"],
      date: parseDate("2020"),
      sources: [],
      photos: []
    };
    const story = generateStory(d, "p");
    expect(story).toContain("They died");
  });
});
