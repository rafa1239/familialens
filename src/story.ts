/**
 * Life narrative generator — turns an event stream into a prose story.
 *
 * Template-based, no AI. Gender-aware pronouns. Third-person past tense.
 * The output is plain text, one paragraph, sentences separated by spaces.
 */

import type { DataState, FamilyEvent, Gender, Person } from "./types";
import {
  findBirthEvent,
  findDeathEvent,
  getChildren,
  getParents,
  getSpouses
} from "./relationships";
import { yearOf } from "./dates";

type Pronouns = {
  subj: string;  // "he" / "she" / "they"
  obj: string;   // "him" / "her" / "them"
  poss: string;  // "his" / "her" / "their"
};

function pronouns(gender: Gender): Pronouns {
  if (gender === "M") return { subj: "he", obj: "him", poss: "his" };
  if (gender === "F") return { subj: "she", obj: "her", poss: "her" };
  return { subj: "they", obj: "them", poss: "their" };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function andList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/**
 * Generate a single-paragraph story for the given person.
 * Returns an empty string if there's nothing meaningful to say.
 */
export function generateStory(data: DataState, personId: string): string {
  const person = data.people[personId];
  if (!person) return "";

  const p = pronouns(person.gender);
  const name = person.name?.trim() || "This person";

  const sentences: string[] = [];

  // ─── Birth sentence ───
  const birth = findBirthEvent(data, personId);
  const parents = getParents(data, personId);

  const birthParts: string[] = [`${name} was born`];
  if (birth?.date?.display) {
    birthParts.push(birthPrefix(birth.date.display));
  }
  if (birth?.place?.name) {
    birthParts.push(`in ${birth.place.name}`);
  }
  if (parents.length > 0) {
    const parentNames = parents.map((x) => x.name || "an unnamed parent");
    birthParts.push(`to ${andList(parentNames)}`);
  }

  const hasBirthInfo =
    !!birth?.date || !!birth?.place || parents.length > 0;
  if (hasBirthInfo) {
    sentences.push(birthParts.join(" ") + ".");
  } else {
    sentences.push(`${name}'s story is still being written.`);
  }

  // ─── Middle events (chronological, excluding birth/death) ───
  const middleEvents = Object.values(data.events)
    .filter((e) => e.people.includes(personId))
    .filter((e) => e.type !== "birth" && e.type !== "death")
    .sort((a, b) => {
      const ka = a.date?.sortKey ?? Number.POSITIVE_INFINITY;
      const kb = b.date?.sortKey ?? Number.POSITIVE_INFINITY;
      return ka - kb;
    });

  for (const ev of middleEvents) {
    const sentence = eventSentence(ev, person, p, data);
    if (sentence) sentences.push(sentence);
  }

  // ─── Children summary ───
  const children = getChildren(data, personId);
  if (children.length > 0) {
    const subj = capitalize(p.subj);
    const verb =
      children.length === 1
        ? "had one child"
        : `had ${numberWord(children.length)} children`;
    const childList = children.map((c) => {
      const cBirth = yearOf(findBirthEvent(data, c.id)?.date);
      return cBirth ? `${c.name} (${cBirth})` : c.name;
    });
    sentences.push(`${subj} ${verb}: ${andList(childList)}.`);
  }

  // ─── Death sentence ───
  const death = findDeathEvent(data, personId);
  if (death) {
    const subj = capitalize(p.subj);
    const parts = [`${subj} died`];
    if (death.date?.display) parts.push(datePrefix(death.date.display));
    if (death.place?.name) parts.push(`in ${death.place.name}`);

    const birthYear = yearOf(birth?.date);
    const deathYear = yearOf(death.date);
    if (birthYear != null && deathYear != null) {
      const age = deathYear - birthYear;
      if (age >= 0 && age < 130) parts.push(`at the age of ${age}`);
    }
    sentences.push(parts.join(" ") + ".");
  }

  return sentences.join(" ");
}

// ─── Event sentence builders ───────────────────────

function eventSentence(
  ev: FamilyEvent,
  subject: Person,
  p: Pronouns,
  data: DataState
): string | null {
  const subj = capitalize(p.subj);
  const poss = p.poss;

  switch (ev.type) {
    case "marriage": {
      const spouseId = ev.people.find((pid) => pid !== subject.id);
      const spouse = spouseId ? data.people[spouseId] : null;
      if (!spouse) return null;
      const parts = [`${subj} married ${spouse.name}`];
      if (ev.date?.display) parts.push(datePrefix(ev.date.display));
      if (ev.place?.name) parts.push(`in ${ev.place.name}`);
      return parts.join(" ") + ".";
    }

    case "divorce": {
      const spouseId = ev.people.find((pid) => pid !== subject.id);
      const spouse = spouseId ? data.people[spouseId] : null;
      if (!spouse) return null;
      const parts = [`${subj} and ${spouse.name} separated`];
      if (ev.date?.display) parts.push(datePrefix(ev.date.display));
      return parts.join(" ") + ".";
    }

    case "migration": {
      const parts = [`${subj} moved`];
      if (ev.place?.name) parts.push(`to ${ev.place.name}`);
      if (ev.date?.display) parts.push(datePrefix(ev.date.display));
      if (parts.length === 1) return null;
      return parts.join(" ") + ".";
    }

    case "residence": {
      if (!ev.place?.name) return null;
      const parts = [`${subj} lived in ${ev.place.name}`];
      if (ev.date?.display) parts.push(datePrefix(ev.date.display));
      return parts.join(" ") + ".";
    }

    case "occupation": {
      const what = ev.notes?.trim();
      const parts = [`${subj} worked`];
      if (what) parts.push(`as ${what.toLowerCase().startsWith("a ") || what.toLowerCase().startsWith("an ") ? what : `a ${what}`}`);
      if (ev.place?.name) parts.push(`in ${ev.place.name}`);
      if (ev.date?.display) parts.push(datePrefix(ev.date.display));
      if (parts.length === 1) return null;
      return parts.join(" ") + ".";
    }

    case "education": {
      const what = ev.notes?.trim();
      const parts = [`${subj} studied`];
      if (what) parts.push(what.toLowerCase());
      if (ev.place?.name) parts.push(`in ${ev.place.name}`);
      if (ev.date?.display) parts.push(datePrefix(ev.date.display));
      if (parts.length === 1) return null;
      return parts.join(" ") + ".";
    }

    case "baptism": {
      const parts = [`${subj} was baptised`];
      if (ev.place?.name) parts.push(`in ${ev.place.name}`);
      if (ev.date?.display) parts.push(datePrefix(ev.date.display));
      if (parts.length === 1) return null;
      return parts.join(" ") + ".";
    }

    case "burial": {
      const parts = [`${subj} was buried`];
      if (ev.place?.name) parts.push(`in ${ev.place.name}`);
      if (ev.date?.display) parts.push(datePrefix(ev.date.display));
      if (parts.length === 1) return null;
      return parts.join(" ") + ".";
    }

    case "custom": {
      const title = ev.customTitle?.trim();
      if (!title) return null;
      const parts = [`${subj}: ${title}`];
      const meta: string[] = [];
      if (ev.date?.display) meta.push(ev.date.display);
      if (ev.place?.name) meta.push(ev.place.name);
      if (meta.length > 0) parts.push(`(${meta.join(", ")})`);
      return parts.join(" ") + ".";
    }

    default:
      return null;
  }
}

// ─── Date formatting ───────────────────────────────

/**
 * Pick the right preposition for a birth event depending on the date
 * precision. "on 15 March 1950" vs "in 1950" vs "around 1950".
 */
function birthPrefix(dateDisplay: string): string {
  return datePrefix(dateDisplay);
}

function datePrefix(dateDisplay: string): string {
  const d = dateDisplay.trim();
  // "15 March 1950" → "on 15 March 1950"
  if (/^\d+\s+[A-Za-z]+\s+\d{4}$/.test(d)) return `on ${d}`;
  // "March 1950" → "in March 1950"
  if (/^[A-Za-z]+\s+\d{4}$/.test(d)) return `in ${d}`;
  // "1950" → "in 1950"
  if (/^\d{4}$/.test(d)) return `in ${d}`;
  // "c. 1950" → "around 1950"
  if (/^c\.?\s*\d{4}$/i.test(d)) return `around ${d.replace(/^c\.?\s*/i, "")}`;
  // "before 1950" / "after 1950" — use as-is
  if (/^(before|after)/i.test(d)) return d;
  // Fallback: "in YYYY-MM-DD" style
  return `in ${d}`;
}

// ─── Number words ──────────────────────────────────

function numberWord(n: number): string {
  const words: Record<number, string> = {
    1: "one",
    2: "two",
    3: "three",
    4: "four",
    5: "five",
    6: "six",
    7: "seven",
    8: "eight",
    9: "nine",
    10: "ten",
    11: "eleven",
    12: "twelve"
  };
  return words[n] ?? String(n);
}
