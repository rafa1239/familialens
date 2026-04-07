import { DataState, LayoutMap } from "./types";

const H_SPACING = 240;
const V_SPACING = 200;

export function computeLayout(data: DataState): LayoutMap {
  const parentsMap = new Map<string, Set<string>>();
  const childrenMap = new Map<string, Set<string>>();
  const spouseMap = new Map<string, Set<string>>();

  for (const rel of Object.values(data.relationships)) {
    if (rel.type === "parent") {
      if (!parentsMap.has(rel.to)) parentsMap.set(rel.to, new Set());
      parentsMap.get(rel.to)!.add(rel.from);
      if (!childrenMap.has(rel.from)) childrenMap.set(rel.from, new Set());
      childrenMap.get(rel.from)!.add(rel.to);
    } else if (rel.type === "spouse") {
      if (!spouseMap.has(rel.from)) spouseMap.set(rel.from, new Set());
      if (!spouseMap.has(rel.to)) spouseMap.set(rel.to, new Set());
      spouseMap.get(rel.from)!.add(rel.to);
      spouseMap.get(rel.to)!.add(rel.from);
    }
  }

  const memo = new Map<string, number>();
  const visiting = new Set<string>();

  const depthOf = (id: string): number => {
    if (memo.has(id)) return memo.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const parents = parentsMap.get(id);
    if (!parents || parents.size === 0) {
      memo.set(id, 0);
      visiting.delete(id);
      return 0;
    }
    let maxDepth = 0;
    for (const parentId of parents) {
      maxDepth = Math.max(maxDepth, depthOf(parentId) + 1);
    }
    memo.set(id, maxDepth);
    visiting.delete(id);
    return maxDepth;
  };

  const levels = new Map<number, string[]>();
  const peopleIds = Object.keys(data.people);
  if (peopleIds.length === 0) return {};

  for (const id of peopleIds) {
    const depth = depthOf(id);
    if (!levels.has(depth)) levels.set(depth, []);
    levels.get(depth)!.push(id);
  }

  // Group spouses together at each level
  const depths = Array.from(levels.keys()).sort((a, b) => a - b);
  const layout: LayoutMap = {};

  for (const depth of depths) {
    const ids = levels.get(depth)!;

    // Group spouses together
    const placed = new Set<string>();
    const groups: string[][] = [];

    for (const id of ids) {
      if (placed.has(id)) continue;
      const group = [id];
      placed.add(id);
      const spouses = spouseMap.get(id);
      if (spouses) {
        for (const spouseId of spouses) {
          if (!placed.has(spouseId) && ids.includes(spouseId)) {
            group.push(spouseId);
            placed.add(spouseId);
          }
        }
      }
      groups.push(group);
    }

    // Sort groups by first member's name
    groups.sort((a, b) => {
      const nameA = data.people[a[0]]?.name ?? "";
      const nameB = data.people[b[0]]?.name ?? "";
      return nameA.localeCompare(nameB);
    });

    // Position groups with spouse spacing
    const SPOUSE_GAP = 160;
    let cursor = 0;
    const groupWidths: number[] = [];

    for (const group of groups) {
      const width = (group.length - 1) * SPOUSE_GAP;
      groupWidths.push(width);
      cursor += width + H_SPACING;
    }

    const totalWidth = cursor - H_SPACING;
    let x = -totalWidth / 2;

    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];
      for (let mi = 0; mi < group.length; mi++) {
        layout[group[mi]] = {
          x: x + mi * SPOUSE_GAP,
          y: depth * V_SPACING
        };
      }
      x += groupWidths[gi] + H_SPACING;
    }
  }

  return layout;
}
