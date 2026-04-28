import type { DataState, FamilyEvent } from "../../types";
import {
  getChildren,
  getParents,
  getSpouses
} from "../../relationships";
import type { TreeLayout, TreeUnit } from "../../treeLayout";
import { TREE_CONSTANTS } from "../../treeLayout";
import type { WorldBounds } from "./useCanvasViewport";

export const CANVAS_NODE_WIDTH = TREE_CONSTANTS.NODE_W;
export const CANVAS_NODE_HEIGHT = TREE_CONSTANTS.NODE_H;

export type CanvasBadges = {
  parents: number;
  children: number;
  spouses: number;
  events: number;
  sources: number;
};

export type FamilyCanvasNode = {
  id: string;
  person: DataState["people"][string];
  x: number;
  y: number;
  generation: number;
  unitId: string;
  birthYear: number | null;
  deathYear: number | null;
  badges: CanvasBadges;
};

export type RenderedParentEdge =
  | { kind: "single"; parent: FamilyCanvasNode; child: FamilyCanvasNode }
  | {
      kind: "couple";
      parentA: FamilyCanvasNode;
      parentB: FamilyCanvasNode;
      child: FamilyCanvasNode;
    };

export type FamilyCanvasModel = {
  nodes: FamilyCanvasNode[];
  nodeById: Map<string, FamilyCanvasNode>;
  coupleUnits: TreeUnit[];
  renderedParentEdges: RenderedParentEdge[];
  bounds: WorldBounds;
};

type EventStats = { events: number; sources: number };

export function filterDataForFocus(
  data: DataState,
  focusSet: Set<string> | null
): DataState {
  if (!focusSet) return data;
  const people = Object.fromEntries(
    Object.entries(data.people).filter(([id]) => focusSet.has(id))
  );
  const events = Object.fromEntries(
    Object.entries(data.events).filter(([, event]) =>
      event.people.length === 0 || event.people.every((id) => focusSet.has(id))
    )
  );
  return { ...data, people, events };
}

export function buildCanvasModel(data: DataState, layout: TreeLayout): FamilyCanvasModel {
  const eventStats = buildEventStats(data);
  const nodes = layout.nodes.map((node): FamilyCanvasNode => {
    const stats = eventStats.get(node.id) ?? { events: 0, sources: 0 };
    return {
      id: node.id,
      person: node.person,
      x: node.x,
      y: node.y,
      generation: node.generation,
      unitId: node.unitId,
      birthYear: node.birthYear,
      deathYear: node.deathYear,
      badges: {
        parents: getParents(data, node.id).length,
        children: getChildren(data, node.id).length,
        spouses: getSpouses(data, node.id).length,
        events: stats.events,
        sources: stats.sources
      }
    };
  });

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const renderedParentEdges = buildRenderedParentEdges(layout, nodeById);

  return {
    nodes,
    nodeById,
    coupleUnits: layout.units.filter((unit) => unit.members.length === 2),
    renderedParentEdges,
    bounds: layout.bounds
  };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function truncateLabel(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}...`;
}

export function lifespanLabel(birthYear: number | null, deathYear: number | null): string {
  if (birthYear == null && deathYear == null) return "Dates unknown";
  if (birthYear != null && deathYear != null) return `${birthYear}-${deathYear}`;
  if (birthYear != null) return `b. ${birthYear}`;
  return `d. ${deathYear}`;
}

export function eventsForPerson(data: DataState, personId: string): FamilyEvent[] {
  return Object.values(data.events)
    .filter((event) => event.people.includes(personId))
    .sort((a, b) => {
      const ad = a.date?.sortKey;
      const bd = b.date?.sortKey;
      const aFinite = typeof ad === "number" && Number.isFinite(ad);
      const bFinite = typeof bd === "number" && Number.isFinite(bd);
      if (aFinite && bFinite) return ad - bd;
      if (aFinite) return -1;
      if (bFinite) return 1;
      return a.type.localeCompare(b.type);
    });
}

function buildEventStats(data: DataState): Map<string, EventStats> {
  const sourceIdsByPerson = new Map<string, Set<string>>();
  const eventCounts = new Map<string, number>();

  for (const event of Object.values(data.events)) {
    for (const personId of event.people) {
      if (!data.people[personId]) continue;
      eventCounts.set(personId, (eventCounts.get(personId) ?? 0) + 1);
      if (!sourceIdsByPerson.has(personId)) sourceIdsByPerson.set(personId, new Set());
      for (const sourceId of event.sources) {
        if (data.sources[sourceId]) sourceIdsByPerson.get(personId)!.add(sourceId);
      }
    }
  }

  const result = new Map<string, EventStats>();
  for (const personId of Object.keys(data.people)) {
    result.set(personId, {
      events: eventCounts.get(personId) ?? 0,
      sources: sourceIdsByPerson.get(personId)?.size ?? 0
    });
  }
  return result;
}

function buildRenderedParentEdges(
  layout: TreeLayout,
  nodeById: Map<string, FamilyCanvasNode>
): RenderedParentEdge[] {
  const parentsByChild = new Map<string, string[]>();
  for (const edge of layout.edges) {
    if (edge.type !== "parent") continue;
    if (!parentsByChild.has(edge.to)) parentsByChild.set(edge.to, []);
    parentsByChild.get(edge.to)!.push(edge.from);
  }

  const result: RenderedParentEdge[] = [];
  for (const [childId, parentIds] of parentsByChild) {
    const child = nodeById.get(childId);
    if (!child) continue;

    if (parentIds.length === 2) {
      const [a, b] = parentIds;
      const parentA = nodeById.get(a);
      const parentB = nodeById.get(b);
      if (parentA && parentB && parentA.unitId === parentB.unitId) {
        result.push({ kind: "couple", parentA, parentB, child });
        continue;
      }
    }

    for (const parentId of parentIds) {
      const parent = nodeById.get(parentId);
      if (parent) result.push({ kind: "single", parent, child });
    }
  }

  return result;
}
