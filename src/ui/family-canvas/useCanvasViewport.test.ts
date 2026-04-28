import { describe, expect, it } from "vitest";
import {
  fitBounds,
  screenToWorld,
  worldRectFromView,
  zoomAt
} from "./useCanvasViewport";

describe("canvas viewport math", () => {
  it("zooms around the pointer without moving the world point under it", () => {
    const view = { x: 100, y: 50, zoom: 1 };
    const pointer = { x: 320, y: 180 };
    const before = screenToWorld(pointer, view);
    const next = zoomAt(view, pointer, 1.75);
    const after = screenToWorld(pointer, next);

    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(next.zoom).toBeCloseTo(1.75, 6);
  });

  it("fits bounds inside a viewport with padding", () => {
    const view = fitBounds(
      { minX: 0, maxX: 400, minY: 0, maxY: 200 },
      { width: 800, height: 500 },
      50
    );
    const rect = worldRectFromView(view, { width: 800, height: 500 });

    expect(rect.minX).toBeLessThanOrEqual(0);
    expect(rect.maxX).toBeGreaterThanOrEqual(400);
    expect(rect.minY).toBeLessThanOrEqual(0);
    expect(rect.maxY).toBeGreaterThanOrEqual(200);
  });
});
