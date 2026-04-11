/**
 * FamiliaLens v7 — event-first data model.
 *
 * Design principle: a Person is a thin identity record. Everything factual
 * about a person (birth, death, marriage, migration, occupation, etc.) is
 * modelled as an Event. Dates, places, and sources live on events — never
 * on people directly. This mirrors how genealogy actually works: you find
 * a document, it asserts an event, you record the event with its source.
 *
 * Birth dates/places are therefore NOT fields on Person — they are derived
 * from the person's birth Event at display time. Same for death. Parent
 * relationships are expressed via Events of type "birth" that list the
 * parents alongside the child. Spouse relationships are expressed via
 * Events of type "marriage".
 */

export const SCHEMA_VERSION = 3;

// ─── Dates ──────────────────────────────────────────────

export type DatePrecision =
  | "exact"     // YYYY-MM-DD known
  | "month"     // YYYY-MM known
  | "year"      // YYYY known
  | "approx"    // "c. 1890" / "circa"
  | "before"    // "before 1890"
  | "after"     // "after 1890"
  | "raw";      // unparseable, kept as display string

/**
 * An event date. `sortKey` is a numeric year (possibly fractional) used
 * for timeline ordering. `display` is what the user sees. `iso` is set
 * when we can represent the date as ISO 8601 (YYYY, YYYY-MM, YYYY-MM-DD).
 */
export type EventDate = {
  display: string;
  sortKey: number;       // NaN if unparseable
  precision: DatePrecision;
  iso?: string;
};

// ─── Places ─────────────────────────────────────────────

export type Place = {
  name: string;          // "Bragança, Portugal"
  lat?: number;
  lon?: number;
};

// ─── Sources ────────────────────────────────────────────

export type SourceReliability = "primary" | "secondary" | "tertiary" | "unknown";

export type Source = {
  id: string;
  title: string;
  citation?: string;     // formal citation text
  url?: string;
  notes?: string;
  reliability: SourceReliability;
};

// ─── Events ─────────────────────────────────────────────

/**
 * Event types. The role of each person in `people` depends on `type`:
 *
 *   birth       people[0]=child, people[1..]=parents (order not significant)
 *   death       people[0]=deceased
 *   marriage    people[0], people[1]=spouses (no ordering semantics)
 *   divorce     people[0], people[1]=ex-spouses
 *   baptism     people[0]=person baptised
 *   burial      people[0]=person buried
 *   migration   people[0]=migrant (use notes/places for from/to detail)
 *   residence   people[0]=resident
 *   occupation  people[0]=worker
 *   education   people[0]=student
 *   custom      people[0..]=participants; customTitle describes the event
 */
export type EventType =
  | "birth"
  | "death"
  | "marriage"
  | "divorce"
  | "baptism"
  | "burial"
  | "migration"
  | "residence"
  | "occupation"
  | "education"
  | "custom";

export type FamilyEvent = {
  id: string;
  type: EventType;
  customTitle?: string;       // only when type === "custom"
  date?: EventDate;
  place?: Place;
  people: string[];           // person IDs; roles inferred from type
  notes?: string;
  sources: string[];          // source IDs
  photos: string[];           // photo IDs (blobs stored separately)
};

// ─── People ─────────────────────────────────────────────

export type Gender = "M" | "F" | "U";

/**
 * Minimal identity record. No dates, no places — those live on events.
 * Photo is a data URL or a blob reference (opaque string).
 */
export type Person = {
  id: string;
  name: string;
  surname?: string;
  aliases?: string[];
  gender: Gender;
  photo?: string;
  notes?: string;
};

// ─── Dataset ────────────────────────────────────────────

export type DataState = {
  schemaVersion: typeof SCHEMA_VERSION;
  datasetId: string;
  createdAt: string;
  updatedAt: string;
  people: Record<string, Person>;
  events: Record<string, FamilyEvent>;
  sources: Record<string, Source>;
};

// ─── Result types ───────────────────────────────────────

export type ValidationResult = { ok: true } | { ok: false; reason: string };
