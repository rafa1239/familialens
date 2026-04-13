/**
 * Dataset statistics — pure functions that take a DataState and return
 * aggregate numbers for the Stats panel.
 */

import type { DataState, FamilyEvent } from "./types";
import { findBirthEvent, findDeathEvent, getParents } from "./relationships";
import { yearOf } from "./dates";

export type DatasetStats = {
  totals: {
    people: number;
    events: number;
    sources: number;
    photos: number;
    places: number;
  };
  yearRange: { earliest: number | null; latest: number | null };
  generations: number;
  demographics: {
    living: number;
    deceased: number;
    unknown: number;
  };
  topPlaces: Array<{ name: string; count: number }>;
  topSurnames: Array<{ surname: string; count: number }>;
  eventsByType: Array<{ type: string; count: number }>;
  dataQuality: {
    missingBirthDate: number;
    missingName: number;
    isolatedPeople: number;
    unlinkedEvents: number;
  };
};

export function computeStats(data: DataState): DatasetStats {
  const people = Object.values(data.people);
  const events = Object.values(data.events);

  // ─── Totals ───
  const photosUsed = new Set<string>();
  for (const p of people) if (p.photo) photosUsed.add(p.photo);
  for (const ev of events) for (const pid of ev.photos) photosUsed.add(pid);

  const placesSet = new Set<string>();
  for (const ev of events) {
    if (ev.place?.name) placesSet.add(ev.place.name.trim());
  }

  // ─── Year range ───
  let earliest: number | null = null;
  let latest: number | null = null;
  for (const ev of events) {
    const y = yearOf(ev.date);
    if (y == null) continue;
    if (earliest == null || y < earliest) earliest = y;
    if (latest == null || y > latest) latest = y;
  }

  // ─── Generations ───
  const generations = computeGenerations(data);

  // ─── Demographics ───
  let living = 0;
  let deceased = 0;
  let unknown = 0;
  for (const person of people) {
    const birth = findBirthEvent(data, person.id);
    const death = findDeathEvent(data, person.id);
    if (death) {
      deceased += 1;
    } else if (birth?.date) {
      living += 1;
    } else {
      unknown += 1;
    }
  }

  // ─── Top places ───
  const placeCounts = new Map<string, number>();
  for (const ev of events) {
    const name = ev.place?.name?.trim();
    if (!name) continue;
    placeCounts.set(name, (placeCounts.get(name) ?? 0) + 1);
  }
  const topPlaces = Array.from(placeCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5);

  // ─── Top surnames ───
  const surnameCounts = new Map<string, number>();
  for (const person of people) {
    const surname =
      person.surname?.trim() || extractSurname(person.name) || "";
    if (!surname) continue;
    surnameCounts.set(surname, (surnameCounts.get(surname) ?? 0) + 1);
  }
  const topSurnames = Array.from(surnameCounts.entries())
    .map(([surname, count]) => ({ surname, count }))
    .sort((a, b) => b.count - a.count || a.surname.localeCompare(b.surname))
    .slice(0, 5);

  // ─── Events by type ───
  const typeCounts = new Map<string, number>();
  for (const ev of events) {
    typeCounts.set(ev.type, (typeCounts.get(ev.type) ?? 0) + 1);
  }
  const eventsByType = Array.from(typeCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // ─── Data quality ───
  const linked = new Set<string>();
  for (const ev of events) for (const pid of ev.people) linked.add(pid);

  let missingBirthDate = 0;
  let missingName = 0;
  let isolatedPeople = 0;
  for (const person of people) {
    const birth = findBirthEvent(data, person.id);
    if (!birth?.date) missingBirthDate += 1;
    if (!person.name.trim() || person.name.trim() === "Unnamed") missingName += 1;
    // Isolated: no relationships AND no birth/death events with other people
    if (!linked.has(person.id)) {
      isolatedPeople += 1;
      continue;
    }
    const hasParent = getParents(data, person.id).length > 0;
    const hasAnyEvent = events.some((e) => e.people.includes(person.id));
    if (!hasParent && hasAnyEvent) {
      // Not isolated in the strict sense — they have events but no family link
    }
  }

  let unlinkedEvents = 0;
  for (const ev of events) {
    if (ev.people.length === 0) unlinkedEvents += 1;
  }

  return {
    totals: {
      people: people.length,
      events: events.length,
      sources: Object.keys(data.sources).length,
      photos: photosUsed.size,
      places: placesSet.size
    },
    yearRange: { earliest, latest },
    generations,
    demographics: { living, deceased, unknown },
    topPlaces,
    topSurnames,
    eventsByType,
    dataQuality: {
      missingBirthDate,
      missingName,
      isolatedPeople,
      unlinkedEvents
    }
  };
}

// ─── Helpers ───────────────────────────────────────

function computeGenerations(data: DataState): number {
  const peopleIds = Object.keys(data.people);
  if (peopleIds.length === 0) return 0;

  const parentsOf = new Map<string, string[]>();
  for (const ev of Object.values(data.events)) {
    if (ev.type !== "birth" || ev.people.length < 2) continue;
    const [child, ...parents] = ev.people;
    parentsOf.set(child, parents);
  }

  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const depthOf = (id: string): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const parents = parentsOf.get(id) ?? [];
    if (parents.length === 0) {
      memo.set(id, 0);
      visiting.delete(id);
      return 0;
    }
    let max = 0;
    for (const pid of parents) max = Math.max(max, depthOf(pid) + 1);
    memo.set(id, max);
    visiting.delete(id);
    return max;
  };

  let max = 0;
  for (const id of peopleIds) max = Math.max(max, depthOf(id));
  return max + 1; // depth 0 = 1 generation
}

function extractSurname(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return "";
  return parts[parts.length - 1];
}

// ─── Per-person alive-at-year (used by timeline scrubber) ──

/**
 * Compute whether each person was alive at a given year. Returns:
 *   "alive"    — born on or before, not yet dead
 *   "deceased" — died before the year
 *   "unborn"   — not yet born
 *   "unknown"  — no date info either way
 */
export type AliveState = "alive" | "deceased" | "unborn" | "unknown";

export function aliveAtYear(
  data: DataState,
  personId: string,
  year: number
): AliveState {
  const birth = findBirthEvent(data, personId);
  const death = findDeathEvent(data, personId);
  const by = yearOf(birth?.date);
  const dy = yearOf(death?.date);

  // No date info at all
  if (by == null && dy == null) return "unknown";

  if (by != null && year < by) return "unborn";
  if (dy != null && year > dy) return "deceased";
  return "alive";
}

/**
 * Scan all events to find the min and max year across the dataset.
 * Used to bound the scrubber.
 */
export function datasetYearBounds(data: DataState): { min: number; max: number } | null {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const ev of Object.values(data.events)) {
    const y = yearOf(ev.date);
    if (y == null) continue;
    if (y < min) min = y;
    if (y > max) max = y;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

  // Extend to today for modern trees (same heuristic as atlasYearBounds):
  // if anyone is plausibly alive OR the latest event is within 100 years.
  const now = new Date().getFullYear();
  const MAX_LIFESPAN = 110;
  const MODERN_WINDOW = 100;
  let hasLiving = false;
  for (const p of Object.values(data.people)) {
    const death = findDeathEvent(data, p.id);
    if (death != null) continue;
    const birth = findBirthEvent(data, p.id);
    const by = yearOf(birth?.date);
    if (by != null && now - by <= MAX_LIFESPAN) {
      hasLiving = true;
      break;
    }
  }
  const isModern = hasLiving || now - Math.ceil(max) <= MODERN_WINDOW;
  const finalMax = isModern ? Math.max(Math.ceil(max), now) : Math.ceil(max);

  return { min: Math.floor(min), max: finalMax };
}
