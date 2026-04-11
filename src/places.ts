/**
 * Place intelligence — aggregate, suggest, deduplicate.
 *
 * Places live inline on events (event.place = { name, lat, lon }). They
 * are NOT stored canonically in DataState. These helpers derive a canonical
 * view on demand:
 *
 *   extractPlaces(data)    — returns one PlaceAggregate per unique name
 *   suggestPlaces(q, ps)   — ranked suggestions for autocomplete (fuzzy)
 *   findNearDuplicates(ps) — groups of probably-the-same-place
 *
 * The actual mutation (renamePlace, mergePlaces) happens in the store.
 */

import type { DataState } from "./types";

export type PlaceAggregate = {
  name: string;           // canonical string used verbatim in events
  eventCount: number;
  lat?: number;
  lon?: number;
  eventIds: string[];
};

// ─── Extraction ─────────────────────────────────────

export function extractPlaces(data: DataState): PlaceAggregate[] {
  const byName = new Map<string, PlaceAggregate>();

  for (const ev of Object.values(data.events)) {
    const name = ev.place?.name?.trim();
    if (!name) continue;

    const existing = byName.get(name);
    if (existing) {
      existing.eventCount += 1;
      existing.eventIds.push(ev.id);
      // Prefer the first non-null coords we see
      if (existing.lat == null && ev.place?.lat != null) existing.lat = ev.place.lat;
      if (existing.lon == null && ev.place?.lon != null) existing.lon = ev.place.lon;
    } else {
      byName.set(name, {
        name,
        eventCount: 1,
        lat: ev.place?.lat,
        lon: ev.place?.lon,
        eventIds: [ev.id]
      });
    }
  }

  return Array.from(byName.values()).sort(
    (a, b) => b.eventCount - a.eventCount || a.name.localeCompare(b.name)
  );
}

// ─── Suggestion (autocomplete) ──────────────────────

/**
 * Rank places for an autocomplete query. Lower score = better match.
 *
 * 0 — exact case-insensitive match
 * 1 — prefix match
 * 2 — contains match
 * 3..5 — fuzzy (Levenshtein ≤ 2 on any word in the place name)
 */
export function suggestPlaces(
  query: string,
  places: PlaceAggregate[],
  limit = 8
): PlaceAggregate[] {
  const q = query.trim().toLowerCase();
  if (!q) {
    return places.slice(0, limit);
  }

  type Match = { place: PlaceAggregate; score: number };
  const matches: Match[] = [];

  for (const place of places) {
    const name = place.name.toLowerCase();

    if (name === q) {
      matches.push({ place, score: 0 });
      continue;
    }
    if (name.startsWith(q)) {
      matches.push({ place, score: 1 });
      continue;
    }
    if (name.includes(q)) {
      matches.push({ place, score: 2 });
      continue;
    }

    // Fuzzy: try each word of the place name
    let best = Number.POSITIVE_INFINITY;
    for (const word of name.split(/[\s,;]+/)) {
      if (word.length < 2) continue;
      const dist = levenshtein(q, word);
      if (dist < best) best = dist;
    }
    if (best <= 2 && q.length >= 3) {
      matches.push({ place, score: 3 + best });
    }
  }

  matches.sort(
    (a, b) =>
      a.score - b.score ||
      b.place.eventCount - a.place.eventCount ||
      a.place.name.localeCompare(b.place.name)
  );
  return matches.slice(0, limit).map((m) => m.place);
}

// ─── Near-duplicate detection ───────────────────────

export type DuplicateGroup = {
  canonical: PlaceAggregate;
  duplicates: PlaceAggregate[];
};

/**
 * Find sets of places that are probably the same. Two passes:
 *   1. Normalize (lowercase, strip punctuation, drop everything after first
 *      comma) and group. Catches "Lisbon" = "lisbon" = "Lisbon,".
 *   2. For anything still ungrouped, check Levenshtein similarity of the
 *      normalized first segment across pairs. Catches "Lisbon" ≈ "Lisboa"
 *      and "New York" ≈ "New-York".
 *
 * Within a group, the canonical is the place with the most events
 * (ties broken alphabetically).
 */
export function findNearDuplicates(places: PlaceAggregate[]): DuplicateGroup[] {
  const results: DuplicateGroup[] = [];
  const processed = new Set<string>();

  // Pass 1 — exact normalized match
  const byKey = new Map<string, PlaceAggregate[]>();
  for (const place of places) {
    const key = normalizeName(place.name);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(place);
  }
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const sorted = sortByImportance(group);
    results.push({ canonical: sorted[0], duplicates: sorted.slice(1) });
    for (const p of group) processed.add(p.name);
  }

  // Pass 2 — fuzzy on remaining
  const remaining = places.filter((p) => !processed.has(p.name));
  for (let i = 0; i < remaining.length; i += 1) {
    const a = remaining[i];
    if (processed.has(a.name)) continue;
    const aKey = normalizeName(a.name);
    if (!aKey) continue;

    const dupes: PlaceAggregate[] = [];
    for (let j = i + 1; j < remaining.length; j += 1) {
      const b = remaining[j];
      if (processed.has(b.name)) continue;
      const bKey = normalizeName(b.name);
      if (!bKey) continue;

      if (areSimilar(aKey, bKey)) {
        dupes.push(b);
        processed.add(b.name);
      }
    }

    if (dupes.length > 0) {
      processed.add(a.name);
      const sorted = sortByImportance([a, ...dupes]);
      results.push({ canonical: sorted[0], duplicates: sorted.slice(1) });
    }
  }

  // Sort result groups: largest first
  results.sort((x, y) => {
    const xTotal = x.canonical.eventCount + x.duplicates.reduce((s, p) => s + p.eventCount, 0);
    const yTotal = y.canonical.eventCount + y.duplicates.reduce((s, p) => s + p.eventCount, 0);
    return yTotal - xTotal;
  });

  return results;
}

/**
 * Two normalized names are "similar enough" to be considered duplicates if
 * their Levenshtein distance is very small relative to their length.
 */
function areSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen < 4) return false; // too short to fuzzy-match safely
  const dist = levenshtein(a, b);
  if (dist <= 1) return true;
  if (dist === 2 && maxLen >= 6) return true;
  // Ratio-based for longer strings
  if (maxLen >= 8 && dist / maxLen <= 0.25) return true;
  return false;
}

function sortByImportance(group: PlaceAggregate[]): PlaceAggregate[] {
  return [...group].sort(
    (a, b) =>
      b.eventCount - a.eventCount ||
      (b.lat != null ? 1 : 0) - (a.lat != null ? 1 : 0) ||
      a.name.localeCompare(b.name)
  );
}

// ─── Normalization ──────────────────────────────────

/**
 * Normalize a place name for duplicate detection:
 *   - lowercase
 *   - drop everything after the first comma (strips country/region)
 *   - strip punctuation
 *   - collapse whitespace
 * Leaves accents alone — fuzzy matching handles minor diacritic differences.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .split(",")[0]
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Levenshtein distance ───────────────────────────

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  // Two-row DP to keep memory small
  let prev = new Array(bl + 1);
  let curr = new Array(bl + 1);
  for (let j = 0; j <= bl; j += 1) prev[j] = j;

  for (let i = 1; i <= al; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= bl; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,          // deletion
        curr[j - 1] + 1,      // insertion
        prev[j - 1] + cost    // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[bl];
}
