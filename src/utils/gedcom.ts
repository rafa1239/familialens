import { DataState, Person, Relationship } from "../types";
import { createId, nowIso } from "../ids";

const SCHEMA_VERSION = 2;

export type GedcomResult =
  | { ok: true; data: DataState; warnings: string[] }
  | { ok: false; reason: string; warnings?: string[] };

export function parseGedcom(content: string): GedcomResult {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.some((line) => line.startsWith("0 HEAD"))) {
    return { ok: false, reason: "Not a GEDCOM file (missing HEAD)." };
  }

  const warnings: string[] = [];
  const people: Record<string, Person> = {};
  const relationships: Record<string, Relationship> = {};
  const idMap = new Map<string, string>();

  let currentIndi: string | null = null;
  let currentFam: string | null = null;
  let currentEvent: "BIRT" | "DEAT" | null = null;
  let activeNote: string | null = null;

  const indiData: Record<
    string,
    {
      name?: string;
      given?: string;
      surn?: string;
      sex?: string;
      birth?: string;
      death?: string;
      note?: string;
      fams: string[];
      famc: string[];
    }
  > = {};
  const famData: Record<string, { husb?: string; wife?: string; children: string[] }> = {};

  const ensureFamily = (id: string) => {
    if (!famData[id]) famData[id] = { children: [] };
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const parts = line.split(" ");
    const level = parts[0];
    const tag = parts[1];
    const rest = parts.slice(2).join(" ");

    if (level === "0") {
      currentIndi = null;
      currentFam = null;
      currentEvent = null;
      activeNote = null;
      if (tag.startsWith("@I") && rest === "INDI") {
        currentIndi = tag;
        indiData[currentIndi] = { fams: [], famc: [] };
      } else if (tag.startsWith("@F") && rest === "FAM") {
        currentFam = tag;
        famData[currentFam] = { children: [] };
      }
      continue;
    }

    if (currentIndi) {
      if (level === "1") {
        currentEvent = null;
        if (tag !== "NOTE") activeNote = null;
      }
      if (level === "1" && tag === "NAME")
        indiData[currentIndi].name = rest.replace(/\//g, "").trim();
      if (level === "2" && tag === "GIVN")
        indiData[currentIndi].given = rest.trim();
      if (level === "2" && tag === "SURN")
        indiData[currentIndi].surn = rest.trim();
      if (level === "1" && tag === "SEX")
        indiData[currentIndi].sex = rest;
      if (level === "1" && tag === "BIRT") currentEvent = "BIRT";
      if (level === "1" && tag === "DEAT") currentEvent = "DEAT";
      if (level === "2" && tag === "DATE" && currentEvent) {
        if (currentEvent === "BIRT") indiData[currentIndi].birth = rest.trim();
        else if (currentEvent === "DEAT") indiData[currentIndi].death = rest.trim();
      }
      if (level === "1" && tag === "FAMS") {
        indiData[currentIndi].fams.push(rest.trim());
        ensureFamily(rest.trim());
      }
      if (level === "1" && tag === "FAMC") {
        indiData[currentIndi].famc.push(rest.trim());
        ensureFamily(rest.trim());
      }
      if (level === "1" && tag === "NOTE") {
        activeNote = currentIndi;
        indiData[currentIndi].note = rest.trim();
      }
      if (activeNote && level === "2" && (tag === "CONT" || tag === "CONC")) {
        const prefix = tag === "CONT" ? "\n" : "";
        const current = indiData[activeNote].note ?? "";
        indiData[activeNote].note = `${current}${prefix}${rest.trim()}`.trim();
      }
    }

    if (currentFam) {
      if (level === "1" && tag === "HUSB") famData[currentFam].husb = rest;
      if (level === "1" && tag === "WIFE") famData[currentFam].wife = rest;
      if (level === "1" && tag === "CHIL") famData[currentFam].children.push(rest);
    }
  }

  for (const [indiId, attrs] of Object.entries(indiData)) {
    for (const famId of attrs.fams) {
      ensureFamily(famId);
      const fam = famData[famId];
      if (attrs.sex === "M" && !fam.husb) fam.husb = indiId;
      else if (attrs.sex === "F" && !fam.wife) fam.wife = indiId;
      else if (!fam.husb) fam.husb = indiId;
      else if (!fam.wife) fam.wife = indiId;
    }
    for (const famId of attrs.famc) {
      ensureFamily(famId);
      const fam = famData[famId];
      if (!fam.children.includes(indiId)) fam.children.push(indiId);
    }
  }

  for (const [gedId, attrs] of Object.entries(indiData)) {
    const id = createId("person");
    idMap.set(gedId, id);
    const fallbackName = [attrs.given, attrs.surn].filter(Boolean).join(" ").trim();
    people[id] = {
      id,
      name: (attrs.name ?? fallbackName) || "Unnamed",
      gender: attrs.sex === "M" || attrs.sex === "F" ? attrs.sex : "U",
      birthDate: attrs.birth ?? "",
      deathDate: attrs.death ?? "",
      birthPlace: "",
      deathPlace: "",
      notes: attrs.note ?? "",
      x: 0,
      y: 0,
      pinned: false
    };
  }

  for (const fam of Object.values(famData)) {
    const husbandId = fam.husb ? idMap.get(fam.husb) : undefined;
    const wifeId = fam.wife ? idMap.get(fam.wife) : undefined;
    if (husbandId && wifeId) {
      const relId = createId("rel");
      relationships[relId] = { id: relId, type: "spouse", from: husbandId, to: wifeId };
    }
    for (const child of fam.children) {
      const childId = idMap.get(child);
      if (!childId) continue;
      if (husbandId) {
        const relId = createId("rel");
        relationships[relId] = { id: relId, type: "parent", from: husbandId, to: childId };
      }
      if (wifeId) {
        const relId = createId("rel");
        relationships[relId] = { id: relId, type: "parent", from: wifeId, to: childId };
      }
      if (!husbandId && !wifeId) {
        warnings.push("Family without parents found; child skipped.");
      }
    }
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
      relationships
    },
    warnings
  };
}

export function exportGedcom(data: DataState): string {
  const people = Object.values(data.people);
  const relationships = Object.values(data.relationships);

  const indiMap = new Map<string, string>();
  people.forEach((person, index) => {
    indiMap.set(person.id, `@I${index + 1}@`);
  });

  const spousePairs = new Map<string, { husb?: string; wife?: string; children: string[] }>();

  for (const rel of relationships) {
    if (rel.type !== "spouse") continue;
    const key = [rel.from, rel.to].sort().join(":");
    const entry = spousePairs.get(key) ?? { children: [] };
    const from = data.people[rel.from];
    const to = data.people[rel.to];
    if (from?.gender === "F" || to?.gender === "M") {
      entry.husb = rel.to;
      entry.wife = rel.from;
    } else {
      entry.husb = rel.from;
      entry.wife = rel.to;
    }
    spousePairs.set(key, entry);
  }

  const parentLinks = relationships.filter((rel) => rel.type === "parent");
  for (const link of parentLinks) {
    let assigned = false;
    for (const [, entry] of spousePairs) {
      if (entry.husb === link.from || entry.wife === link.from) {
        entry.children.push(link.to);
        assigned = true;
      }
    }
    if (!assigned) {
      const key = `single:${link.from}`;
      const entry = spousePairs.get(key) ?? { children: [] };
      if (!entry.husb && !entry.wife) {
        const p = data.people[link.from];
        if (p?.gender === "F") entry.wife = link.from;
        else entry.husb = link.from;
      }
      entry.children.push(link.to);
      spousePairs.set(key, entry);
    }
  }

  const familyEntries: Array<{ id: string; husb?: string; wife?: string; children: string[] }> = [];
  let famIndex = 1;
  for (const entry of spousePairs.values()) {
    familyEntries.push({ id: `@F${famIndex++}@`, ...entry });
  }

  const famsByPerson = new Map<string, string[]>();
  const famcByPerson = new Map<string, string[]>();
  for (const fam of familyEntries) {
    for (const pid of [fam.husb, fam.wife].filter(Boolean) as string[]) {
      const list = famsByPerson.get(pid) ?? [];
      list.push(fam.id);
      famsByPerson.set(pid, list);
    }
    for (const child of fam.children) {
      const list = famcByPerson.get(child) ?? [];
      list.push(fam.id);
      famcByPerson.set(child, list);
    }
  }

  const lines: string[] = [];
  lines.push("0 HEAD", "1 SOUR FamiliaLens", "1 GEDC", "2 VERS 5.5", "1 CHAR UTF-8");

  for (const person of people) {
    const indiId = indiMap.get(person.id)!;
    const name = person.name.trim() || "Unknown";
    const parts = name.split(" ");
    const first = parts.slice(0, -1).join(" ") || parts[0];
    const last = parts.length > 1 ? parts[parts.length - 1] : "";

    lines.push(`0 ${indiId} INDI`);
    lines.push(`1 NAME ${first} /${last}/`);
    if (person.gender && person.gender !== "U") lines.push(`1 SEX ${person.gender}`);
    if (person.birthDate) {
      lines.push("1 BIRT");
      lines.push(`2 DATE ${person.birthDate}`);
    }
    if (person.deathDate) {
      lines.push("1 DEAT");
      lines.push(`2 DATE ${person.deathDate}`);
    }
    if (person.notes) {
      const noteLines = person.notes.split(/\r?\n/).filter(Boolean);
      if (noteLines.length > 0) {
        lines.push(`1 NOTE ${noteLines[0]}`);
        for (const extra of noteLines.slice(1)) lines.push(`2 CONT ${extra}`);
      }
    }
    for (const famId of famsByPerson.get(person.id) ?? []) lines.push(`1 FAMS ${famId}`);
    for (const famId of famcByPerson.get(person.id) ?? []) lines.push(`1 FAMC ${famId}`);
  }

  for (const fam of familyEntries) {
    lines.push(`0 ${fam.id} FAM`);
    if (fam.husb && indiMap.has(fam.husb)) lines.push(`1 HUSB ${indiMap.get(fam.husb)}`);
    if (fam.wife && indiMap.has(fam.wife)) lines.push(`1 WIFE ${indiMap.get(fam.wife)}`);
    for (const child of fam.children) {
      if (indiMap.has(child)) lines.push(`1 CHIL ${indiMap.get(child)}`);
    }
  }

  lines.push("0 TRLR");
  return lines.join("\n");
}
