import { describe, it, expect } from "vitest";
import {
  findDuplicatePeople,
  normalizePersonName
} from "./peopleDedup";
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

function addPerson(
  d: DataState,
  id: string,
  name: string,
  gender: "M" | "F" | "U" = "U",
  birthYear?: number
) {
  d.people[id] = { id, name, gender };
  if (birthYear) {
    d.events[`b_${id}`] = {
      id: `b_${id}`,
      type: "birth",
      people: [id],
      date: parseDate(String(birthYear)),
      sources: [],
      photos: []
    };
  }
}

describe("normalizePersonName", () => {
  it("lowercases", () => {
    expect(normalizePersonName("JOHN SMITH")).toBe("john smith");
  });
  it("drops middle initials", () => {
    expect(normalizePersonName("John E. Smith")).toBe("john smith");
  });
  it("strips punctuation", () => {
    expect(normalizePersonName("Jean-Claude Dupont")).toBe("jean claude dupont");
  });
  it("collapses whitespace", () => {
    expect(normalizePersonName("  John   Smith  ")).toBe("john smith");
  });
});

describe("findDuplicatePeople", () => {
  it("returns empty for a unique dataset", () => {
    const d = emptyData();
    addPerson(d, "a", "Alice", "F", 1950);
    addPerson(d, "b", "Bob", "M", 1955);
    addPerson(d, "c", "Carol", "F", 1960);
    expect(findDuplicatePeople(d)).toEqual([]);
  });

  it("detects exact-name exact-year duplicates as high confidence", () => {
    const d = emptyData();
    addPerson(d, "a", "John Smith", "M", 1950);
    addPerson(d, "b", "John Smith", "M", 1950);
    const groups = findDuplicatePeople(d);
    expect(groups).toHaveLength(1);
    expect(groups[0].confidence).toBe("high");
    expect(groups[0].canonical.person.name).toBe("John Smith");
    expect(groups[0].duplicates).toHaveLength(1);
  });

  it("detects 'John E. Smith' vs 'John Smith' as same via middle initial strip", () => {
    const d = emptyData();
    addPerson(d, "a", "John E. Smith", "M", 1950);
    addPerson(d, "b", "John Smith", "M", 1950);
    const groups = findDuplicatePeople(d);
    expect(groups).toHaveLength(1);
  });

  it("picks canonical with more events", () => {
    const d = emptyData();
    addPerson(d, "a", "John Smith", "M", 1950);
    addPerson(d, "b", "John Smith", "M", 1950);
    // Give person B an extra event
    d.events.extra = {
      id: "extra",
      type: "death",
      people: ["b"],
      date: parseDate("2010"),
      sources: [],
      photos: []
    };
    const groups = findDuplicatePeople(d);
    expect(groups[0].canonical.person.id).toBe("b");
  });

  it("refuses to group people with incompatible birth years", () => {
    const d = emptyData();
    addPerson(d, "a", "John Smith", "M", 1950);
    addPerson(d, "b", "John Smith", "M", 1990);
    expect(findDuplicatePeople(d)).toEqual([]);
  });

  it("refuses to group people with incompatible genders", () => {
    const d = emptyData();
    addPerson(d, "a", "Alex Smith", "M", 1950);
    addPerson(d, "b", "Alex Smith", "F", 1950);
    expect(findDuplicatePeople(d)).toEqual([]);
  });

  it("detects fuzzy name match (typo) with matching year as medium confidence", () => {
    const d = emptyData();
    addPerson(d, "a", "Catherine Jones", "F", 1950);
    addPerson(d, "b", "Catherine Joens", "F", 1950); // typo in surname
    const groups = findDuplicatePeople(d);
    expect(groups).toHaveLength(1);
    expect(groups[0].confidence).toBe("medium");
  });

  it("groups three or more dupes into a single group", () => {
    const d = emptyData();
    addPerson(d, "a", "Maria Lopez", "F", 1920);
    addPerson(d, "b", "Maria Lopez", "F", 1920);
    addPerson(d, "c", "Maria Lopez", "F", 1920);
    const groups = findDuplicatePeople(d);
    expect(groups).toHaveLength(1);
    expect(groups[0].duplicates).toHaveLength(2);
  });

  it("does not group when one has birth year and name is only fuzzy-similar", () => {
    const d = emptyData();
    addPerson(d, "a", "Johnson", "M", 1950);
    addPerson(d, "b", "Johnston", "M"); // no year, fuzzy similar
    // One has birth year, other doesn't → not strong enough
    const groups = findDuplicatePeople(d);
    expect(groups).toHaveLength(0);
  });

  it("accepts U gender as matching anything", () => {
    const d = emptyData();
    addPerson(d, "a", "Pat Smith", "F", 1950);
    addPerson(d, "b", "Pat Smith", "U", 1950);
    const groups = findDuplicatePeople(d);
    expect(groups).toHaveLength(1);
  });
});
