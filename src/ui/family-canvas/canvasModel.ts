import type { DataState, FamilyEvent } from "../../types";
import { EVENT_META } from "../../eventMeta";
import {
  findBirthEvent,
  findDeathEvent,
  getChildren,
  getParents,
  getSpouses,
  relationLabel
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

export type FreeCanvasPosition = {
  x: number;
  y: number;
  pinned?: boolean;
};

export type FreeCanvasPositions = Record<string, FreeCanvasPosition>;

export type FamilyCoupleUnit = Omit<TreeUnit, "height"> & {
  height: number;
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
  coupleUnits: FamilyCoupleUnit[];
  renderedParentEdges: RenderedParentEdge[];
  bounds: WorldBounds;
};

type EventStats = { events: number; sources: number };

export type KinshipRole = "self" | "parent" | "child" | "spouse" | "sibling" | "other";

export type StoryLine = {
  tone: "fact" | "link" | "gap";
  text: string;
};

export type PersonInsight = {
  parents: number;
  children: number;
  spouses: number;
  siblings: number;
  events: number;
  sources: number;
  sourcedEvents: number;
  missingSources: number;
  evidenceRatio: number;
  primaryPlace: string | null;
  hasBirth: boolean;
  hasDeath: boolean;
  storyLines: StoryLine[];
};

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

export function buildCanvasModel(
  data: DataState,
  layout: TreeLayout,
  freePositions: FreeCanvasPositions = {}
): FamilyCanvasModel {
  const eventStats = buildEventStats(data);
  const nodes = layout.nodes.map((node): FamilyCanvasNode => {
    const stats = eventStats.get(node.id) ?? { events: 0, sources: 0 };
    const freePosition = validFreePosition(freePositions[node.id]);
    return {
      id: node.id,
      person: node.person,
      x: freePosition?.x ?? node.x,
      y: freePosition?.y ?? node.y,
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
    coupleUnits: buildCoupleUnits(layout, nodeById),
    renderedParentEdges,
    bounds: boundsForNodes(nodes)
  };
}

export function hasFreeCanvasPositions(freePositions: FreeCanvasPositions): boolean {
  return Object.values(freePositions).some((position) => !!validFreePosition(position));
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

export function kinshipRoleFor(
  data: DataState,
  anchorId: string | null,
  candidateId: string
): KinshipRole {
  if (!anchorId) return "other";
  const relation = relationLabel(data, anchorId, candidateId);
  if (
    relation === "self" ||
    relation === "parent" ||
    relation === "child" ||
    relation === "spouse" ||
    relation === "sibling"
  ) {
    return relation;
  }
  return "other";
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

export function buildPersonInsight(data: DataState, personId: string): PersonInsight {
  const parents = getParents(data, personId);
  const children = getChildren(data, personId);
  const spouses = getSpouses(data, personId);
  const siblings = buildSiblingCount(data, personId);
  const events = eventsForPerson(data, personId);
  const birthEvent = findBirthEvent(data, personId);
  const deathEvent = findDeathEvent(data, personId);
  const sourceIds = new Set<string>();
  let sourcedEvents = 0;
  let missingSources = 0;

  for (const event of events) {
    const validSources = event.sources.filter((sourceId) => data.sources[sourceId]);
    if (validSources.length > 0) {
      sourcedEvents += 1;
      for (const sourceId of validSources) sourceIds.add(sourceId);
    } else {
      missingSources += 1;
    }
  }

  const insightBase = {
    parents: parents.length,
    children: children.length,
    spouses: spouses.length,
    siblings,
    events: events.length,
    sources: sourceIds.size,
    sourcedEvents,
    missingSources,
    evidenceRatio: events.length === 0 ? 0 : sourcedEvents / events.length,
    primaryPlace: primaryPlaceFor(events),
    hasBirth: !!birthEvent,
    hasDeath: !!deathEvent
  };

  return {
    ...insightBase,
    storyLines: buildStoryLines(
      data,
      personId,
      insightBase,
      events,
      birthEvent,
      deathEvent,
      parents,
      children,
      spouses
    )
  };
}

function buildSiblingCount(data: DataState, personId: string): number {
  const parents = new Set(getParents(data, personId).map((person) => person.id));
  if (parents.size === 0) return 0;

  const siblingIds = new Set<string>();
  for (const event of Object.values(data.events)) {
    if (event.type !== "birth" || event.people.length === 0) continue;
    const [childId, ...parentIds] = event.people;
    if (childId === personId) continue;
    if (parentIds.some((parentId) => parents.has(parentId))) siblingIds.add(childId);
  }
  return siblingIds.size;
}

function buildStoryLines(
  data: DataState,
  personId: string,
  insight: Omit<PersonInsight, "storyLines">,
  events: FamilyEvent[],
  birthEvent: FamilyEvent | null,
  deathEvent: FamilyEvent | null,
  parents: DataState["people"][string][],
  children: DataState["people"][string][],
  spouses: DataState["people"][string][]
): StoryLine[] {
  const person = data.people[personId];
  const lines: StoryLine[] = [];
  const birthText = eventDatePlace(birthEvent);
  const deathText = eventDatePlace(deathEvent);

  if (birthText) {
    lines.push({ tone: "fact", text: `Born ${birthText}.` });
  } else {
    lines.push({ tone: "gap", text: "Birth date or place is still missing." });
  }

  if (parents.length > 0) {
    lines.push({ tone: "link", text: `Child of ${formatPeopleList(parents)}.` });
  } else {
    lines.push({ tone: "gap", text: "Parents are not linked yet." });
  }

  if (spouses.length > 0) {
    lines.push({ tone: "link", text: `Married with ${formatPeopleList(spouses)}.` });
  }

  if (children.length > 0) {
    lines.push({ tone: "link", text: `Parent of ${formatPeopleList(children)}.` });
  }

  const signatureEvent = events.find(
    (event) => !["birth", "death", "marriage"].includes(event.type)
  );
  if (signatureEvent) {
    lines.push({ tone: "fact", text: eventSentence(signatureEvent) });
  }

  if (deathText) {
    lines.push({ tone: "fact", text: `Died ${deathText}.` });
  }

  if (events.length === 0) {
    lines.push({ tone: "gap", text: "No timeline events recorded yet." });
  } else if (insight.missingSources > 0) {
    lines.push({
      tone: "gap",
      text: `${pluralize(insight.missingSources, "event")} still needs a source.`
    });
  }

  if (person?.notes?.trim()) {
    lines.push({ tone: "fact", text: truncateLabel(person.notes.trim(), 84) });
  }

  return lines.slice(0, 5);
}

function eventSentence(event: FamilyEvent): string {
  const meta = EVENT_META[event.type];
  const title = event.type === "custom" && event.customTitle ? event.customTitle : meta.label;
  const detail = eventDatePlace(event);
  return detail ? `${title} ${detail}.` : `${title}.`;
}

function eventDatePlace(event: FamilyEvent | null | undefined): string {
  if (!event) return "";
  const date = event.date?.display?.trim();
  const place = event.place?.name?.trim();
  if (date && place) return `${date} in ${place}`;
  if (date) return date;
  if (place) return `in ${place}`;
  return "";
}

function formatPeopleList(people: DataState["people"][string][]): string {
  const names = people.map((person) => person.name || "Unnamed");
  if (names.length <= 2) return names.join(" and ");
  return `${names[0]}, ${names[1]}, and ${names.length - 2} more`;
}

function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function primaryPlaceFor(events: FamilyEvent[]): string | null {
  const firstPlacedEvent = events.find((event) => event.place?.name?.trim());
  return firstPlacedEvent?.place?.name?.trim() ?? null;
}

function validFreePosition(position: FreeCanvasPosition | undefined): FreeCanvasPosition | null {
  if (!position) return null;
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
  return position;
}

function buildCoupleUnits(
  layout: TreeLayout,
  nodeById: Map<string, FamilyCanvasNode>
): FamilyCoupleUnit[] {
  return layout.units
    .filter((unit) => unit.members.length === 2)
    .map((unit) => {
      const first = nodeById.get(unit.members[0]);
      const second = nodeById.get(unit.members[1]);
      if (!first || !second) return { ...unit, height: CANVAS_NODE_HEIGHT };
      const width = Math.max(CANVAS_NODE_WIDTH, Math.abs(first.x - second.x) + CANVAS_NODE_WIDTH);
      const height = Math.max(CANVAS_NODE_HEIGHT, Math.abs(first.y - second.y) + CANVAS_NODE_HEIGHT);
      return {
        ...unit,
        centerX: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
        width,
        height
      };
    });
}

function boundsForNodes(nodes: FamilyCanvasNode[]): WorldBounds {
  if (nodes.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    minX = Math.min(minX, node.x - CANVAS_NODE_WIDTH / 2);
    maxX = Math.max(maxX, node.x + CANVAS_NODE_WIDTH / 2);
    minY = Math.min(minY, node.y - CANVAS_NODE_HEIGHT / 2);
    maxY = Math.max(maxY, node.y + CANVAS_NODE_HEIGHT / 2);
  }
  return { minX, maxX, minY, maxY };
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
