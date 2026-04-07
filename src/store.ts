import { create } from "zustand";
import {
  DataState,
  FocusMode,
  Gender,
  LayoutMap,
  Operation,
  Person,
  Relationship,
  RelationshipType,
  ThemeMode,
  ValidationResult,
  ViewMode
} from "./types";
import { createId, getClientId, nowIso } from "./ids";
import { loadSnapshot, saveSnapshot, appendOp } from "./db";
import { computeLayout } from "./layout";
import { validateRelationship } from "./rules";
import { makeOp } from "./ops";

const SCHEMA_VERSION = 2;
const MAX_HISTORY = 30;
const clientId = getClientId();

function createInitialData(): DataState {
  const now = nowIso();
  return {
    schemaVersion: SCHEMA_VERSION,
    datasetId: createId("dataset"),
    createdAt: now,
    updatedAt: now,
    people: {},
    relationships: {}
  };
}

function touch(data: DataState): DataState {
  return { ...data, updatedAt: nowIso() };
}

function normalizePerson(person: Person, id: string): Person {
  return {
    id: person.id ?? id,
    name: typeof person.name === "string" ? person.name : "Unnamed",
    gender:
      person.gender === "M" || person.gender === "F" || person.gender === "U"
        ? person.gender
        : "U",
    birthDate: typeof person.birthDate === "string" ? person.birthDate : "",
    deathDate: typeof person.deathDate === "string" ? person.deathDate : "",
    birthPlace: typeof person.birthPlace === "string" ? person.birthPlace : "",
    deathPlace: typeof person.deathPlace === "string" ? person.deathPlace : "",
    notes: typeof person.notes === "string" ? person.notes : "",
    photo: typeof person.photo === "string" ? person.photo : undefined,
    pinned: person.pinned ?? false,
    x: Number.isFinite(person.x) ? person.x : 0,
    y: Number.isFinite(person.y) ? person.y : 0
  };
}

function normalizeData(raw: DataState): DataState {
  const now = nowIso();
  const people: Record<string, Person> = {};
  for (const [id, person] of Object.entries(raw.people ?? {})) {
    people[id] = normalizePerson(person, id);
  }
  const peopleIds = new Set(Object.keys(people));
  const relationships: Record<string, Relationship> = {};
  for (const [id, rel] of Object.entries(raw.relationships ?? {})) {
    if (peopleIds.has(rel.from) && peopleIds.has(rel.to)) {
      relationships[id] = rel;
    }
  }
  return {
    schemaVersion: raw.schemaVersion ?? SCHEMA_VERSION,
    datasetId: raw.datasetId ?? createId("dataset"),
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? now,
    people,
    relationships
  };
}

function applyLayoutToData(
  data: DataState,
  layout: LayoutMap,
  respectPins: boolean
): DataState {
  const people: Record<string, Person> = {};
  for (const [id, person] of Object.entries(data.people)) {
    const pos = layout[id];
    if (respectPins && person.pinned) {
      people[id] = person;
    } else {
      people[id] = pos ? { ...person, x: pos.x, y: pos.y } : person;
    }
  }
  return { ...data, people };
}

export type ContextMenuState = {
  x: number;
  y: number;
  targetId: string;
} | null;

interface FamiliaStore {
  // Data
  data: DataState;

  // UI State
  selectedIds: string[];
  linkMode: { type: RelationshipType | null; sourceId: string | null };
  viewMode: ViewMode;
  theme: ThemeMode;
  searchQuery: string;
  focusMode: FocusMode;
  filters: { gender: Gender | "all"; yearFrom: string; yearTo: string };
  statusMessage: string | null;
  contextMenu: ContextMenuState;
  respectPins: boolean;

  // Persistence
  hydrated: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  lastSavedAt: string | null;
  recentOps: Operation[];

  // History
  past: DataState[];
  future: DataState[];

  // Move tracking
  _moveSnapshot: DataState | null;
  _moveIds: Set<string>;

  // Actions
  init: () => Promise<void>;
  setTheme: (theme: ThemeMode) => void;
  setViewMode: (mode: ViewMode) => void;
  setSearchQuery: (query: string) => void;
  setFocusMode: (mode: FocusMode) => void;
  setFilters: (patch: Partial<FamiliaStore["filters"]>) => void;
  setStatusMessage: (msg: string | null) => void;
  setContextMenu: (menu: ContextMenuState) => void;
  setRespectPins: (value: boolean) => void;

  selectPerson: (id: string | null) => void;
  selectToggle: (id: string) => void;
  selectOnly: (id: string) => void;
  clearSelection: () => void;

  setLinkMode: (type: RelationshipType | null, sourceId: string | null) => void;

  addPerson: () => string;
  updatePerson: (id: string, patch: Partial<Person>) => void;
  deletePerson: (id: string) => void;
  deleteSelected: () => void;
  deleteRelationship: (id: string) => void;

  movePerson: (id: string, x: number, y: number) => void;
  beginMove: () => void;
  endMove: () => void;

  tryLink: (
    type: RelationshipType,
    from: string,
    to: string
  ) => ValidationResult;
  createRelative: (
    anchorId: string,
    relation: "parent" | "child" | "spouse"
  ) => { ok: true; id: string } | { ok: false; reason: string };

  relayout: () => void;
  importData: (data: DataState) => void;

  undo: () => void;
  redo: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(data: DataState, set: (partial: Partial<FamiliaStore>) => void) {
  if (saveTimer) clearTimeout(saveTimer);
  set({ saveStatus: "saving" });
  saveTimer = setTimeout(() => {
    saveSnapshot(data)
      .then(() =>
        set({ saveStatus: "saved", lastSavedAt: new Date().toISOString() })
      )
      .catch(() => set({ saveStatus: "error" }));
  }, 250);
}

function logOp(type: string, payload: Record<string, unknown>, set: (fn: (s: FamiliaStore) => Partial<FamiliaStore>) => void) {
  const op = makeOp(clientId, type, payload);
  appendOp(op).catch(() => undefined);
  set((s) => ({ recentOps: [op, ...s.recentOps].slice(0, 12) }));
}

export const useStore = create<FamiliaStore>()((set, get) => ({
  data: createInitialData(),

  selectedIds: [],
  linkMode: { type: null, sourceId: null },
  viewMode: "tree",
  theme: (typeof localStorage !== "undefined" &&
    localStorage.getItem("familialens.theme") === "light"
    ? "light"
    : "dark") as ThemeMode,
  searchQuery: "",
  focusMode: "all",
  filters: { gender: "all", yearFrom: "", yearTo: "" },
  statusMessage: null,
  contextMenu: null,
  respectPins: true,

  hydrated: false,
  saveStatus: "idle",
  lastSavedAt: null,
  recentOps: [],

  past: [],
  future: [],

  _moveSnapshot: null,
  _moveIds: new Set(),

  async init() {
    try {
      const snapshot = await loadSnapshot();
      if (snapshot) {
        set({ data: normalizeData(snapshot), hydrated: true });
      } else {
        set({ hydrated: true });
      }
    } catch {
      set({ hydrated: true });
    }
  },

  setTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("familialens.theme", theme);
    set({ theme });
  },

  setViewMode(mode) {
    set({ viewMode: mode });
  },

  setSearchQuery(query) {
    set({ searchQuery: query });
  },

  setFocusMode(mode) {
    set({ focusMode: mode });
  },

  setFilters(patch) {
    set((s) => ({ filters: { ...s.filters, ...patch } }));
  },

  setStatusMessage(msg) {
    set({ statusMessage: msg });
  },

  setContextMenu(menu) {
    set({ contextMenu: menu });
  },

  setRespectPins(value) {
    set({ respectPins: value });
  },

  selectPerson(id) {
    if (!id) {
      set({ selectedIds: [] });
      return;
    }
    set((s) => ({
      selectedIds: s.selectedIds.includes(id) ? s.selectedIds : [id]
    }));
  },

  selectToggle(id) {
    set((s) => {
      const next = new Set(s.selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { selectedIds: Array.from(next) };
    });
  },

  selectOnly(id) {
    set({ selectedIds: [id] });
  },

  clearSelection() {
    set({ selectedIds: [], linkMode: { type: null, sourceId: null } });
  },

  setLinkMode(type, sourceId) {
    set({ linkMode: { type, sourceId } });
  },

  addPerson() {
    const s = get();
    const id = createId("person");
    const count = Object.keys(s.data.people).length + 1;
    const person: Person = {
      id,
      name: `Person ${count}`,
      gender: "U",
      birthDate: "",
      deathDate: "",
      birthPlace: "",
      deathPlace: "",
      notes: "",
      x: 0,
      y: 0,
      pinned: false
    };
    const nextData = touch({
      ...s.data,
      people: { ...s.data.people, [id]: person }
    });
    const layout = computeLayout(nextData);
    const laid = applyLayoutToData(nextData, layout, true);
    set({
      data: laid,
      selectedIds: [id],
      past: [...s.past, s.data].slice(-MAX_HISTORY),
      future: []
    });
    scheduleSave(laid, (p) => set(p));
    logOp("person.add", { id }, set);
    return id;
  },

  updatePerson(id, patch) {
    const s = get();
    if (!s.data.people[id]) return;
    const nextData = touch({
      ...s.data,
      people: {
        ...s.data.people,
        [id]: { ...s.data.people[id], ...patch }
      }
    });
    set({
      data: nextData,
      past: [...s.past, s.data].slice(-MAX_HISTORY),
      future: []
    });
    scheduleSave(nextData, (p) => set(p));
    logOp("person.update", { id }, set);
  },

  deletePerson(id) {
    const s = get();
    if (!s.data.people[id]) return;
    const nextPeople = { ...s.data.people };
    delete nextPeople[id];
    const nextRels: Record<string, Relationship> = {};
    for (const [rid, rel] of Object.entries(s.data.relationships)) {
      if (rel.from !== id && rel.to !== id) nextRels[rid] = rel;
    }
    const nextData = touch({
      ...s.data,
      people: nextPeople,
      relationships: nextRels
    });
    set({
      data: nextData,
      selectedIds: s.selectedIds.filter((sid) => sid !== id),
      past: [...s.past, s.data].slice(-MAX_HISTORY),
      future: []
    });
    scheduleSave(nextData, (p) => set(p));
    logOp("person.delete", { id }, set);
  },

  deleteSelected() {
    const s = get();
    if (s.selectedIds.length === 0) return;
    const toDelete = new Set(s.selectedIds);
    const nextPeople = { ...s.data.people };
    for (const id of toDelete) delete nextPeople[id];
    const nextRels: Record<string, Relationship> = {};
    for (const [rid, rel] of Object.entries(s.data.relationships)) {
      if (!toDelete.has(rel.from) && !toDelete.has(rel.to))
        nextRels[rid] = rel;
    }
    const nextData = touch({
      ...s.data,
      people: nextPeople,
      relationships: nextRels
    });
    set({
      data: nextData,
      selectedIds: [],
      past: [...s.past, s.data].slice(-MAX_HISTORY),
      future: []
    });
    scheduleSave(nextData, (p) => set(p));
    logOp("person.delete.batch", { count: toDelete.size }, set);
  },

  deleteRelationship(id) {
    const s = get();
    if (!s.data.relationships[id]) return;
    const nextRels = { ...s.data.relationships };
    delete nextRels[id];
    const nextData = touch({ ...s.data, relationships: nextRels });
    set({
      data: nextData,
      past: [...s.past, s.data].slice(-MAX_HISTORY),
      future: []
    });
    scheduleSave(nextData, (p) => set(p));
    logOp("relationship.delete", { id }, set);
  },

  movePerson(id, x, y) {
    const s = get();
    if (!s.data.people[id]) return;
    const nextData = {
      ...s.data,
      updatedAt: s.data.updatedAt,
      people: {
        ...s.data.people,
        [id]: { ...s.data.people[id], x, y, pinned: true }
      }
    };
    s._moveIds.add(id);
    set({ data: nextData });
  },

  beginMove() {
    const s = get();
    if (!s._moveSnapshot) {
      set({ _moveSnapshot: s.data });
    }
  },

  endMove() {
    const s = get();
    if (!s._moveSnapshot) return;
    const snapshot = s._moveSnapshot;
    set({
      _moveSnapshot: null,
      past: [...s.past, snapshot].slice(-MAX_HISTORY),
      future: []
    });
    if (s._moveIds.size > 0) {
      logOp("person.move", { ids: Array.from(s._moveIds) }, set);
      s._moveIds.clear();
    }
    scheduleSave(s.data, (p) => set(p));
  },

  tryLink(type, from, to) {
    const s = get();
    const rel = { id: createId("rel"), type, from, to };
    const result = validateRelationship(s.data, rel);
    if (!result.ok) return result;
    const nextData = touch({
      ...s.data,
      relationships: { ...s.data.relationships, [rel.id]: rel }
    });
    const layout = computeLayout(nextData);
    const laid = applyLayoutToData(nextData, layout, true);
    set({
      data: laid,
      past: [...s.past, s.data].slice(-MAX_HISTORY),
      future: []
    });
    scheduleSave(laid, (p) => set(p));
    logOp("relationship.add", { type, from, to }, set);
    return { ok: true as const };
  },

  createRelative(anchorId, relation) {
    const s = get();
    const anchor = s.data.people[anchorId];
    if (!anchor) return { ok: false, reason: "Select a person first." };

    const id = createId("person");
    const count = Object.keys(s.data.people).length + 1;
    const offsets =
      relation === "parent"
        ? { x: 0, y: -220 }
        : relation === "child"
          ? { x: 0, y: 220 }
          : { x: 250, y: 0 };

    const person: Person = {
      id,
      name: relation === "spouse" ? `Partner ${count}` : `Person ${count}`,
      gender: "U",
      birthDate: "",
      deathDate: "",
      birthPlace: "",
      deathPlace: "",
      notes: "",
      x: anchor.x + offsets.x,
      y: anchor.y + offsets.y,
      pinned: true
    };

    const tempData: DataState = {
      ...s.data,
      people: { ...s.data.people, [id]: person }
    };

    const relType = relation === "spouse" ? "spouse" : "parent";
    const relFrom = relation === "parent" ? id : anchorId;
    const relTo = relation === "parent" ? anchorId : id;
    const rel = {
      id: createId("rel"),
      type: relType as "parent" | "spouse",
      from: relFrom,
      to: relTo
    };

    const result = validateRelationship(tempData, rel);
    if (!result.ok) return result;

    const nextData = touch({
      ...s.data,
      people: { ...s.data.people, [id]: person },
      relationships: { ...s.data.relationships, [rel.id]: rel }
    });
    set({
      data: nextData,
      selectedIds: [id],
      past: [...s.past, s.data].slice(-MAX_HISTORY),
      future: []
    });
    scheduleSave(nextData, (p) => set(p));
    logOp(`relative.add.${relation}`, { anchorId, personId: id }, set);
    return { ok: true, id };
  },

  relayout() {
    const s = get();
    const layout = computeLayout(s.data);
    const nextData = touch(
      applyLayoutToData(s.data, layout, s.respectPins)
    );
    set({
      data: nextData,
      past: [...s.past, s.data].slice(-MAX_HISTORY),
      future: []
    });
    scheduleSave(nextData, (p) => set(p));
  },

  importData(data) {
    const normalized = normalizeData(data);
    set({
      data: normalized,
      selectedIds: [],
      past: [],
      future: [],
      recentOps: []
    });
    scheduleSave(normalized, (p) => set(p));
  },

  undo() {
    const s = get();
    if (s.past.length === 0) return;
    const previous = s.past[s.past.length - 1];
    set({
      data: previous,
      past: s.past.slice(0, -1),
      future: [s.data, ...s.future].slice(0, MAX_HISTORY)
    });
    scheduleSave(previous, (p) => set(p));
  },

  redo() {
    const s = get();
    if (s.future.length === 0) return;
    const next = s.future[0];
    set({
      data: next,
      past: [...s.past, s.data].slice(-MAX_HISTORY),
      future: s.future.slice(1)
    });
    scheduleSave(next, (p) => set(p));
  }
}));
