import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Person, Relationship } from "../types";
import { useStore } from "../store";
import { getGenerationDepth } from "../utils/insights";
import { Minimap } from "./Minimap";

const NODE_W = 220;
const NODE_H = 110;
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 3;
const OVERSCAN = 350;

const GEN_COLORS = [
  "#5b8cc9", "#6aad80", "#c9944a", "#c96868", "#9a74b8", "#5aadca",
  "#7a9e5a", "#c97a9a", "#8a8ac0", "#c9a060"
];

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type ViewState = { x: number; y: number; zoom: number };
type PanState = { sx: number; sy: number; bx: number; by: number };
type DragState = {
  ax: number; ay: number;
  targets: { id: string; sx: number; sy: number }[];
  cx: number; cy: number;
  started: boolean;
};

export function Canvas({
  people, relationships, searchMatchIds
}: {
  people: Record<string, Person>;
  relationships: Relationship[];
  searchMatchIds: Set<string>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<ViewState>({ x: 0, y: 80, zoom: 1 });
  const [pan, setPan] = useState<PanState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [fitReq, setFitReq] = useState(0);

  const selectedIds = useStore((s) => s.selectedIds);
  const linkMode = useStore((s) => s.linkMode);
  const data = useStore((s) => s.data);
  const {
    selectOnly, selectToggle, clearSelection,
    setLinkMode, setStatusMessage,
    movePerson, beginMove, endMove,
    setContextMenu, selectPerson
  } = useStore();
  const tryLink = useStore((s) => s.tryLink);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const personList = useMemo(() => Object.values(people), [people]);
  const genDepths = useMemo(() => getGenerationDepth(data), [data]);

  const viewport = useMemo(() => ({
    x: -view.x / view.zoom, y: -view.y / view.zoom,
    w: size.w / view.zoom, h: size.h / view.zoom
  }), [view, size]);

  const visiblePeople = useMemo(() => {
    const p = OVERSCAN;
    return personList.filter(
      (n) => n.x >= viewport.x - p && n.x <= viewport.x + viewport.w + p &&
             n.y >= viewport.y - p && n.y <= viewport.y + viewport.h + p
    );
  }, [personList, viewport]);

  const visibleLinks = useMemo(() => {
    const p = OVERSCAN;
    return relationships.filter((rel) => {
      const f = people[rel.from], t = people[rel.to];
      if (!f || !t) return false;
      return Math.max(f.x, t.x) >= viewport.x - p && Math.min(f.x, t.x) <= viewport.x + viewport.w + p &&
             Math.max(f.y, t.y) >= viewport.y - p && Math.min(f.y, t.y) <= viewport.y + viewport.h + p;
    });
  }, [people, relationships, viewport]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const u = () => { const r = el.getBoundingClientRect(); setSize({ w: r.width, h: r.height }); };
    u();
    const obs = new ResizeObserver(u);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const fitView = useCallback(() => {
    if (personList.length === 0 || size.w === 0) return;
    const pad = 140;
    const xs = personList.map((p) => p.x), ys = personList.map((p) => p.y);
    const minX = Math.min(...xs) - NODE_W / 2 - pad, maxX = Math.max(...xs) + NODE_W / 2 + pad;
    const minY = Math.min(...ys) - NODE_H / 2 - pad, maxY = Math.max(...ys) + NODE_H / 2 + pad;
    const w = maxX - minX, h = maxY - minY;
    if (w <= 0 || h <= 0) return;
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(size.w / w, size.h / h)));
    setView({ x: size.w / 2 - (minX + w / 2) * zoom, y: size.h / 2 - (minY + h / 2) * zoom, zoom });
  }, [personList, size]);

  useEffect(() => { if (fitReq > 0) fitView(); }, [fitReq, fitView]);

  useEffect(() => {
    const h = () => setFitReq((n) => n + 1);
    window.addEventListener("familialens:fit", h);
    return () => window.removeEventListener("familialens:fit", h);
  }, []);

  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d?.targetId) return;
      const p = people[d.targetId];
      if (!p) return;
      setView((prev) => ({ ...prev, x: size.w / 2 - p.x * prev.zoom, y: size.h / 2 - p.y * prev.zoom }));
    };
    window.addEventListener("familialens:focus", h);
    return () => window.removeEventListener("familialens:focus", h);
  }, [people, size]);

  useEffect(() => {
    const h = (e: Event) => {
      const dir = (e as CustomEvent).detail?.direction ?? 1;
      const factor = dir > 0 ? 1.15 : 0.85;
      setView((prev) => {
        const cx = size.w / 2, cy = size.h / 2;
        const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev.zoom * factor));
        return { x: cx - ((cx - prev.x) / prev.zoom) * nz, y: cy - ((cy - prev.y) / prev.zoom) * nz, zoom: nz };
      });
    };
    window.addEventListener("familialens:zoom", h);
    return () => window.removeEventListener("familialens:zoom", h);
  }, [size]);

  const screenToWorld = (cx: number, cy: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: cx, y: cy };
    return { x: (cx - rect.left - view.x) / view.zoom, y: (cy - rect.top - view.y) / view.zoom };
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const wx = (cx - view.x) / view.zoom, wy = (cy - view.y) / view.zoom;
    const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    setView({ x: cx - wx * nz, y: cy - wy * nz, zoom: nz });
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || drag) return;
    setPan({ sx: e.clientX, sy: e.clientY, bx: view.x, by: view.y });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (drag) {
      const dist = Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy);
      let started = drag.started;
      if (!started && dist > 3) { beginMove(); started = true; setDrag({ ...drag, started: true }); }
      if (started) {
        const world = screenToWorld(e.clientX, e.clientY);
        drag.targets.forEach((t) => movePerson(t.id, t.sx + world.x - drag.ax, t.sy + world.y - drag.ay));
      }
      return;
    }
    if (!pan) return;
    setView((prev) => ({ ...prev, x: pan.bx + (e.clientX - pan.sx), y: pan.by + (e.clientY - pan.sy) }));
  };

  const handlePointerUp = () => {
    if (drag) { if (drag.started) endMove(); setDrag(null); }
    if (pan) setPan(null);
  };

  const handleBgClick = () => {
    if (linkMode.type) { setLinkMode(null, null); setStatusMessage("Link cancelled."); }
    clearSelection();
    setContextMenu(null);
  };

  const handleNodeDown = (e: React.PointerEvent, person: Person) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    if (linkMode.type) { handleLinkClick(person.id); return; }
    const multi = e.shiftKey || e.metaKey || e.ctrlKey;
    if (multi) { selectToggle(person.id); return; }
    if (!selectedSet.has(person.id)) selectOnly(person.id);
    const targetIds = selectedSet.has(person.id) && selectedIds.length > 1 ? selectedIds : [person.id];
    const targets = targetIds.map((id) => people[id]).filter(Boolean).map((p) => ({ id: p.id, sx: p.x, sy: p.y }));
    const world = screenToWorld(e.clientX, e.clientY);
    setDrag({ ax: world.x, ay: world.y, targets, cx: e.clientX, cy: e.clientY, started: false });
  };

  const handleNodeContext = (e: React.MouseEvent, person: Person) => {
    e.preventDefault(); e.stopPropagation();
    selectOnly(person.id);
    setContextMenu({ x: e.clientX, y: e.clientY, targetId: person.id });
  };

  const handleLinkClick = (id: string) => {
    if (!linkMode.type) return;
    if (!linkMode.sourceId) {
      setLinkMode(linkMode.type, id); selectPerson(id);
      setStatusMessage("Now click the second person."); return;
    }
    if (linkMode.sourceId === id) { setStatusMessage("Pick a different person."); return; }
    const result = tryLink(linkMode.type, linkMode.sourceId, id);
    setStatusMessage(result.ok ? "Link created." : (result as { reason: string }).reason);
    setLinkMode(null, null); selectOnly(id);
  };

  // ─── Edge paths ───
  const parentEdge = (from: Person, to: Person) => {
    const x1 = from.x, y1 = from.y + NODE_H / 2;
    const x2 = to.x, y2 = to.y - NODE_H / 2;
    const midY = (y1 + y2) / 2;
    const r = Math.min(14, Math.abs(y2 - y1) / 4, Math.abs(x2 - x1) / 2 || 14);
    if (Math.abs(x1 - x2) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;
    const dir = x2 > x1 ? 1 : -1;
    return `M ${x1} ${y1} L ${x1} ${midY - r} Q ${x1} ${midY} ${x1 + dir * r} ${midY} L ${x2 - dir * r} ${midY} Q ${x2} ${midY} ${x2} ${midY + r} L ${x2} ${y2}`;
  };

  const spouseEdge = (a: Person, b: Person) => {
    const left = a.x < b.x ? a : b, right = a.x < b.x ? b : a;
    return `M ${left.x + NODE_W / 2 - 10} ${left.y} L ${right.x - NODE_W / 2 + 10} ${right.y}`;
  };

  const isAlive = (p: Person) => !p.deathDate?.trim();

  return (
    <div className="canvas-container" ref={containerRef}
      onWheel={handleWheel} onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp} onClick={handleBgClick}>

      <div className="canvas-texture" />

      {/* Empty state */}
      {personList.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">
            <svg width="120" height="130" viewBox="0 0 120 130" fill="none">
              {/* trunk */}
              <path d="M 60 130 L 60 70" stroke="var(--edge-trunk)" strokeWidth="4" strokeLinecap="round" />
              {/* branches */}
              <path d="M 60 70 Q 60 55 35 45" stroke="var(--edge-trunk)" strokeWidth="3" strokeLinecap="round" fill="none" />
              <path d="M 60 70 Q 60 55 85 45" stroke="var(--edge-trunk)" strokeWidth="3" strokeLinecap="round" fill="none" />
              <path d="M 60 85 Q 60 75 30 72" stroke="var(--edge-trunk)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              <path d="M 60 85 Q 60 75 90 72" stroke="var(--edge-trunk)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
              {/* leaves / people */}
              <circle cx="35" cy="40" r="14" fill="var(--node-male)" opacity="0.7" />
              <circle cx="85" cy="40" r="14" fill="var(--node-female)" opacity="0.7" />
              <circle cx="60" cy="18" r="12" fill="var(--accent)" opacity="0.6" />
              <circle cx="25" cy="68" r="10" fill="var(--gen-2)" opacity="0.5" />
              <circle cx="95" cy="68" r="10" fill="var(--gen-3)" opacity="0.5" />
            </svg>
          </div>
          <h2 className="empty-title">Your family story starts here</h2>
          <p className="empty-sub">Press <kbd>N</kbd> to add the first person, or import a GEDCOM file.</p>
        </div>
      )}

      {/* Overlays */}
      <div className="canvas-overlay canvas-overlay-tl">
        <div className="canvas-chip">{Math.round(view.zoom * 100)}%</div>
        <div className="canvas-chip">{visiblePeople.length}/{personList.length}</div>
        {selectedIds.length > 1 && <div className="canvas-chip accent">{selectedIds.length} selected</div>}
      </div>

      <div className="canvas-overlay canvas-overlay-bl">
        {linkMode.type ? (
          <div className="canvas-hint active">
            {linkMode.sourceId ? `Click second person for ${linkMode.type} link` : `Click first person for ${linkMode.type} link`}
          </div>
        ) : (
          <div className="canvas-hint">Shift+click multi-select &middot; Right-click for menu &middot; Scroll to zoom</div>
        )}
      </div>

      {/* World */}
      <div className="canvas-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        <svg className="edge-layer">
          <defs>
            <filter id="edge-glow">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Draw edges */}
          {visibleLinks.map((rel) => {
            const from = people[rel.from], to = people[rel.to];
            if (!from || !to) return null;

            if (rel.type === "spouse") {
              const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
              return (
                <g key={rel.id} className="edge-group spouse-edge">
                  <path className="edge-path spouse" d={spouseEdge(from, to)} />
                  {/* heart-shaped connector */}
                  <g transform={`translate(${mx}, ${my})`}>
                    <circle r="8" className="spouse-ring" />
                    <path d="M 0 2 C -3 -2 -6 -4 -6 -6 C -6 -8 -4 -9 -2 -8 L 0 -5 L 2 -8 C 4 -9 6 -8 6 -6 C 6 -4 3 -2 0 2 Z"
                      className="spouse-heart" transform="scale(0.7)" />
                  </g>
                </g>
              );
            }

            return (
              <g key={rel.id} className="edge-group parent-edge">
                {/* Shadow line for depth */}
                <path className="edge-shadow" d={parentEdge(from, to)} />
                {/* Main line */}
                <path className="edge-path parent" d={parentEdge(from, to)} />
                {/* Connection dot at child */}
                <circle cx={to.x} cy={to.y - NODE_H / 2} r="4" className="conn-dot" />
                {/* Connection dot at parent */}
                <circle cx={from.x} cy={from.y + NODE_H / 2} r="3" className="conn-dot-sm" />
              </g>
            );
          })}
        </svg>

        {/* Nodes */}
        {visiblePeople.map((person) => {
          const sel = selectedSet.has(person.id);
          const src = linkMode.sourceId === person.id;
          const match = searchMatchIds.has(person.id);
          const gen = genDepths.get(person.id) ?? 0;
          const genColor = GEN_COLORS[gen % GEN_COLORS.length];
          const alive = isAlive(person);
          const years = [person.birthDate, person.deathDate].filter(Boolean).join(" \u2013 ");
          const place = person.birthPlace || person.deathPlace || "";

          const genderColor = person.gender === "M" ? "var(--node-male)"
            : person.gender === "F" ? "var(--node-female)" : "var(--node-unknown)";

          return (
            <div key={person.id}
              className={`tree-node${sel ? " selected" : ""}${src ? " link-source" : ""}${match ? " search-match" : ""}${!alive ? " deceased" : ""}`}
              style={{ transform: `translate(${person.x}px, ${person.y}px)` }}
              onPointerDown={(e) => handleNodeDown(e, person)}
              onContextMenu={(e) => handleNodeContext(e, person)}
              onClick={(e) => e.stopPropagation()}>

              {/* Generation color accent */}
              <div className="node-accent" style={{ background: genColor }} />

              {/* Avatar with ring */}
              <div className="node-avatar-wrap">
                <div className="node-avatar-ring" style={{ borderColor: genderColor }}>
                  <div className="node-avatar" style={!person.photo ? { background: genderColor } : undefined}>
                    {person.photo
                      ? <img src={person.photo} alt="" />
                      : <span className="node-initials">{getInitials(person.name)}</span>}
                  </div>
                </div>
                {alive && <div className="node-alive-dot" />}
              </div>

              {/* Info */}
              <div className="node-body">
                <span className="node-name">{person.name || "Unnamed"}</span>
                <span className="node-dates">{years || "No dates"}</span>
                {place && <span className="node-place">{place}</span>}
              </div>

              {person.pinned && <div className="node-pin" title="Pinned" />}
            </div>
          );
        })}
      </div>

      <Minimap people={personList} view={view} containerSize={size} genDepths={genDepths}
        onNavigate={(wx, wy) => setView((prev) => ({ ...prev, x: size.w / 2 - wx * prev.zoom, y: size.h / 2 - wy * prev.zoom }))} />
    </div>
  );
}
