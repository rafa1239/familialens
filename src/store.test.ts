import { beforeEach, describe, it, expect } from "vitest";
import { useStore } from "./store";
import type { DataState, FamilyEvent } from "./types";
import { SCHEMA_VERSION } from "./types";

function resetStore() {
  useStore.setState({
    data: {
      schemaVersion: SCHEMA_VERSION,
      datasetId: "test",
      createdAt: "2020-01-01T00:00:00.000Z",
      updatedAt: "2020-01-01T00:00:00.000Z",
      people: {},
      events: {},
      sources: {}
    },
    hydrated: true,
    past: [],
    future: [],
    selectedPersonId: null,
    selectedEventId: null,
    toasts: []
  });
}

describe("store — people", () => {
  beforeEach(resetStore);

  it("adds a person and returns the id", () => {
    const id = useStore.getState().addPerson({ name: "John", gender: "M" });
    expect(id).toMatch(/^person_/);
    expect(useStore.getState().data.people[id].name).toBe("John");
  });

  it("updates a person", () => {
    const id = useStore.getState().addPerson({ name: "John", gender: "M" });
    useStore.getState().updatePerson(id, { name: "John Doe" });
    expect(useStore.getState().data.people[id].name).toBe("John Doe");
  });

  it("ignores updates for missing people", () => {
    useStore.getState().updatePerson("missing", { name: "Ghost" });
    expect(Object.keys(useStore.getState().data.people)).toHaveLength(0);
  });

  it("deletes a person and cleans up their events", () => {
    const s = useStore.getState();
    const alice = s.addPerson({ name: "Alice", gender: "F" });
    const bob = s.addPerson({ name: "Bob", gender: "M" });
    s.addEvent({ type: "marriage", people: [alice, bob], sources: [], photos: [] });

    s.deletePerson(alice);

    const after = useStore.getState().data;
    expect(after.people[alice]).toBeUndefined();
    expect(after.people[bob]).toBeDefined();
    // Marriage event had both — after removing alice only bob remains, which
    // means the event is preserved with a reduced people list.
    const events = Object.values(after.events);
    expect(events).toHaveLength(1);
    expect(events[0].people).toEqual([bob]);
  });

  it("removes events that become empty after person deletion", () => {
    const s = useStore.getState();
    const alice = s.addPerson({ name: "Alice", gender: "F" });
    s.addEvent({ type: "death", people: [alice], sources: [], photos: [] });

    s.deletePerson(alice);

    const after = useStore.getState().data;
    expect(Object.keys(after.events)).toHaveLength(0);
  });
});

describe("store — events", () => {
  beforeEach(resetStore);

  it("adds, updates and deletes events", () => {
    const s = useStore.getState();
    const alice = s.addPerson({ name: "Alice", gender: "F" });
    const id = s.addEvent({
      type: "birth",
      people: [alice],
      sources: [],
      photos: []
    });

    expect(useStore.getState().data.events[id].type).toBe("birth");

    s.updateEvent(id, { notes: "Born in Lisbon" });
    expect(useStore.getState().data.events[id].notes).toBe("Born in Lisbon");

    s.deleteEvent(id);
    expect(useStore.getState().data.events[id]).toBeUndefined();
  });

  it("defaults sources and photos arrays on add", () => {
    const s = useStore.getState();
    const alice = s.addPerson({ name: "Alice", gender: "F" });
    const id = s.addEvent({ type: "birth", people: [alice] });
    const event = useStore.getState().data.events[id];
    expect(event.sources).toEqual([]);
    expect(event.photos).toEqual([]);
  });
});

describe("store — sources", () => {
  beforeEach(resetStore);

  it("adds a source and attaches it to an event via updateEvent", () => {
    const s = useStore.getState();
    const sid = s.addSource({
      title: "Birth certificate",
      reliability: "primary"
    });
    const alice = s.addPerson({ name: "Alice", gender: "F" });
    const eid = s.addEvent({
      type: "birth",
      people: [alice],
      sources: [sid],
      photos: []
    });
    expect(useStore.getState().data.events[eid].sources).toEqual([sid]);
  });

  it("detaches the source from events when the source is deleted", () => {
    const s = useStore.getState();
    const sid = s.addSource({ title: "Cert", reliability: "primary" });
    const alice = s.addPerson({ name: "Alice", gender: "F" });
    const eid = s.addEvent({
      type: "birth",
      people: [alice],
      sources: [sid],
      photos: []
    });

    s.deleteSource(sid);

    const after = useStore.getState().data;
    expect(after.sources[sid]).toBeUndefined();
    expect(after.events[eid].sources).toEqual([]);
  });
});

describe("store — relationships", () => {
  beforeEach(resetStore);

  it("linkParent creates a birth event when none exists", () => {
    const s = useStore.getState();
    const child = s.addPerson({ name: "Child", gender: "U" });
    const dad = s.addPerson({ name: "Dad", gender: "M" });
    const result = s.linkParent(child, dad);
    expect(result.ok).toBe(true);

    const after = useStore.getState().data;
    const births = Object.values(after.events).filter((e) => e.type === "birth");
    expect(births).toHaveLength(1);
    expect(births[0].people).toEqual([child, dad]);
  });

  it("linkParent adds to an existing birth event", () => {
    const s = useStore.getState();
    const child = s.addPerson({ name: "Child", gender: "U" });
    const dad = s.addPerson({ name: "Dad", gender: "M" });
    const mom = s.addPerson({ name: "Mom", gender: "F" });
    s.addEvent({
      type: "birth",
      people: [child],
      date: { display: "1990", sortKey: 1990, precision: "year", iso: "1990" }
    });
    s.linkParent(child, dad);
    s.linkParent(child, mom);

    const after = useStore.getState().data;
    const births = Object.values(after.events).filter((e) => e.type === "birth");
    expect(births).toHaveLength(1);
    expect(new Set(births[0].people)).toEqual(new Set([child, dad, mom]));
    // Date is preserved
    expect(births[0].date?.sortKey).toBe(1990);
  });

  it("linkParent refuses when it would create a cycle", () => {
    const s = useStore.getState();
    const a = s.addPerson({ name: "A", gender: "U" });
    const b = s.addPerson({ name: "B", gender: "U" });
    s.linkParent(b, a); // a is parent of b
    const result = s.linkParent(a, b); // try to make b parent of a
    expect(result.ok).toBe(false);
  });

  it("linkParent refuses a third parent", () => {
    const s = useStore.getState();
    const child = s.addPerson({ name: "C", gender: "U" });
    const p1 = s.addPerson({ name: "P1", gender: "M" });
    const p2 = s.addPerson({ name: "P2", gender: "F" });
    const p3 = s.addPerson({ name: "P3", gender: "U" });
    s.linkParent(child, p1);
    s.linkParent(child, p2);
    const result = s.linkParent(child, p3);
    expect(result.ok).toBe(false);
  });

  it("unlinkParent removes the parent from the birth event", () => {
    const s = useStore.getState();
    const child = s.addPerson({ name: "C", gender: "U" });
    const dad = s.addPerson({ name: "Dad", gender: "M" });
    const mom = s.addPerson({ name: "Mom", gender: "F" });
    s.linkParent(child, dad);
    s.linkParent(child, mom);

    s.unlinkParent(child, dad);
    const after = useStore.getState().data;
    const births = Object.values(after.events).filter((e) => e.type === "birth");
    expect(births).toHaveLength(1);
    expect(births[0].people).toEqual([child, mom]);
  });

  it("unlinkParent drops an otherwise-empty birth event", () => {
    const s = useStore.getState();
    const child = s.addPerson({ name: "C", gender: "U" });
    const dad = s.addPerson({ name: "Dad", gender: "M" });
    s.linkParent(child, dad);

    s.unlinkParent(child, dad);
    const after = useStore.getState().data;
    const births = Object.values(after.events).filter((e) => e.type === "birth");
    expect(births).toHaveLength(0);
  });

  it("linkSpouse creates a marriage event", () => {
    const s = useStore.getState();
    const a = s.addPerson({ name: "A", gender: "M" });
    const b = s.addPerson({ name: "B", gender: "F" });
    const result = s.linkSpouse(a, b);
    expect(result.ok).toBe(true);

    const marriages = Object.values(useStore.getState().data.events).filter(
      (e) => e.type === "marriage"
    );
    expect(marriages).toHaveLength(1);
  });

  it("linkSpouse refuses duplicates", () => {
    const s = useStore.getState();
    const a = s.addPerson({ name: "A", gender: "M" });
    const b = s.addPerson({ name: "B", gender: "F" });
    s.linkSpouse(a, b);
    const result = s.linkSpouse(a, b);
    expect(result.ok).toBe(false);
  });

  it("unlinkSpouse removes the marriage event", () => {
    const s = useStore.getState();
    const a = s.addPerson({ name: "A", gender: "M" });
    const b = s.addPerson({ name: "B", gender: "F" });
    s.linkSpouse(a, b);
    s.unlinkSpouse(a, b);
    const marriages = Object.values(useStore.getState().data.events).filter(
      (e) => e.type === "marriage"
    );
    expect(marriages).toHaveLength(0);
  });

  it("createRelative parent creates person + link atomically", () => {
    const s = useStore.getState();
    const anchor = s.addPerson({ name: "Anchor", gender: "U" });
    const result = s.createRelative(anchor, "parent", {
      name: "New Parent",
      gender: "F"
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const data = useStore.getState().data;
    expect(data.people[result.personId].name).toBe("New Parent");
    const births = Object.values(data.events).filter(
      (e) => e.type === "birth" && e.people[0] === anchor
    );
    expect(births).toHaveLength(1);
    expect(births[0].people).toContain(result.personId);
  });

  it("createRelative child creates person + link atomically", () => {
    const s = useStore.getState();
    const anchor = s.addPerson({ name: "Anchor", gender: "F" });
    const result = s.createRelative(anchor, "child", {
      name: "New Kid",
      gender: "U"
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const data = useStore.getState().data;
    const births = Object.values(data.events).filter(
      (e) => e.type === "birth" && e.people[0] === result.personId
    );
    expect(births).toHaveLength(1);
    expect(births[0].people).toContain(anchor);
  });

  it("createRelative spouse creates person + marriage atomically", () => {
    const s = useStore.getState();
    const anchor = s.addPerson({ name: "Anchor", gender: "F" });
    const result = s.createRelative(anchor, "spouse", {
      name: "Partner",
      gender: "M"
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const data = useStore.getState().data;
    const marriages = Object.values(data.events).filter((e) => e.type === "marriage");
    expect(marriages).toHaveLength(1);
    expect(marriages[0].people).toContain(anchor);
    expect(marriages[0].people).toContain(result.personId);
  });
});

describe("store — applyParsedStatements", () => {
  beforeEach(resetStore);

  it("creates people and events from parsed statements", () => {
    const s = useStore.getState();
    const result = s.applyParsedStatements([
      { kind: "person", name: "Maria", gender: "F" },
      { kind: "birth", person: "Maria", date: "1898", place: "Lisbon" }
    ]);
    expect(result.peopleCreated).toBe(1);
    expect(result.eventsCreated).toBe(1);
    const data = useStore.getState().data;
    const maria = Object.values(data.people).find((p) => p.name === "Maria");
    expect(maria?.gender).toBe("F");
    const birth = Object.values(data.events).find((e) => e.type === "birth");
    expect(birth?.date?.sortKey).toBe(1898);
    expect(birth?.place?.name).toBe("Lisbon");
  });

  it("reuses existing people by normalized name", () => {
    const s = useStore.getState();
    const id = s.addPerson({ name: "Maria", gender: "F" });
    const result = s.applyParsedStatements([
      { kind: "person", name: "María" }, // accent difference
      { kind: "birth", person: "María", date: "1898" }
    ]);
    expect(result.peopleCreated).toBe(0);
    expect(result.peopleReused).toBeGreaterThan(0);
    const births = Object.values(useStore.getState().data.events).filter(
      (e) => e.type === "birth"
    );
    expect(births[0].people[0]).toBe(id);
  });

  it("creates marriage events", () => {
    const s = useStore.getState();
    s.applyParsedStatements([
      { kind: "person", name: "Maria" },
      { kind: "person", name: "João" },
      { kind: "marriage", a: "Maria", b: "João", date: "1920", place: "Porto" }
    ]);
    const data = useStore.getState().data;
    const marriages = Object.values(data.events).filter((e) => e.type === "marriage");
    expect(marriages).toHaveLength(1);
    expect(marriages[0].place?.name).toBe("Porto");
    expect(marriages[0].date?.sortKey).toBe(1920);
  });

  it("attaches parents to children's birth events", () => {
    const s = useStore.getState();
    s.applyParsedStatements([
      { kind: "person", name: "Maria" },
      { kind: "person", name: "João" },
      { kind: "person", name: "Ana" },
      { kind: "parent", parent: "Maria", child: "Ana" },
      { kind: "parent", parent: "João", child: "Ana" }
    ]);
    const data = useStore.getState().data;
    const births = Object.values(data.events).filter((e) => e.type === "birth");
    expect(births).toHaveLength(1);
    expect(births[0].people).toHaveLength(3);
  });

  it("merges birth info into an existing birth event", () => {
    const s = useStore.getState();
    const p = s.addPerson({ name: "Maria", gender: "F" });
    s.setBirthFact(p, { dateStr: "1898", placeName: "" });
    // Apply a statement that adds a place to the same person's birth
    s.applyParsedStatements([
      { kind: "birth", person: "Maria", place: "Lisbon" }
    ]);
    const data = useStore.getState().data;
    const birth = Object.values(data.events).find((e) => e.type === "birth");
    expect(birth?.place?.name).toBe("Lisbon");
    expect(birth?.date?.sortKey).toBe(1898); // old date preserved
  });

  it("is a single undo step for the whole batch", () => {
    const s = useStore.getState();
    const pastBefore = useStore.getState().past.length;
    s.applyParsedStatements([
      { kind: "person", name: "A" },
      { kind: "person", name: "B" },
      { kind: "person", name: "C" },
      { kind: "birth", person: "A", date: "1900" }
    ]);
    expect(useStore.getState().past.length).toBe(pastBefore + 1);
    // Undo removes everything
    useStore.getState().undo();
    expect(Object.keys(useStore.getState().data.people)).toHaveLength(0);
  });

  it("warns about duplicate marriages", () => {
    const s = useStore.getState();
    const a = s.addPerson({ name: "A", gender: "M" });
    const b = s.addPerson({ name: "B", gender: "F" });
    s.linkSpouse(a, b);
    const result = s.applyParsedStatements([
      { kind: "marriage", a: "A", b: "B" }
    ]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.eventsCreated).toBe(0);
  });

  it("warns when trying to add a third parent", () => {
    const s = useStore.getState();
    s.applyParsedStatements([
      { kind: "person", name: "Child" },
      { kind: "person", name: "P1" },
      { kind: "person", name: "P2" },
      { kind: "person", name: "P3" },
      { kind: "parent", parent: "P1", child: "Child" },
      { kind: "parent", parent: "P2", child: "Child" },
      { kind: "parent", parent: "P3", child: "Child" }
    ]);
    const result = useStore.getState();
    const births = Object.values(result.data.events).filter(
      (e) => e.type === "birth"
    );
    expect(births[0].people).toHaveLength(3); // child + 2 parents
  });

  it("backfills gender on existing person from inferred statement", () => {
    const s = useStore.getState();
    const id = s.addPerson({ name: "Alex", gender: "U" });
    s.applyParsedStatements([
      { kind: "person", name: "Alex", gender: "F" }
    ]);
    expect(useStore.getState().data.people[id].gender).toBe("F");
  });
});

describe("store — quick facts", () => {
  beforeEach(resetStore);

  it("setBirthFact creates a new event when none exists", () => {
    const s = useStore.getState();
    const alice = s.addPerson({ name: "Alice", gender: "F" });
    s.setBirthFact(alice, { dateStr: "1950", placeName: "Lisbon" });

    const events = Object.values(useStore.getState().data.events);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("birth");
    expect(events[0].people).toEqual([alice]);
    expect(events[0].date?.sortKey).toBe(1950);
    expect(events[0].place?.name).toBe("Lisbon");
  });

  it("setBirthFact updates an existing event", () => {
    const s = useStore.getState();
    const alice = s.addPerson({ name: "Alice", gender: "F" });
    s.setBirthFact(alice, { dateStr: "1950", placeName: "Lisbon" });
    s.setBirthFact(alice, { dateStr: "1951", placeName: "Porto" });

    const events = Object.values(useStore.getState().data.events);
    expect(events).toHaveLength(1);
    expect(events[0].date?.sortKey).toBe(1951);
    expect(events[0].place?.name).toBe("Porto");
  });

  it("setBirthFact preserves lat/lon when only the name changes", () => {
    const s = useStore.getState();
    const alice = s.addPerson({ name: "Alice", gender: "F" });
    // Seed event with lat/lon via addEvent
    const eid = s.addEvent({
      type: "birth",
      people: [alice],
      place: { name: "Lisbon", lat: 38.72, lon: -9.14 }
    });

    s.setBirthFact(alice, { dateStr: "1950", placeName: "Lisboa" });

    const ev = useStore.getState().data.events[eid];
    expect(ev.place?.name).toBe("Lisboa");
    expect(ev.place?.lat).toBe(38.72);
    expect(ev.place?.lon).toBe(-9.14);
  });

  it("setBirthFact preserves parents when updating date", () => {
    const s = useStore.getState();
    const kid = s.addPerson({ name: "Kid", gender: "U" });
    const mom = s.addPerson({ name: "Mom", gender: "F" });
    s.linkParent(kid, mom);
    s.setBirthFact(kid, { dateStr: "1990", placeName: "" });

    const births = Object.values(useStore.getState().data.events).filter(
      (e) => e.type === "birth"
    );
    expect(births).toHaveLength(1);
    expect(births[0].people).toEqual([kid, mom]);
    expect(births[0].date?.sortKey).toBe(1990);
  });

  it("setBirthFact deletes the event when clearing all fields from a skeleton", () => {
    const s = useStore.getState();
    const alice = s.addPerson({ name: "Alice", gender: "F" });
    s.setBirthFact(alice, { dateStr: "1950", placeName: "Lisbon" });
    expect(
      Object.values(useStore.getState().data.events).filter((e) => e.type === "birth")
    ).toHaveLength(1);

    s.setBirthFact(alice, { dateStr: "", placeName: "" });
    expect(
      Object.values(useStore.getState().data.events).filter((e) => e.type === "birth")
    ).toHaveLength(0);
  });

  it("setBirthFact keeps an event with parents even when date/place are cleared", () => {
    const s = useStore.getState();
    const kid = s.addPerson({ name: "Kid", gender: "U" });
    const mom = s.addPerson({ name: "Mom", gender: "F" });
    s.linkParent(kid, mom); // creates skeleton birth event
    s.setBirthFact(kid, { dateStr: "1990", placeName: "X" });
    s.setBirthFact(kid, { dateStr: "", placeName: "" });

    const births = Object.values(useStore.getState().data.events).filter(
      (e) => e.type === "birth"
    );
    expect(births).toHaveLength(1);
    expect(births[0].date).toBeUndefined();
    expect(births[0].place).toBeUndefined();
    expect(births[0].people).toEqual([kid, mom]);
  });

  it("setBirthFact is a no-op with empty input and no existing event", () => {
    const s = useStore.getState();
    const alice = s.addPerson({ name: "Alice", gender: "F" });
    s.setBirthFact(alice, { dateStr: "", placeName: "" });
    expect(Object.values(useStore.getState().data.events)).toHaveLength(0);
  });

  it("setDeathFact works symmetrically", () => {
    const s = useStore.getState();
    const alice = s.addPerson({ name: "Alice", gender: "F" });
    s.setDeathFact(alice, { dateStr: "2020", placeName: "Madrid" });

    const events = Object.values(useStore.getState().data.events);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("death");
    expect(events[0].date?.sortKey).toBe(2020);
    expect(events[0].place?.name).toBe("Madrid");
  });

  it("birth and death facts are independent events", () => {
    const s = useStore.getState();
    const alice = s.addPerson({ name: "Alice", gender: "F" });
    s.setBirthFact(alice, { dateStr: "1950", placeName: "" });
    s.setDeathFact(alice, { dateStr: "2020", placeName: "" });

    const events = Object.values(useStore.getState().data.events);
    expect(events).toHaveLength(2);
    expect(events.some((e) => e.type === "birth")).toBe(true);
    expect(events.some((e) => e.type === "death")).toBe(true);
  });
});

describe("store — createRelative auto-spouse", () => {
  beforeEach(resetStore);

  it("auto-links the only spouse as second parent when creating a child", () => {
    const s = useStore.getState();
    const maria = s.addPerson({ name: "Maria", gender: "F" });
    const joao = s.addPerson({ name: "João", gender: "M" });
    s.linkSpouse(maria, joao);

    const result = s.createRelative(maria, "child", {
      name: "Ana",
      gender: "F"
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.autoLinkedParent).toBe(joao);

    const births = Object.values(useStore.getState().data.events).filter(
      (e) => e.type === "birth" && e.people[0] === result.personId
    );
    expect(births).toHaveLength(1);
    expect(new Set(births[0].people)).toEqual(
      new Set([result.personId, maria, joao])
    );
  });

  it("does NOT auto-link when anchor has no spouse", () => {
    const s = useStore.getState();
    const maria = s.addPerson({ name: "Maria", gender: "F" });
    const result = s.createRelative(maria, "child", {
      name: "Ana",
      gender: "F"
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.autoLinkedParent).toBeUndefined();

    const births = Object.values(useStore.getState().data.events).filter(
      (e) => e.type === "birth" && e.people[0] === result.personId
    );
    expect(births[0].people).toEqual([result.personId, maria]);
  });

  it("does NOT auto-link when anchor has multiple spouses", () => {
    const s = useStore.getState();
    const maria = s.addPerson({ name: "Maria", gender: "F" });
    const joao = s.addPerson({ name: "João", gender: "M" });
    const luis = s.addPerson({ name: "Luis", gender: "M" });
    s.linkSpouse(maria, joao);
    s.linkSpouse(maria, luis);

    const result = s.createRelative(maria, "child", {
      name: "Ana",
      gender: "F"
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.autoLinkedParent).toBeUndefined();

    const births = Object.values(useStore.getState().data.events).filter(
      (e) => e.type === "birth" && e.people[0] === result.personId
    );
    expect(births[0].people).toEqual([result.personId, maria]);
  });
});

describe("store — mergePeople", () => {
  beforeEach(resetStore);

  it("merges two people, rewriting event references", () => {
    const s = useStore.getState();
    const a = s.addPerson({ name: "John Smith", gender: "M" });
    const b = s.addPerson({ name: "John Smith", gender: "M" });
    const kid = s.addPerson({ name: "Kid", gender: "U" });
    s.linkParent(kid, a);

    s.mergePeople(a, [b]);

    const data = useStore.getState().data;
    expect(data.people[a]).toBeDefined();
    expect(data.people[b]).toBeUndefined();
    // The parent link for kid should still point to the canonical
    const births = Object.values(data.events).filter((e) => e.type === "birth");
    expect(births.some((e) => e.people.includes(a))).toBe(true);
    expect(births.some((e) => e.people.includes(b))).toBe(false);
  });

  it("dedupes within the same event", () => {
    const s = useStore.getState();
    const a = s.addPerson({ name: "Alice", gender: "F" });
    const b = s.addPerson({ name: "Alice", gender: "F" });
    // Create an event with both duplicates in it
    s.addEvent({ type: "custom", people: [a, b], customTitle: "Together" });

    s.mergePeople(a, [b]);

    const events = Object.values(useStore.getState().data.events);
    const customEv = events.find((e) => e.type === "custom")!;
    // After merge, event.people should only contain the canonical (no duplicate)
    expect(customEv.people).toEqual([a]);
  });

  it("collapses identical events that become duplicates after rewriting", () => {
    const s = useStore.getState();
    const a = s.addPerson({ name: "Alice", gender: "F" });
    const b = s.addPerson({ name: "Alice", gender: "F" });
    // Both have identical death events (same type, no date, no place)
    // After merge they should collapse into one.
    s.addEvent({ type: "death", people: [a], place: { name: "Lisbon" } });
    s.addEvent({ type: "death", people: [b], place: { name: "Lisbon" } });

    s.mergePeople(a, [b]);

    const data = useStore.getState().data;
    const deaths = Object.values(data.events).filter((e) => e.type === "death");
    expect(deaths).toHaveLength(1);
    expect(deaths[0].people).toEqual([a]);
  });

  it("preserves non-identical events from the duplicate", () => {
    const s = useStore.getState();
    const a = s.addPerson({ name: "A", gender: "F" });
    const b = s.addPerson({ name: "A", gender: "F" });
    s.addEvent({
      type: "occupation",
      people: [b],
      notes: "Teacher"
    });

    s.mergePeople(a, [b]);

    const events = Object.values(useStore.getState().data.events);
    const occ = events.find((e) => e.type === "occupation")!;
    expect(occ).toBeDefined();
    expect(occ.people).toEqual([a]);
    expect(occ.notes).toBe("Teacher");
  });

  it("fills empty canonical photo/notes from duplicate", () => {
    const s = useStore.getState();
    const a = s.addPerson({ name: "A", gender: "F" }); // no photo, no notes
    const b = s.addPerson({
      name: "A",
      gender: "F",
      photo: "data:image/png;base64,xyz",
      notes: "Great-grandmother"
    });

    s.mergePeople(a, [b]);

    const canonical = useStore.getState().data.people[a];
    expect(canonical.photo).toBe("data:image/png;base64,xyz");
    expect(canonical.notes).toBe("Great-grandmother");
  });

  it("reassigns selection if the selected person was deleted", () => {
    const s = useStore.getState();
    const a = s.addPerson({ name: "A", gender: "F" });
    const b = s.addPerson({ name: "A", gender: "F" });
    s.selectPerson(b);
    s.mergePeople(a, [b]);
    expect(useStore.getState().selectedPersonId).toBe(a);
  });

  it("is a no-op if duplicate ids don't exist", () => {
    const s = useStore.getState();
    const a = s.addPerson({ name: "A", gender: "F" });
    s.mergePeople(a, ["ghost-id"]);
    expect(Object.keys(useStore.getState().data.people)).toHaveLength(1);
  });

  it("merges sources and photos from collapsed duplicate events", () => {
    const s = useStore.getState();
    const a = s.addPerson({ name: "A", gender: "F" });
    const b = s.addPerson({ name: "A", gender: "F" });
    const src1 = s.addSource({ title: "Doc 1", reliability: "primary" });
    const src2 = s.addSource({ title: "Doc 2", reliability: "primary" });
    s.addEvent({ type: "birth", people: [a], sources: [src1] });
    s.addEvent({ type: "birth", people: [b], sources: [src2] });

    s.mergePeople(a, [b]);

    const data = useStore.getState().data;
    const births = Object.values(data.events).filter((e) => e.type === "birth");
    expect(births).toHaveLength(1);
    expect(births[0].sources).toEqual(expect.arrayContaining([src1, src2]));
  });
});

describe("store — places", () => {
  beforeEach(resetStore);

  it("renamePlace updates every event with the old name", () => {
    const s = useStore.getState();
    const a = s.addPerson({ name: "A", gender: "F" });
    const b = s.addPerson({ name: "B", gender: "M" });
    s.addEvent({ type: "birth", people: [a], place: { name: "Lisbon" } });
    s.addEvent({ type: "birth", people: [b], place: { name: "Lisbon" } });
    s.addEvent({ type: "death", people: [a], place: { name: "Porto" } });

    s.renamePlace("Lisbon", "Lisboa");

    const events = Object.values(useStore.getState().data.events);
    const lisbons = events.filter((e) => e.place?.name === "Lisbon");
    const lisboas = events.filter((e) => e.place?.name === "Lisboa");
    expect(lisbons).toHaveLength(0);
    expect(lisboas).toHaveLength(2);
    // Porto untouched
    expect(events.filter((e) => e.place?.name === "Porto")).toHaveLength(1);
  });

  it("renamePlace preserves lat/lon", () => {
    const s = useStore.getState();
    const a = s.addPerson({ name: "A", gender: "F" });
    s.addEvent({
      type: "birth",
      people: [a],
      place: { name: "Lisbon", lat: 38.72, lon: -9.14 }
    });
    s.renamePlace("Lisbon", "Lisboa");
    const events = Object.values(useStore.getState().data.events);
    expect(events[0].place?.name).toBe("Lisboa");
    expect(events[0].place?.lat).toBe(38.72);
    expect(events[0].place?.lon).toBe(-9.14);
  });

  it("mergePlaces folds multiple names into a canonical", () => {
    const s = useStore.getState();
    const a = s.addPerson({ name: "A", gender: "F" });
    s.addEvent({ type: "birth", people: [a], place: { name: "Lisbon" } });
    s.addEvent({ type: "death", people: [a], place: { name: "Lisboa" } });
    s.addEvent({ type: "residence", people: [a], place: { name: "LISBON" } });

    s.mergePlaces(["Lisboa", "LISBON"], "Lisbon");

    const events = Object.values(useStore.getState().data.events);
    expect(events.every((e) => e.place?.name === "Lisbon")).toBe(true);
  });

  it("mergePlaces fills missing coords on renamed events from canonical", () => {
    const s = useStore.getState();
    const a = s.addPerson({ name: "A", gender: "F" });
    // Two "Lisboa" events — one with coords, one without.
    s.addEvent({ type: "birth", people: [a], place: { name: "Lisboa" } });
    s.addEvent({
      type: "death",
      people: [a],
      place: { name: "Lisboa", lat: 99, lon: 99 }
    });

    // Merge Lisboa → Lisbon, providing canonical coords
    s.mergePlaces(["Lisboa"], "Lisbon", { lat: 38.72, lon: -9.14 });

    const events = Object.values(useStore.getState().data.events);
    const birthEv = events.find((e) => e.type === "birth")!;
    const deathEv = events.find((e) => e.type === "death")!;
    expect(birthEv.place?.name).toBe("Lisbon");
    expect(deathEv.place?.name).toBe("Lisbon");
    // birth had no coords → filled from canonical
    expect(birthEv.place?.lat).toBe(38.72);
    expect(birthEv.place?.lon).toBe(-9.14);
    // death had own coords → kept them
    expect(deathEv.place?.lat).toBe(99);
    expect(deathEv.place?.lon).toBe(99);
  });

  it("setPlaceCoords updates every matching event", () => {
    const s = useStore.getState();
    const a = s.addPerson({ name: "A", gender: "F" });
    s.addEvent({ type: "birth", people: [a], place: { name: "Lisbon" } });
    s.addEvent({ type: "death", people: [a], place: { name: "Lisbon" } });
    s.addEvent({ type: "birth", people: [a], place: { name: "Porto" } });

    s.setPlaceCoords("Lisbon", 38.72, -9.14);

    const events = Object.values(useStore.getState().data.events);
    const lisbonEvents = events.filter((e) => e.place?.name === "Lisbon");
    expect(lisbonEvents.every((e) => e.place?.lat === 38.72)).toBe(true);
    expect(lisbonEvents.every((e) => e.place?.lon === -9.14)).toBe(true);
    // Porto untouched
    expect(events.find((e) => e.place?.name === "Porto")?.place?.lat).toBeUndefined();
  });

  it("setBirthFact accepts optional coords", () => {
    const s = useStore.getState();
    const a = s.addPerson({ name: "A", gender: "F" });
    s.setBirthFact(a, {
      dateStr: "1950",
      placeName: "Lisbon",
      placeLat: 38.72,
      placeLon: -9.14
    });
    const events = Object.values(useStore.getState().data.events);
    expect(events[0].place?.lat).toBe(38.72);
    expect(events[0].place?.lon).toBe(-9.14);
  });
});

describe("store — undo/redo", () => {
  beforeEach(resetStore);

  it("undoes a person addition", () => {
    const s = useStore.getState();
    s.addPerson({ name: "Alice", gender: "F" });
    expect(Object.keys(useStore.getState().data.people)).toHaveLength(1);
    useStore.getState().undo();
    expect(Object.keys(useStore.getState().data.people)).toHaveLength(0);
  });

  it("redoes a person addition", () => {
    const s = useStore.getState();
    s.addPerson({ name: "Alice", gender: "F" });
    useStore.getState().undo();
    useStore.getState().redo();
    expect(Object.keys(useStore.getState().data.people)).toHaveLength(1);
  });

  it("undoes a linkSpouse operation", () => {
    const s = useStore.getState();
    const a = s.addPerson({ name: "A", gender: "M" });
    const b = s.addPerson({ name: "B", gender: "F" });
    s.linkSpouse(a, b);
    expect(
      Object.values(useStore.getState().data.events).filter((e) => e.type === "marriage")
    ).toHaveLength(1);
    useStore.getState().undo();
    expect(
      Object.values(useStore.getState().data.events).filter((e) => e.type === "marriage")
    ).toHaveLength(0);
  });

  it("clears redo on new mutation", () => {
    const s = useStore.getState();
    s.addPerson({ name: "A", gender: "M" });
    useStore.getState().undo();
    expect(useStore.getState().canRedo()).toBe(true);
    useStore.getState().addPerson({ name: "B", gender: "F" });
    expect(useStore.getState().canRedo()).toBe(false);
  });
});

describe("store — import / reset", () => {
  beforeEach(resetStore);

  it("importData replaces the current dataset", () => {
    const s = useStore.getState();
    s.addPerson({ name: "Will be gone", gender: "U" });

    const replacement: DataState = {
      schemaVersion: SCHEMA_VERSION,
      datasetId: "imported",
      createdAt: "2021-01-01T00:00:00.000Z",
      updatedAt: "2021-01-01T00:00:00.000Z",
      people: {
        x: { id: "x", name: "Imported", gender: "M" }
      },
      events: {},
      sources: {}
    };
    s.importData(replacement);

    const after = useStore.getState().data;
    expect(after.datasetId).toBe("imported");
    expect(Object.keys(after.people)).toEqual(["x"]);
  });

  it("reset creates an empty dataset", () => {
    const s = useStore.getState();
    s.addPerson({ name: "Somebody", gender: "U" });
    s.reset();
    const after = useStore.getState().data;
    expect(Object.keys(after.people)).toHaveLength(0);
    expect(Object.keys(after.events)).toHaveLength(0);
  });
});
