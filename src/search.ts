/**
 * Cross-entity search across people, places, and event notes.
 *
 * Pure function. Returns ranked results with type tags so the UI can
 * decide how to render and navigate each hit.
 */

import type { DataState, Person, FamilyEvent } from "./types";
import { findBirthEvent, findDeathEvent } from "./relationships";
import { yearOf } from "./dates";
import { levenshtein } from "./places";

export type SearchResult =
  | {
      kind: "person";
      person: Person;
      birthYear: number | null;
      deathYear: number | null;
      score: number;
      matchedText: string;
    }
  | {
      kind: "event";
      event: FamilyEvent;
      firstPersonId: string | null;
      score: number;
      matchedText: string;
    }
  | {
      kind: "place";
      placeName: string;
      eventCount: number;
      score: number;
      matchedText: string;
    };

/**
 * Search across the dataset. Ranking:
 *   0 — exact match
 *   1 — prefix match
 *   2 — substring match
 *   3+ — fuzzy (Levenshtein-based)
 * Lower score = better match.
 */
export function search(
  query: string,
  data: DataState,
  limit = 15
): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results: SearchResult[] = [];

  // ─── People by name ───
  for (const person of Object.values(data.people)) {
    const name = (person.name ?? "").toLowerCase();
    if (!name) continue;

    const score = scoreStringMatch(q, name);
    if (score == null) continue;

    results.push({
      kind: "person",
      person,
      birthYear: yearOf(findBirthEvent(data, person.id)?.date),
      deathYear: yearOf(findDeathEvent(data, person.id)?.date),
      score,
      matchedText: person.name
    });
  }

  // ─── Places (aggregated by name) ───
  const placeCounts = new Map<string, number>();
  for (const ev of Object.values(data.events)) {
    const name = ev.place?.name?.trim();
    if (!name) continue;
    placeCounts.set(name, (placeCounts.get(name) ?? 0) + 1);
  }
  for (const [placeName, count] of placeCounts) {
    const score = scoreStringMatch(q, placeName.toLowerCase());
    if (score == null) continue;
    results.push({
      kind: "place",
      placeName,
      eventCount: count,
      score: score + 0.1, // slight penalty vs people
      matchedText: placeName
    });
  }

  // ─── Event notes ───
  for (const ev of Object.values(data.events)) {
    const notes = ev.notes?.trim();
    if (!notes) continue;
    const lower = notes.toLowerCase();
    if (!lower.includes(q)) continue; // notes search is substring only
    // Score: boost if match is early in the note
    const pos = lower.indexOf(q);
    const score = 1.5 + pos / 1000;
    results.push({
      kind: "event",
      event: ev,
      firstPersonId: ev.people[0] ?? null,
      score,
      matchedText: notes.slice(Math.max(0, pos - 10), pos + q.length + 30)
    });
  }

  results.sort((a, b) => a.score - b.score);
  return results.slice(0, limit);
}

/**
 * Score a string match. Lower = better. null = no match.
 * 0   — exact
 * 1   — starts with
 * 2   — contains
 * 3-5 — fuzzy (Levenshtein ≤ 2)
 */
function scoreStringMatch(query: string, text: string): number | null {
  if (text === query) return 0;
  if (text.startsWith(query)) return 1;
  if (text.includes(query)) return 2;

  // Fuzzy on the best word
  if (query.length >= 3) {
    let best = Number.POSITIVE_INFINITY;
    for (const word of text.split(/[\s,;.-]+/)) {
      if (word.length < 2) continue;
      const dist = levenshtein(query, word);
      if (dist < best) best = dist;
    }
    if (best <= 2) return 3 + best;
  }

  return null;
}
