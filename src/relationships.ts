/**
 * Relationship helpers — pure query functions and cycle detection.
 *
 * These never mutate data. Mutations happen in the store, which uses these
 * to decide what to do.
 */

import type { DataState, FamilyEvent, Person } from "./types";

// ─── Queries ─────────────────────────────────────────

/** People listed as parents in the selected person's birth event. */
export function getParents(data: DataState, personId: string): Person[] {
  const ids = new Set<string>();
  for (const ev of Object.values(data.events)) {
    if (ev.type !== "birth") continue;
    if (ev.people[0] !== personId) continue;
    for (let i = 1; i < ev.people.length; i += 1) ids.add(ev.people[i]);
  }
  return Array.from(ids).map((id) => data.people[id]).filter(Boolean);
}

/** People whose birth event lists the given person as a parent. */
export function getChildren(data: DataState, personId: string): Person[] {
  const ids = new Set<string>();
  for (const ev of Object.values(data.events)) {
    if (ev.type !== "birth" || ev.people.length === 0) continue;
    const parents = ev.people.slice(1);
    if (parents.includes(personId)) ids.add(ev.people[0]);
  }
  return Array.from(ids).map((id) => data.people[id]).filter(Boolean);
}

/** Partners listed in any marriage event with the given person. */
export function getSpouses(data: DataState, personId: string): Person[] {
  const ids = new Set<string>();
  for (const ev of Object.values(data.events)) {
    if (ev.type !== "marriage") continue;
    if (!ev.people.includes(personId)) continue;
    for (const pid of ev.people) if (pid !== personId) ids.add(pid);
  }
  return Array.from(ids).map((id) => data.people[id]).filter(Boolean);
}

/** Siblings share at least one parent. */
export function getSiblings(data: DataState, personId: string): Person[] {
  const parents = new Set(getParents(data, personId).map((p) => p.id));
  if (parents.size === 0) return [];
  const siblingIds = new Set<string>();
  for (const ev of Object.values(data.events)) {
    if (ev.type !== "birth" || ev.people.length === 0) continue;
    const [child, ...evParents] = ev.people;
    if (child === personId) continue;
    if (evParents.some((p) => parents.has(p))) siblingIds.add(child);
  }
  return Array.from(siblingIds).map((id) => data.people[id]).filter(Boolean);
}

// ─── Checks ──────────────────────────────────────────

export function isSpouseOf(data: DataState, a: string, b: string): boolean {
  for (const ev of Object.values(data.events)) {
    if (ev.type !== "marriage") continue;
    if (ev.people.includes(a) && ev.people.includes(b)) return true;
  }
  return false;
}

export function isParentOf(data: DataState, parent: string, child: string): boolean {
  for (const ev of Object.values(data.events)) {
    if (ev.type !== "birth" || ev.people.length === 0) continue;
    if (ev.people[0] !== child) continue;
    if (ev.people.slice(1).includes(parent)) return true;
  }
  return false;
}

/**
 * Would adding `parentId` as a parent of `childId` create a cycle?
 * Walks up from parentId; if we reach childId, it's a cycle.
 */
export function wouldCreateCycle(
  data: DataState,
  parentId: string,
  childId: string
): boolean {
  if (parentId === childId) return true;
  const visited = new Set<string>();
  const stack: string[] = [parentId];
  while (stack.length > 0) {
    const curr = stack.pop()!;
    if (curr === childId) return true;
    if (visited.has(curr)) continue;
    visited.add(curr);
    for (const parent of getParents(data, curr)) {
      if (!visited.has(parent.id)) stack.push(parent.id);
    }
  }
  return false;
}

// ─── Per-person facts ────────────────────────────────
//
// Every person has at most one "primary" birth event (the one where they
// appear as people[0]) and one primary death event. Quick-edit fields in
// the inspector read/write these.

/** Returns the birth event where `personId` is the subject (people[0]). */
export function findBirthEvent(
  data: DataState,
  personId: string
): FamilyEvent | null {
  for (const ev of Object.values(data.events)) {
    if (ev.type === "birth" && ev.people[0] === personId) return ev;
  }
  return null;
}

/** Returns the death event where `personId` is the subject (people[0]). */
export function findDeathEvent(
  data: DataState,
  personId: string
): FamilyEvent | null {
  for (const ev of Object.values(data.events)) {
    if (ev.type === "death" && ev.people[0] === personId) return ev;
  }
  return null;
}

// ─── Focus set ───────────────────────────────────────

export type FocusMode = "all" | "ancestors" | "descendants";

/**
 * Compute the set of person ids that should be visible when focusing
 * on `rootId` in a given mode. The set always includes the root and
 * (when focus is active) the spouses of any included person, so couples
 * stay visually together.
 */
export function computeFocusSet(
  data: DataState,
  rootId: string,
  mode: Exclude<FocusMode, "all">
): Set<string> {
  const visited = new Set<string>([rootId]);
  const queue = [rootId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const nexts =
      mode === "ancestors"
        ? getParents(data, current).map((p) => p.id)
        : getChildren(data, current).map((p) => p.id);
    for (const id of nexts) {
      if (!visited.has(id)) {
        visited.add(id);
        queue.push(id);
      }
    }
  }

  // Include spouses of everyone already visited
  for (const id of Array.from(visited)) {
    const spouses = getSpouses(data, id);
    for (const s of spouses) visited.add(s.id);
  }

  return visited;
}

// ─── Labels ──────────────────────────────────────────

export function relationLabel(
  data: DataState,
  anchorId: string,
  otherId: string
): string | null {
  if (anchorId === otherId) return "self";
  if (isSpouseOf(data, anchorId, otherId)) return "spouse";
  if (isParentOf(data, otherId, anchorId)) return "parent";
  if (isParentOf(data, anchorId, otherId)) return "child";
  const aParents = new Set(getParents(data, anchorId).map((p) => p.id));
  const oParents = new Set(getParents(data, otherId).map((p) => p.id));
  for (const p of aParents) if (oParents.has(p)) return "sibling";
  return null;
}
