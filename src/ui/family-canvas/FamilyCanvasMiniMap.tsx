import type { PointerEvent } from "react";
import {
  CANVAS_NODE_HEIGHT,
  CANVAS_NODE_WIDTH,
  type FamilyCanvasNode
} from "./canvasModel";
import {
  type CanvasSize,
  type CanvasView,
  type WorldBounds,
  worldRectFromView
} from "./useCanvasViewport";

const MINI_W = 178;
const MINI_H = 120;
const PAD = 10;

type MiniMapProps = {
  nodes: FamilyCanvasNode[];
  bounds: WorldBounds;
  selectedPersonId: string | null;
  view: CanvasView;
  size: CanvasSize;
  onNavigate: (x: number, y: number) => void;
};

export function FamilyCanvasMiniMap({
  nodes,
  bounds,
  selectedPersonId,
  view,
  size,
  onNavigate
}: MiniMapProps) {
  if (nodes.length === 0 || size.width <= 0 || size.height <= 0) return null;

  const width = Math.max(1, bounds.maxX - bounds.minX + CANVAS_NODE_WIDTH);
  const height = Math.max(1, bounds.maxY - bounds.minY + CANVAS_NODE_HEIGHT);
  const scale = Math.min((MINI_W - PAD * 2) / width, (MINI_H - PAD * 2) / height);
  const offsetX = (MINI_W - width * scale) / 2;
  const offsetY = (MINI_H - height * scale) / 2;
  const minX = bounds.minX - CANVAS_NODE_WIDTH / 2;
  const minY = bounds.minY - CANVAS_NODE_HEIGHT / 2;

  const toMiniX = (x: number) => offsetX + (x - minX) * scale;
  const toMiniY = (y: number) => offsetY + (y - minY) * scale;
  const toWorldX = (x: number) => (x - offsetX) / scale + minX;
  const toWorldY = (y: number) => (y - offsetY) / scale + minY;

  const viewport = worldRectFromView(view, size);
  const viewportX = toMiniX(viewport.minX);
  const viewportY = toMiniY(viewport.minY);
  const viewportW = Math.max(4, (viewport.maxX - viewport.minX) * scale);
  const viewportH = Math.max(4, (viewport.maxY - viewport.minY) * scale);

  const handlePointer = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(MINI_W, event.clientX - rect.left));
    const y = Math.max(0, Math.min(MINI_H, event.clientY - rect.top));
    onNavigate(toWorldX(x), toWorldY(y));
  };

  return (
    <div
      className="family-minimap"
      aria-label="Tree minimap"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <svg
        viewBox={`0 0 ${MINI_W} ${MINI_H}`}
        onPointerDown={handlePointer}
        onPointerMove={(event) => {
          if (event.buttons === 1) handlePointer(event);
        }}
      >
        <rect className="family-minimap-bg" x={0} y={0} width={MINI_W} height={MINI_H} rx={10} />
        {nodes.map((node) => (
          <rect
            key={node.id}
            className={`family-minimap-node gender-${node.person.gender} ${
              node.id === selectedPersonId ? "selected" : ""
            }`}
            x={toMiniX(node.x - CANVAS_NODE_WIDTH / 2)}
            y={toMiniY(node.y - CANVAS_NODE_HEIGHT / 2)}
            width={Math.max(3, CANVAS_NODE_WIDTH * scale)}
            height={Math.max(2, CANVAS_NODE_HEIGHT * scale)}
            rx={2}
          />
        ))}
        <rect
          className="family-minimap-viewport"
          x={viewportX}
          y={viewportY}
          width={viewportW}
          height={viewportH}
          rx={3}
        />
      </svg>
    </div>
  );
}
