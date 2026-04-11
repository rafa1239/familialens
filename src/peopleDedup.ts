/**
 * Person deduplication — detect probable duplicate people.
 *
 * Signals:
 *   - Normalized name match (exact or fuzzy via Levenshtein)
 *   - Birth year proximity (|Δ| ≤ 2 years)
 *   - Gender compatibility (any U matches anything, different M/F rules it out)
 *
 * Pure functions. Mutation happens in the store via `mergePeople`.
 */

import type { DataState, Person } from "./types";
import { findBirthEvent } from "./relationships";
import { yearOf } from "./dates";
import { levenshtein } from "./places";

export type PersonCandidate = {
  person: Person;
  birthYear: number | null;
};

export type DuplicatePersonGroup = {
  canonical: PersonCandidate;
  duplicates: PersonCandidate[];
  confidence: "high" | "medium";
};

// ─── Name normalization ─────────────────────────────

/**
 * For name comparison: lowercase, strip punctuation, collapse whitespace,
 * remove common middle-initial-like single letters so "John E. Smith"
 * compares with "John Smith".
 */
export function normalizePersonName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = base.split(" ").filter((p) => p.length > 1);
  return parts.join(" ");
}

// ─── Detection ──────────────────────────────────────

/**
 * Find groups of probable duplicate people in the dataset.
 *
 * Algorithm:
 *   1. Build candidates with normalized name and birth year.
 *   2. For each pair, compute a similarity score.
 *   3. Group candidates where each has a high score with at least one
 *      other already-in-the-group member.
 *   4. Each group's canonical is the person with more events linked,
 *      breaking ties by having a birth year, then by more complete name.
 */
export function findDuplicatePeople(data: DataState): DuplicatePersonGroup[] {
  const candidates: PersonCandidate[] = Object.values(data.people).map((p) => ({
    person: p,
    birthYear: yearOf(findBirthEvent(data, p.id)?.date)
  }));

  const processed = new Set<string>();
  const groups: DuplicatePersonGroup[] = [];

  for (let i = 0; i < candidates.length; i += 1) {
    const a = candidates[i];
    if (processed.has(a.person.id)) continue;

    const matches: Array<{ cand: PersonCandidate; confidence: "high" | "medium" }> = [];

    for (let j = i + 1; j < candidates.length; j += 1) {
      const b = candidates[j];
      if (processed.has(b.person.id)) continue;
      const result = scorePair(a, b);
      if (result) matches.push({ cand: b, confidence: result });
    }

    if (matches.length === 0) continue;

    // At least one match — form a group
    processed.add(a.person.id);
    for (const m of matches) processed.add(m.cand.person.id);

    // Overall group confidence = min of all pairs
    const confidence: "high" | "medium" = matches.every(
      (m) => m.confidence === "high"
    )
      ? "high"
      : "medium";

    const allMembers = [a, ...matches.map((m) => m.cand)];
    const sorted = sortByCanonicalScore(allMembers, data);
    groups.push({
      canonical: sorted[0],
      duplicates: sorted.slice(1),
      confidence
    });
  }

  // Sort groups: high-confidence first, then by group size
  groups.sort((x, y) => {
    if (x.confidence !== y.confidence) return x.confidence === "high" ? -1 : 1;
    return (
      y.duplicates.length + 1 - (x.duplicates.length + 1) ||
      x.canonical.person.name.localeCompare(y.canonical.person.name)
    );
  });

  return groups;
}

// ─── Pair scoring ───────────────────────────────────

/**
 * Decide if two people are probably duplicates.
 *
 * Returns:
 *   "high"   — very confident (normalized-name exact + compatible birth year)
 *   "medium" — plausible (fuzzy name + compatible birth year)
 *   null     — not a match
 */
function scorePair(a: PersonCandidate, b: PersonCandidate): "high" | "medium" | null {
  const nameA = normalizePersonName(a.person.name);
  const nameB = normalizePersonName(b.person.name);
  if (!nameA || !nameB) return null;

  // Incompatible genders rule it out
  const ga = a.person.gender;
  const gb = b.person.gender;
  if (ga !== "U" && gb !== "U" && ga !== gb) return null;

  // Incompatible birth years rule it out
  if (
    a.birthYear != null &&
    b.birthYear != null &&
    Math.abs(a.birthYear - b.birthYear) > 5
  ) {
    return null;
  }

  // Name comparison
  const exactName = nameA === nameB;
  const dist = exactName ? 0 : levenshtein(nameA, nameB);
  const maxLen = Math.max(nameA.length, nameB.length);
  const similarName =
    exactName ||
    dist <= 1 ||
    (dist <= 2 && maxLen >= 6) ||
    (maxLen >= 10 && dist / maxLen <= 0.2);

  if (!similarName) return null;

  // Birth year compatibility
  const birthYearCompatible =
    a.birthYear == null ||
    b.birthYear == null ||
    Math.abs(a.birthYear - b.birthYear) <= 2;

  if (exactName && birthYearCompatible) {
    // Even higher confidence if both birth years match exactly
    if (a.birthYear != null && b.birthYear != null && a.birthYear === b.birthYear) {
      return "high";
    }
    // Exact name + both null years = medium (could be different people)
    if (a.birthYear == null && b.birthYear == null) return "medium";
    return "high";
  }

  // Fuzzy name match — only "medium" at best
  if (birthYearCompatible && a.birthYear != null && b.birthYear != null) {
    return "medium";
  }

  return null;
}

// ─── Canonical selection ────────────────────────────

function sortByCanonicalScore(
  members: PersonCandidate[],
  data: DataState
): PersonCandidate[] {
  const eventCount = new Map<string, number>();
  for (const ev of Object.values(data.events)) {
    for (const pid of ev.people) {
      eventCount.set(pid, (eventCount.get(pid) ?? 0) + 1);
    }
  }

  return [...members].sort((a, b) => {
    // More events wins
    const ea = eventCount.get(a.person.id) ?? 0;
    const eb = eventCount.get(b.person.id) ?? 0;
    if (ea !== eb) return eb - ea;

    // Has birth year wins
    const ha = a.birthYear != null ? 1 : 0;
    const hb = b.birthYear != null ? 1 : 0;
    if (ha !== hb) return hb - ha;

    // Has photo wins
    const pa = a.person.photo ? 1 : 0;
    const pb = b.person.photo ? 1 : 0;
    if (pa !== pb) return pb - pa;

    // Longer/more complete name wins
    return b.person.name.length - a.person.name.length;
  });
}
