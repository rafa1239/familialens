import { describe, it, expect } from "vitest";
import { search } from "./search";
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

function withData(): DataState {
  const d = emptyData();
  d.people.a = { id: "a", name: "Alice Smith", gender: "F" };
  d.people.b = { id: "b", name: "Bob Jones", gender: "M" };
  d.people.c = { id: "c", name: "Maria Lopez", gender: "F" };
  d.events.e1 = {
    id: "e1",
    type: "birth",
    people: ["a"],
    date: parseDate("1950"),
    place: { name: "Lisbon" },
    sources: [],
    photos: []
  };
  d.events.e2 = {
    id: "e2",
    type: "birth",
    people: ["b"],
    place: { name: "Porto" },
    notes: "Famously traveled the world",
    sources: [],
    photos: []
  };
  d.events.e3 = {
    id: "e3",
    type: "birth",
    people: ["c"],
    place: { name: "Lisbon" },
    sources: [],
    photos: []
  };
  return d;
}

describe("search", () => {
  it("returns empty for empty query", () => {
    expect(search("", withData())).toEqual([]);
    expect(search("   ", withData())).toEqual([]);
  });

  it("finds people by exact name", () => {
    const results = search("Alice Smith", withData());
    expect(results.some((r) => r.kind === "person")).toBe(true);
    const p = results.find((r) => r.kind === "person");
    expect(p?.kind === "person" && p.person.id).toBe("a");
  });

  it("finds people by prefix", () => {
    const results = search("Ali", withData());
    expect(results.some((r) => r.kind === "person" && r.person.id === "a")).toBe(true);
  });

  it("finds people by substring", () => {
    const results = search("smith", withData());
    expect(results.some((r) => r.kind === "person" && r.person.id === "a")).toBe(true);
  });

  it("finds people with fuzzy typo", () => {
    const results = search("lopz", withData()); // typo of "lopez"
    expect(results.some((r) => r.kind === "person" && r.person.id === "c")).toBe(true);
  });

  it("finds places by name", () => {
    const results = search("lisbon", withData());
    const place = results.find((r) => r.kind === "place");
    expect(place?.kind === "place" && place.placeName).toBe("Lisbon");
    expect(place?.kind === "place" && place.eventCount).toBe(2);
  });

  it("finds event notes by substring", () => {
    const results = search("travel", withData());
    expect(results.some((r) => r.kind === "event")).toBe(true);
  });

  it("ranks exact matches above prefix above substring", () => {
    const d = emptyData();
    d.people.exact = { id: "exact", name: "test", gender: "U" };
    d.people.prefix = { id: "prefix", name: "test one", gender: "U" };
    d.people.sub = { id: "sub", name: "not test something", gender: "U" };
    const results = search("test", d);
    const personResults = results.filter((r) => r.kind === "person");
    expect(personResults[0].kind === "person" && personResults[0].person.id).toBe("exact");
    expect(personResults[1].kind === "person" && personResults[1].person.id).toBe("prefix");
  });

  it("limits results to the requested number", () => {
    const d = emptyData();
    for (let i = 0; i < 30; i++) {
      d.people[`p${i}`] = { id: `p${i}`, name: `Test Person ${i}`, gender: "U" };
    }
    expect(search("test", d, 5)).toHaveLength(5);
  });

  it("is case-insensitive", () => {
    const results = search("LISBON", withData());
    expect(results.some((r) => r.kind === "place")).toBe(true);
  });
});
