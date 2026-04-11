/**
 * Narrative parser — free-form English family history → structured statements.
 *
 * Pure function, no dependencies on store. The UI calls this on every
 * keystroke (debounced), shows a live preview of what was understood, and
 * on "Apply" the store commits every statement in a single undo step.
 *
 * Coverage is intentionally pragmatic: ~25 sentence templates covering the
 * most common forms of birth, death, marriage, parent relationships,
 * children lists, migration, residence, and occupation. Sentences that
 * don't match any pattern are reported as `unmatched` so the user can see
 * what the parser skipped.
 *
 * Name resolution: within a single parse, the same written name is
 * assumed to refer to the same person. Matching is case-insensitive and
 * accent-insensitive. Gender can be inferred from relationship words
 * ("father", "mother", "son", "daughter", "wife", "husband"...).
 */

import type { Gender } from "./types";

// ─── Types ──────────────────────────────────────────

export type ParsedStatement =
  | { kind: "person"; name: string; gender?: Gender }
  | { kind: "birth"; person: string; date?: string; place?: string }
  | { kind: "death"; person: string; date?: string; place?: string }
  | { kind: "marriage"; a: string; b: string; date?: string; place?: string }
  | { kind: "parent"; parent: string; child: string }
  | { kind: "residence"; person: string; date?: string; place?: string }
  | { kind: "migration"; person: string; date?: string; place?: string }
  | { kind: "occupation"; person: string; role: string };

export type ParseResult = {
  statements: ParsedStatement[];
  unmatched: string[];
  /** Unique names mentioned, in first-seen order. */
  people: string[];
  /** Inferred genders for each mentioned name (not always present). */
  genders: Record<string, Gender>;
};

// ─── Regex fragments ────────────────────────────────
// Name: one or more capitalized word parts separated by spaces.
// Supports Unicode letters, apostrophes, and hyphens within each part.
// Example matches: "Maria", "Maria Silva", "O'Brien", "Jean-Luc Picard"
const N = String.raw`[\p{Lu}][\p{L}'\-]*(?:\s+[\p{Lu}][\p{L}'\-]*)*`;

// Year: 4 digits
const Y = String.raw`\d{4}`;

// Natural date forms. Longest first so regex alternation picks the longest.
//   "15 March 1950" | "15 Mar 1950" | "March 1950" | "Mar 1950" | "1950"
const D = String.raw`(?:\d{1,2}\s+[A-Za-z]+\s+\d{4}|[A-Za-z]+\s+\d{4}|\d{4})`;

// Place: starts with an uppercase letter, can contain letters, commas,
// periods, apostrophes, hyphens, spaces. Non-greedy so it doesn't swallow
// " in YEAR" trailers.
const P = String.raw`[\p{Lu}][\p{L}'\-,\.\s]*?`;

// ─── Pattern set ────────────────────────────────────

type PatternHandler = (
  m: RegExpMatchArray,
  emit: (s: ParsedStatement) => void
) => void;

type Pattern = { regex: RegExp; handler: PatternHandler };

function makePattern(body: string, handler: PatternHandler): Pattern {
  // All patterns anchor the full sentence. Trailing period is optional.
  return {
    regex: new RegExp(`^${body}\\.?$`, "iu"),
    handler
  };
}

// Patterns ordered so that more specific patterns come before less
// specific ones; the matcher takes the first hit.
const PATTERNS: Pattern[] = [
  // ─── Children lists ───
  // "X and Y had children: A, B, and C" — two parents
  makePattern(
    `(${N})\\s+and\\s+(${N})\\s+had\\s+(?:(?:\\w+\\s+)?children|a son|a daughter):?\\s+(.+)`,
    (m, emit) => {
      const a = m[1].trim();
      const b = m[2].trim();
      emit({ kind: "person", name: a });
      emit({ kind: "person", name: b });
      for (const child of parseChildrenList(m[3])) {
        emit({ kind: "person", name: child });
        emit({ kind: "parent", parent: a, child });
        emit({ kind: "parent", parent: b, child });
      }
    }
  ),
  // "X had children: A, B, and C" — single parent
  makePattern(
    `(${N})\\s+had\\s+(?:(?:\\w+\\s+)?children|a son|a daughter):?\\s+(.+)`,
    (m, emit) => {
      const a = m[1].trim();
      emit({ kind: "person", name: a });
      for (const child of parseChildrenList(m[2])) {
        emit({ kind: "person", name: child });
        emit({ kind: "parent", parent: a, child });
      }
    }
  ),

  // ─── Parent relationships ───
  // "X's parents were Y and Z"
  makePattern(
    `(${N})'s\\s+parents?\\s+(?:were|are)\\s+(${N})\\s+and\\s+(${N})`,
    (m, emit) => {
      emit({ kind: "person", name: m[1].trim() });
      emit({ kind: "person", name: m[2].trim() });
      emit({ kind: "person", name: m[3].trim() });
      emit({ kind: "parent", parent: m[2].trim(), child: m[1].trim() });
      emit({ kind: "parent", parent: m[3].trim(), child: m[1].trim() });
    }
  ),
  // "X's father was Y"
  makePattern(
    `(${N})'s\\s+father\\s+(?:was|is)\\s+(${N})`,
    (m, emit) => {
      emit({ kind: "person", name: m[1].trim() });
      emit({ kind: "person", name: m[2].trim(), gender: "M" });
      emit({ kind: "parent", parent: m[2].trim(), child: m[1].trim() });
    }
  ),
  // "X's mother was Y"
  makePattern(
    `(${N})'s\\s+mother\\s+(?:was|is)\\s+(${N})`,
    (m, emit) => {
      emit({ kind: "person", name: m[1].trim() });
      emit({ kind: "person", name: m[2].trim(), gender: "F" });
      emit({ kind: "parent", parent: m[2].trim(), child: m[1].trim() });
    }
  ),
  // "X is the son of Y and Z"
  makePattern(
    `(${N})\\s+(?:is|was)\\s+(?:the\\s+)?son\\s+of\\s+(${N})\\s+and\\s+(${N})`,
    (m, emit) => {
      emit({ kind: "person", name: m[1].trim(), gender: "M" });
      emit({ kind: "person", name: m[2].trim() });
      emit({ kind: "person", name: m[3].trim() });
      emit({ kind: "parent", parent: m[2].trim(), child: m[1].trim() });
      emit({ kind: "parent", parent: m[3].trim(), child: m[1].trim() });
    }
  ),
  // "X is the daughter of Y and Z"
  makePattern(
    `(${N})\\s+(?:is|was)\\s+(?:the\\s+)?daughter\\s+of\\s+(${N})\\s+and\\s+(${N})`,
    (m, emit) => {
      emit({ kind: "person", name: m[1].trim(), gender: "F" });
      emit({ kind: "person", name: m[2].trim() });
      emit({ kind: "person", name: m[3].trim() });
      emit({ kind: "parent", parent: m[2].trim(), child: m[1].trim() });
      emit({ kind: "parent", parent: m[3].trim(), child: m[1].trim() });
    }
  ),
  // "X is the child of Y and Z"
  makePattern(
    `(${N})\\s+(?:is|was)\\s+(?:the\\s+)?child\\s+of\\s+(${N})\\s+and\\s+(${N})`,
    (m, emit) => {
      emit({ kind: "person", name: m[1].trim() });
      emit({ kind: "person", name: m[2].trim() });
      emit({ kind: "person", name: m[3].trim() });
      emit({ kind: "parent", parent: m[2].trim(), child: m[1].trim() });
      emit({ kind: "parent", parent: m[3].trim(), child: m[1].trim() });
    }
  ),
  // "X is the son of Y" (single parent)
  makePattern(
    `(${N})\\s+(?:is|was)\\s+(?:the\\s+)?son\\s+of\\s+(${N})`,
    (m, emit) => {
      emit({ kind: "person", name: m[1].trim(), gender: "M" });
      emit({ kind: "person", name: m[2].trim() });
      emit({ kind: "parent", parent: m[2].trim(), child: m[1].trim() });
    }
  ),
  // "X is the daughter of Y"
  makePattern(
    `(${N})\\s+(?:is|was)\\s+(?:the\\s+)?daughter\\s+of\\s+(${N})`,
    (m, emit) => {
      emit({ kind: "person", name: m[1].trim(), gender: "F" });
      emit({ kind: "person", name: m[2].trim() });
      emit({ kind: "parent", parent: m[2].trim(), child: m[1].trim() });
    }
  ),
  // "X is the child of Y"
  makePattern(
    `(${N})\\s+(?:is|was)\\s+(?:the\\s+)?child\\s+of\\s+(${N})`,
    (m, emit) => {
      emit({ kind: "person", name: m[1].trim() });
      emit({ kind: "person", name: m[2].trim() });
      emit({ kind: "parent", parent: m[2].trim(), child: m[1].trim() });
    }
  ),

  // ─── Marriage ───
  // "X and Y married in YEAR in PLACE"
  makePattern(
    `(${N})\\s+and\\s+(${N})\\s+(?:got\\s+)?married\\s+in\\s+(${Y})\\s+in\\s+(${P})`,
    (m, emit) => {
      const a = m[1].trim();
      const b = m[2].trim();
      emit({ kind: "person", name: a });
      emit({ kind: "person", name: b });
      emit({ kind: "marriage", a, b, date: m[3], place: m[4].trim() });
    }
  ),
  // "X and Y married in YEAR"
  makePattern(
    `(${N})\\s+and\\s+(${N})\\s+(?:got\\s+)?married\\s+in\\s+(${Y})`,
    (m, emit) => {
      const a = m[1].trim();
      const b = m[2].trim();
      emit({ kind: "person", name: a });
      emit({ kind: "person", name: b });
      emit({ kind: "marriage", a, b, date: m[3] });
    }
  ),
  // "X married Y in YEAR in PLACE"
  makePattern(
    `(${N})\\s+married\\s+(${N})\\s+in\\s+(${Y})\\s+in\\s+(${P})`,
    (m, emit) => {
      const a = m[1].trim();
      const b = m[2].trim();
      emit({ kind: "person", name: a });
      emit({ kind: "person", name: b });
      emit({ kind: "marriage", a, b, date: m[3], place: m[4].trim() });
    }
  ),
  // "X married Y on DATE in PLACE"
  makePattern(
    `(${N})\\s+married\\s+(${N})\\s+(?:on|in)\\s+(${D})\\s+in\\s+(${P})`,
    (m, emit) => {
      const a = m[1].trim();
      const b = m[2].trim();
      emit({ kind: "person", name: a });
      emit({ kind: "person", name: b });
      emit({ kind: "marriage", a, b, date: m[3], place: m[4].trim() });
    }
  ),
  // "X married Y in YEAR"
  makePattern(
    `(${N})\\s+married\\s+(${N})\\s+in\\s+(${Y})`,
    (m, emit) => {
      const a = m[1].trim();
      const b = m[2].trim();
      emit({ kind: "person", name: a });
      emit({ kind: "person", name: b });
      emit({ kind: "marriage", a, b, date: m[3] });
    }
  ),
  // "X married Y"
  makePattern(
    `(${N})\\s+married\\s+(${N})`,
    (m, emit) => {
      const a = m[1].trim();
      const b = m[2].trim();
      emit({ kind: "person", name: a });
      emit({ kind: "person", name: b });
      emit({ kind: "marriage", a, b });
    }
  ),

  // ─── Birth ───
  // "X was born on DATE in PLACE"
  makePattern(
    `(${N})\\s+was\\s+born\\s+on\\s+(${D})\\s+in\\s+(${P})`,
    (m, emit) => {
      const name = m[1].trim();
      emit({ kind: "person", name });
      emit({ kind: "birth", person: name, date: m[2], place: m[3].trim() });
    }
  ),
  // "X was born in YEAR in PLACE"
  makePattern(
    `(${N})\\s+was\\s+born\\s+in\\s+(${D})\\s+in\\s+(${P})`,
    (m, emit) => {
      const name = m[1].trim();
      emit({ kind: "person", name });
      emit({ kind: "birth", person: name, date: m[2], place: m[3].trim() });
    }
  ),
  // "X was born in PLACE in YEAR" (place before year — Portuguese-style)
  makePattern(
    `(${N})\\s+was\\s+born\\s+in\\s+(${P})\\s+in\\s+(${Y})`,
    (m, emit) => {
      const name = m[1].trim();
      const place = m[2].trim();
      // Guard: don't accept a place that's just digits
      if (/^\d+$/.test(place)) return;
      emit({ kind: "person", name });
      emit({ kind: "birth", person: name, date: m[3], place });
    }
  ),
  // "X was born on DATE"
  makePattern(
    `(${N})\\s+was\\s+born\\s+on\\s+(${D})`,
    (m, emit) => {
      const name = m[1].trim();
      emit({ kind: "person", name });
      emit({ kind: "birth", person: name, date: m[2] });
    }
  ),
  // "X was born in DATE"
  makePattern(
    `(${N})\\s+was\\s+born\\s+in\\s+(${D})`,
    (m, emit) => {
      const name = m[1].trim();
      emit({ kind: "person", name });
      emit({ kind: "birth", person: name, date: m[2] });
    }
  ),
  // "X was born in PLACE"
  makePattern(
    `(${N})\\s+was\\s+born\\s+in\\s+(${P})`,
    (m, emit) => {
      const name = m[1].trim();
      const place = m[2].trim();
      if (/^\d+$/.test(place)) return;
      emit({ kind: "person", name });
      emit({ kind: "birth", person: name, place });
    }
  ),

  // ─── Death ───
  // "X died on DATE in PLACE"
  makePattern(
    `(${N})\\s+died\\s+on\\s+(${D})\\s+in\\s+(${P})`,
    (m, emit) => {
      const name = m[1].trim();
      emit({ kind: "person", name });
      emit({ kind: "death", person: name, date: m[2], place: m[3].trim() });
    }
  ),
  // "X died in YEAR in PLACE"
  makePattern(
    `(${N})\\s+died\\s+in\\s+(${D})\\s+in\\s+(${P})`,
    (m, emit) => {
      const name = m[1].trim();
      emit({ kind: "person", name });
      emit({ kind: "death", person: name, date: m[2], place: m[3].trim() });
    }
  ),
  // "X died in PLACE in YEAR"
  makePattern(
    `(${N})\\s+died\\s+in\\s+(${P})\\s+in\\s+(${Y})`,
    (m, emit) => {
      const name = m[1].trim();
      const place = m[2].trim();
      if (/^\d+$/.test(place)) return;
      emit({ kind: "person", name });
      emit({ kind: "death", person: name, date: m[3], place });
    }
  ),
  // "X died in YEAR"
  makePattern(
    `(${N})\\s+died\\s+in\\s+(${D})`,
    (m, emit) => {
      const name = m[1].trim();
      emit({ kind: "person", name });
      emit({ kind: "death", person: name, date: m[2] });
    }
  ),
  // "X died in PLACE"
  makePattern(
    `(${N})\\s+died\\s+in\\s+(${P})`,
    (m, emit) => {
      const name = m[1].trim();
      const place = m[2].trim();
      if (/^\d+$/.test(place)) return;
      emit({ kind: "person", name });
      emit({ kind: "death", person: name, place });
    }
  ),

  // ─── Migration / residence ───
  // "X moved to PLACE in YEAR"
  makePattern(
    `(${N})\\s+(?:moved|emigrated|relocated)\\s+to\\s+(${P})\\s+in\\s+(${Y})`,
    (m, emit) => {
      const name = m[1].trim();
      emit({ kind: "person", name });
      emit({
        kind: "migration",
        person: name,
        date: m[3],
        place: m[2].trim()
      });
    }
  ),
  // "X moved to PLACE"
  makePattern(
    `(${N})\\s+(?:moved|emigrated|relocated)\\s+to\\s+(${P})`,
    (m, emit) => {
      const name = m[1].trim();
      emit({ kind: "person", name });
      emit({ kind: "migration", person: name, place: m[2].trim() });
    }
  ),
  // "X lived in PLACE"
  makePattern(
    `(${N})\\s+lived\\s+in\\s+(${P})`,
    (m, emit) => {
      const name = m[1].trim();
      emit({ kind: "person", name });
      emit({ kind: "residence", person: name, place: m[2].trim() });
    }
  ),

  // ─── Occupation ───
  // "X worked as a/an ROLE"
  makePattern(
    `(${N})\\s+worked\\s+as\\s+(?:an?\\s+)?([\\p{L}\\- ]+)`,
    (m, emit) => {
      const name = m[1].trim();
      emit({ kind: "person", name });
      emit({ kind: "occupation", person: name, role: m[2].trim() });
    }
  ),
  // "X was a/an ROLE"
  makePattern(
    `(${N})\\s+was\\s+an?\\s+([\\p{L}\\- ]+)`,
    (m, emit) => {
      const name = m[1].trim();
      // Guard against "X was born..." and "X was the son of..." etc.
      const role = m[2].trim();
      if (/^(born|the|married|buried)\b/i.test(role)) return;
      emit({ kind: "person", name });
      emit({ kind: "occupation", person: name, role });
    }
  )
];

// ─── Main ───────────────────────────────────────────

export function parseNarrative(text: string): ParseResult {
  const statements: ParsedStatement[] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();
  const people: string[] = [];
  const genders: Record<string, Gender> = {};

  const emit = (s: ParsedStatement) => {
    statements.push(s);
    if (s.kind === "person") {
      const key = normalizeForDedupe(s.name);
      if (!seen.has(key)) {
        seen.add(key);
        people.push(s.name);
      }
      if (s.gender && s.gender !== "U") {
        genders[s.name] = s.gender;
      }
    }
  };

  const sentences = splitSentences(text);
  for (const sentence of sentences) {
    if (!parseSentence(sentence, emit)) {
      unmatched.push(sentence);
    }
  }

  return { statements, unmatched, people, genders };
}

// ─── Sentence parsing ───────────────────────────────

function parseSentence(
  sentence: string,
  emit: (s: ParsedStatement) => void
): boolean {
  const cleaned = sentence.trim().replace(/\.$/, "");
  if (!cleaned) return true;

  for (const pattern of PATTERNS) {
    const m = cleaned.match(pattern.regex);
    if (m) {
      pattern.handler(m, emit);
      return true;
    }
  }
  return false;
}

// ─── Helpers ────────────────────────────────────────

function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation (.?!) or explicit newlines.
  // Also on ";" to let users paste lists separated by semicolons.
  return text
    .split(/(?<=[.!?])\s+|\n+|;\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Parse a comma-separated list of names: "Ana, Pedro and Sofia" or
 * "Ana, Pedro, and Sofia" or "Ana (1922), Pedro (1925), and Sofia".
 * Birth years in parens are stripped for v1 but can be handled later.
 */
export function parseChildrenList(text: string): string[] {
  const cleaned = text.trim().replace(/\.$/, "");
  // Normalise "and" conjunctions into commas so oxford commas and plain
  // "A and B" both collapse to a single comma-separated list.
  const normalised = cleaned
    .replace(/\s*,\s*and\s+/gi, ", ") // ", and " → ", "
    .replace(/\s+and\s+/gi, ", "); // " and " → ", "
  const parts = normalised
    .split(/\s*,\s*/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  // Strip "(1925)" birth-year suffixes
  return parts
    .map((p) => p.replace(/\s*\(\d{4}[^)]*\)\s*$/, "").trim())
    .filter((p) => p.length > 0 && /^[\p{Lu}]/u.test(p));
}

function normalizeForDedupe(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/\s+/g, " ")
    .trim();
}
