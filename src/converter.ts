import type {
  DataState,
  FamilyEvent,
  Person,
  Place
} from "./types";
import { SCHEMA_VERSION } from "./types";
import { createId, nowIso } from "./ids";
import { parseDate } from "./dates";

// ─── v5 shape (inlined so we don't depend on v5 code) ──────────

type V5Person = {
  id: string;
  name: string;
  gender: "M" | "F" | "U";
  birthDate?: string;
  deathDate?: string;
  birthPlace?: string;
  deathPlace?: string;
  notes?: string;
  photo?: string;
  x?: number;
  y?: number;
  pinned?: boolean;
};

type V5Relationship = {
  id: string;
  type: "parent" | "spouse";
  from: string;
  to: string;
};

export type V5DataState = {
  schemaVersion?: number;
  datasetId?: string;
  createdAt?: string;
  updatedAt?: string;
  people: Record<string, V5Person>;
  relationships: Record<string, V5Relationship>;
};

// ─── Conversion result ────────────────────────────────────────

export type ConversionReport = {
  data: DataState;
  warnings: string[];
  stats: {
    peopleConverted: number;
    birthEventsCreated: number;
    deathEventsCreated: number;
    marriageEventsCreated: number;
    parentsAttached: number;
    duplicateSpousesIgnored: number;
    unparseableDates: number;
  };
};

// ─── Main converter ───────────────────────────────────────────

/**
 * Convert a v5 DataState into a v7 DataState.
 *
 * Rules:
 *  1. Every v5 Person becomes a v7 Person (name, gender, notes, photo).
 *     Position fields (x, y, pinned) are discarded — v7 layouts itself.
 *  2. If the v5 person has a birthDate or birthPlace, create a birth Event
 *     with that person as people[0].
 *  3. If the v5 person has a deathDate or deathPlace, create a death Event.
 *  4. For every v5 parent relationship (from=parent, to=child):
 *       - Find or create the child's birth Event
 *       - Append the parent to that event's people array (deduped)
 *  5. For every v5 spouse relationship, create one marriage Event per
 *     unordered pair (duplicates ignored).
 *  6. Orphan relationships (referencing missing people) are dropped with
 *     a warning.
 */
export function convertV5toV7(v5: V5DataState): ConversionReport {
  const warnings: string[] = [];
  const stats = {
    peopleConverted: 0,
    birthEventsCreated: 0,
    deathEventsCreated: 0,
    marriageEventsCreated: 0,
    parentsAttached: 0,
    duplicateSpousesIgnored: 0,
    unparseableDates: 0
  };

  const people: Record<string, Person> = {};
  const events: Record<string, FamilyEvent> = {};

  // 1. People
  for (const [id, p] of Object.entries(v5.people)) {
    people[id] = {
      id,
      name: p.name ?? "Unnamed",
      gender: p.gender === "M" || p.gender === "F" ? p.gender : "U",
      notes: p.notes,
      photo: p.photo
    };
    stats.peopleConverted += 1;
  }

  // Track birth event per person for step 4
  const birthEventByPerson = new Map<string, string>();

  // 2. Birth events from birthDate / birthPlace
  for (const [personId, p] of Object.entries(v5.people)) {
    const hasDate = !!p.birthDate?.trim();
    const hasPlace = !!p.birthPlace?.trim();
    if (!hasDate && !hasPlace) continue;

    const date = parseDate(p.birthDate);
    if (hasDate && !date) {
      warnings.push(`Birth date of "${p.name}" was empty after parsing.`);
    }
    if (date && date.precision === "raw") stats.unparseableDates += 1;

    const place: Place | undefined = hasPlace
      ? { name: p.birthPlace!.trim() }
      : undefined;

    const eventId = createId("event");
    events[eventId] = {
      id: eventId,
      type: "birth",
      date,
      place,
      people: [personId],
      sources: [],
      photos: []
    };
    birthEventByPerson.set(personId, eventId);
    stats.birthEventsCreated += 1;
  }

  // 3. Death events from deathDate / deathPlace
  for (const [personId, p] of Object.entries(v5.people)) {
    const hasDate = !!p.deathDate?.trim();
    const hasPlace = !!p.deathPlace?.trim();
    if (!hasDate && !hasPlace) continue;

    const date = parseDate(p.deathDate);
    if (date && date.precision === "raw") stats.unparseableDates += 1;

    const place: Place | undefined = hasPlace
      ? { name: p.deathPlace!.trim() }
      : undefined;

    const eventId = createId("event");
    events[eventId] = {
      id: eventId,
      type: "death",
      date,
      place,
      people: [personId],
      sources: [],
      photos: []
    };
    stats.deathEventsCreated += 1;
  }

  // 4. Attach parents to children's birth events
  for (const rel of Object.values(v5.relationships ?? {})) {
    if (rel.type !== "parent") continue;
    const childId = rel.to;
    const parentId = rel.from;

    if (!people[childId] || !people[parentId]) {
      warnings.push(`Dropped parent link ${rel.id}: missing person.`);
      continue;
    }

    let birthEventId = birthEventByPerson.get(childId);
    if (!birthEventId) {
      // Create a skeleton birth event (no date/place) so we have somewhere
      // to record the parents.
      birthEventId = createId("event");
      events[birthEventId] = {
        id: birthEventId,
        type: "birth",
        people: [childId],
        sources: [],
        photos: []
      };
      birthEventByPerson.set(childId, birthEventId);
      stats.birthEventsCreated += 1;
    }

    const event = events[birthEventId];
    if (!event.people.includes(parentId)) {
      event.people.push(parentId);
      stats.parentsAttached += 1;
    }
  }

  // 5. Marriage events from spouse relationships
  const seenMarriages = new Set<string>();
  for (const rel of Object.values(v5.relationships ?? {})) {
    if (rel.type !== "spouse") continue;
    if (!people[rel.from] || !people[rel.to]) {
      warnings.push(`Dropped spouse link ${rel.id}: missing person.`);
      continue;
    }
    const key = [rel.from, rel.to].sort().join(":");
    if (seenMarriages.has(key)) {
      stats.duplicateSpousesIgnored += 1;
      continue;
    }
    seenMarriages.add(key);

    const eventId = createId("event");
    events[eventId] = {
      id: eventId,
      type: "marriage",
      people: [rel.from, rel.to],
      sources: [],
      photos: []
    };
    stats.marriageEventsCreated += 1;
  }

  const now = nowIso();
  const data: DataState = {
    schemaVersion: SCHEMA_VERSION,
    datasetId: v5.datasetId ?? createId("dataset"),
    createdAt: v5.createdAt ?? now,
    updatedAt: now,
    people,
    events,
    sources: {}
  };

  return { data, warnings, stats };
}
