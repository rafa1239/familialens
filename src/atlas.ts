/**
 * Atlas — spatiotemporal logic for the Living Atlas view.
 *
 * Given the dataset and a year, compute for every person:
 *   - their lifecycle state (unborn / alive / deceased / unknown)
 *   - their "current" location (best available at that year)
 *   - their age
 *   - their generation
 *
 * Also provides lifetime trails (sequence of all located events for a
 * person, in chronological order) and dataset year bounds.
 *
 * All functions are pure and side-effect-free.
 */

import type { DataState, FamilyEvent, Person } from "./types";
import { findBirthEvent, findDeathEvent, getParents } from "./relationships";
import { yearOf } from "./dates";

// ─── Types ───────────────────────────────────────────

export type PersonStatus = "unborn" | "alive" | "deceased" | "unknown";

export type AtlasLocation = {
  lat: number;
  lon: number;
  placeName: string;
  sourceEventId: string;
  sourceEventType: string;
  sourceYear: number | null;
};

export type AtlasPersonState = {
  person: Person;
  status: PersonStatus;
  /**
   * Best-known location at the current year.
   *   - status "alive": current residence / migration / birthplace
   *   - status "unborn": their future birthplace (for pre-render positioning)
   *   - status "deceased": their death place or last known location
   *   - status "unknown": last known location or null
   * Can be null if the person has no placed event at all.
   */
  location: AtlasLocation | null;
  age: number | null;
  birthYear: number | null;
  deathYear: number | null;
  generation: number;
};

export type TrailPoint = {
  year: number | null;
  lat: number;
  lon: number;
  placeName: string;
  eventId: string;
  eventType: string;
};

// ─── Location resolution ─────────────────────────────

/**
 * Determine a person's best-known location at a given year. We rank
 * candidate events like this:
 *
 *   1. Most recent event whose date ≤ year, preferring:
 *        migration / residence > birth > death > others
 *   2. If nothing with a date ≤ year, fall back to an undated event
 *   3. If nothing at all, return null
 */
export function computePersonLocationAtYear(
  data: DataState,
  personId: string,
  year: number
): AtlasLocation | null {
  type Candidate = {
    eventId: string;
    eventType: string;
    year: number | null;
    lat: number;
    lon: number;
    name: string;
    typeRank: number; // lower = preferred when years tie
  };

  const candidates: Candidate[] = [];
  for (const ev of Object.values(data.events)) {
    if (!ev.people.includes(personId)) continue;
    if (ev.place?.lat == null || ev.place?.lon == null) continue;

    const y = yearOf(ev.date);
    let typeRank = 5;
    if (ev.type === "residence" || ev.type === "migration") typeRank = 1;
    else if (ev.type === "birth") typeRank = 2;
    else if (ev.type === "baptism") typeRank = 3;
    else if (ev.type === "death") typeRank = 4;
    else if (ev.type === "burial") typeRank = 4;

    candidates.push({
      eventId: ev.id,
      eventType: ev.type,
      year: y,
      lat: ev.place.lat,
      lon: ev.place.lon,
      name: ev.place.name,
      typeRank
    });
  }

  if (candidates.length === 0) return null;

  // Two-step selection:
  //   a) Events with a known year ≤ current year, sorted by year desc then typeRank asc
  //   b) If none, fall back to undated events sorted by typeRank asc
  const dated = candidates.filter(
    (c) => c.year !== null && c.year <= year
  );

  let best: Candidate | null = null;
  if (dated.length > 0) {
    dated.sort((a, b) => {
      const ay = a.year ?? Number.NEGATIVE_INFINITY;
      const by = b.year ?? Number.NEGATIVE_INFINITY;
      if (ay !== by) return by - ay;
      return a.typeRank - b.typeRank;
    });
    best = dated[0];
  } else {
    const undated = candidates.filter((c) => c.year === null);
    if (undated.length > 0) {
      undated.sort((a, b) => a.typeRank - b.typeRank);
      best = undated[0];
    }
  }

  if (!best) return null;

  return {
    lat: best.lat,
    lon: best.lon,
    placeName: best.name,
    sourceEventId: best.eventId,
    sourceEventType: best.eventType,
    sourceYear: best.year
  };
}

/**
 * Returns the very last location a person is known to have been at —
 * used as the fallback "final resting place" for deceased people.
 */
export function computePersonLastLocation(
  data: DataState,
  personId: string
): AtlasLocation | null {
  return computePersonLocationAtYear(
    data,
    personId,
    Number.MAX_SAFE_INTEGER
  );
}

/**
 * Returns a person's birthplace specifically (or first dated place) —
 * used as the fallback position for "unborn" people so they appear at
 * the right place when they're born.
 */
export function computePersonFirstLocation(
  data: DataState,
  personId: string
): AtlasLocation | null {
  // Find the earliest dated placed event; fall back to undated
  type Candidate = {
    eventId: string;
    eventType: string;
    year: number | null;
    lat: number;
    lon: number;
    name: string;
  };
  const candidates: Candidate[] = [];
  for (const ev of Object.values(data.events)) {
    if (!ev.people.includes(personId)) continue;
    if (ev.place?.lat == null || ev.place?.lon == null) continue;
    candidates.push({
      eventId: ev.id,
      eventType: ev.type,
      year: yearOf(ev.date),
      lat: ev.place.lat,
      lon: ev.place.lon,
      name: ev.place.name
    });
  }
  if (candidates.length === 0) return null;

  // Prefer birth event first
  const birth = candidates.find((c) => c.eventType === "birth");
  if (birth) {
    return {
      lat: birth.lat,
      lon: birth.lon,
      placeName: birth.name,
      sourceEventId: birth.eventId,
      sourceEventType: birth.eventType,
      sourceYear: birth.year
    };
  }

  // Otherwise earliest-dated
  candidates.sort((a, b) => {
    const ay = a.year ?? Number.POSITIVE_INFINITY;
    const by = b.year ?? Number.POSITIVE_INFINITY;
    return ay - by;
  });
  const earliest = candidates[0];
  return {
    lat: earliest.lat,
    lon: earliest.lon,
    placeName: earliest.name,
    sourceEventId: earliest.eventId,
    sourceEventType: earliest.eventType,
    sourceYear: earliest.year
  };
}

// ─── Snapshot ────────────────────────────────────────

/**
 * Compute the full atlas snapshot: every person's state at the given year.
 *
 * Design decisions for "ghost positioning":
 *   - "unborn" people are placed at their first known location (birthplace)
 *     with opacity: 0 in the UI. When the scrubber crosses their birth
 *     year, they fade in.
 *   - "deceased" people are placed at their last known location with
 *     opacity: 0 in the UI, so they fade out rather than disappear.
 *   - "unknown" (no birth/death dates at all) are treated as "alive" for
 *     the entire timespan so they're always visible at their first
 *     known location.
 *
 * This gives smooth CSS transitions across year changes.
 */
export function computeAtlasSnapshot(
  data: DataState,
  year: number
): AtlasPersonState[] {
  const generations = computeGenerationDepths(data);
  const results: AtlasPersonState[] = [];

  for (const person of Object.values(data.people)) {
    const birth = findBirthEvent(data, person.id);
    const death = findDeathEvent(data, person.id);
    const birthYear = yearOf(birth?.date);
    const deathYear = yearOf(death?.date);

    let status: PersonStatus;
    if (birthYear == null && deathYear == null) {
      status = "unknown";
    } else if (birthYear != null && year < birthYear) {
      status = "unborn";
    } else if (deathYear != null && year > deathYear) {
      status = "deceased";
    } else {
      status = "alive";
    }

    // Pick the location based on status
    let location: AtlasLocation | null;
    if (status === "unborn") {
      location = computePersonFirstLocation(data, person.id);
    } else if (status === "deceased") {
      location = computePersonLastLocation(data, person.id);
    } else {
      // alive or unknown — use current year (unknown treats year as "any")
      location = computePersonLocationAtYear(data, person.id, year);
    }

    const age =
      status === "alive" && birthYear != null ? year - birthYear : null;

    results.push({
      person,
      status,
      location,
      age,
      birthYear,
      deathYear,
      generation: generations.get(person.id) ?? 0
    });
  }

  return results;
}

// ─── Trails ──────────────────────────────────────────

/**
 * Returns the chronological sequence of a person's placed events.
 * Used to draw a lifetime trail polyline on the map.
 */
export function buildLifetimeTrail(
  data: DataState,
  personId: string
): TrailPoint[] {
  type RawPoint = TrailPoint & { order: number };
  const raw: RawPoint[] = [];
  for (const ev of Object.values(data.events)) {
    // Only include events where THIS person is the primary subject,
    // i.e. people[0]. Marriage/divorce events count for both spouses.
    // This excludes events like a child's birth where this person only
    // appears as a parent — they might not have been at that place.
    const isPrimary =
      ev.people[0] === personId ||
      ((ev.type === "marriage" || ev.type === "divorce") &&
        ev.people.includes(personId));
    if (!isPrimary) continue;
    if (ev.place?.lat == null || ev.place?.lon == null) continue;
    const order = eventOrderForTrail(ev.type);
    raw.push({
      year: yearOf(ev.date),
      lat: ev.place.lat,
      lon: ev.place.lon,
      placeName: ev.place.name,
      eventId: ev.id,
      eventType: ev.type,
      order
    });
  }
  raw.sort((a, b) => {
    const ay = a.year ?? Number.POSITIVE_INFINITY;
    const by = b.year ?? Number.POSITIVE_INFINITY;
    if (ay !== by) return ay - by;
    return a.order - b.order;
  });
  return raw.map(({ order, ...rest }) => rest);
}

function eventOrderForTrail(type: string): number {
  if (type === "birth") return 0;
  if (type === "baptism") return 1;
  if (type === "residence" || type === "migration") return 2;
  if (type === "death") return 9;
  if (type === "burial") return 10;
  return 5;
}

// ─── Bounds ──────────────────────────────────────────

export function atlasYearBounds(data: DataState): { minYear: number; maxYear: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const ev of Object.values(data.events)) {
    const y = yearOf(ev.date);
    if (y == null) continue;
    if (y < min) min = y;
    if (y > max) max = y;
  }
  if (!Number.isFinite(min)) {
    const now = new Date().getFullYear();
    return { minYear: now - 100, maxYear: now };
  }

  // Pad by 2 years either side for breathing room
  const paddedMin = Math.floor(min) - 2;
  const paddedMax = Math.ceil(max) + 2;
  const now = new Date().getFullYear();

  // Decide whether this is a "modern" tree that should scrub to today.
  // Two ways to qualify:
  //   1. Anyone plausibly alive (birth event, no death, age ≤ 110), OR
  //   2. The tree's latest event is within MODERN_WINDOW years of today
  //      (a modern tree that simply doesn't happen to have anyone
  //      flagged as alive — e.g. all people lack birth events, or they're
  //      marked in non-standard ways).
  //
  // Purely historical trees (last event > MODERN_WINDOW years ago) keep
  // their tight bounds so the slider isn't flooded with empty decades.
  const MAX_LIFESPAN = 110;
  const MODERN_WINDOW = 100;

  let hasLiving = false;
  for (const p of Object.values(data.people)) {
    const death = findDeathEvent(data, p.id);
    if (death != null) continue;
    const birth = findBirthEvent(data, p.id);
    const by = yearOf(birth?.date);
    if (by == null) continue;
    if (now - by <= MAX_LIFESPAN) {
      hasLiving = true;
      break;
    }
  }

  const isModernTree = hasLiving || now - Math.ceil(max) <= MODERN_WINDOW;

  return {
    minYear: paddedMin,
    maxYear: isModernTree ? Math.max(paddedMax, now) : paddedMax
  };
}

/**
 * Find the lat/lon bounding box of every placed event in the dataset.
 * Used for initial map fit.
 */
export function atlasLatLonBounds(
  data: DataState
): { minLat: number; maxLat: number; minLon: number; maxLon: number } | null {
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let found = false;
  for (const ev of Object.values(data.events)) {
    if (ev.place?.lat == null || ev.place?.lon == null) continue;
    found = true;
    if (ev.place.lat < minLat) minLat = ev.place.lat;
    if (ev.place.lat > maxLat) maxLat = ev.place.lat;
    if (ev.place.lon < minLon) minLon = ev.place.lon;
    if (ev.place.lon > maxLon) maxLon = ev.place.lon;
  }
  if (!found) return null;
  return { minLat, maxLat, minLon, maxLon };
}

// ─── Generation depths ───────────────────────────────

/**
 * Compute each person's generation depth (0 = root, 1 = one generation
 * below, etc.). Used for colouring dots.
 */
export function computeGenerationDepths(data: DataState): Map<string, number> {
  const memo = new Map<string, number>();
  const visiting = new Set<string>();

  const depthOf = (id: string): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const parents = getParents(data, id);
    if (parents.length === 0) {
      memo.set(id, 0);
      visiting.delete(id);
      return 0;
    }
    let max = 0;
    for (const p of parents) max = Math.max(max, depthOf(p.id) + 1);
    memo.set(id, max);
    visiting.delete(id);
    return max;
  };

  for (const id of Object.keys(data.people)) depthOf(id);
  return memo;
}

// ─── Generation colors ───────────────────────────────

const GEN_COLORS = [
  "#c07a20", // accent — root
  "#5b8cc9", // blue
  "#6aad80", // green
  "#c96868", // red
  "#9a74b8", // purple
  "#5aadca", // cyan
  "#d4a05a", // amber
  "#7a9e5a", // olive
  "#c4856e", // terracotta
  "#8a8ac0"  // periwinkle
];

export function generationColor(generation: number): string {
  return GEN_COLORS[generation % GEN_COLORS.length];
}

// ─── Stats for the slider label ──────────────────────

export function aliveCount(snapshot: AtlasPersonState[]): number {
  return snapshot.filter(
    (s) => s.status === "alive" && s.location != null
  ).length;
}

export function placedCount(snapshot: AtlasPersonState[]): number {
  return snapshot.filter((s) => s.location != null).length;
}
