import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { computeTreeLayout, TREE_CONSTANTS } from "../treeLayout";
import type { TreeNode, TreeUnit } from "../treeLayout";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { PersonPicker, type PickerResult } from "./PersonPicker";
import { getPhotoUrl } from "../photos";
import { useFocusSet } from "./useFocusSet";

const { NODE_W, NODE_H, COUPLE_GAP } = TREE_CONSTANTS;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2.5;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function lifespan(birth: number | null, death: number | null): string {
  if (birth == null && death == null) return "";
  if (birth != null && death != null) return `${birth} – ${death}`;
  if (birth != null) return `b. ${birth}`;
  return `d. ${death}`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

// SVG can't directly render an <img> with clipping. We use <foreignObject>
// for HTML-based avatars (supports data URLs and object URLs from PhotoThumb).
function PhotoAvatar({
  id,
  x,
  y,
  size,
  gender
}: {
  id?: string;
  x: number;
  y: number;
  size: number;
  gender: "M" | "F" | "U";
}) {
  if (!id) return null;
  const isUrl = id.startsWith("data:") || id.startsWith("http") || id.startsWith("blob:");
  return (
    <foreignObject x={x} y={y} width={size} height={size}>
      <div
        className={`tree-photo gender-${gender}`}
        style={{ width: size, height: size }}
      >
        {isUrl ? (
          <img src={id} alt="" draggable={false} />
        ) : (
          <PhotoAvatarLazy id={id} />
        )}
      </div>
    </foreignObject>
  );
}

// Tiny wrapper to lazy-load blob photos from IndexedDB
function PhotoAvatarLazy({ id }: { id: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getPhotoUrl(id).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);
  if (!src) return null;
  return <img src={src} alt="" draggable={false} />;
}

export function TreeView() {
  const data = useStore((s) => s.data);
  const selectedPersonId = useStore((s) => s.selectedPersonId);
  const selectPerson = useStore((s) => s.selectPerson);
  const selectEvent = useStore((s) => s.selectEvent);
  const deletePerson = useStore((s) => s.deletePerson);
  const createRelative = useStore((s) => s.createRelative);
  const linkParent = useStore((s) => s.linkParent);
  const linkSpouse = useStore((s) => s.linkSpouse);
  const pushToast = useStore((s) => s.pushToast);

  const focusSet = useFocusSet();

  // When focus is active, compute the layout on a reduced dataset
  const layout = useMemo(() => {
    if (!focusSet) return computeTreeLayout(data);
    const filteredPeople = Object.fromEntries(
      Object.entries(data.people).filter(([id]) => focusSet.has(id))
    );
    const filteredEvents = Object.fromEntries(
      Object.entries(data.events).filter(
        ([, ev]) => ev.people.length === 0 || ev.people.every((pid) => focusSet.has(pid))
      )
    );
    return computeTreeLayout({
      ...data,
      people: filteredPeople,
      events: filteredEvents
    });
  }, [data, focusSet]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [pan, setPan] = useState<
    null | { sx: number; sy: number; bx: number; by: number }
  >(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    personId: string;
  } | null>(null);
  const [picker, setPicker] = useState<{
    personId: string;
    relation: "parent" | "spouse" | "child";
  } | null>(null);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const u = () => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    };
    u();
    const obs = new ResizeObserver(u);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Fit to content when layout changes
  useEffect(() => {
    if (size.w === 0 || layout.nodes.length === 0) return;
    const pad = 80;
    const w = layout.bounds.maxX - layout.bounds.minX + pad * 2;
    const h = layout.bounds.maxY - layout.bounds.minY + pad * 2;
    if (w === 0 || h === 0) return;
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(size.w / w, size.h / h)));
    const cx = (layout.bounds.minX + layout.bounds.maxX) / 2;
    const cy = (layout.bounds.minY + layout.bounds.maxY) / 2;
    setView({
      x: size.w / 2 - cx * zoom,
      y: size.h / 2 - cy * zoom,
      zoom
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.nodes.length, size.w, size.h]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const wx = (cx - view.x) / view.zoom;
    const wy = (cy - view.y) / view.zoom;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const nz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, view.zoom * factor));
    setView({ x: cx - wx * nz, y: cy - wy * nz, zoom: nz });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    // Prevent browser's native SVG drag and capture the pointer so
    // move/up events keep firing even when the cursor leaves the container.
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setPan({ sx: e.clientX, sy: e.clientY, bx: view.x, by: view.y });
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!pan) return;
    e.preventDefault();
    setView((v) => ({
      ...v,
      x: pan.bx + (e.clientX - pan.sx),
      y: pan.by + (e.clientY - pan.sy)
    }));
  };
  const handlePointerUp = () => setPan(null);

  // Edge paths — orthogonal with rounded elbows
  const parentPath = (parent: TreeNode, child: TreeNode) => {
    const x1 = parent.x;
    const y1 = parent.y + NODE_H / 2;
    const x2 = child.x;
    const y2 = child.y - NODE_H / 2;
    const midY = (y1 + y2) / 2;
    const r = Math.min(14, Math.abs(y2 - y1) / 4, Math.abs(x2 - x1) / 2 || 14);
    if (Math.abs(x1 - x2) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;
    const dir = x2 > x1 ? 1 : -1;
    return `M ${x1} ${y1} L ${x1} ${midY - r} Q ${x1} ${midY} ${x1 + dir * r} ${midY} L ${x2 - dir * r} ${midY} Q ${x2} ${midY} ${x2} ${midY + r} L ${x2} ${y2}`;
  };

  const nodeById = useMemo(
    () => new Map(layout.nodes.map((n) => [n.id, n])),
    [layout.nodes]
  );

  const parentEdges = layout.edges.filter((e) => e.type === "parent");

  // Parent edges: when a child has 2 parents in the SAME couple unit,
  // we only draw ONE line (from the midpoint between the couple).
  // Otherwise we draw individual lines.
  type RenderedEdge =
    | { kind: "single"; parent: TreeNode; child: TreeNode }
    | { kind: "couple"; parentA: TreeNode; parentB: TreeNode; child: TreeNode };

  const renderedEdges = useMemo<RenderedEdge[]>(() => {
    const byChild = new Map<string, string[]>();
    for (const e of parentEdges) {
      if (e.type !== "parent") continue;
      if (!byChild.has(e.to)) byChild.set(e.to, []);
      byChild.get(e.to)!.push(e.from);
    }
    const result: RenderedEdge[] = [];
    for (const [childId, parentIds] of byChild) {
      const child = nodeById.get(childId);
      if (!child) continue;
      if (parentIds.length === 2) {
        const [a, b] = parentIds;
        const nodeA = nodeById.get(a);
        const nodeB = nodeById.get(b);
        if (nodeA && nodeB && nodeA.unitId === nodeB.unitId) {
          result.push({ kind: "couple", parentA: nodeA, parentB: nodeB, child });
          continue;
        }
      }
      for (const pid of parentIds) {
        const parent = nodeById.get(pid);
        if (parent) result.push({ kind: "single", parent, child });
      }
    }
    return result;
  }, [parentEdges, nodeById]);

  if (layout.nodes.length === 0) {
    return (
      <div className="tree-empty">
        <div className="empty-tree-icon">
          <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
            <circle cx="30" cy="30" r="14" stroke="var(--accent)" strokeWidth="2" fill="var(--accent-soft)" />
            <circle cx="70" cy="30" r="14" stroke="var(--accent)" strokeWidth="2" fill="var(--accent-soft)" />
            <line x1="30" y1="44" x2="30" y2="56" stroke="var(--border-strong)" strokeWidth="2" />
            <line x1="70" y1="44" x2="70" y2="56" stroke="var(--border-strong)" strokeWidth="2" />
            <line x1="30" y1="56" x2="70" y2="56" stroke="var(--border-strong)" strokeWidth="2" />
            <line x1="50" y1="56" x2="50" y2="68" stroke="var(--border-strong)" strokeWidth="2" />
            <circle cx="50" cy="80" r="12" stroke="var(--accent-teal)" strokeWidth="2" fill="var(--accent-teal-soft)" />
          </svg>
        </div>
        <h2>No tree yet</h2>
        <p>Add people and connect them with birth or marriage events.</p>
      </div>
    );
  }

  return (
    <div
      className="tree-view"
      ref={containerRef}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          selectPerson(null);
          selectEvent(null);
        }
      }}
    >
      <svg width="100%" height="100%" style={{ display: "block" }}>
        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          {/* Couple background boxes — drawn BEFORE nodes so they sit below */}
          {layout.units
            .filter((u) => u.members.length === 2)
            .map((u) => (
              <CoupleBackground key={u.id} unit={u} />
            ))}

          {/* Parent edges */}
          {renderedEdges.map((e, i) => {
            if (e.kind === "single") {
              return (
                <path
                  key={`p-${i}`}
                  d={parentPath(e.parent, e.child)}
                  className="tree-edge parent"
                  fill="none"
                />
              );
            }
            // Couple edge — single line from the couple midpoint down
            const midParent: TreeNode = {
              ...e.parentA,
              x: (e.parentA.x + e.parentB.x) / 2
            };
            return (
              <path
                key={`pc-${i}`}
                d={parentPath(midParent, e.child)}
                className="tree-edge parent"
                fill="none"
              />
            );
          })}

          {/* Nodes */}
          {layout.nodes.map((n) => {
            const isSel = n.id === selectedPersonId;
            return (
              <g
                key={n.id}
                transform={`translate(${n.x - NODE_W / 2} ${n.y - NODE_H / 2})`}
                className={`tree-node ${isSel ? "selected" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  selectPerson(n.id);
                  selectEvent(null);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  selectPerson(n.id);
                  setContextMenu({ x: e.clientX, y: e.clientY, personId: n.id });
                }}
              >
                {/* Card background */}
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={16}
                  className="tree-node-rect"
                />

                {/* Top gender stripe */}
                <rect
                  x={0}
                  y={0}
                  width={NODE_W}
                  height={5}
                  className={`tree-node-stripe gender-${n.person.gender}`}
                />

                {/* Avatar circle */}
                <circle
                  cx={NODE_W / 2}
                  cy={38}
                  r={24}
                  className={`tree-avatar gender-${n.person.gender}`}
                />
                {n.person.photo ? (
                  <PhotoAvatar
                    id={n.person.photo}
                    x={NODE_W / 2 - 24}
                    y={14}
                    size={48}
                    gender={n.person.gender}
                  />
                ) : (
                  <text
                    x={NODE_W / 2}
                    y={44}
                    textAnchor="middle"
                    className="tree-avatar-initials"
                  >
                    {initials(n.person.name)}
                  </text>
                )}

                {/* Name */}
                <text
                  x={NODE_W / 2}
                  y={82}
                  textAnchor="middle"
                  className="tree-node-name"
                >
                  {truncate(n.person.name || "Unnamed", 20)}
                </text>

                {/* Lifespan */}
                <text
                  x={NODE_W / 2}
                  y={99}
                  textAnchor="middle"
                  className="tree-node-dates"
                >
                  {lifespan(n.birthYear, n.deathYear) || "—"}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {contextMenu &&
        (() => {
          const items: MenuItem[] = [
            {
              kind: "action",
              label: "Add parent…",
              onClick: () => setPicker({ personId: contextMenu.personId, relation: "parent" })
            },
            {
              kind: "action",
              label: "Add spouse…",
              onClick: () => setPicker({ personId: contextMenu.personId, relation: "spouse" })
            },
            {
              kind: "action",
              label: "Add child…",
              onClick: () => setPicker({ personId: contextMenu.personId, relation: "child" })
            },
            { kind: "separator" },
            {
              kind: "action",
              label: "Delete person",
              danger: true,
              onClick: () => {
                const p = data.people[contextMenu.personId];
                if (p && window.confirm(`Delete ${p.name}?`)) {
                  deletePerson(contextMenu.personId);
                  pushToast("Person deleted.", "info");
                }
              }
            }
          ];
          return (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              items={items}
              onClose={() => setContextMenu(null)}
            />
          );
        })()}

      {picker &&
        (() => {
          const anchor = data.people[picker.personId];
          if (!anchor) return null;
          const title =
            picker.relation === "parent"
              ? `Add parent of ${anchor.name}`
              : picker.relation === "spouse"
                ? `Add spouse of ${anchor.name}`
                : `Add child of ${anchor.name}`;
          const handlePick = (result: PickerResult) => {
            if (result.kind === "new") {
              const res = createRelative(picker.personId, picker.relation, {
                name: result.name,
                gender: result.gender
              });
              if (!res.ok) pushToast(res.reason, "error");
              else {
                let msg = `Added ${result.name}.`;
                if (res.autoLinkedParent) {
                  const p = data.people[res.autoLinkedParent];
                  if (p) msg += ` ${p.name} auto-linked as second parent.`;
                }
                pushToast(msg, "success");
              }
            } else {
              let res;
              if (picker.relation === "parent")
                res = linkParent(picker.personId, result.person.id);
              else if (picker.relation === "spouse")
                res = linkSpouse(picker.personId, result.person.id);
              else res = linkParent(result.person.id, picker.personId);
              if (!res.ok) pushToast(res.reason, "error");
              else pushToast(`Linked ${result.person.name}.`, "success");
            }
            setPicker(null);
            setContextMenu(null);
          };
          return (
            <PersonPicker
              title={title}
              excludeIds={new Set([picker.personId])}
              onPick={handlePick}
              onCancel={() => setPicker(null)}
            />
          );
        })()}
    </div>
  );
}

// ─── Couple background box ─────────────────────────
function CoupleBackground({ unit }: { unit: TreeUnit }) {
  const x = unit.centerX - unit.width / 2;
  const y = unit.y - NODE_H / 2;
  const padding = 8;
  return (
    <rect
      x={x - padding}
      y={y - padding}
      width={unit.width + padding * 2}
      height={NODE_H + padding * 2}
      rx={22}
      className="tree-couple-bg"
    />
  );
}
