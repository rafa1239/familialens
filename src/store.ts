import { create } from "zustand";
import type {
  DataState,
  FamilyEvent,
  Gender,
  Person,
  Place,
  Source
} from "./types";
import { SCHEMA_VERSION } from "./types";
import { createId, nowIso } from "./ids";
import { loadSnapshot, saveSnapshot } from "./db";
import {
  findBirthEvent,
  findDeathEvent,
  getSpouses,
  isSpouseOf,
  wouldCreateCycle
} from "./relationships";
import { parseDate } from "./dates";
import type { ParsedStatement } from "./parseNarrative";

// ─── Factories ───────────────────────────────────────

export function createEmptyDataState(): DataState {
  const now = nowIso();
  return {
    schemaVersion: SCHEMA_VERSION,
    datasetId: createId("dataset"),
    createdAt: now,
    updatedAt: now,
    people: {},
    events: {},
    sources: {}
  };
}

function touch(data: DataState): DataState {
  return { ...data, updatedAt: nowIso() };
}

// ─── Toasts ──────────────────────────────────────────

export type Toast = {
  id: string;
  message: string;
  kind: "info" | "success" | "error";
};

// ─── Store type ──────────────────────────────────────

export type ViewMode = "timeline" | "tree" | "map" | "atlas";
export type FocusMode = "all" | "ancestors" | "descendants";

const MAX_HISTORY = 50;

export type RelationshipResult =
  | { ok: true; eventId?: string }
  | { ok: false; reason: string };

interface Store {
  data: DataState;
  hydrated: boolean;

  // UI state
  selectedPersonId: string | null;
  selectedEventId: string | null;
  viewMode: ViewMode;
  focusMode: FocusMode;
  toasts: Toast[];

  // History
  past: DataState[];
  future: DataState[];

  // Selection
  selectPerson: (id: string | null) => void;
  selectEvent: (id: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setFocusMode: (mode: FocusMode) => void;

  // Toast
  pushToast: (message: string, kind?: Toast["kind"]) => void;
  dismissToast: (id: string) => void;

  // Init
  init: () => Promise<void>;
  importData: (data: DataState) => void;
  reset: () => void;

  // History
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // People
  addPerson: (partial: Omit<Person, "id">) => string;
  updatePerson: (id: string, patch: Partial<Person>) => void;
  deletePerson: (id: string) => void;

  // Events
  addEvent: (
    partial: Omit<FamilyEvent, "id" | "sources" | "photos"> & {
      sources?: string[];
      photos?: string[];
    }
  ) => string;
  updateEvent: (id: string, patch: Partial<FamilyEvent>) => void;
  deleteEvent: (id: string) => void;

  // Sources
  addSource: (partial: Omit<Source, "id">) => string;
  updateSource: (id: string, patch: Partial<Source>) => void;
  deleteSource: (id: string) => void;

  // ─── Relationships (the human side) ───
  linkParent: (childId: string, parentId: string) => RelationshipResult;
  unlinkParent: (childId: string, parentId: string) => void;
  linkSpouse: (aId: string, bId: string) => RelationshipResult;
  unlinkSpouse: (aId: string, bId: string) => void;

  /**
   * Create a new person AND link them to `anchorId` as parent/spouse/child
   * in a single atomic operation. Returns the new person's id on success.
   * When creating a child of a person with exactly one spouse, the spouse
   * is automatically added as the second parent (reported via `autoLinkedParent`).
   */
  createRelative: (
    anchorId: string,
    relation: "parent" | "spouse" | "child",
    attrs: { name: string; gender: Gender }
  ) =>
    | { ok: true; personId: string; autoLinkedParent?: string }
    | { ok: false; reason: string };

  // ─── Quick facts (upsert birth/death directly from header fields) ───
  setBirthFact: (
    personId: string,
    fact: {
      dateStr: string;
      placeName: string;
      placeLat?: number;
      placeLon?: number;
    }
  ) => void;
  setDeathFact: (
    personId: string,
    fact: {
      dateStr: string;
      placeName: string;
      placeLat?: number;
      placeLon?: number;
    }
  ) => void;

  // ─── People merging (dedup) ───
  /**
   * Merge N people into a canonical person.
   * - Updates every event.people to replace duplicate ids with canonical id
   * - Dedupes within events (no same id twice)
   * - Collapses events that become identical after rewriting (same type,
   *   same date, same place, same people set)
   * - Deletes the non-canonical people
   * - Preserves canonical's photo/notes/name unless they were empty
   */
  mergePeople: (canonicalId: string, duplicateIds: string[]) => void;

  // ─── Places ───
  /**
   * Rename every event referencing `oldName` (exact match, case-sensitive)
   * to use `newName` instead. No-op if old and new are the same.
   */
  renamePlace: (oldName: string, newName: string) => void;

  /**
   * Merge all places whose names appear in `names` into `canonicalName`.
   * Events keep their lat/lon unless they had none, in which case the
   * canonical's coords (if any) are copied in.
   */
  mergePlaces: (
    names: string[],
    canonicalName: string,
    canonicalCoords?: { lat?: number; lon?: number }
  ) => void;

  /**
   * Set lat/lon on every event with place.name === name.
   */
  setPlaceCoords: (name: string, lat: number | undefined, lon: number | undefined) => void;

  /**
   * Apply a batch of parsed narrative statements atomically (one undo step).
   * Returns stats about what was created.
   */
  applyParsedStatements: (statements: ParsedStatement[]) => ApplyNarrativeResult;
}

export type ApplyNarrativeResult = {
  peopleCreated: number;
  peopleReused: number;
  eventsCreated: number;
  warnings: string[];
};

// ─── Save debounce ───────────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(data: DataState) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveSnapshot(data).catch(() => undefined);
  }, 250);
}

// ─── Upsert helper for quick facts ───────────────────

/**
 * Upsert a birth or death event for `personId` based on a free-text date
 * and place name. Optionally accepts coords (e.g. from the place
 * autocomplete when the user picks an existing place that has them).
 *
 * If the resulting event has no date, no place name, no notes, no parents,
 * no sources, no photos — it is deleted entirely.
 *
 * Coord precedence: explicit `placeLat`/`placeLon` > existing event's
 * coords > undefined.
 */
function upsertFact(
  state: Store,
  personId: string,
  type: "birth" | "death",
  dateStr: string,
  placeName: string,
  placeLat: number | undefined,
  placeLon: number | undefined,
  existing: FamilyEvent | null,
  commit: (next: DataState, extra?: Partial<Store>) => void
) {
  const nextDate = parseDate(dateStr);
  const trimmedPlace = placeName.trim();

  let nextPlace: Place | undefined;
  if (trimmedPlace) {
    nextPlace = {
      name: trimmedPlace,
      lat: placeLat != null ? placeLat : existing?.place?.lat,
      lon: placeLon != null ? placeLon : existing?.place?.lon
    };
  } else if (!trimmedPlace && existing?.place) {
    // User cleared the name — drop the place entirely (lat/lon go too)
    nextPlace = undefined;
  }

  const hasOtherData = !!existing && (
    existing.people.length > 1 ||                     // parents attached
    (!!existing.notes && existing.notes.trim() !== "") ||
    existing.sources.length > 0 ||
    existing.photos.length > 0
  );

  const nothingLeft = !nextDate && !nextPlace && !hasOtherData;

  const nextEvents: Record<string, FamilyEvent> = { ...state.data.events };

  if (existing && nothingLeft) {
    delete nextEvents[existing.id];
    commit({ ...state.data, events: nextEvents });
    return;
  }

  if (existing) {
    nextEvents[existing.id] = {
      ...existing,
      date: nextDate,
      place: nextPlace
    };
    commit({ ...state.data, events: nextEvents });
    return;
  }

  // No existing event — only create one if there's something to save
  if (!nextDate && !nextPlace) return;

  const newId = createId("event");
  nextEvents[newId] = {
    id: newId,
    type,
    date: nextDate,
    place: nextPlace,
    people: [personId],
    sources: [],
    photos: []
  };
  commit({ ...state.data, events: nextEvents });
}

// ─── Store implementation ────────────────────────────

export const useStore = create<Store>()((set, get) => {
  /**
   * Commit a new data snapshot: push current to history, clear redo, save.
   */
  const commit = (next: DataState, extra?: Partial<Store>) => {
    const s = get();
    const touched = touch(next);
    set({
      data: touched,
      past: [...s.past, s.data].slice(-MAX_HISTORY),
      future: [],
      ...extra
    });
    scheduleSave(touched);
  };

  return {
    data: createEmptyDataState(),
    hydrated: false,
    selectedPersonId: null,
    selectedEventId: null,
    viewMode: "timeline",
    focusMode: "all",
    toasts: [],
    past: [],
    future: [],

    selectPerson(id) { set({ selectedPersonId: id }); },
    selectEvent(id) { set({ selectedEventId: id }); },
    setViewMode(mode) { set({ viewMode: mode }); },
    setFocusMode(mode) { set({ focusMode: mode }); },

    pushToast(message, kind = "info") {
      const t: Toast = { id: createId("toast"), message, kind };
      set((s) => ({ toasts: [...s.toasts, t] }));
      // Auto-dismiss after 3.5s
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) }));
      }, 3500);
    },
    dismissToast(id) {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    },

    async init() {
      try {
        const snapshot = await loadSnapshot();
        if (snapshot) set({ data: snapshot, hydrated: true });
        else set({ hydrated: true });
      } catch {
        set({ hydrated: true });
      }
    },

    importData(data) {
      commit(data, { selectedPersonId: null, selectedEventId: null });
    },

    reset() {
      const empty = createEmptyDataState();
      commit(empty, { selectedPersonId: null, selectedEventId: null });
    },

    // ─── Undo / redo ───
    undo() {
      const s = get();
      if (s.past.length === 0) return;
      const previous = s.past[s.past.length - 1];
      set({
        data: previous,
        past: s.past.slice(0, -1),
        future: [s.data, ...s.future].slice(0, MAX_HISTORY)
      });
      scheduleSave(previous);
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
      scheduleSave(next);
    },
    canUndo() { return get().past.length > 0; },
    canRedo() { return get().future.length > 0; },

    // ─── People ───
    addPerson(partial) {
      const id = createId("person");
      const person: Person = { ...partial, id };
      const s = get();
      commit({ ...s.data, people: { ...s.data.people, [id]: person } });
      return id;
    },

    updatePerson(id, patch) {
      const s = get();
      const existing = s.data.people[id];
      if (!existing) return;
      commit({
        ...s.data,
        people: { ...s.data.people, [id]: { ...existing, ...patch, id } }
      });
    },

    deletePerson(id) {
      const s = get();
      if (!s.data.people[id]) return;

      const nextPeople = { ...s.data.people };
      delete nextPeople[id];

      const nextEvents: Record<string, FamilyEvent> = {};
      for (const [eid, event] of Object.entries(s.data.events)) {
        const people = event.people.filter((pid) => pid !== id);
        if (people.length === 0) continue;
        if (people.length === event.people.length) nextEvents[eid] = event;
        else nextEvents[eid] = { ...event, people };
      }

      commit(
        { ...s.data, people: nextPeople, events: nextEvents },
        {
          selectedPersonId: s.selectedPersonId === id ? null : s.selectedPersonId,
          selectedEventId:
            s.selectedEventId && !nextEvents[s.selectedEventId]
              ? null
              : s.selectedEventId
        }
      );
    },

    // ─── Events ───
    addEvent(partial) {
      const id = createId("event");
      const event: FamilyEvent = {
        ...partial,
        id,
        sources: partial.sources ?? [],
        photos: partial.photos ?? []
      };
      const s = get();
      commit({ ...s.data, events: { ...s.data.events, [id]: event } });
      return id;
    },

    updateEvent(id, patch) {
      const s = get();
      const existing = s.data.events[id];
      if (!existing) return;
      commit({
        ...s.data,
        events: { ...s.data.events, [id]: { ...existing, ...patch, id } }
      });
    },

    deleteEvent(id) {
      const s = get();
      if (!s.data.events[id]) return;
      const nextEvents = { ...s.data.events };
      delete nextEvents[id];
      commit(
        { ...s.data, events: nextEvents },
        { selectedEventId: s.selectedEventId === id ? null : s.selectedEventId }
      );
    },

    // ─── Sources ───
    addSource(partial) {
      const id = createId("source");
      const source: Source = { ...partial, id };
      const s = get();
      commit({ ...s.data, sources: { ...s.data.sources, [id]: source } });
      return id;
    },

    updateSource(id, patch) {
      const s = get();
      const existing = s.data.sources[id];
      if (!existing) return;
      commit({
        ...s.data,
        sources: { ...s.data.sources, [id]: { ...existing, ...patch, id } }
      });
    },

    deleteSource(id) {
      const s = get();
      if (!s.data.sources[id]) return;
      const nextSources = { ...s.data.sources };
      delete nextSources[id];
      const nextEvents: Record<string, FamilyEvent> = {};
      for (const [eid, event] of Object.entries(s.data.events)) {
        if (event.sources.includes(id)) {
          nextEvents[eid] = {
            ...event,
            sources: event.sources.filter((sid) => sid !== id)
          };
        } else {
          nextEvents[eid] = event;
        }
      }
      commit({ ...s.data, sources: nextSources, events: nextEvents });
    },

    // ─── Relationships ───

    linkParent(childId, parentId) {
      const s = get();
      if (childId === parentId) {
        return { ok: false, reason: "A person can't be their own parent." };
      }
      if (!s.data.people[childId] || !s.data.people[parentId]) {
        return { ok: false, reason: "Both people must exist." };
      }
      if (wouldCreateCycle(s.data, parentId, childId)) {
        return { ok: false, reason: "That link would create a cycle in the tree." };
      }

      // Find existing birth event for the child (child is people[0])
      let birthId: string | null = null;
      for (const [eid, ev] of Object.entries(s.data.events)) {
        if (ev.type === "birth" && ev.people[0] === childId) {
          birthId = eid;
          break;
        }
      }

      if (birthId) {
        const ev = s.data.events[birthId];
        if (ev.people.includes(parentId)) {
          return { ok: false, reason: "Already linked." };
        }
        if (ev.people.length >= 3) {
          return { ok: false, reason: "A child already has two parents." };
        }
        const nextEvent: FamilyEvent = {
          ...ev,
          people: [...ev.people, parentId]
        };
        commit({
          ...s.data,
          events: { ...s.data.events, [birthId]: nextEvent }
        });
        return { ok: true, eventId: birthId };
      }

      // Create new skeleton birth event with [child, parent]
      const newId = createId("event");
      const newEvent: FamilyEvent = {
        id: newId,
        type: "birth",
        people: [childId, parentId],
        sources: [],
        photos: []
      };
      commit({
        ...s.data,
        events: { ...s.data.events, [newId]: newEvent }
      });
      return { ok: true, eventId: newId };
    },

    unlinkParent(childId, parentId) {
      const s = get();
      let changed = false;
      const nextEvents: Record<string, FamilyEvent> = {};
      for (const [eid, ev] of Object.entries(s.data.events)) {
        if (
          ev.type === "birth" &&
          ev.people[0] === childId &&
          ev.people.includes(parentId)
        ) {
          const people = ev.people.filter((p) => p !== parentId);
          // If only the child remains and the event has no date/place, drop it
          if (
            people.length === 1 &&
            !ev.date &&
            !ev.place &&
            !ev.notes &&
            ev.sources.length === 0 &&
            ev.photos.length === 0
          ) {
            changed = true;
            continue; // skip — effectively delete
          }
          nextEvents[eid] = { ...ev, people };
          changed = true;
        } else {
          nextEvents[eid] = ev;
        }
      }
      if (!changed) return;
      commit({ ...s.data, events: nextEvents });
    },

    linkSpouse(aId, bId) {
      const s = get();
      if (aId === bId) {
        return { ok: false, reason: "A person can't marry themselves." };
      }
      if (!s.data.people[aId] || !s.data.people[bId]) {
        return { ok: false, reason: "Both people must exist." };
      }
      if (isSpouseOf(s.data, aId, bId)) {
        return { ok: false, reason: "These two are already married." };
      }
      const newId = createId("event");
      const newEvent: FamilyEvent = {
        id: newId,
        type: "marriage",
        people: [aId, bId],
        sources: [],
        photos: []
      };
      commit({ ...s.data, events: { ...s.data.events, [newId]: newEvent } });
      return { ok: true, eventId: newId };
    },

    unlinkSpouse(aId, bId) {
      const s = get();
      let changed = false;
      const nextEvents: Record<string, FamilyEvent> = {};
      for (const [eid, ev] of Object.entries(s.data.events)) {
        if (
          ev.type === "marriage" &&
          ev.people.includes(aId) &&
          ev.people.includes(bId)
        ) {
          changed = true;
          continue; // delete marriage event
        }
        nextEvents[eid] = ev;
      }
      if (!changed) return;
      commit({ ...s.data, events: nextEvents });
    },

    createRelative(anchorId, relation, attrs) {
      const s = get();
      if (!s.data.people[anchorId]) {
        return { ok: false, reason: "Anchor person missing." };
      }

      const personId = createId("person");
      const person: Person = {
        id: personId,
        name: attrs.name.trim() || "Unnamed",
        gender: attrs.gender
      };

      const nextPeople = { ...s.data.people, [personId]: person };
      const nextEvents = { ...s.data.events };
      let autoLinkedParent: string | undefined;

      if (relation === "parent") {
        if (wouldCreateCycle(s.data, personId, anchorId)) {
          return { ok: false, reason: "Would create a cycle." };
        }
        // Find/create birth event for anchor
        let birthId: string | null = null;
        for (const [eid, ev] of Object.entries(nextEvents)) {
          if (ev.type === "birth" && ev.people[0] === anchorId) {
            birthId = eid;
            break;
          }
        }
        if (birthId) {
          const ev = nextEvents[birthId];
          if (ev.people.length >= 3) {
            return { ok: false, reason: "Anchor already has two parents." };
          }
          nextEvents[birthId] = { ...ev, people: [...ev.people, personId] };
        } else {
          const newId = createId("event");
          nextEvents[newId] = {
            id: newId,
            type: "birth",
            people: [anchorId, personId],
            sources: [],
            photos: []
          };
        }
      } else if (relation === "child") {
        if (wouldCreateCycle(s.data, anchorId, personId)) {
          return { ok: false, reason: "Would create a cycle." };
        }
        // Auto-suggest: if anchor has exactly one spouse, include them
        // as the second parent. Matches the 95% use case.
        const spouses = getSpouses(s.data, anchorId);
        const parentIds: string[] = [anchorId];
        if (spouses.length === 1) {
          parentIds.push(spouses[0].id);
          autoLinkedParent = spouses[0].id;
        }
        const newId = createId("event");
        nextEvents[newId] = {
          id: newId,
          type: "birth",
          people: [personId, ...parentIds],
          sources: [],
          photos: []
        };
      } else if (relation === "spouse") {
        const newId = createId("event");
        nextEvents[newId] = {
          id: newId,
          type: "marriage",
          people: [anchorId, personId],
          sources: [],
          photos: []
        };
      }

      commit(
        { ...s.data, people: nextPeople, events: nextEvents },
        { selectedPersonId: personId, selectedEventId: null }
      );
      return { ok: true, personId, autoLinkedParent };
    },

    // ─── Quick facts ─────────────────────────────

    setBirthFact(personId, { dateStr, placeName, placeLat, placeLon }) {
      const s = get();
      if (!s.data.people[personId]) return;
      upsertFact(
        s,
        personId,
        "birth",
        dateStr,
        placeName,
        placeLat,
        placeLon,
        findBirthEvent(s.data, personId),
        commit
      );
    },

    setDeathFact(personId, { dateStr, placeName, placeLat, placeLon }) {
      const s = get();
      if (!s.data.people[personId]) return;
      upsertFact(
        s,
        personId,
        "death",
        dateStr,
        placeName,
        placeLat,
        placeLon,
        findDeathEvent(s.data, personId),
        commit
      );
    },

    // ─── People merging ───

    mergePeople(canonicalId, duplicateIds) {
      const s = get();
      if (!s.data.people[canonicalId]) return;
      const toDelete = new Set(duplicateIds.filter((id) => id !== canonicalId));
      if (toDelete.size === 0) return;
      // Ensure all duplicates exist
      for (const id of toDelete) {
        if (!s.data.people[id]) return;
      }

      // ─── Rewrite events ───
      const rewrittenEvents: Record<string, FamilyEvent> = {};
      for (const [eid, ev] of Object.entries(s.data.events)) {
        const newPeople: string[] = [];
        const seen = new Set<string>();
        for (const pid of ev.people) {
          const next = toDelete.has(pid) ? canonicalId : pid;
          if (!seen.has(next)) {
            newPeople.push(next);
            seen.add(next);
          }
        }
        rewrittenEvents[eid] = { ...ev, people: newPeople };
      }

      // ─── Collapse duplicate events ───
      // Two events are considered duplicate if they have the same type,
      // same date sortKey (or both undefined), same place name, and the
      // same set of people.
      const keyOf = (ev: FamilyEvent): string => {
        const dateKey = ev.date ? ev.date.display : "—";
        const placeKey = ev.place?.name ?? "—";
        const peopleKey = [...ev.people].sort().join(",");
        return `${ev.type}|${dateKey}|${placeKey}|${peopleKey}`;
      };

      const seenKeys = new Map<string, string>(); // key → kept event id
      const finalEvents: Record<string, FamilyEvent> = {};
      for (const [eid, ev] of Object.entries(rewrittenEvents)) {
        const key = keyOf(ev);
        const existingId = seenKeys.get(key);
        if (existingId) {
          // Merge sources and photos into the existing one
          const kept = finalEvents[existingId];
          finalEvents[existingId] = {
            ...kept,
            sources: Array.from(new Set([...kept.sources, ...ev.sources])),
            photos: Array.from(new Set([...kept.photos, ...ev.photos])),
            notes: kept.notes || ev.notes
          };
          continue;
        }
        seenKeys.set(key, eid);
        finalEvents[eid] = ev;
      }

      // ─── Remove duplicate people ───
      const canonical = s.data.people[canonicalId];
      const nextPeople: Record<string, Person> = { ...s.data.people };
      for (const id of toDelete) delete nextPeople[id];

      // Merge photo/notes fallback: if canonical has none, inherit from the
      // first duplicate that does.
      let mergedCanonical: Person = { ...canonical };
      for (const id of toDelete) {
        const dupe = s.data.people[id];
        if (!mergedCanonical.photo && dupe.photo) mergedCanonical.photo = dupe.photo;
        if (!mergedCanonical.notes && dupe.notes) mergedCanonical.notes = dupe.notes;
        if (!mergedCanonical.surname && dupe.surname) mergedCanonical.surname = dupe.surname;
      }
      nextPeople[canonicalId] = mergedCanonical;

      const next: DataState = {
        ...s.data,
        people: nextPeople,
        events: finalEvents
      };

      commit(next, {
        selectedPersonId: toDelete.has(s.selectedPersonId ?? "")
          ? canonicalId
          : s.selectedPersonId,
        selectedEventId: s.selectedEventId && !finalEvents[s.selectedEventId]
          ? null
          : s.selectedEventId
      });
    },

    // ─── Places ───

    renamePlace(oldName, newName) {
      const s = get();
      const trimmed = newName.trim();
      if (!trimmed || oldName === trimmed) return;

      let changed = false;
      const nextEvents: Record<string, FamilyEvent> = {};
      for (const [eid, ev] of Object.entries(s.data.events)) {
        if (ev.place?.name === oldName) {
          nextEvents[eid] = { ...ev, place: { ...ev.place, name: trimmed } };
          changed = true;
        } else {
          nextEvents[eid] = ev;
        }
      }
      if (!changed) return;
      commit({ ...s.data, events: nextEvents });
    },

    mergePlaces(names, canonicalName, canonicalCoords) {
      const s = get();
      const trimmed = canonicalName.trim();
      if (!trimmed || names.length === 0) return;
      const targets = new Set(names);

      let changed = false;
      const nextEvents: Record<string, FamilyEvent> = {};
      for (const [eid, ev] of Object.entries(s.data.events)) {
        if (ev.place && targets.has(ev.place.name)) {
          const nextLat =
            ev.place.lat != null ? ev.place.lat : canonicalCoords?.lat;
          const nextLon =
            ev.place.lon != null ? ev.place.lon : canonicalCoords?.lon;
          nextEvents[eid] = {
            ...ev,
            place: { name: trimmed, lat: nextLat, lon: nextLon }
          };
          changed = true;
        } else {
          nextEvents[eid] = ev;
        }
      }
      if (!changed) return;
      commit({ ...s.data, events: nextEvents });
    },

    setPlaceCoords(name, lat, lon) {
      const s = get();
      if (!name) return;
      let changed = false;
      const nextEvents: Record<string, FamilyEvent> = {};
      for (const [eid, ev] of Object.entries(s.data.events)) {
        if (ev.place?.name === name) {
          nextEvents[eid] = {
            ...ev,
            place: { ...ev.place, lat, lon }
          };
          changed = true;
        } else {
          nextEvents[eid] = ev;
        }
      }
      if (!changed) return;
      commit({ ...s.data, events: nextEvents });
    },

    // ─── Apply parsed narrative ───
    applyParsedStatements(statements) {
      const s = get();
      const warnings: string[] = [];
      let peopleCreated = 0;
      let peopleReused = 0;
      let eventsCreated = 0;

      // Start with the current dataset as a working copy.
      const nextPeople: Record<string, Person> = { ...s.data.people };
      const nextEvents: Record<string, FamilyEvent> = { ...s.data.events };

      // Name → personId resolver. First tries existing database people,
      // then falls back to newly-created people from this batch.
      const nameToId = new Map<string, string>();

      const normalize = (name: string): string =>
        name
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/\s+/g, " ")
          .trim();

      // Pre-populate with existing people by normalised name
      for (const p of Object.values(nextPeople)) {
        const key = normalize(p.name);
        if (key && !nameToId.has(key)) nameToId.set(key, p.id);
      }

      const resolveOrCreate = (name: string, gender?: Gender): string => {
        const key = normalize(name);
        const existing = nameToId.get(key);
        if (existing) {
          // Optionally backfill gender
          if (gender && gender !== "U") {
            const p = nextPeople[existing];
            if (p && p.gender === "U") {
              nextPeople[existing] = { ...p, gender };
            }
          }
          peopleReused += 1;
          return existing;
        }
        const id = createId("person");
        nextPeople[id] = {
          id,
          name: name.trim(),
          gender: gender ?? "U"
        };
        nameToId.set(key, id);
        peopleCreated += 1;
        return id;
      };

      const findBirthEventFor = (personId: string): string | null => {
        for (const [eid, ev] of Object.entries(nextEvents)) {
          if (ev.type === "birth" && ev.people[0] === personId) return eid;
        }
        return null;
      };
      const findDeathEventFor = (personId: string): string | null => {
        for (const [eid, ev] of Object.entries(nextEvents)) {
          if (ev.type === "death" && ev.people[0] === personId) return eid;
        }
        return null;
      };

      // First pass: create all persons. This ensures any order of
      // statements can reference them later.
      for (const stmt of statements) {
        if (stmt.kind === "person") {
          resolveOrCreate(stmt.name, stmt.gender);
        }
      }

      // Second pass: apply events and relationships.
      for (const stmt of statements) {
        if (stmt.kind === "person") continue;

        if (stmt.kind === "birth") {
          const personId = resolveOrCreate(stmt.person);
          // Find existing birth event (so we can merge new info)
          let birthId = findBirthEventFor(personId);
          const parsedDate = stmt.date ? parseDate(stmt.date) : undefined;
          const place = stmt.place?.trim()
            ? { name: stmt.place.trim() }
            : undefined;
          if (birthId) {
            const ev = nextEvents[birthId];
            nextEvents[birthId] = {
              ...ev,
              date: parsedDate ?? ev.date,
              place: place ?? ev.place
            };
          } else {
            const eid = createId("event");
            nextEvents[eid] = {
              id: eid,
              type: "birth",
              people: [personId],
              date: parsedDate,
              place,
              sources: [],
              photos: []
            };
            eventsCreated += 1;
          }
          continue;
        }

        if (stmt.kind === "death") {
          const personId = resolveOrCreate(stmt.person);
          let deathId = findDeathEventFor(personId);
          const parsedDate = stmt.date ? parseDate(stmt.date) : undefined;
          const place = stmt.place?.trim()
            ? { name: stmt.place.trim() }
            : undefined;
          if (deathId) {
            const ev = nextEvents[deathId];
            nextEvents[deathId] = {
              ...ev,
              date: parsedDate ?? ev.date,
              place: place ?? ev.place
            };
          } else {
            const eid = createId("event");
            nextEvents[eid] = {
              id: eid,
              type: "death",
              people: [personId],
              date: parsedDate,
              place,
              sources: [],
              photos: []
            };
            eventsCreated += 1;
          }
          continue;
        }

        if (stmt.kind === "marriage") {
          const aId = resolveOrCreate(stmt.a);
          const bId = resolveOrCreate(stmt.b);
          // Skip if already married
          const exists = Object.values(nextEvents).some(
            (ev) =>
              ev.type === "marriage" &&
              ev.people.includes(aId) &&
              ev.people.includes(bId)
          );
          if (exists) {
            warnings.push(`Marriage of ${stmt.a} and ${stmt.b} already recorded.`);
            continue;
          }
          const eid = createId("event");
          nextEvents[eid] = {
            id: eid,
            type: "marriage",
            people: [aId, bId],
            date: stmt.date ? parseDate(stmt.date) : undefined,
            place: stmt.place?.trim() ? { name: stmt.place.trim() } : undefined,
            sources: [],
            photos: []
          };
          eventsCreated += 1;
          continue;
        }

        if (stmt.kind === "parent") {
          const parentId = resolveOrCreate(stmt.parent);
          const childId = resolveOrCreate(stmt.child);
          if (parentId === childId) {
            warnings.push(`${stmt.parent} can't be their own parent.`);
            continue;
          }
          // Find or create child's birth event, add parent if not already
          let birthId = findBirthEventFor(childId);
          if (birthId) {
            const ev = nextEvents[birthId];
            if (ev.people.includes(parentId)) continue; // already linked
            if (ev.people.length >= 3) {
              warnings.push(
                `${stmt.child} already has two parents; skipped ${stmt.parent}.`
              );
              continue;
            }
            nextEvents[birthId] = {
              ...ev,
              people: [...ev.people, parentId]
            };
          } else {
            const eid = createId("event");
            nextEvents[eid] = {
              id: eid,
              type: "birth",
              people: [childId, parentId],
              sources: [],
              photos: []
            };
            eventsCreated += 1;
          }
          continue;
        }

        if (stmt.kind === "residence" || stmt.kind === "migration") {
          const personId = resolveOrCreate(stmt.person);
          const eid = createId("event");
          nextEvents[eid] = {
            id: eid,
            type: stmt.kind,
            people: [personId],
            date: stmt.date ? parseDate(stmt.date) : undefined,
            place: stmt.place?.trim() ? { name: stmt.place.trim() } : undefined,
            sources: [],
            photos: []
          };
          eventsCreated += 1;
          continue;
        }

        if (stmt.kind === "occupation") {
          const personId = resolveOrCreate(stmt.person);
          const eid = createId("event");
          nextEvents[eid] = {
            id: eid,
            type: "occupation",
            people: [personId],
            notes: stmt.role,
            sources: [],
            photos: []
          };
          eventsCreated += 1;
          continue;
        }
      }

      const nextData: DataState = {
        ...s.data,
        people: nextPeople,
        events: nextEvents
      };
      commit(nextData);

      return { peopleCreated, peopleReused, eventsCreated, warnings };
    }
  };
});
