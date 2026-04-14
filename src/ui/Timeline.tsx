import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { useStore } from "../store";
import type { DataState, FamilyEvent, Person } from "../types";
import { EVENT_META } from "../eventMeta";
import { PhotoThumb } from "./PhotoThumb";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { PersonPicker, type PickerResult } from "./PersonPicker";
import { aliveAtYear, datasetYearBounds } from "../stats";
import { useFocusSet } from "./useFocusSet";
import { HISTORICAL_EVENTS } from "../historicalEvents";

// ─── Layout constants ────────────────────────────────
const LANE_H = 46;
const HEADER_H = 44;
const LEFT_PAD = 190;
const RIGHT_PAD = 40;
const MIN_PX_PER_YEAR = 4;
const DEFAULT_PX_PER_YEAR = 14;
const MAX_PX_PER_YEAR = 60;
const DOT_R = 9;

// ─── Helpers ─────────────────────────────────────────
type Lane = {
  person: Person;
  events: FamilyEvent[];
  firstYear: number | null;
  lastYear: number | null;
};

function buildLanes(data: DataState): Lane[] {
  const byPerson = new Map<string, FamilyEvent[]>();
  for (const ev of Object.values(data.events)) {
    for (const pid of ev.people) {
      if (!byPerson.has(pid)) byPerson.set(pid, []);
      byPerson.get(pid)!.push(ev);
    }
  }

  const lanes: Lane[] = [];
  for (const person of Object.values(data.people)) {
    const events = (byPerson.get(person.id) ?? [])
      .slice()
      .sort((a, b) => {
        const ka = a.date?.sortKey ?? Number.POSITIVE_INFINITY;
        const kb = b.date?.sortKey ?? Number.POSITIVE_INFINITY;
        return ka - kb;
      });

    const sortKeys = events
      .map((e) => e.date?.sortKey)
      .filter((k): k is number => typeof k === "number" && Number.isFinite(k));

    lanes.push({
      person,
      events,
      firstYear: sortKeys.length ? Math.min(...sortKeys) : null,
      lastYear: sortKeys.length ? Math.max(...sortKeys) : null
    });
  }

  lanes.sort((a, b) => {
    const fa = a.firstYear ?? Number.POSITIVE_INFINITY;
    const fb = b.firstYear ?? Number.POSITIVE_INFINITY;
    if (fa !== fb) return fa - fb;
    return a.person.name.localeCompare(b.person.name);
  });

  return lanes;
}

function computeBounds(lanes: Lane[]): { minYear: number; maxYear: number } {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const lane of lanes) {
    if (lane.firstYear != null) min = Math.min(min, lane.firstYear);
    if (lane.lastYear != null) max = Math.max(max, lane.lastYear);
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    const currentYear = new Date().getFullYear();
    return { minYear: currentYear - 100, maxYear: currentYear };
  }
  min = Math.floor((min - 5) / 10) * 10;
  max = Math.ceil((max + 5) / 10) * 10;
  if (max - min < 20) max = min + 20;
  return { minYear: min, maxYear: max };
}

function tickStep(totalYears: number, pxPerYear: number): number {
  const minPx = 70;
  const minYears = minPx / pxPerYear;
  const candidates = [1, 2, 5, 10, 20, 25, 50, 100, 200];
  for (const c of candidates) if (c >= minYears) return c;
  return Math.ceil(minYears / 100) * 100;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── Component ───────────────────────────────────────
export function Timeline() {
  const data = useStore((s) => s.data);
  const selectedPersonId = useStore((s) => s.selectedPersonId);
  const selectedEventId = useStore((s) => s.selectedEventId);
  const selectPerson = useStore((s) => s.selectPerson);
  const selectEvent = useStore((s) => s.selectEvent);
  const deletePerson = useStore((s) => s.deletePerson);
  const createRelative = useStore((s) => s.createRelative);
  const linkParent = useStore((s) => s.linkParent);
  const linkSpouse = useStore((s) => s.linkSpouse);
  const pushToast = useStore((s) => s.pushToast);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [pxPerYear, setPxPerYear] = useState(DEFAULT_PX_PER_YEAR);
  const [scrubberYear, setScrubberYear] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    personId: string;
  } | null>(null);
  const [picker, setPicker] = useState<{
    personId: string;
    relation: "parent" | "spouse" | "child";
  } | null>(null);

  const focusSet = useFocusSet();
  const lanes = useMemo(() => {
    const all = buildLanes(data);
    if (!focusSet) return all;
    return all.filter((l) => focusSet.has(l.person.id));
  }, [data, focusSet]);
  const { minYear, maxYear } = useMemo(() => computeBounds(lanes), [lanes]);
  const totalYears = maxYear - minYear;

  // Dataset bounds for the scrubber (may be tighter than lane bounds)
  const scrubberBounds = useMemo(() => {
    const b = datasetYearBounds(data);
    return b ?? { min: minYear, max: maxYear };
  }, [data, minYear, maxYear]);

  // Auto-fit
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || lanes.length === 0) return;
    const available = el.clientWidth - LEFT_PAD - RIGHT_PAD;
    if (available <= 0 || totalYears <= 0) return;
    const ideal = available / totalYears;
    const clamped = Math.max(MIN_PX_PER_YEAR, Math.min(MAX_PX_PER_YEAR, ideal));
    setPxPerYear(clamped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lanes.length, minYear, maxYear]);

  // ─── Scrubber keyboard control ───
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only when Timeline is the active view and focus isn't in an input
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.altKey || e.metaKey || e.ctrlKey) return;

      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (scrubberYear == null) return;
        e.preventDefault();
        const delta = e.shiftKey ? 10 : 1;
        const dir = e.key === "ArrowRight" ? 1 : -1;
        setScrubberYear((y) =>
          y == null
            ? null
            : Math.max(
                scrubberBounds.min,
                Math.min(scrubberBounds.max, y + dir * delta)
              )
        );
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [scrubberYear, scrubberBounds]);

  const yearToX = useCallback(
    (year: number) => LEFT_PAD + (year - minYear) * pxPerYear,
    [minYear, pxPerYear]
  );

  const contentWidth = LEFT_PAD + totalYears * pxPerYear + RIGHT_PAD;
  const contentHeight = HEADER_H + lanes.length * LANE_H + 40;

  const step = tickStep(totalYears, pxPerYear);
  const ticks: number[] = [];
  const firstTick = Math.ceil(minYear / step) * step;
  for (let y = firstTick; y <= maxYear; y += step) ticks.push(y);

  // Map person id to lane index for shared marriage events
  const laneIndexByPerson = useMemo(() => {
    const map = new Map<string, number>();
    lanes.forEach((lane, i) => map.set(lane.person.id, i));
    return map;
  }, [lanes]);

  // Shared marriage events: one connecting bar between both spouses' lanes
  type SharedMarriage = {
    ev: FamilyEvent;
    x: number;
    yTop: number;
    yBottom: number;
  };
  const sharedMarriages = useMemo(() => {
    const result: SharedMarriage[] = [];
    for (const ev of Object.values(data.events)) {
      if (ev.type !== "marriage") continue;
      if (!ev.date || Number.isNaN(ev.date.sortKey)) continue;
      if (ev.people.length < 2) continue;
      const laneIs = ev.people
        .map((pid) => laneIndexByPerson.get(pid))
        .filter((i): i is number => typeof i === "number");
      if (laneIs.length < 2) continue;
      const minI = Math.min(...laneIs);
      const maxI = Math.max(...laneIs);
      result.push({
        ev,
        x: yearToX(ev.date.sortKey),
        yTop: HEADER_H + minI * LANE_H + LANE_H / 2,
        yBottom: HEADER_H + maxI * LANE_H + LANE_H / 2
      });
    }
    return result;
  }, [data.events, laneIndexByPerson, yearToX]);

  // Ids of marriage events that have a shared bar — skip their per-lane dots
  const sharedMarriageIds = useMemo(
    () => new Set(sharedMarriages.map((m) => m.ev.id)),
    [sharedMarriages]
  );

  const handleWheelZoom = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mouseX = e.clientX - rect.left + el.scrollLeft;
    const yearAtMouse = (mouseX - LEFT_PAD) / pxPerYear + minYear;
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const nextPx = Math.max(
      MIN_PX_PER_YEAR,
      Math.min(MAX_PX_PER_YEAR, pxPerYear * factor)
    );
    setPxPerYear(nextPx);
    requestAnimationFrame(() => {
      if (!scrollRef.current) return;
      const newMouseX = LEFT_PAD + (yearAtMouse - minYear) * nextPx;
      scrollRef.current.scrollLeft = newMouseX - (e.clientX - rect.left);
    });
  };

  if (lanes.length === 0) {
    return (
      <div className="timeline-empty">
        <div className="empty-circle" />
        <h2>No events yet</h2>
        <p>Add a person on the left, then give them a birth date to start a timeline.</p>
      </div>
    );
  }

  const aliveCount =
    scrubberYear == null
      ? null
      : lanes.filter(
          (l) => aliveAtYear(data, l.person.id, scrubberYear) === "alive"
        ).length;

  return (
    <div className="timeline-wrap">
      <ScrubberBar
        bounds={scrubberBounds}
        year={scrubberYear}
        aliveCount={aliveCount}
        totalCount={lanes.length}
        onChange={setScrubberYear}
      />

      <div
        className="timeline"
        ref={scrollRef}
        onWheel={handleWheelZoom}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            selectPerson(null);
            selectEvent(null);
          }
        }}
      >
        <div
          className="timeline-canvas"
          style={{ width: contentWidth, height: contentHeight }}
        >
          {/* Year ticks */}
          <div className="timeline-header" style={{ height: HEADER_H }}>
            {ticks.map((year) => (
              <div
                key={year}
                className="timeline-tick"
                style={{ left: yearToX(year) }}
              >
                <div className="tick-line" />
                <span className="tick-label">{year}</span>
              </div>
            ))}
          </div>

          {/* Historical event bands — subtle color washes spanning the canvas.
              Sit behind everything else so lanes/events render on top. */}
          {HISTORICAL_EVENTS.filter((h) => {
            const end = h.year + (h.span ?? 0);
            return end >= minYear && h.year <= maxYear;
          }).map((h, i) => {
            const start = Math.max(h.year, minYear);
            const end = Math.min(h.year + (h.span ?? 0), maxYear);
            const x = yearToX(start);
            const width = Math.max(2, yearToX(end) - x + pxPerYear);
            return (
              <div
                key={`hist-${h.year}-${i}`}
                className={`timeline-hist-band cat-${h.category}`}
                style={{
                  left: x,
                  width,
                  top: HEADER_H,
                  height: lanes.length * LANE_H
                }}
                title={`${h.year}${h.span ? `–${h.year + h.span}` : ""} · ${h.title}`}
              />
            );
          })}

          {/* Scrubber vertical line across canvas */}
          {scrubberYear != null && (
            <div
              className="scrubber-line"
              style={{
                left: yearToX(scrubberYear),
                top: HEADER_H,
                height: lanes.length * LANE_H
              }}
            />
          )}

          {/* Lanes */}
          {lanes.map((lane, i) => {
            const y = HEADER_H + i * LANE_H;
            const isSelected = lane.person.id === selectedPersonId;
            const lifelineStart =
              lane.firstYear != null ? yearToX(lane.firstYear) : yearToX(minYear);
            const lifelineEnd =
              lane.lastYear != null ? yearToX(lane.lastYear) : lifelineStart;

            // Alive-at-year state for opacity
            const alive =
              scrubberYear == null
                ? "alive"
                : aliveAtYear(data, lane.person.id, scrubberYear);
            const laneClass =
              scrubberYear == null
                ? ""
                : alive === "alive"
                  ? "alive"
                  : alive === "unknown"
                    ? "alive"
                    : alive === "deceased"
                      ? "faded"
                      : "hidden";

            return (
              <div key={lane.person.id} className={`lane-group ${laneClass}`}>
                {/* Lane background */}
                <div
                  className={`lane-bg ${isSelected ? "selected" : ""}`}
                  style={{
                    top: y,
                    height: LANE_H,
                    width: contentWidth
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectPerson(lane.person.id);
                    selectEvent(null);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    selectPerson(lane.person.id);
                    setContextMenu({ x: e.clientX, y: e.clientY, personId: lane.person.id });
                  }}
                />

                {/* Person label (sticky left) */}
                <div
                  className={`lane-label ${isSelected ? "selected" : ""}`}
                  style={{ top: y, height: LANE_H }}
                  onClick={(e) => {
                    e.stopPropagation();
                    selectPerson(lane.person.id);
                    selectEvent(null);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    selectPerson(lane.person.id);
                    setContextMenu({ x: e.clientX, y: e.clientY, personId: lane.person.id });
                  }}
                >
                  <div className={`lane-avatar gender-${lane.person.gender}`}>
                    {lane.person.photo ? (
                      <PhotoThumb id={lane.person.photo} alt={lane.person.name} />
                    ) : (
                      initials(lane.person.name)
                    )}
                  </div>
                  <div className="lane-name-wrap">
                    <div className="lane-name">
                      {lane.person.name || "Unnamed"}
                      {scrubberYear != null && alive === "deceased" && (
                        <span className="lane-badge" title="Deceased by this year">✝</span>
                      )}
                    </div>
                    {lane.firstYear != null && (
                      <div className="lane-years">
                        {lane.firstYear}
                        {lane.lastYear != null && lane.lastYear !== lane.firstYear
                          ? ` – ${lane.lastYear}`
                          : ""}
                      </div>
                    )}
                  </div>
                </div>

                {/* Lifeline */}
                {lane.firstYear != null &&
                  lane.lastYear != null &&
                  lane.lastYear > lane.firstYear && (
                    <div
                      className="lifeline"
                      style={{
                        left: lifelineStart,
                        top: y + LANE_H / 2 - 1,
                        width: lifelineEnd - lifelineStart
                      }}
                    />
                  )}

                {/* Event dots (skip events that have shared bars) */}
                {lane.events.map((ev) => {
                  if (!ev.date || !Number.isFinite(ev.date.sortKey)) return null;
                  if (sharedMarriageIds.has(ev.id)) return null;
                  const x = yearToX(ev.date.sortKey);
                  const meta = EVENT_META[ev.type];
                  const isEvSelected = ev.id === selectedEventId;
                  return (
                    <button
                      key={ev.id + "@" + lane.person.id}
                      className={`event-dot ${isEvSelected ? "selected" : ""}`}
                      style={{
                        left: x - DOT_R,
                        top: y + LANE_H / 2 - DOT_R,
                        background: meta.color,
                        width: DOT_R * 2,
                        height: DOT_R * 2
                      }}
                      title={`${meta.label} — ${ev.date.display}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        selectEvent(ev.id);
                        selectPerson(lane.person.id);
                      }}
                    />
                  );
                })}
              </div>
            );
          })}

          {/* Shared marriage bars — drawn AFTER lanes so they overlay cleanly */}
          {sharedMarriages.map((m) => {
            const isSelected = m.ev.id === selectedEventId;
            return (
              <button
                key={`marriage-${m.ev.id}`}
                className={`marriage-bar ${isSelected ? "selected" : ""}`}
                style={{
                  left: m.x - 3,
                  top: m.yTop,
                  height: m.yBottom - m.yTop,
                  width: 6
                }}
                title={`Marriage — ${m.ev.date?.display ?? ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  selectEvent(m.ev.id);
                }}
              >
                <span
                  className="marriage-icon"
                  style={{
                    top: (m.yBottom - m.yTop) / 2 - 9
                  }}
                >
                  <svg viewBox="0 0 14 12" width="14" height="12">
                    <circle cx="4.5" cy="6" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
                    <circle cx="9.5" cy="6" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
                  </svg>
                </span>
              </button>
            );
          })}
        </div>

        {contextMenu &&
          (() => {
            const items: MenuItem[] = [
              {
                kind: "action",
                label: "Add parent…",
                onClick: () => {
                  setPicker({ personId: contextMenu.personId, relation: "parent" });
                }
              },
              {
                kind: "action",
                label: "Add spouse…",
                onClick: () => {
                  setPicker({ personId: contextMenu.personId, relation: "spouse" });
                }
              },
              {
                kind: "action",
                label: "Add child…",
                onClick: () => {
                  setPicker({ personId: contextMenu.personId, relation: "child" });
                }
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
    </div>
  );
}

// ─── Scrubber bar ───────────────────────────────────
function ScrubberBar({
  bounds,
  year,
  aliveCount,
  totalCount,
  onChange
}: {
  bounds: { min: number; max: number };
  year: number | null;
  aliveCount: number | null;
  totalCount: number;
  onChange: (year: number | null) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const range = Math.max(1, bounds.max - bounds.min);
  const progress = year == null ? 0 : ((year - bounds.min) / range) * 100;

  const yearFromX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return bounds.min;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(bounds.min + ratio * range);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    setDragging(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    onChange(yearFromX(e.clientX));
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    onChange(yearFromX(e.clientX));
  };
  const handlePointerUp = () => setDragging(false);

  return (
    <div className="scrubber">
      <div className="scrubber-display">
        <div className="scrubber-year">
          {year != null ? year : "All years"}
        </div>
        {year != null && aliveCount != null && (
          <div className="scrubber-meta">
            <strong>{aliveCount}</strong> of {totalCount} alive
          </div>
        )}
      </div>

      <div
        ref={trackRef}
        className="scrubber-track"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div className="scrubber-track-line" />
        <div className="scrubber-marker-min">{bounds.min}</div>
        <div className="scrubber-marker-max">{bounds.max}</div>
        {year != null && (
          <>
            <div
              className="scrubber-fill"
              style={{ width: `${progress}%` }}
            />
            <div
              className="scrubber-handle"
              style={{ left: `${progress}%` }}
            />
          </>
        )}
      </div>

      <div className="scrubber-actions">
        {year == null ? (
          <button
            className="ghost small"
            onClick={() => {
              const middle = Math.round((bounds.min + bounds.max) / 2);
              onChange(middle);
            }}
          >
            Scrub
          </button>
        ) : (
          <button className="ghost small" onClick={() => onChange(null)}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
