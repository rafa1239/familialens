/**
 * GEDCOM 5.5 import/export adapted to the v7 event-first model.
 *
 * Design:
 *  - Each v7 Person → one INDI record.
 *  - Each v7 birth event with date/place → BIRT sub-record on the child's INDI.
 *  - Each v7 death event → DEAT sub-record on the person's INDI.
 *  - Each v7 marriage event → one FAM record with HUSB/WIFE + MARR sub-record.
 *  - Parent-child links come from birth events (child + parents) → FAM.CHIL
 *    entries on an implicit family. Families are reconstructed by grouping
 *    children under their shared parent pairs.
 *  - Events that don't fit GEDCOM standard tags (migration, custom, etc.)
 *    are exported as EVEN records with a TYPE subtag.
 *  - Sources are exported as SOUR records and referenced by each event.
 */

import type { DataState, FamilyEvent, Person, Source } from "./types";
import { SCHEMA_VERSION } from "./types";
import { createId, nowIso } from "./ids";
import { parseDate } from "./dates";

// ─── Export ────────────────────────────────────────────

export function exportGedcom(data: DataState): string {
  const lines: string[] = [];
  lines.push("0 HEAD");
  lines.push("1 SOUR FamiliaLens");
  lines.push("2 VERS 7");
  lines.push("1 GEDC");
  lines.push("2 VERS 5.5");
  lines.push("2 FORM LINEAGE-LINKED");
  lines.push("1 CHAR UTF-8");

  const indiId = new Map<string, string>();
  Object.keys(data.people).forEach((pid, i) => {
    indiId.set(pid, `@I${i + 1}@`);
  });
  const sourceId = new Map<string, string>();
  Object.keys(data.sources).forEach((sid, i) => {
    sourceId.set(sid, `@S${i + 1}@`);
  });

  // Group parent sets → families
  type FamilyKey = string; // sorted parent ids joined
  const families = new Map<
    FamilyKey,
    {
      famId: string;
      parents: string[];
      children: string[];
      marriageEvent?: FamilyEvent;
    }
  >();

  const familyKey = (parents: string[]): string =>
    parents.slice().sort().join("|");

  // From birth events, derive parent-groups
  for (const ev of Object.values(data.events)) {
    if (ev.type !== "birth" || ev.people.length === 0) continue;
    const [child, ...parents] = ev.people;
    if (parents.length === 0) continue;
    const key = familyKey(parents);
    if (!families.has(key)) {
      families.set(key, {
        famId: `@F${families.size + 1}@`,
        parents,
        children: []
      });
    }
    families.get(key)!.children.push(child);
  }

  // Attach marriage events to families. If no existing family matches the
  // marriage's parents, create one with no children.
  for (const ev of Object.values(data.events)) {
    if (ev.type !== "marriage" || ev.people.length < 2) continue;
    const key = familyKey(ev.people);
    if (!families.has(key)) {
      families.set(key, {
        famId: `@F${families.size + 1}@`,
        parents: ev.people,
        children: []
      });
    }
    families.get(key)!.marriageEvent = ev;
  }

  // Build per-person list of FAMS (spouse-of) and FAMC (child-of)
  const famsByPerson = new Map<string, string[]>();
  const famcByPerson = new Map<string, string[]>();
  for (const fam of families.values()) {
    for (const parent of fam.parents) {
      if (!famsByPerson.has(parent)) famsByPerson.set(parent, []);
      famsByPerson.get(parent)!.push(fam.famId);
    }
    for (const child of fam.children) {
      if (!famcByPerson.has(child)) famcByPerson.set(child, []);
      famcByPerson.get(child)!.push(fam.famId);
    }
  }

  // ── Write INDI records ──
  for (const person of Object.values(data.people)) {
    const id = indiId.get(person.id)!;
    lines.push(`0 ${id} INDI`);
    writePersonName(lines, person);
    if (person.gender === "M" || person.gender === "F") {
      lines.push(`1 SEX ${person.gender}`);
    }

    // Events attached to this person
    for (const ev of Object.values(data.events)) {
      if (!ev.people.includes(person.id)) continue;
      if (ev.type === "marriage" || ev.type === "divorce") continue; // go on FAM
      if (ev.type === "birth" && ev.people[0] !== person.id) continue; // only on child

      writeEvent(lines, ev, 1, sourceId);
    }

    if (person.notes) writeNote(lines, person.notes, 1);

    for (const fid of famsByPerson.get(person.id) ?? []) {
      lines.push(`1 FAMS ${fid}`);
    }
    for (const fid of famcByPerson.get(person.id) ?? []) {
      lines.push(`1 FAMC ${fid}`);
    }
  }

  // ── Write FAM records ──
  for (const fam of families.values()) {
    lines.push(`0 ${fam.famId} FAM`);
    // If exactly 2 parents, guess HUSB/WIFE by gender
    if (fam.parents.length === 2) {
      const [a, b] = fam.parents;
      const pa = data.people[a];
      const pb = data.people[b];
      let husb = a;
      let wife = b;
      if (pa?.gender === "F" && pb?.gender === "M") {
        husb = b;
        wife = a;
      }
      if (indiId.has(husb)) lines.push(`1 HUSB ${indiId.get(husb)}`);
      if (indiId.has(wife)) lines.push(`1 WIFE ${indiId.get(wife)}`);
    } else if (fam.parents.length === 1) {
      const parent = fam.parents[0];
      const p = data.people[parent];
      const tag = p?.gender === "F" ? "WIFE" : "HUSB";
      if (indiId.has(parent)) lines.push(`1 ${tag} ${indiId.get(parent)}`);
    }
    for (const child of fam.children) {
      if (indiId.has(child)) lines.push(`1 CHIL ${indiId.get(child)}`);
    }
    if (fam.marriageEvent) {
      writeEvent(lines, fam.marriageEvent, 1, sourceId);
    }
  }

  // ── Write SOUR records ──
  for (const source of Object.values(data.sources)) {
    const id = sourceId.get(source.id)!;
    lines.push(`0 ${id} SOUR`);
    lines.push(`1 TITL ${source.title}`);
    if (source.citation) writeNote(lines, source.citation, 1);
    if (source.url) lines.push(`1 PUBL ${source.url}`);
  }

  lines.push("0 TRLR");
  return lines.join("\n");
}

function writePersonName(lines: string[], person: Person) {
  const name = person.name || "Unknown";
  // GEDCOM format: given /surname/
  if (person.surname) {
    const given = name.replace(new RegExp(`\\s*${escapeRe(person.surname)}\\s*$`), "").trim();
    lines.push(`1 NAME ${given} /${person.surname}/`);
  } else {
    const parts = name.split(/\s+/);
    if (parts.length >= 2) {
      const surname = parts[parts.length - 1];
      const given = parts.slice(0, -1).join(" ");
      lines.push(`1 NAME ${given} /${surname}/`);
    } else {
      lines.push(`1 NAME ${name} //`);
    }
  }
}

function writeEvent(
  lines: string[],
  ev: FamilyEvent,
  level: number,
  sourceId: Map<string, string>
) {
  const tag = GEDCOM_TAGS[ev.type] ?? "EVEN";
  lines.push(`${level} ${tag}`);
  if (ev.type === "custom" && ev.customTitle) {
    lines.push(`${level + 1} TYPE ${ev.customTitle}`);
  } else if (tag === "EVEN") {
    lines.push(`${level + 1} TYPE ${ev.type}`);
  }
  if (ev.date) {
    lines.push(`${level + 1} DATE ${gedcomDate(ev.date.display)}`);
  }
  if (ev.place?.name) {
    lines.push(`${level + 1} PLAC ${ev.place.name}`);
    if (ev.place.lat != null && ev.place.lon != null) {
      lines.push(`${level + 2} MAP`);
      lines.push(`${level + 3} LATI ${formatLat(ev.place.lat)}`);
      lines.push(`${level + 3} LONG ${formatLon(ev.place.lon)}`);
    }
  }
  if (ev.notes) writeNote(lines, ev.notes, level + 1);
  for (const sid of ev.sources) {
    const gid = sourceId.get(sid);
    if (gid) lines.push(`${level + 1} SOUR ${gid}`);
  }
}

const GEDCOM_TAGS: Partial<Record<FamilyEvent["type"], string>> = {
  birth: "BIRT",
  death: "DEAT",
  marriage: "MARR",
  divorce: "DIV",
  baptism: "BAPM",
  burial: "BURI",
  residence: "RESI",
  occupation: "OCCU",
  education: "EDUC"
};

function writeNote(lines: string[], text: string, level: number) {
  const parts = text.split(/\r?\n/);
  lines.push(`${level} NOTE ${parts[0] ?? ""}`);
  for (let i = 1; i < parts.length; i += 1) {
    lines.push(`${level + 1} CONT ${parts[i]}`);
  }
}

function gedcomDate(display: string): string {
  // Accept whatever the display says; GEDCOM is forgiving enough.
  return display;
}

function formatLat(lat: number): string {
  return (lat >= 0 ? "N" : "S") + Math.abs(lat).toFixed(6);
}
function formatLon(lon: number): string {
  return (lon >= 0 ? "E" : "W") + Math.abs(lon).toFixed(6);
}
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Import ────────────────────────────────────────────
//
// Minimal GEDCOM 5.5 reader: enough to round-trip what we export and to
// accept typical exports from other tools. We intentionally keep this
// simple; edge cases that parse "badly" fall through to NOTE.

export type GedcomImportResult =
  | { ok: true; data: DataState; warnings: string[] }
  | { ok: false; reason: string };

export function parseGedcom(content: string): GedcomImportResult {
  const rawLines = content.split(/\r?\n/);
  if (!rawLines.some((l) => l.trim().startsWith("0 HEAD"))) {
    return { ok: false, reason: "Not a GEDCOM file (missing HEAD)." };
  }

  const warnings: string[] = [];

  type IndiRec = {
    name?: string;
    surname?: string;
    gender?: "M" | "F";
    events: Partial<FamilyEvent>[];
    famc: string[];
    fams: string[];
    notes?: string;
  };
  type FamRec = {
    husb?: string;
    wife?: string;
    children: string[];
    marriage?: Partial<FamilyEvent>;
  };

  const indis: Record<string, IndiRec> = {};
  const fams: Record<string, FamRec> = {};

  let currentIndi: string | null = null;
  let currentFam: string | null = null;
  let currentEvent: Partial<FamilyEvent> | null = null;
  let currentEventOwner: "indi" | "fam" | null = null;
  let lastLevel = 0;

  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/^(\d+)\s+(\S+)(?:\s+(.*))?$/);
    if (!m) continue;
    const level = Number(m[1]);
    const tag = m[2];
    const rest = m[3] ?? "";

    if (level === 0) {
      currentIndi = null;
      currentFam = null;
      currentEvent = null;
      currentEventOwner = null;
      if (tag.startsWith("@I") && rest === "INDI") {
        currentIndi = tag;
        indis[tag] = { events: [], famc: [], fams: [] };
      } else if (tag.startsWith("@F") && rest === "FAM") {
        currentFam = tag;
        fams[tag] = { children: [] };
      }
      lastLevel = 0;
      continue;
    }

    if (currentIndi) {
      const ind = indis[currentIndi];
      if (level === 1) {
        currentEvent = null;
        currentEventOwner = null;
        if (tag === "NAME") {
          // "Given /Surname/"
          const match = rest.match(/^(.*?)\s*\/(.*?)\/\s*$/);
          if (match) {
            ind.name = `${match[1].trim()} ${match[2].trim()}`.trim();
            ind.surname = match[2].trim() || undefined;
          } else {
            ind.name = rest.trim();
          }
        } else if (tag === "SEX") {
          if (rest === "M" || rest === "F") ind.gender = rest as "M" | "F";
        } else if (tag === "FAMC") {
          ind.famc.push(rest.trim());
        } else if (tag === "FAMS") {
          ind.fams.push(rest.trim());
        } else if (tag === "NOTE") {
          ind.notes = rest;
          currentEvent = { notes: rest };
          currentEventOwner = null;
        } else if (GEDCOM_TYPE_BY_TAG[tag]) {
          currentEvent = { type: GEDCOM_TYPE_BY_TAG[tag], sources: [], photos: [] };
          currentEventOwner = "indi";
          ind.events.push(currentEvent);
        }
      } else if (level === 2 && currentEvent) {
        if (tag === "DATE") {
          currentEvent.date = parseDate(rest);
        } else if (tag === "PLAC") {
          currentEvent.place = { name: rest };
        } else if (tag === "NOTE") {
          currentEvent.notes = rest;
        }
      } else if (level === 3 && currentEvent?.place && tag === "LATI") {
        currentEvent.place.lat = parseCoord(rest);
      } else if (level === 3 && currentEvent?.place && tag === "LONG") {
        currentEvent.place.lon = parseCoord(rest);
      }
    } else if (currentFam) {
      const fam = fams[currentFam];
      if (level === 1) {
        currentEvent = null;
        currentEventOwner = null;
        if (tag === "HUSB") fam.husb = rest.trim();
        else if (tag === "WIFE") fam.wife = rest.trim();
        else if (tag === "CHIL") fam.children.push(rest.trim());
        else if (tag === "MARR") {
          fam.marriage = { type: "marriage", sources: [], photos: [] };
          currentEvent = fam.marriage;
          currentEventOwner = "fam";
        }
      } else if (level === 2 && currentEvent) {
        if (tag === "DATE") currentEvent.date = parseDate(rest);
        else if (tag === "PLAC") currentEvent.place = { name: rest };
      }
    }
    lastLevel = level;
  }

  // Build v7 data
  const people: Record<string, Person> = {};
  const events: Record<string, FamilyEvent> = {};
  const idMap = new Map<string, string>(); // gedcom @I..@ → v7 person id

  for (const [gid, rec] of Object.entries(indis)) {
    const pid = createId("person");
    idMap.set(gid, pid);
    people[pid] = {
      id: pid,
      name: rec.name || "Unknown",
      surname: rec.surname,
      gender: rec.gender ?? "U",
      notes: rec.notes
    };
  }

  // Emit per-person events
  for (const [gid, rec] of Object.entries(indis)) {
    const pid = idMap.get(gid)!;
    for (const ev of rec.events) {
      if (!ev.type) continue;
      const eid = createId("event");
      events[eid] = {
        id: eid,
        type: ev.type,
        date: ev.date,
        place: ev.place,
        notes: ev.notes,
        people: [pid],
        sources: [],
        photos: []
      };
    }
  }

  // Parent→child birth events: FAMC → find the family, add parents to the
  // child's birth event. If the child has no birth event, create a skeleton.
  for (const [gid, rec] of Object.entries(indis)) {
    const pid = idMap.get(gid)!;
    for (const famId of rec.famc) {
      const fam = fams[famId];
      if (!fam) continue;
      const parents = [fam.husb, fam.wife]
        .filter((p): p is string => !!p && !!idMap.get(p))
        .map((p) => idMap.get(p)!);
      if (parents.length === 0) continue;

      // Find existing birth event for this person, or create one
      let birth = Object.values(events).find(
        (e) => e.type === "birth" && e.people[0] === pid
      );
      if (!birth) {
        const eid = createId("event");
        birth = {
          id: eid,
          type: "birth",
          people: [pid],
          sources: [],
          photos: []
        };
        events[eid] = birth;
      }
      for (const parent of parents) {
        if (!birth.people.includes(parent)) birth.people.push(parent);
      }
    }
  }

  // Marriage events from FAM records
  for (const fam of Object.values(fams)) {
    if (!fam.husb || !fam.wife) continue;
    const a = idMap.get(fam.husb);
    const b = idMap.get(fam.wife);
    if (!a || !b) continue;
    const eid = createId("event");
    events[eid] = {
      id: eid,
      type: "marriage",
      date: fam.marriage?.date,
      place: fam.marriage?.place,
      people: [a, b],
      sources: [],
      photos: []
    };
  }

  const now = nowIso();
  return {
    ok: true,
    data: {
      schemaVersion: SCHEMA_VERSION,
      datasetId: createId("dataset"),
      createdAt: now,
      updatedAt: now,
      people,
      events,
      sources: {}
    },
    warnings
  };
}

const GEDCOM_TYPE_BY_TAG: Record<string, FamilyEvent["type"]> = {
  BIRT: "birth",
  DEAT: "death",
  BAPM: "baptism",
  BURI: "burial",
  RESI: "residence",
  OCCU: "occupation",
  EDUC: "education"
};

function parseCoord(raw: string): number | undefined {
  // "N38.720000" | "W9.140000" | "38.72"
  const m = raw.match(/^([NSEW])?(-?\d+\.?\d*)$/);
  if (!m) return undefined;
  const sign = m[1] === "S" || m[1] === "W" ? -1 : 1;
  const n = Number(m[2]);
  if (!Number.isFinite(n)) return undefined;
  return sign * Math.abs(n);
}
