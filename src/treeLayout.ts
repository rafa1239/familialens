/**
 * Derived tree layout — reads from the event-first model, never stores
 * positions.
 *
 * Parent-child relationships are inferred from `birth` events where
 * people[0] = child and people[1..] = parents.
 *
 * Spouse relationships are inferred from `marriage` events.
 *
 * ─── Algorithm ───
 *
 *   1. Build adjacency maps (parents, children, spouses).
 *   2. Compute each person's generation depth (longest path from a root;
 *      spouses normalised to share the max of both).
 *   3. Per generation, form "family units". A unit is either a single
 *      person or a couple (two spouses). Each person is placed in at most
 *      one unit — we pick the first-seen spouse.
 *   4. Build a parent→children relationship at the UNIT level. A unit's
 *      children are the units whose person-level members include a child
 *      of any of this unit's members. Children units appear under exactly
 *      one parent unit (if a child belongs to multiple parent units —
 *      step-families — we assign them to the parent of their first-listed
 *      parent).
 *   5. Layout is a post-order traversal: compute each unit's subtree width
 *      (max of its own width vs total children width). Then a pre-order
 *      pass assigns x coordinates, packing children left-to-right and
 *      centering each parent over its children's span.
 *   6. Multiple roots (forests) are placed side-by-side.
 */

import type { DataState, FamilyEvent, Person } from "./types";
import { findBirthEvent, findDeathEvent } from "./relationships";

// ─── Visual constants ──────────────────────────────

const NODE_W = 190;
const NODE_H = 110;
const COUPLE_GAP = 14;      // gap between the two avatars inside a couple
const SIBLING_GAP = 30;     // gap between sibling units at the same generation
const FOREST_GAP = 80;      // extra gap between unrelated root subtrees
const V_GAP = 130;

export const TREE_CONSTANTS = {
  NODE_W,
  NODE_H,
  COUPLE_GAP,
  SIBLING_GAP,
  V_GAP
};

// ─── Types ─────────────────────────────────────────

export type TreeNode = {
  id: string;
  person: Person;
  x: number;
  y: number;
  generation: number;
  unitId: string;
  birthYear: number | null;
  deathYear: number | null;
};

/**
 * A rendering group of 1 or 2 people. For a couple, the unit's x is the
 * midpoint between the two members; for a single, it's the member's x.
 */
export type TreeUnit = {
  id: string;
  members: string[];       // 1 or 2 person ids, in placement order
  centerX: number;
  y: number;
  width: number;           // visual width (single: NODE_W; couple: 2*NODE_W + COUPLE_GAP)
  generation: number;
};

export type TreeEdge =
  | { type: "parent"; from: string; to: string }   // parentId → childId
  | { type: "spouse"; a: string; b: string };      // implicit inside a couple unit

export type TreeLayout = {
  nodes: TreeNode[];
  units: TreeUnit[];
  edges: TreeEdge[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
};

// ─── Adjacency ─────────────────────────────────────

type Adjacency = {
  parentsOf: Map<string, string[]>;       // ordered: first parent listed first
  childrenOf: Map<string, Set<string>>;
  spousesOf: Map<string, Set<string>>;
};

function buildAdjacency(data: DataState): Adjacency {
  const parentsOf = new Map<string, string[]>();
  const childrenOf = new Map<string, Set<string>>();
  const spousesOf = new Map<string, Set<string>>();

  for (const ev of Object.values(data.events)) {
    if (ev.type === "birth" && ev.people.length > 0) {
      const [child, ...parents] = ev.people;
      if (!data.people[child]) continue;
      const existing = parentsOf.get(child) ?? [];
      for (const parent of parents) {
        if (!data.people[parent]) continue;
        if (!existing.includes(parent)) existing.push(parent);
        if (!childrenOf.has(parent)) childrenOf.set(parent, new Set());
        childrenOf.get(parent)!.add(child);
      }
      parentsOf.set(child, existing);
    } else if (ev.type === "marriage" && ev.people.length >= 2) {
      const [a, b] = ev.people;
      if (data.people[a] && data.people[b]) {
        if (!spousesOf.has(a)) spousesOf.set(a, new Set());
        if (!spousesOf.has(b)) spousesOf.set(b, new Set());
        spousesOf.get(a)!.add(b);
        spousesOf.get(b)!.add(a);
      }
    }
  }

  return { parentsOf, childrenOf, spousesOf };
}

// ─── Generations ───────────────────────────────────

function computeDepths(data: DataState, adj: Adjacency): Map<string, number> {
  const memo = new Map<string, number>();
  const visiting = new Set<string>();

  const depthOf = (id: string): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const parents = adj.parentsOf.get(id);
    if (!parents || parents.length === 0) {
      memo.set(id, 0);
      visiting.delete(id);
      return 0;
    }
    let max = 0;
    for (const pid of parents) {
      max = Math.max(max, depthOf(pid) + 1);
    }
    memo.set(id, max);
    visiting.delete(id);
    return max;
  };

  for (const id of Object.keys(data.people)) depthOf(id);

  // Normalise: spouses share the max depth of both.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [a, spouses] of adj.spousesOf) {
      const da = memo.get(a) ?? 0;
      for (const b of spouses) {
        const db = memo.get(b) ?? 0;
        const target = Math.max(da, db);
        if ((memo.get(a) ?? 0) !== target) {
          memo.set(a, target);
          changed = true;
        }
        if ((memo.get(b) ?? 0) !== target) {
          memo.set(b, target);
          changed = true;
        }
      }
    }
  }

  return memo;
}

// ─── Unit formation ────────────────────────────────

type UnitDraft = {
  id: string;
  members: string[];
  generation: number;
};

function formUnits(
  data: DataState,
  adj: Adjacency,
  depths: Map<string, number>
): { units: UnitDraft[]; unitOf: Map<string, string> } {
  const unitOf = new Map<string, string>();
  const units: UnitDraft[] = [];
  let counter = 0;

  // Sort people by name for stable layout
  const peopleIds = Object.keys(data.people).sort((a, b) => {
    const na = data.people[a]?.name ?? "";
    const nb = data.people[b]?.name ?? "";
    return na.localeCompare(nb);
  });

  for (const personId of peopleIds) {
    if (unitOf.has(personId)) continue;
    const generation = depths.get(personId) ?? 0;
    const id = `unit_${counter++}`;

    // Look for a spouse in the same generation that isn't placed yet
    let partner: string | undefined;
    const spouses = adj.spousesOf.get(personId);
    if (spouses) {
      for (const s of spouses) {
        if (!unitOf.has(s) && depths.get(s) === generation) {
          partner = s;
          break;
        }
      }
    }

    const members = partner ? [personId, partner] : [personId];
    units.push({ id, members, generation });
    for (const m of members) unitOf.set(m, id);
  }

  return { units, unitOf };
}

// ─── Unit-level tree ───────────────────────────────

type UnitTree = {
  byId: Map<string, UnitDraft>;
  childrenOf: Map<string, string[]>;  // unitId → child unit ids
  parentOf: Map<string, string>;      // unitId → parent unit id
  roots: string[];
};

function buildUnitTree(
  data: DataState,
  adj: Adjacency,
  units: UnitDraft[],
  unitOf: Map<string, string>
): UnitTree {
  const byId = new Map<string, UnitDraft>();
  for (const u of units) byId.set(u.id, u);

  const childrenOf = new Map<string, string[]>();
  const parentOf = new Map<string, string>();

  for (const unit of units) {
    const kids: string[] = [];
    for (const personId of unit.members) {
      const personKids = adj.childrenOf.get(personId);
      if (!personKids) continue;
      for (const kidId of personKids) {
        const kidUnit = unitOf.get(kidId);
        if (!kidUnit || kidUnit === unit.id) continue;
        // Assign the child unit to this parent unit ONLY if the child's
        // first-listed parent (people[1] in their birth event) is a member
        // of this unit. This prevents double-parenting in step-families.
        const birthEv = findFirstBirthEventFor(data, kidId);
        const firstParent = birthEv?.people?.[1];
        if (firstParent && unit.members.includes(firstParent)) {
          if (!kids.includes(kidUnit)) kids.push(kidUnit);
        } else if (!firstParent && unit.members[0] === personId) {
          // Rare: no parent order info. Fall back to first encounter.
          if (!kids.includes(kidUnit)) kids.push(kidUnit);
        }
      }
    }
    if (kids.length > 0) childrenOf.set(unit.id, kids);
  }

  // Assign each child unit to exactly one parent unit. If a child unit has
  // been listed by multiple parent units, keep the first and drop the rest.
  for (const [parentId, kids] of childrenOf) {
    const kept: string[] = [];
    for (const kidId of kids) {
      if (parentOf.has(kidId)) continue; // already assigned to an earlier parent
      parentOf.set(kidId, parentId);
      kept.push(kidId);
    }
    childrenOf.set(parentId, kept);
  }

  // Sort children of each unit by name of the first member for stable output.
  for (const [pid, kids] of childrenOf) {
    kids.sort((a, b) => {
      const ua = byId.get(a);
      const ub = byId.get(b);
      const na = ua ? data.people[ua.members[0]]?.name ?? "" : "";
      const nb = ub ? data.people[ub.members[0]]?.name ?? "" : "";
      return na.localeCompare(nb);
    });
    childrenOf.set(pid, kids);
  }

  const roots = units.filter((u) => !parentOf.has(u.id)).map((u) => u.id);
  // Sort roots by generation then name for stability
  roots.sort((a, b) => {
    const ua = byId.get(a)!;
    const ub = byId.get(b)!;
    if (ua.generation !== ub.generation) return ua.generation - ub.generation;
    const na = data.people[ua.members[0]]?.name ?? "";
    const nb = data.people[ub.members[0]]?.name ?? "";
    return na.localeCompare(nb);
  });

  return { byId, childrenOf, parentOf, roots };
}

function findFirstBirthEventFor(data: DataState, childId: string): FamilyEvent | null {
  for (const ev of Object.values(data.events)) {
    if (ev.type === "birth" && ev.people[0] === childId) return ev;
  }
  return null;
}

// ─── Width computation (post-order) ────────────────

function unitOwnWidth(unit: UnitDraft): number {
  return unit.members.length === 1
    ? NODE_W
    : 2 * NODE_W + COUPLE_GAP;
}

function computeSubtreeWidths(tree: UnitTree): Map<string, number> {
  const widths = new Map<string, number>();

  const walk = (unitId: string): number => {
    if (widths.has(unitId)) return widths.get(unitId)!;
    const unit = tree.byId.get(unitId)!;
    const own = unitOwnWidth(unit);
    const kids = tree.childrenOf.get(unitId) ?? [];
    if (kids.length === 0) {
      widths.set(unitId, own);
      return own;
    }
    let childrenTotal = 0;
    for (let i = 0; i < kids.length; i++) {
      if (i > 0) childrenTotal += SIBLING_GAP;
      childrenTotal += walk(kids[i]);
    }
    const w = Math.max(own, childrenTotal);
    widths.set(unitId, w);
    return w;
  };

  for (const root of tree.roots) walk(root);
  return widths;
}

// ─── x placement (pre-order) ───────────────────────

function placeUnits(
  tree: UnitTree,
  widths: Map<string, number>
): Map<string, number> {
  const centers = new Map<string, number>();

  const walk = (unitId: string, leftEdge: number) => {
    const unit = tree.byId.get(unitId)!;
    const subtreeWidth = widths.get(unitId) ?? unitOwnWidth(unit);
    const kids = tree.childrenOf.get(unitId) ?? [];

    if (kids.length === 0) {
      centers.set(unitId, leftEdge + subtreeWidth / 2);
      return;
    }

    // Place children first, starting at our leftEdge.
    let cursor = leftEdge;
    const childrenTotal =
      kids
        .map((k) => widths.get(k) ?? 0)
        .reduce((a, b) => a + b, 0) +
      (kids.length - 1) * SIBLING_GAP;

    // Center children horizontally within our subtree slot if we're wider
    // than they are (happens when own width > sum of child widths).
    cursor += Math.max(0, (subtreeWidth - childrenTotal) / 2);

    for (const kid of kids) {
      walk(kid, cursor);
      cursor += (widths.get(kid) ?? 0) + SIBLING_GAP;
    }

    // Center self over children's midpoint
    const firstKidCenter = centers.get(kids[0]);
    const lastKidCenter = centers.get(kids[kids.length - 1]);
    if (firstKidCenter != null && lastKidCenter != null) {
      centers.set(unitId, (firstKidCenter + lastKidCenter) / 2);
    } else {
      centers.set(unitId, leftEdge + subtreeWidth / 2);
    }
  };

  let forestCursor = 0;
  for (const root of tree.roots) {
    walk(root, forestCursor);
    forestCursor += (widths.get(root) ?? 0) + FOREST_GAP;
  }

  return centers;
}

// ─── Main ──────────────────────────────────────────

export function computeTreeLayout(data: DataState): TreeLayout {
  const peopleIds = Object.keys(data.people);
  if (peopleIds.length === 0) {
    return {
      nodes: [],
      units: [],
      edges: [],
      bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 }
    };
  }

  const adj = buildAdjacency(data);
  const depths = computeDepths(data, adj);
  const { units: unitDrafts, unitOf } = formUnits(data, adj, depths);
  const unitTree = buildUnitTree(data, adj, unitDrafts, unitOf);
  const widths = computeSubtreeWidths(unitTree);
  const centers = placeUnits(unitTree, widths);

  // Build TreeUnit objects and TreeNode objects
  const units: TreeUnit[] = [];
  const nodes: TreeNode[] = [];

  for (const draft of unitDrafts) {
    const centerX = centers.get(draft.id) ?? 0;
    const y = draft.generation * (NODE_H + V_GAP);
    const width = unitOwnWidth(draft);

    units.push({
      id: draft.id,
      members: draft.members,
      centerX,
      y,
      width,
      generation: draft.generation
    });

    if (draft.members.length === 1) {
      const person = data.people[draft.members[0]];
      nodes.push({
        id: person.id,
        person,
        x: centerX,
        y,
        generation: draft.generation,
        unitId: draft.id,
        birthYear: yearFromEvent(findBirthEvent(data, person.id)),
        deathYear: yearFromEvent(findDeathEvent(data, person.id))
      });
    } else {
      // Couple: place members left and right of centerX
      const leftX = centerX - (NODE_W + COUPLE_GAP) / 2;
      const rightX = centerX + (NODE_W + COUPLE_GAP) / 2;
      const [a, b] = draft.members;
      const personA = data.people[a];
      const personB = data.people[b];
      nodes.push({
        id: personA.id,
        person: personA,
        x: leftX,
        y,
        generation: draft.generation,
        unitId: draft.id,
        birthYear: yearFromEvent(findBirthEvent(data, personA.id)),
        deathYear: yearFromEvent(findDeathEvent(data, personA.id))
      });
      nodes.push({
        id: personB.id,
        person: personB,
        x: rightX,
        y,
        generation: draft.generation,
        unitId: draft.id,
        birthYear: yearFromEvent(findBirthEvent(data, personB.id)),
        deathYear: yearFromEvent(findDeathEvent(data, personB.id))
      });
    }
  }

  // Normalise so min x is 0
  let minX = Infinity;
  for (const n of nodes) minX = Math.min(minX, n.x - NODE_W / 2);
  if (Number.isFinite(minX) && minX !== 0) {
    for (const n of nodes) n.x -= minX;
    for (const u of units) u.centerX -= minX;
  }

  // Edges
  const edges: TreeEdge[] = [];
  for (const [childId, parents] of adj.parentsOf) {
    for (const parentId of parents) {
      edges.push({ type: "parent", from: parentId, to: childId });
    }
  }
  const seenMarriages = new Set<string>();
  for (const ev of Object.values(data.events)) {
    if (ev.type !== "marriage" || ev.people.length < 2) continue;
    const [a, b] = ev.people;
    const key = [a, b].sort().join(":");
    if (seenMarriages.has(key)) continue;
    seenMarriages.add(key);
    if (data.people[a] && data.people[b]) {
      edges.push({ type: "spouse", a, b });
    }
  }

  return { nodes, units, edges, bounds: computeBounds(nodes) };
}

function computeBounds(nodes: TreeNode[]) {
  if (nodes.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.x - NODE_W / 2);
    maxX = Math.max(maxX, n.x + NODE_W / 2);
    minY = Math.min(minY, n.y - NODE_H / 2);
    maxY = Math.max(maxY, n.y + NODE_H / 2);
  }
  return { minX, maxX, minY, maxY };
}

function yearFromEvent(ev: FamilyEvent | null): number | null {
  if (!ev?.date) return null;
  if (Number.isNaN(ev.date.sortKey)) return null;
  return Math.floor(ev.date.sortKey);
}
