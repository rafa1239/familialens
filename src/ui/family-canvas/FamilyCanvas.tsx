import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent
} from "react";
import { useStore } from "../../store";
import { computeTreeLayout } from "../../treeLayout";
import { ContextMenu, type MenuItem } from "../ContextMenu";
import { PersonPicker, type PickerResult } from "../PersonPicker";
import { useFocusSet } from "../useFocusSet";
import {
  buildCanvasModel,
  buildPersonInsight,
  CANVAS_NODE_HEIGHT,
  CANVAS_NODE_WIDTH,
  filterDataForFocus,
  hasFreeCanvasPositions,
  kinshipRoleFor,
  type FamilyCanvasNode,
  type FamilyCoupleUnit,
  type FreeCanvasPositions,
  type KinshipRole,
  type RenderedParentEdge
} from "./canvasModel";
import { FamilyCanvasHud } from "./FamilyCanvasHud";
import { FamilyCanvasMiniMap } from "./FamilyCanvasMiniMap";
import { FamilyCanvasNodeView } from "./FamilyCanvasNode";
import {
  nodeIntersectsBounds,
  pointInsideBounds,
  useCanvasViewport,
  worldRectFromView,
  zoomAt,
  type CanvasSize,
  type CanvasView
} from "./useCanvasViewport";
import { useFreeCanvasPositions } from "./useFreeCanvasPositions";

type Relation = "parent" | "spouse" | "child";
type PanState = {
  pointerId: number;
  startX: number;
  startY: number;
  baseX: number;
  baseY: number;
};
type NodeDragState = {
  pointerId: number;
  personId: string;
  startX: number;
  startY: number;
  baseX: number;
  baseY: number;
};

const EDGE_OVERSCAN = 360;
const NODE_OVERSCAN = 280;

export function FamilyCanvas() {
  const data = useStore((state) => state.data);
  const selectedPersonId = useStore((state) => state.selectedPersonId);
  const focusMode = useStore((state) => state.focusMode);
  const selectPerson = useStore((state) => state.selectPerson);
  const selectEvent = useStore((state) => state.selectEvent);
  const addPerson = useStore((state) => state.addPerson);
  const deletePerson = useStore((state) => state.deletePerson);
  const createRelative = useStore((state) => state.createRelative);
  const linkParent = useStore((state) => state.linkParent);
  const linkSpouse = useStore((state) => state.linkSpouse);
  const addEvent = useStore((state) => state.addEvent);
  const loadDemo = useStore((state) => state.loadDemo);
  const pushToast = useStore((state) => state.pushToast);
  const setViewMode = useStore((state) => state.setViewMode);
  const setFocusMode = useStore((state) => state.setFocusMode);

  const focusSet = useFocusSet();
  const {
    positions: freePositions,
    setPersonPosition,
    releasePersonPosition,
    clearPositions
  } = useFreeCanvasPositions(data);
  const [draftPositions, setDraftPositions] = useState<FreeCanvasPositions>({});
  const displayPositions = useMemo(
    () => ({ ...freePositions, ...draftPositions }),
    [draftPositions, freePositions]
  );
  const hasFreeLayout = hasFreeCanvasPositions(displayPositions);
  const layoutData = useMemo(() => filterDataForFocus(data, focusSet), [data, focusSet]);
  const layout = useMemo(() => computeTreeLayout(layoutData), [layoutData]);
  const model = useMemo(
    () => buildCanvasModel(data, layout, displayPositions),
    [data, displayPositions, layout]
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const pendingViewRef = useRef<CanvasView | null>(null);
  const pendingDraftRef = useRef<{
    personId: string;
    x: number;
    y: number;
  } | null>(null);
  const lastDraftRef = useRef<{
    personId: string;
    x: number;
    y: number;
  } | null>(null);
  const panMovedRef = useRef(false);
  const nodeDragMovedRef = useRef(false);
  const suppressClickRef = useRef(false);
  const [size, setSize] = useState<CanvasSize>({ width: 0, height: 0 });
  const [pan, setPan] = useState<PanState | null>(null);
  const [nodeDrag, setNodeDrag] = useState<NodeDragState | null>(null);
  const [isZooming, setIsZooming] = useState(false);
  const [frameRate, setFrameRate] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    personId: string;
  } | null>(null);
  const [picker, setPicker] = useState<{ personId: string; relation: Relation } | null>(null);
  const { view, setView, zoomAtPoint, fitToBounds, centerOnPoint } = useCanvasViewport();
  const viewRef = useRef<CanvasView>(view);
  const zoomingRef = useRef(false);
  const zoomEndTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    if (!shouldShowPerfMeter()) return;
    let frame = 0;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      frame += 1;
      const elapsed = now - last;
      if (elapsed >= 500) {
        setFrameRate(Math.round((frame * 1000) / elapsed));
        frame = 0;
        last = now;
      }
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  const scheduleInteractionFrame = () => {
    if (rafRef.current != null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const nextView = pendingViewRef.current;
      const nextDraft = pendingDraftRef.current;
      pendingViewRef.current = null;
      pendingDraftRef.current = null;

      if (nextView) {
        viewRef.current = nextView;
        setView(nextView);
      }
      if (nextDraft) {
        setDraftPositions((current) => ({
          ...current,
          [nextDraft.personId]: {
            x: nextDraft.x,
            y: nextDraft.y,
            pinned: true
          }
        }));
      }
    });
  };

  useEffect(() => {
    return () => {
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
      if (zoomEndTimeoutRef.current != null) window.clearTimeout(zoomEndTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fitKey = `${layout.nodes.length}:${layout.bounds.minX}:${layout.bounds.maxX}:${layout.bounds.minY}:${layout.bounds.maxY}:${focusMode}`;
  useEffect(() => {
    if (model.nodes.length === 0 || size.width <= 0 || size.height <= 0) return;
    if (hasFreeLayout) return;
    fitToBounds(layout.bounds, size, 130);
  }, [fitKey, fitToBounds, hasFreeLayout, layout.bounds, model.nodes.length, size.height, size.width]);

  useEffect(() => {
    if (!selectedPersonId || size.width <= 0 || size.height <= 0) return;
    if (nodeDrag) return;
    const node = model.nodeById.get(selectedPersonId);
    if (!node) return;
    const rect = worldRectFromView(view, size);
    if (!pointInsideBounds({ x: node.x, y: node.y }, rect, 120)) {
      centerOnPoint({ x: node.x, y: node.y }, size);
    }
  }, [centerOnPoint, model.nodeById, nodeDrag, selectedPersonId, size, view]);

  const visibleRect = useMemo(() => worldRectFromView(view, size), [size, view]);
  const visibleNodes = useMemo(
    () =>
      model.nodes.filter((node) =>
        nodeIntersectsBounds(
          { x: node.x, y: node.y },
          CANVAS_NODE_WIDTH,
          CANVAS_NODE_HEIGHT,
          visibleRect,
          NODE_OVERSCAN
        )
      ),
    [model.nodes, visibleRect]
  );
  const visibleEdges = useMemo(
    () =>
      model.renderedParentEdges.filter((edge) =>
        edgeVisible(edge, visibleRect, EDGE_OVERSCAN)
      ),
    [model.renderedParentEdges, visibleRect]
  );

  const selectedNode = selectedPersonId ? model.nodeById.get(selectedPersonId) : null;
  const selectedPerson = selectedPersonId ? data.people[selectedPersonId] : null;
  const focusPerson = selectedPersonId ? data.people[selectedPersonId] : null;
  const kinshipByNode = useMemo(() => {
    const roles = new Map<string, KinshipRole>();
    for (const node of model.nodes) {
      roles.set(node.id, kinshipRoleFor(data, selectedPersonId, node.id));
    }
    return roles;
  }, [data, model.nodes, selectedPersonId]);
  const selectedInsight = useMemo(
    () => (selectedPersonId ? buildPersonInsight(data, selectedPersonId) : null),
    [data, selectedPersonId]
  );

  const markZooming = () => {
    if (!zoomingRef.current) {
      zoomingRef.current = true;
      setIsZooming(true);
    }
    if (zoomEndTimeoutRef.current != null) {
      window.clearTimeout(zoomEndTimeoutRef.current);
    }
    zoomEndTimeoutRef.current = window.setTimeout(() => {
      zoomingRef.current = false;
      zoomEndTimeoutRef.current = null;
      setIsZooming(false);
    }, 120);
  };

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    markZooming();
    const baseView = pendingViewRef.current ?? viewRef.current;
    const nextView = zoomAt(
      baseView,
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      Math.exp(-event.deltaY * 0.0012)
    );
    pendingViewRef.current = nextView;
    viewRef.current = nextView;
    scheduleInteractionFrame();
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const currentView = pendingViewRef.current ?? viewRef.current;
    setPan({
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      baseX: currentView.x,
      baseY: currentView.y
    });
    panMovedRef.current = false;
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (nodeDrag?.pointerId === event.pointerId) {
      event.preventDefault();
      const zoom = viewRef.current.zoom;
      const dx = (event.clientX - nodeDrag.startX) / zoom;
      const dy = (event.clientY - nodeDrag.startY) / zoom;
      if (Math.hypot(event.clientX - nodeDrag.startX, event.clientY - nodeDrag.startY) > 3) {
        nodeDragMovedRef.current = true;
      }
      const nextDraft = {
        personId: nodeDrag.personId,
        x: nodeDrag.baseX + dx,
        y: nodeDrag.baseY + dy
      };
      pendingDraftRef.current = nextDraft;
      lastDraftRef.current = nextDraft;
      scheduleInteractionFrame();
      return;
    }

    if (!pan || pan.pointerId !== event.pointerId) return;
    const dx = event.clientX - pan.startX;
    const dy = event.clientY - pan.startY;
    if (Math.hypot(dx, dy) > 3) panMovedRef.current = true;
    pendingViewRef.current = {
      ...viewRef.current,
      x: pan.baseX + dx,
      y: pan.baseY + dy
    };
    viewRef.current = pendingViewRef.current;
    scheduleInteractionFrame();
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (nodeDrag?.pointerId === event.pointerId) {
      const finalPosition =
        pendingDraftRef.current?.personId === nodeDrag.personId
          ? pendingDraftRef.current
          : lastDraftRef.current?.personId === nodeDrag.personId
            ? lastDraftRef.current
          : null;
      pendingDraftRef.current = null;
      lastDraftRef.current = null;
      setDraftPositions({});
      if (finalPosition) setPersonPosition(nodeDrag.personId, finalPosition.x, finalPosition.y);
      if (nodeDragMovedRef.current) suppressClickRef.current = true;
      nodeDragMovedRef.current = false;
      setNodeDrag(null);
      return;
    }

    if (pan?.pointerId === event.pointerId && pendingViewRef.current) {
      viewRef.current = pendingViewRef.current;
      setView(pendingViewRef.current);
      pendingViewRef.current = null;
    }
    if (pan?.pointerId === event.pointerId && panMovedRef.current) {
      suppressClickRef.current = true;
    }
    panMovedRef.current = false;
    setPan(null);
  };

  const handlePointerCancel = () => {
    pendingDraftRef.current = null;
    lastDraftRef.current = null;
    setDraftPositions({});
    panMovedRef.current = false;
    nodeDragMovedRef.current = false;
    setNodeDrag(null);
    setPan(null);
  };

  const handleNodePointerDown = (
    event: PointerEvent<SVGGElement>,
    node: FamilyCanvasNode
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    selectPerson(node.id);
    selectEvent(null);
    setContextMenu(null);
    setNodeDrag({
      pointerId: event.pointerId,
      personId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      baseX: node.x,
      baseY: node.y
    });
    nodeDragMovedRef.current = false;
  };

  const handleBackgroundClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    selectPerson(null);
    selectEvent(null);
  };

  const openPicker = (personId: string, relation: Relation) => {
    setPicker({ personId, relation });
    setContextMenu(null);
  };

  const handlePick = (result: PickerResult) => {
    if (!picker) return;
    const anchor = data.people[picker.personId];
    if (!anchor) {
      setPicker(null);
      return;
    }

    if (result.kind === "new") {
      const response = createRelative(picker.personId, picker.relation, {
        name: result.name,
        gender: result.gender
      });
      if (!response.ok) {
        pushToast(response.reason, "error");
      } else {
        let message = `Added ${result.name}.`;
        if (response.autoLinkedParent) {
          const autoParent = data.people[response.autoLinkedParent];
          if (autoParent) message += ` ${autoParent.name} auto-linked as second parent.`;
        }
        pushToast(message, "success");
      }
    } else {
      const response =
        picker.relation === "parent"
          ? linkParent(picker.personId, result.person.id)
          : picker.relation === "spouse"
            ? linkSpouse(picker.personId, result.person.id)
            : linkParent(result.person.id, picker.personId);
      if (!response.ok) pushToast(response.reason, "error");
      else pushToast(`Linked ${result.person.name}.`, "success");
    }

    setPicker(null);
  };

  const handleAddEvent = (personId: string) => {
    const eventId = addEvent({
      type: "custom",
      customTitle: "New event",
      people: [personId]
    });
    selectPerson(personId);
    selectEvent(eventId);
    pushToast("Event added. Edit it in the inspector.", "success");
  };

  const handleAddFirstPerson = () => {
    const personId = addPerson({ name: "New person", gender: "U" });
    selectPerson(personId);
    selectEvent(null);
  };

  const handleDeletePerson = (personId: string) => {
    const person = data.people[personId];
    if (!person) return;
    if (window.confirm(`Delete ${person.name || "this person"}?`)) {
      deletePerson(personId);
      pushToast("Person deleted.", "info");
    }
  };

  const zoomPercent = Math.round(view.zoom * 100);
  const hasPeople = Object.keys(data.people).length > 0;

  return (
    <div
      ref={containerRef}
      className={`family-canvas ${pan ? "panning" : ""} ${nodeDrag ? "dragging-node" : ""} ${isZooming ? "zooming" : ""}`}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClick={handleBackgroundClick}
    >
      <div className="family-canvas-meta">
        <strong>{model.nodes.length}</strong> people
        <span>{visibleNodes.length} visible</span>
        <span>{zoomPercent}%</span>
      </div>

      {frameRate != null && (
        <div className="family-perf-meter">
          {frameRate} fps
        </div>
      )}

      {selectedPerson && selectedInsight && (
        <div className="family-insight-strip">
          <strong>{selectedPerson.name || "Unnamed"}</strong>
          <span>{countLabel(selectedInsight.parents, "parent")}</span>
          <span>{countLabel(selectedInsight.children, "child", "children")}</span>
          <span>{countLabel(selectedInsight.spouses, "spouse")}</span>
          <span>{selectedInsight.events === 0 ? "no events" : `${selectedInsight.sourcedEvents}/${selectedInsight.events} sourced`}</span>
        </div>
      )}

      <div
        className="family-canvas-controls"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <button title="Zoom out" onClick={() => zoomAtPoint({ x: size.width / 2, y: size.height / 2 }, 0.84)}>
          -
        </button>
        <button title="Zoom in" onClick={() => zoomAtPoint({ x: size.width / 2, y: size.height / 2 }, 1.16)}>
          +
        </button>
        <button title="Fit tree" onClick={() => fitToBounds(model.bounds, size, 130)}>
          Fit
        </button>
        <button
          title="Return to automatic layout"
          onClick={() => {
            clearPositions();
            fitToBounds(layout.bounds, size, 130);
            pushToast("Canvas tidied.", "info");
          }}
        >
          Tidy
        </button>
      </div>

      {focusSet && focusPerson && (
        <div
          className="family-focus-pill"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <span>
            {focusMode === "ancestors" ? "Ancestors" : "Descendants"} of {focusPerson.name}
          </span>
          <button onClick={() => setFocusMode("all")}>Show all</button>
        </div>
      )}

      {model.nodes.length === 0 ? (
        <EmptyCanvas
          hasPeople={hasPeople}
          onAddFirstPerson={handleAddFirstPerson}
          onLoadDemo={loadDemo}
          onShowAll={() => setFocusMode("all")}
        />
      ) : (
        <svg className="family-canvas-stage" aria-label="Family tree canvas">
          <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
            {model.coupleUnits.map((unit) => (
              <CoupleBackground
                key={unit.id}
                unit={unit}
                kinshipState={coupleKinshipState(unit.members, selectedPersonId, kinshipByNode)}
              />
            ))}

            {visibleEdges.map((edge, index) => (
              <path
                key={`edge-${index}`}
                className={`family-edge parent ${edgeKinshipState(edge, selectedPersonId, kinshipByNode)}`}
                d={parentPath(edge)}
              />
            ))}

            {visibleNodes.map((node) => (
              <FamilyCanvasNodeView
                key={node.id}
                node={node}
                isSelected={node.id === selectedPersonId}
                isDragging={node.id === nodeDrag?.personId}
                isDimmed={!!focusSet && !focusSet.has(node.id)}
                isPinned={!!freePositions[node.id]}
                kinshipRole={selectedPersonId ? kinshipByNode.get(node.id) ?? "other" : null}
                onPickRelation={
                  node.id === selectedPersonId
                    ? (relation) => openPicker(node.id, relation)
                    : undefined
                }
                onPointerDown={(event) => handleNodePointerDown(event, node)}
                onClick={(event) => {
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false;
                    return;
                  }
                  event.stopPropagation();
                  selectPerson(node.id);
                  selectEvent(null);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  selectPerson(node.id);
                  setContextMenu({ x: event.clientX, y: event.clientY, personId: node.id });
                }}
              />
            ))}
          </g>
        </svg>
      )}

      {selectedPerson && selectedNode && (
        <FamilyCanvasHud
          person={selectedPerson}
          data={data}
          birthYear={selectedNode.birthYear}
          deathYear={selectedNode.deathYear}
          onPickRelation={(relation) => openPicker(selectedPerson.id, relation)}
          onAddEvent={() => handleAddEvent(selectedPerson.id)}
          onOpenTimeline={() => setViewMode("timeline")}
          onSelectPerson={(personId) => {
            selectPerson(personId);
            selectEvent(null);
          }}
          onSelectEvent={(eventId) => {
            selectEvent(eventId);
            setViewMode("timeline");
          }}
        />
      )}

      <FamilyCanvasMiniMap
        nodes={model.nodes}
        bounds={model.bounds}
        selectedPersonId={selectedPersonId}
        view={view}
        size={size}
        onNavigate={(x, y) => {
          setView((current) => {
            const next = {
              ...current,
              x: size.width / 2 - x * current.zoom,
              y: size.height / 2 - y * current.zoom
            };
            viewRef.current = next;
            return next;
          });
        }}
      />

      {contextMenu &&
        (() => {
          const items: MenuItem[] = [
            {
              kind: "action",
              label: "Child of...",
              onClick: () => openPicker(contextMenu.personId, "parent")
            },
            {
              kind: "action",
              label: "Parent of...",
              onClick: () => openPicker(contextMenu.personId, "child")
            },
            {
              kind: "action",
              label: "Married with...",
              onClick: () => openPicker(contextMenu.personId, "spouse")
            },
            {
              kind: "action",
              label: "Add event",
              onClick: () => handleAddEvent(contextMenu.personId)
            },
            ...(freePositions[contextMenu.personId]
              ? [
                  {
                    kind: "action" as const,
                    label: "Release position",
                    onClick: () => releasePersonPosition(contextMenu.personId)
                  }
                ]
              : []),
            { kind: "separator" },
            {
              kind: "action",
              label: "Delete person",
              danger: true,
              onClick: () => handleDeletePerson(contextMenu.personId)
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
          return (
            <PersonPicker
              title={pickerTitle(anchor.name || "Unnamed", picker.relation)}
              subtitle={pickerSubtitle(anchor.name || "Unnamed", picker.relation)}
              anchorPersonId={picker.personId}
              relation={picker.relation}
              excludeIds={new Set([picker.personId])}
              onPick={handlePick}
              onCancel={() => setPicker(null)}
            />
          );
        })()}
    </div>
  );
}

function EmptyCanvas({
  hasPeople,
  onAddFirstPerson,
  onLoadDemo,
  onShowAll
}: {
  hasPeople: boolean;
  onAddFirstPerson: () => void;
  onLoadDemo: () => void;
  onShowAll: () => void;
}) {
  return (
    <div
      className="family-canvas-empty"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="family-canvas-empty-tree" aria-hidden="true">
        <span className="root" />
        <span className="left" />
        <span className="right" />
      </div>
      <h2>{hasPeople ? "No people in this focus" : "Start the family canvas"}</h2>
      <p>
        {hasPeople
          ? "The current focus has hidden every node."
          : "Create one person, then connect parents, children, spouses, events, and sources."}
      </p>
      <div>
        {hasPeople ? (
          <button className="primary" onClick={onShowAll}>Show all</button>
        ) : (
          <>
            <button className="primary" onClick={onAddFirstPerson}>Add first person</button>
            <button onClick={onLoadDemo}>Load demo</button>
          </>
        )}
      </div>
    </div>
  );
}

function CoupleBackground({
  unit,
  kinshipState
}: {
  unit: FamilyCoupleUnit;
  kinshipState: string;
}) {
  const padX = 10;
  const padY = 10;
  return (
    <rect
      x={unit.centerX - unit.width / 2 - padX}
      y={unit.y - unit.height / 2 - padY}
      width={unit.width + padX * 2}
      height={unit.height + padY * 2}
      rx={18}
      className={`family-couple-bg ${kinshipState}`}
    />
  );
}

function parentPath(edge: RenderedParentEdge): string {
  const parent =
    edge.kind === "single"
      ? edge.parent
      : {
          ...edge.parentA,
          x: (edge.parentA.x + edge.parentB.x) / 2
        };
  const child = edge.child;
  const x1 = parent.x;
  const y1 = parent.y + CANVAS_NODE_HEIGHT / 2;
  const x2 = child.x;
  const y2 = child.y - CANVAS_NODE_HEIGHT / 2;
  const midY = (y1 + y2) / 2;

  if (Math.abs(x1 - x2) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;

  const dir = x2 > x1 ? 1 : -1;
  const radius = Math.min(18, Math.abs(y2 - y1) / 4, Math.abs(x2 - x1) / 2);
  return [
    `M ${x1} ${y1}`,
    `L ${x1} ${midY - radius}`,
    `Q ${x1} ${midY} ${x1 + dir * radius} ${midY}`,
    `L ${x2 - dir * radius} ${midY}`,
    `Q ${x2} ${midY} ${x2} ${midY + radius}`,
    `L ${x2} ${y2}`
  ].join(" ");
}

function edgeVisible(edge: RenderedParentEdge, rect: { minX: number; maxX: number; minY: number; maxY: number }, overscan: number) {
  const nodes: FamilyCanvasNode[] =
    edge.kind === "single"
      ? [edge.parent, edge.child]
      : [edge.parentA, edge.parentB, edge.child];
  return nodes.some((node) =>
    nodeIntersectsBounds(
      { x: node.x, y: node.y },
      CANVAS_NODE_WIDTH,
      CANVAS_NODE_HEIGHT,
      rect,
      overscan
    )
  );
}

function edgeKinshipState(
  edge: RenderedParentEdge,
  selectedPersonId: string | null,
  kinshipByNode: Map<string, KinshipRole>
): string {
  if (!selectedPersonId) return "";
  const ids = edgePersonIds(edge);
  if (ids.includes(selectedPersonId)) return "kin-active";
  if (ids.some((id) => isCloseKin(kinshipByNode.get(id)))) return "kin-near";
  return "kin-muted";
}

function coupleKinshipState(
  memberIds: string[],
  selectedPersonId: string | null,
  kinshipByNode: Map<string, KinshipRole>
): string {
  if (!selectedPersonId) return "";
  if (memberIds.includes(selectedPersonId)) return "kin-active";
  if (memberIds.some((id) => isCloseKin(kinshipByNode.get(id)))) return "kin-near";
  return "kin-muted";
}

function edgePersonIds(edge: RenderedParentEdge): string[] {
  return edge.kind === "single"
    ? [edge.parent.id, edge.child.id]
    : [edge.parentA.id, edge.parentB.id, edge.child.id];
}

function isCloseKin(role: KinshipRole | undefined): boolean {
  return !!role && role !== "other";
}

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function shouldShowPerfMeter(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "localhost" ||
    window.location.hostname.endsWith(".pages.dev")
  );
}

function pickerTitle(anchorName: string, relation: Relation): string {
  if (relation === "parent") return `${anchorName} is child of...`;
  if (relation === "child") return `${anchorName} is parent of...`;
  return `${anchorName} is married with...`;
}

function pickerSubtitle(anchorName: string, relation: Relation): string {
  if (relation === "parent") return `Choose or create a parent for ${anchorName}.`;
  if (relation === "child") return `Choose or create a child for ${anchorName}.`;
  return `Choose or create a spouse for ${anchorName}.`;
}
