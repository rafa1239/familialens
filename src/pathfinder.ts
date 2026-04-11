/**
 * Relationship pathfinder.
 *
 * Given two person ids, find how they're related by walking the parent
 * graph. The algorithm:
 *   1. BFS up from A collecting all ancestors with depth + came-from pointer
 *   2. BFS up from B (same)
 *   3. Common ancestors are ids in both maps; the "best" LCA is the one
 *      minimising depthA + depthB
 *   4. From (depthA, depthB), derive the kinship label (cousin, aunt, etc.)
 *   5. Reconstruct the visual path from A up to LCA and from LCA down to B
 *
 * Also handles:
 *   - Same person
 *   - Spouses (via marriage events)
 *   - Direct ancestor/descendant chains
 */

import type { DataState, Gender, Person } from "./types";
import { getParents, isSpouseOf } from "./relationships";

export type RelationshipKind =
  | "self"
  | "spouse"
  | "ancestor"       // A is an ancestor of B
  | "descendant"     // A is a descendant of B
  | "sibling"
  | "pibling"        // A is aunt/uncle of B
  | "nibling"        // A is niece/nephew of B
  | "cousin"
  | "unrelated";

export type RelationshipResult = {
  kind: RelationshipKind;
  /** e.g. "Maria is Pedro's grandmother" */
  aIsToB: string;
  /** e.g. "Pedro is Maria's grandson" */
  bIsToA: string;
  /** Short version, just the relation noun: "grandmother", "2nd cousin once removed" */
  shortLabel: string;
  generationsA: number;     // steps from A up to LCA
  generationsB: number;     // steps from B up to LCA
  lcaId: string | null;
  /** People in order: A, ..., LCA, ..., B */
  path: string[];
};

// ─── Public API ─────────────────────────────────────

export function findRelationship(
  data: DataState,
  aId: string,
  bId: string
): RelationshipResult {
  const a = data.people[aId];
  const b = data.people[bId];

  if (aId === bId) {
    return {
      kind: "self",
      aIsToB: `${a?.name ?? "This person"} is the same person.`,
      bIsToA: `${a?.name ?? "This person"} is the same person.`,
      shortLabel: "same person",
      generationsA: 0,
      generationsB: 0,
      lcaId: aId,
      path: [aId]
    };
  }

  if (!a || !b) {
    return unrelated(aId, bId);
  }

  // Spouses: short-circuit (they may also be blood relatives; we prioritise
  // marriage because that's how users think about it first)
  if (isSpouseOf(data, aId, bId)) {
    return {
      kind: "spouse",
      aIsToB: `${a.name} is ${b.name}'s ${spouseWord(a.gender)}.`,
      bIsToA: `${b.name} is ${a.name}'s ${spouseWord(b.gender)}.`,
      shortLabel: "spouse",
      generationsA: 0,
      generationsB: 0,
      lcaId: null,
      path: [aId, bId]
    };
  }

  const upA = buildAncestorMap(data, aId);
  const upB = buildAncestorMap(data, bId);

  // Find LCA = common ancestor minimising (depthA + depthB)
  let lca: string | null = null;
  let bestSum = Infinity;
  for (const [id, dA] of upA.depth) {
    const dB = upB.depth.get(id);
    if (dB == null) continue;
    if (dA + dB < bestSum) {
      bestSum = dA + dB;
      lca = id;
    }
  }

  if (!lca) return unrelated(aId, bId);

  const gA = upA.depth.get(lca)!;
  const gB = upB.depth.get(lca)!;

  // Path: A up to LCA, then LCA down to B (reversed B path excluding the duplicated LCA)
  const pathAtoLCA = reconstructUpward(upA.cameFrom, lca);
  const pathLCAtoB = reconstructUpward(upB.cameFrom, lca).reverse();
  // pathAtoLCA ends with LCA; pathLCAtoB starts with LCA — dedupe
  const path = [...pathAtoLCA, ...pathLCAtoB.slice(1)];

  return labelPair(a, b, gA, gB, lca, path);
}

// ─── Labelling ──────────────────────────────────────

function labelPair(
  a: Person,
  b: Person,
  gA: number,
  gB: number,
  lca: string,
  path: string[]
): RelationshipResult {
  // Direct ancestor / descendant
  if (gA === 0) {
    // A is the LCA → A is B's ancestor
    const noun = ancestorWord(a.gender, gB);
    return {
      kind: "ancestor",
      aIsToB: `${a.name} is ${b.name}'s ${noun}.`,
      bIsToA: `${b.name} is ${a.name}'s ${descendantWord(b.gender, gB)}.`,
      shortLabel: noun,
      generationsA: 0,
      generationsB: gB,
      lcaId: lca,
      path
    };
  }
  if (gB === 0) {
    const noun = descendantWord(a.gender, gA);
    return {
      kind: "descendant",
      aIsToB: `${a.name} is ${b.name}'s ${noun}.`,
      bIsToA: `${b.name} is ${a.name}'s ${ancestorWord(b.gender, gA)}.`,
      shortLabel: noun,
      generationsA: gA,
      generationsB: 0,
      lcaId: lca,
      path
    };
  }

  // Siblings
  if (gA === 1 && gB === 1) {
    return {
      kind: "sibling",
      aIsToB: `${a.name} is ${b.name}'s ${siblingWord(a.gender)}.`,
      bIsToA: `${b.name} is ${a.name}'s ${siblingWord(b.gender)}.`,
      shortLabel: siblingWord(a.gender),
      generationsA: 1,
      generationsB: 1,
      lcaId: lca,
      path
    };
  }

  // Pibling (uncle/aunt): one side is 1 generation below LCA, the other more
  if (gA === 1 && gB >= 2) {
    const noun = piblingWord(a.gender, gB);
    const otherNoun = niblingWord(b.gender, gB);
    return {
      kind: "pibling",
      aIsToB: `${a.name} is ${b.name}'s ${noun}.`,
      bIsToA: `${b.name} is ${a.name}'s ${otherNoun}.`,
      shortLabel: noun,
      generationsA: gA,
      generationsB: gB,
      lcaId: lca,
      path
    };
  }
  if (gB === 1 && gA >= 2) {
    const noun = niblingWord(a.gender, gA);
    const otherNoun = piblingWord(b.gender, gA);
    return {
      kind: "nibling",
      aIsToB: `${a.name} is ${b.name}'s ${noun}.`,
      bIsToA: `${b.name} is ${a.name}'s ${otherNoun}.`,
      shortLabel: noun,
      generationsA: gA,
      generationsB: gB,
      lcaId: lca,
      path
    };
  }

  // Cousins
  const degree = Math.min(gA, gB) - 1;
  const removed = Math.abs(gA - gB);
  const noun = cousinWord(degree, removed);
  return {
    kind: "cousin",
    aIsToB: `${a.name} is ${b.name}'s ${noun}.`,
    bIsToA: `${b.name} is ${a.name}'s ${noun}.`,
    shortLabel: noun,
    generationsA: gA,
    generationsB: gB,
    lcaId: lca,
    path
  };
}

function unrelated(aId: string, bId: string): RelationshipResult {
  return {
    kind: "unrelated",
    aIsToB: "Not related through known blood lineage.",
    bIsToA: "Not related through known blood lineage.",
    shortLabel: "unrelated",
    generationsA: 0,
    generationsB: 0,
    lcaId: null,
    path: [aId, bId]
  };
}

// ─── BFS helpers ────────────────────────────────────

function buildAncestorMap(data: DataState, rootId: string) {
  const depth = new Map<string, number>();
  const cameFrom = new Map<string, string | null>();
  depth.set(rootId, 0);
  cameFrom.set(rootId, null);
  const queue: string[] = [rootId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const d = depth.get(current)!;
    for (const parent of getParents(data, current)) {
      if (depth.has(parent.id)) continue;
      depth.set(parent.id, d + 1);
      cameFrom.set(parent.id, current);
      queue.push(parent.id);
    }
  }
  return { depth, cameFrom };
}

/**
 * Walk `cameFrom` from `targetId` back to the BFS root, returning the
 * ordered path [root, ..., targetId]. `cameFrom[id]` stores the child
 * node that led to `id` during BFS, so walking it traces back toward root.
 */
function reconstructUpward(
  cameFrom: Map<string, string | null>,
  targetId: string
): string[] {
  const result: string[] = [];
  let current: string | null = targetId;
  const guard = new Set<string>();
  while (current !== null && !guard.has(current)) {
    guard.add(current);
    result.unshift(current);
    const next = cameFrom.get(current);
    if (next === undefined || next === null) break;
    current = next;
  }
  return result;
}

// ─── Word helpers ───────────────────────────────────

function greats(n: number): string {
  if (n <= 0) return "";
  if (n === 1) return "great-";
  return `great-${greats(n - 1)}`;
}

function ancestorWord(aGender: Gender, gen: number): string {
  // gen = how many generations A is above B
  if (gen === 1) {
    if (aGender === "M") return "father";
    if (aGender === "F") return "mother";
    return "parent";
  }
  if (gen === 2) {
    if (aGender === "M") return "grandfather";
    if (aGender === "F") return "grandmother";
    return "grandparent";
  }
  const g = greats(gen - 2);
  if (aGender === "M") return `${g}grandfather`;
  if (aGender === "F") return `${g}grandmother`;
  return `${g}grandparent`;
}

function descendantWord(aGender: Gender, gen: number): string {
  if (gen === 1) {
    if (aGender === "M") return "son";
    if (aGender === "F") return "daughter";
    return "child";
  }
  if (gen === 2) {
    if (aGender === "M") return "grandson";
    if (aGender === "F") return "granddaughter";
    return "grandchild";
  }
  const g = greats(gen - 2);
  if (aGender === "M") return `${g}grandson`;
  if (aGender === "F") return `${g}granddaughter`;
  return `${g}grandchild`;
}

function siblingWord(aGender: Gender): string {
  if (aGender === "M") return "brother";
  if (aGender === "F") return "sister";
  return "sibling";
}

function piblingWord(aGender: Gender, nephewGen: number): string {
  // nephewGen >= 2 (nephewGen=2 → uncle/aunt; 3 → great-uncle, etc.)
  const base = aGender === "M" ? "uncle" : aGender === "F" ? "aunt" : "uncle or aunt";
  if (nephewGen === 2) return base;
  return `${greats(nephewGen - 2)}${base}`;
}

function niblingWord(aGender: Gender, selfGen: number): string {
  const base =
    aGender === "M" ? "nephew" : aGender === "F" ? "niece" : "niece or nephew";
  if (selfGen === 2) return base;
  return `${greats(selfGen - 2)}${base}`;
}

function spouseWord(aGender: Gender): string {
  if (aGender === "M") return "husband";
  if (aGender === "F") return "wife";
  return "spouse";
}

function cousinWord(degree: number, removed: number): string {
  const ord = ordinal(degree);
  const base = `${ord} cousin`;
  if (removed === 0) return base;
  if (removed === 1) return `${base} once removed`;
  if (removed === 2) return `${base} twice removed`;
  if (removed === 3) return `${base} thrice removed`;
  return `${base} ${removed} times removed`;
}

function ordinal(n: number): string {
  if (n === 1) return "1st";
  if (n === 2) return "2nd";
  if (n === 3) return "3rd";
  return `${n}th`;
}
