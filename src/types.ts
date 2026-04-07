export type Gender = "M" | "F" | "U";

export type Person = {
  id: string;
  name: string;
  gender: Gender;
  birthDate: string;
  deathDate: string;
  birthPlace?: string;
  deathPlace?: string;
  notes?: string;
  photo?: string;
  x: number;
  y: number;
  pinned?: boolean;
};

export type RelationshipType = "parent" | "spouse";

export type Relationship = {
  id: string;
  type: RelationshipType;
  from: string;
  to: string;
};

export type DataState = {
  schemaVersion: number;
  datasetId: string;
  createdAt: string;
  updatedAt: string;
  people: Record<string, Person>;
  relationships: Record<string, Relationship>;
};

export type LayoutMap = Record<string, { x: number; y: number }>;

export type Operation = {
  id: string;
  ts: string;
  clientId: string;
  type: string;
  payload: Record<string, unknown>;
};

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export type ViewMode = "tree" | "timeline";
export type ThemeMode = "dark" | "light";
export type FocusMode = "all" | "ancestors" | "descendants";
