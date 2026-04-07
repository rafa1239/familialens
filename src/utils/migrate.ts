import { DataState, Person, Relationship } from "../types";
import { createId, nowIso } from "../ids";

const SCHEMA_VERSION = 2;

export type MigrationResult =
  | { ok: true; data: DataState; warnings: string[] }
  | { ok: false; reason: string };

export function migrateData(raw: unknown): MigrationResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "Invalid JSON structure." };
  }

  const input = raw as Partial<DataState> & Record<string, unknown>;
  const warnings: string[] = [];

  if (typeof input.schemaVersion === "number" && input.schemaVersion !== SCHEMA_VERSION) {
    warnings.push(`Schema version ${input.schemaVersion} migrated to ${SCHEMA_VERSION}.`);
  }

  let people: Record<string, Person> = {};
  let relationships: Record<string, Relationship> = {};

  if (Array.isArray(input.people)) {
    warnings.push("Converted people array into map.");
    const entries = input.people as Array<Record<string, any>>;
    entries.forEach((person) => {
      const id = String(person.id ?? createId("person"));
      people[id] = {
        id,
        name: String(person.name ?? "Unnamed"),
        gender:
          person.gender === "M" || person.gender === "F" || person.gender === "U"
            ? person.gender
            : "U",
        birthDate: String(person.birth_date ?? person.birthDate ?? ""),
        deathDate: String(person.death_date ?? person.deathDate ?? ""),
        birthPlace: String(person.birthPlace ?? person.birth_place ?? ""),
        deathPlace: String(person.deathPlace ?? person.death_place ?? ""),
        notes: typeof person.notes === "string" ? person.notes : "",
        photo: typeof person.photo === "string" ? person.photo : undefined,
        x: Number(person.x ?? 0),
        y: Number(person.y ?? 0),
        pinned: Boolean(person.pinned)
      };
      if (person.spouse_id) {
        const relId = createId("rel");
        relationships[relId] = { id: relId, type: "spouse", from: id, to: String(person.spouse_id) };
      }
      if (person.father_id) {
        const relId = createId("rel");
        relationships[relId] = { id: relId, type: "parent", from: String(person.father_id), to: id };
      }
      if (person.mother_id) {
        const relId = createId("rel");
        relationships[relId] = { id: relId, type: "parent", from: String(person.mother_id), to: id };
      }
    });
  } else if (input.people && typeof input.people === "object") {
    people = input.people as Record<string, Person>;
  }

  if (input.relationships && typeof input.relationships === "object") {
    relationships = input.relationships as Record<string, Relationship>;
  }

  if (!input.schemaVersion) {
    warnings.push("Missing schemaVersion; defaulted to v2.");
  }

  const now = nowIso();
  const data: DataState = {
    schemaVersion: SCHEMA_VERSION,
    datasetId: input.datasetId ?? createId("dataset"),
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    people,
    relationships
  };

  return { ok: true, data, warnings };
}
