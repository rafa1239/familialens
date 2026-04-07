import { useMemo } from "react";
import type { Person } from "../types";

const MAP_W = 180;
const MAP_H = 120;
const PAD = 10;

const GEN_COLORS = [
  "var(--gen-0)",
  "var(--gen-1)",
  "var(--gen-2)",
  "var(--gen-3)",
  "var(--gen-4)",
  "var(--gen-5)"
];

export function Minimap({
  people,
  view,
  containerSize,
  genDepths,
  onNavigate
}: {
  people: Person[];
  view: { x: number; y: number; zoom: number };
  containerSize: { w: number; h: number };
  genDepths: Map<string, number>;
  onNavigate: (worldX: number, worldY: number) => void;
}) {
  const bounds = useMemo(() => {
    if (people.length === 0) return null;
    const xs = people.map((p) => p.x);
    const ys = people.map((p) => p.y);
    return {
      minX: Math.min(...xs) - 100,
      maxX: Math.max(...xs) + 100,
      minY: Math.min(...ys) - 60,
      maxY: Math.max(...ys) + 60
    };
  }, [people]);

  if (!bounds || people.length === 0) return null;

  const bw = bounds.maxX - bounds.minX;
  const bh = bounds.maxY - bounds.minY;
  if (bw <= 0 || bh <= 0) return null;

  const innerW = MAP_W - PAD * 2;
  const innerH = MAP_H - PAD * 2;
  const scale = Math.min(innerW / bw, innerH / bh);

  const toMapX = (wx: number) => PAD + (wx - bounds.minX) * scale;
  const toMapY = (wy: number) => PAD + (wy - bounds.minY) * scale;

  // Viewport rect in world coords
  const vpLeft = -view.x / view.zoom;
  const vpTop = -view.y / view.zoom;
  const vpW = containerSize.w / view.zoom;
  const vpH = containerSize.h / view.zoom;

  const rectLeft = toMapX(vpLeft);
  const rectTop = toMapY(vpTop);
  const rectW = vpW * scale;
  const rectH = vpH * scale;

  const handleClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const wx = (mx - PAD) / scale + bounds.minX;
    const wy = (my - PAD) / scale + bounds.minY;
    onNavigate(wx, wy);
  };

  return (
    <div className="minimap" onClick={handleClick}>
      {people.map((p) => {
        const gen = genDepths.get(p.id) ?? 0;
        return (
          <div
            key={p.id}
            className="minimap-node"
            style={{
              left: toMapX(p.x) - 3,
              top: toMapY(p.y) - 2,
              background: GEN_COLORS[gen % GEN_COLORS.length]
            }}
          />
        );
      })}
      <div
        className="minimap-viewport"
        style={{
          left: Math.max(0, rectLeft),
          top: Math.max(0, rectTop),
          width: Math.min(MAP_W, rectW),
          height: Math.min(MAP_H, rectH)
        }}
      />
    </div>
  );
}
