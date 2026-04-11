import { describe, it, expect } from "vitest";
import { convertV5toV7, type V5DataState } from "./converter";
import { parseDate, yearOf } from "./dates";

// ─── Helpers ──────────────────────────────────────────

function emptyV5(): V5DataState {
  return {
    schemaVersion: 1,
    datasetId: "dataset_test",
    createdAt: "2020-01-01T00:00:00.000Z",
    updatedAt: "2020-01-01T00:00:00.000Z",
    people: {},
    relationships: {}
  };
}

function v5Person(
  id: string,
  name: string,
  gender: "M" | "F" | "U" = "U",
  extra: Partial<{
    birthDate: string;
    deathDate: string;
    birthPlace: string;
    deathPlace: string;
    notes: string;
    photo: string;
  }> = {}
) {
  return {
    id,
    name,
    gender,
    birthDate: extra.birthDate ?? "",
    deathDate: extra.deathDate ?? "",
    birthPlace: extra.birthPlace,
    deathPlace: extra.deathPlace,
    notes: extra.notes,
    photo: extra.photo,
    x: 0,
    y: 0,
    pinned: false
  };
}

function v5Rel(id: string, type: "parent" | "spouse", from: string, to: string) {
  return { id, type, from, to };
}

// ─── parseDate ────────────────────────────────────────

describe("parseDate", () => {
  it("returns undefined for empty / nullish input", () => {
    expect(parseDate("")).toBeUndefined();
    expect(parseDate("   ")).toBeUndefined();
    expect(parseDate(undefined)).toBeUndefined();
    expect(parseDate(null)).toBeUndefined();
  });

  it("parses year-only", () => {
    const d = parseDate("1950")!;
    expect(d.precision).toBe("year");
    expect(d.sortKey).toBe(1950);
    expect(d.iso).toBe("1950");
    expect(d.display).toBe("1950");
  });

  it("parses year-month", () => {
    const d = parseDate("1950-03")!;
    expect(d.precision).toBe("month");
    expect(d.iso).toBe("1950-03");
    // March is month index 2, so sortKey = 1950 + 2/12
    expect(d.sortKey).toBeCloseTo(1950 + 2 / 12, 5);
    expect(d.display).toBe("March 1950");
  });

  it("parses full ISO date", () => {
    const d = parseDate("1950-03-15")!;
    expect(d.precision).toBe("exact");
    expect(d.iso).toBe("1950-03-15");
    expect(d.display).toBe("15 March 1950");
    // Day of year for March 15 = 31 + 28 + 15 = 74, zero-indexed 73
    expect(d.sortKey).toBeCloseTo(1950 + 73 / 365, 4);
  });

  it("parses leap-year February dates", () => {
    const d = parseDate("2000-02-29")!;
    expect(d.precision).toBe("exact");
    expect(d.display).toBe("29 February 2000");
  });

  it("rejects invalid dates as raw", () => {
    const d = parseDate("1950-13-99")!;
    expect(d.precision).toBe("raw");
    expect(Number.isNaN(d.sortKey)).toBe(true);
    expect(d.display).toBe("1950-13-99");
  });

  it("parses circa notations", () => {
    for (const input of ["c. 1890", "c.1890", "circa 1890", "~1890", "ca 1890", "ca. 1890"]) {
      const d = parseDate(input);
      expect(d, `input=${input}`).toBeDefined();
      expect(d!.precision).toBe("approx");
      expect(d!.sortKey).toBe(1890);
      expect(d!.display).toBe("c. 1890");
    }
  });

  it("parses before", () => {
    const d = parseDate("before 1890")!;
    expect(d.precision).toBe("before");
    expect(d.sortKey).toBe(1889.5);
    expect(d.display).toBe("before 1890");

    const d2 = parseDate("bef. 1890")!;
    expect(d2.precision).toBe("before");
  });

  it("parses after", () => {
    const d = parseDate("after 1890")!;
    expect(d.precision).toBe("after");
    expect(d.sortKey).toBe(1890.5);
    expect(d.display).toBe("after 1890");
  });

  it("preserves unparseable strings as raw", () => {
    const d = parseDate("verano de 1950")!;
    expect(d.precision).toBe("raw");
    expect(Number.isNaN(d.sortKey)).toBe(true);
    expect(d.display).toBe("verano de 1950");
  });

  it("orders by sortKey for timeline placement", () => {
    const dates = ["1950", "1949-12", "1950-06-15", "c. 1890", "before 1890", "after 1890"]
      .map((s) => parseDate(s)!);
    // Assert sortKey relationships — what a timeline cares about.
    const sk = (s: string) => dates[["1950", "1949-12", "1950-06-15", "c. 1890", "before 1890", "after 1890"].indexOf(s)].sortKey;

    expect(sk("before 1890")).toBeLessThan(sk("c. 1890"));
    expect(sk("c. 1890")).toBeLessThan(sk("after 1890"));
    expect(sk("after 1890")).toBeLessThan(sk("1949-12"));
    expect(sk("1949-12")).toBeLessThan(sk("1950"));
    expect(sk("1950")).toBeLessThan(sk("1950-06-15"));
  });

  it("gives year and YYYY-01-01 the same sortKey (both start of 1950)", () => {
    // This is intentional: "1950" means "sometime in 1950", so its sort
    // position is the start of the year, same as an exact Jan 1 date.
    expect(parseDate("1950")!.sortKey).toBe(parseDate("1950-01-01")!.sortKey);
  });
});

// ─── yearOf ───────────────────────────────────────────

describe("yearOf", () => {
  it("returns null for undefined", () => {
    expect(yearOf(undefined)).toBeNull();
  });
  it("returns null for raw dates", () => {
    expect(yearOf(parseDate("foo"))).toBeNull();
  });
  it("returns floor of sortKey", () => {
    expect(yearOf(parseDate("1950-06"))).toBe(1950);
    expect(yearOf(parseDate("before 1890"))).toBe(1889);
  });
});

// ─── convertV5toV7 ────────────────────────────────────

describe("convertV5toV7", () => {
  it("converts an empty dataset", () => {
    const { data, warnings, stats } = convertV5toV7(emptyV5());
    expect(Object.keys(data.people)).toHaveLength(0);
    expect(Object.keys(data.events)).toHaveLength(0);
    expect(Object.keys(data.sources)).toHaveLength(0);
    expect(warnings).toHaveLength(0);
    expect(stats.peopleConverted).toBe(0);
    expect(data.schemaVersion).toBe(3);
  });

  it("preserves dataset id and createdAt", () => {
    const v5 = emptyV5();
    v5.datasetId = "my_tree";
    v5.createdAt = "2019-05-05T00:00:00.000Z";
    const { data } = convertV5toV7(v5);
    expect(data.datasetId).toBe("my_tree");
    expect(data.createdAt).toBe("2019-05-05T00:00:00.000Z");
  });

  it("converts a person without dates to 1 person and 0 events", () => {
    const v5 = emptyV5();
    v5.people.p1 = v5Person("p1", "John Doe", "M");
    const { data, stats } = convertV5toV7(v5);
    expect(Object.keys(data.people)).toHaveLength(1);
    expect(data.people.p1.name).toBe("John Doe");
    expect(data.people.p1.gender).toBe("M");
    expect(Object.keys(data.events)).toHaveLength(0);
    expect(stats.birthEventsCreated).toBe(0);
    expect(stats.deathEventsCreated).toBe(0);
  });

  it("creates a birth event when birthDate is present", () => {
    const v5 = emptyV5();
    v5.people.p1 = v5Person("p1", "John", "M", { birthDate: "1950" });
    const { data, stats } = convertV5toV7(v5);
    const events = Object.values(data.events);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("birth");
    expect(events[0].people).toEqual(["p1"]);
    expect(events[0].date?.sortKey).toBe(1950);
    expect(stats.birthEventsCreated).toBe(1);
  });

  it("creates a birth event with place when only birthPlace is present", () => {
    const v5 = emptyV5();
    v5.people.p1 = v5Person("p1", "John", "M", { birthPlace: "Lisbon" });
    const { data } = convertV5toV7(v5);
    const events = Object.values(data.events);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("birth");
    expect(events[0].place?.name).toBe("Lisbon");
    expect(events[0].date).toBeUndefined();
  });

  it("creates both birth and death events", () => {
    const v5 = emptyV5();
    v5.people.p1 = v5Person("p1", "John", "M", {
      birthDate: "1950",
      deathDate: "2020",
      birthPlace: "Paris",
      deathPlace: "Madrid"
    });
    const { data, stats } = convertV5toV7(v5);
    const events = Object.values(data.events);
    expect(events).toHaveLength(2);
    const birth = events.find((e) => e.type === "birth")!;
    const death = events.find((e) => e.type === "death")!;
    expect(birth.place?.name).toBe("Paris");
    expect(death.place?.name).toBe("Madrid");
    expect(birth.date?.sortKey).toBe(1950);
    expect(death.date?.sortKey).toBe(2020);
    expect(stats.birthEventsCreated).toBe(1);
    expect(stats.deathEventsCreated).toBe(1);
  });

  it("attaches a parent to the child's birth event", () => {
    const v5 = emptyV5();
    v5.people.c = v5Person("c", "Child", "U", { birthDate: "1980" });
    v5.people.d = v5Person("d", "Dad", "M");
    v5.relationships.r1 = v5Rel("r1", "parent", "d", "c");
    const { data, stats } = convertV5toV7(v5);
    const births = Object.values(data.events).filter((e) => e.type === "birth");
    expect(births).toHaveLength(1);
    expect(births[0].people).toEqual(["c", "d"]);
    expect(stats.parentsAttached).toBe(1);
  });

  it("creates a skeleton birth event for children with parents but no birthDate", () => {
    const v5 = emptyV5();
    v5.people.c = v5Person("c", "Child");
    v5.people.m = v5Person("m", "Mom", "F");
    v5.relationships.r1 = v5Rel("r1", "parent", "m", "c");
    const { data } = convertV5toV7(v5);
    const births = Object.values(data.events).filter((e) => e.type === "birth");
    expect(births).toHaveLength(1);
    expect(births[0].date).toBeUndefined();
    expect(births[0].place).toBeUndefined();
    expect(births[0].people).toEqual(["c", "m"]);
  });

  it("attaches multiple parents to the same birth event", () => {
    const v5 = emptyV5();
    v5.people.c = v5Person("c", "Child", "U", { birthDate: "1980" });
    v5.people.d = v5Person("d", "Dad", "M");
    v5.people.m = v5Person("m", "Mom", "F");
    v5.relationships.r1 = v5Rel("r1", "parent", "d", "c");
    v5.relationships.r2 = v5Rel("r2", "parent", "m", "c");
    const { data, stats } = convertV5toV7(v5);
    const births = Object.values(data.events).filter((e) => e.type === "birth");
    expect(births).toHaveLength(1);
    expect(births[0].people).toHaveLength(3);
    expect(new Set(births[0].people)).toEqual(new Set(["c", "d", "m"]));
    expect(stats.parentsAttached).toBe(2);
  });

  it("does not duplicate the same parent on re-attach", () => {
    const v5 = emptyV5();
    v5.people.c = v5Person("c", "Child", "U");
    v5.people.d = v5Person("d", "Dad", "M");
    v5.relationships.r1 = v5Rel("r1", "parent", "d", "c");
    v5.relationships.r2 = v5Rel("r2", "parent", "d", "c"); // duplicate
    const { data } = convertV5toV7(v5);
    const births = Object.values(data.events).filter((e) => e.type === "birth");
    expect(births).toHaveLength(1);
    expect(births[0].people).toEqual(["c", "d"]);
  });

  it("creates a marriage event from a spouse relationship", () => {
    const v5 = emptyV5();
    v5.people.a = v5Person("a", "Alice", "F");
    v5.people.b = v5Person("b", "Bob", "M");
    v5.relationships.r1 = v5Rel("r1", "spouse", "a", "b");
    const { data, stats } = convertV5toV7(v5);
    const marriages = Object.values(data.events).filter((e) => e.type === "marriage");
    expect(marriages).toHaveLength(1);
    expect(new Set(marriages[0].people)).toEqual(new Set(["a", "b"]));
    expect(stats.marriageEventsCreated).toBe(1);
  });

  it("dedupes spouse relationships regardless of direction", () => {
    const v5 = emptyV5();
    v5.people.a = v5Person("a", "Alice", "F");
    v5.people.b = v5Person("b", "Bob", "M");
    v5.relationships.r1 = v5Rel("r1", "spouse", "a", "b");
    v5.relationships.r2 = v5Rel("r2", "spouse", "b", "a"); // reverse
    const { data, stats } = convertV5toV7(v5);
    const marriages = Object.values(data.events).filter((e) => e.type === "marriage");
    expect(marriages).toHaveLength(1);
    expect(stats.duplicateSpousesIgnored).toBe(1);
  });

  it("drops relationships that reference missing people", () => {
    const v5 = emptyV5();
    v5.people.a = v5Person("a", "Alice", "F");
    // "ghost" does not exist
    v5.relationships.r1 = v5Rel("r1", "spouse", "a", "ghost");
    v5.relationships.r2 = v5Rel("r2", "parent", "ghost", "a");
    const { data, warnings } = convertV5toV7(v5);
    expect(Object.values(data.events).filter((e) => e.type === "marriage")).toHaveLength(0);
    expect(Object.values(data.events).filter((e) => e.type === "birth")).toHaveLength(0);
    expect(warnings).toHaveLength(2);
  });

  it("discards v5 layout fields (x, y, pinned)", () => {
    const v5 = emptyV5();
    v5.people.p1 = { ...v5Person("p1", "John", "M"), x: 100, y: 200, pinned: true };
    const { data } = convertV5toV7(v5);
    const person: any = data.people.p1;
    expect(person.x).toBeUndefined();
    expect(person.y).toBeUndefined();
    expect(person.pinned).toBeUndefined();
  });

  it("preserves photo and notes", () => {
    const v5 = emptyV5();
    v5.people.p1 = v5Person("p1", "John", "M", {
      notes: "Great-grandfather",
      photo: "data:image/jpeg;base64,xyz"
    });
    const { data } = convertV5toV7(v5);
    expect(data.people.p1.notes).toBe("Great-grandfather");
    expect(data.people.p1.photo).toBe("data:image/jpeg;base64,xyz");
  });

  it("counts unparseable dates", () => {
    const v5 = emptyV5();
    v5.people.p1 = v5Person("p1", "John", "M", { birthDate: "verano 1950" });
    const { stats } = convertV5toV7(v5);
    expect(stats.unparseableDates).toBe(1);
  });

  it("handles a realistic small family", () => {
    // Two grandparents → Dad, one grandmother → Mom, Dad + Mom → Child
    const v5 = emptyV5();
    v5.people.gf = v5Person("gf", "Grandfather", "M", { birthDate: "1920", deathDate: "1990" });
    v5.people.gm = v5Person("gm", "Grandmother", "F", { birthDate: "1922", deathDate: "2005" });
    v5.people.mgm = v5Person("mgm", "Maternal Grandmother", "F", { birthDate: "1925" });
    v5.people.dad = v5Person("dad", "Dad", "M", { birthDate: "1950" });
    v5.people.mom = v5Person("mom", "Mom", "F", { birthDate: "1955" });
    v5.people.child = v5Person("child", "Child", "U", { birthDate: "1985" });

    v5.relationships.r1 = v5Rel("r1", "parent", "gf", "dad");
    v5.relationships.r2 = v5Rel("r2", "parent", "gm", "dad");
    v5.relationships.r3 = v5Rel("r3", "parent", "mgm", "mom");
    v5.relationships.r4 = v5Rel("r4", "parent", "dad", "child");
    v5.relationships.r5 = v5Rel("r5", "parent", "mom", "child");
    v5.relationships.r6 = v5Rel("r6", "spouse", "gf", "gm");
    v5.relationships.r7 = v5Rel("r7", "spouse", "dad", "mom");

    const { data, stats } = convertV5toV7(v5);

    expect(stats.peopleConverted).toBe(6);
    expect(stats.birthEventsCreated).toBe(6); // all 6 people have birthDates
    expect(stats.deathEventsCreated).toBe(2); // grandfather and grandmother
    expect(stats.marriageEventsCreated).toBe(2);
    expect(stats.parentsAttached).toBe(5);

    // Child's birth event should list all three people
    const childBirth = Object.values(data.events).find(
      (e) => e.type === "birth" && e.people[0] === "child"
    )!;
    expect(new Set(childBirth.people)).toEqual(new Set(["child", "dad", "mom"]));

    // Dad's birth event should list him + both grandparents
    const dadBirth = Object.values(data.events).find(
      (e) => e.type === "birth" && e.people[0] === "dad"
    )!;
    expect(new Set(dadBirth.people)).toEqual(new Set(["dad", "gf", "gm"]));
  });
});
