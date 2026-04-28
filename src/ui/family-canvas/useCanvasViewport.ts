import { useCallback, useState } from "react";

export type CanvasPoint = { x: number; y: number };
export type CanvasSize = { width: number; height: number };
export type CanvasView = { x: number; y: number; zoom: number };
export type WorldBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export const MIN_CANVAS_ZOOM = 0.15;
export const MAX_CANVAS_ZOOM = 2.8;

export function clampZoom(
  zoom: number,
  minZoom = MIN_CANVAS_ZOOM,
  maxZoom = MAX_CANVAS_ZOOM
): number {
  return Math.max(minZoom, Math.min(maxZoom, zoom));
}

export function screenToWorld(point: CanvasPoint, view: CanvasView): CanvasPoint {
  return {
    x: (point.x - view.x) / view.zoom,
    y: (point.y - view.y) / view.zoom
  };
}

export function worldToScreen(point: CanvasPoint, view: CanvasView): CanvasPoint {
  return {
    x: point.x * view.zoom + view.x,
    y: point.y * view.zoom + view.y
  };
}

export function zoomAt(
  view: CanvasView,
  screenPoint: CanvasPoint,
  factor: number,
  minZoom = MIN_CANVAS_ZOOM,
  maxZoom = MAX_CANVAS_ZOOM
): CanvasView {
  const before = screenToWorld(screenPoint, view);
  const zoom = clampZoom(view.zoom * factor, minZoom, maxZoom);
  return {
    x: screenPoint.x - before.x * zoom,
    y: screenPoint.y - before.y * zoom,
    zoom
  };
}

export function fitBounds(
  bounds: WorldBounds,
  size: CanvasSize,
  padding = 120,
  minZoom = MIN_CANVAS_ZOOM,
  maxZoom = MAX_CANVAS_ZOOM
): CanvasView {
  if (size.width <= 0 || size.height <= 0) {
    return { x: 0, y: 0, zoom: 1 };
  }

  const rawWidth = bounds.maxX - bounds.minX;
  const rawHeight = bounds.maxY - bounds.minY;
  if (!Number.isFinite(rawWidth) || !Number.isFinite(rawHeight)) {
    return { x: size.width / 2, y: size.height / 2, zoom: 1 };
  }

  const width = Math.max(1, rawWidth + padding * 2);
  const height = Math.max(1, rawHeight + padding * 2);
  const zoom = clampZoom(Math.min(size.width / width, size.height / height), minZoom, maxZoom);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  return {
    x: size.width / 2 - centerX * zoom,
    y: size.height / 2 - centerY * zoom,
    zoom
  };
}

export function centerOn(
  worldPoint: CanvasPoint,
  view: CanvasView,
  size: CanvasSize
): CanvasView {
  if (size.width <= 0 || size.height <= 0) return view;
  return {
    ...view,
    x: size.width / 2 - worldPoint.x * view.zoom,
    y: size.height / 2 - worldPoint.y * view.zoom
  };
}

export function worldRectFromView(view: CanvasView, size: CanvasSize): WorldBounds {
  const topLeft = screenToWorld({ x: 0, y: 0 }, view);
  const bottomRight = screenToWorld({ x: size.width, y: size.height }, view);
  return {
    minX: Math.min(topLeft.x, bottomRight.x),
    maxX: Math.max(topLeft.x, bottomRight.x),
    minY: Math.min(topLeft.y, bottomRight.y),
    maxY: Math.max(topLeft.y, bottomRight.y)
  };
}

export function pointInsideBounds(
  point: CanvasPoint,
  bounds: WorldBounds,
  padding = 0
): boolean {
  return (
    point.x >= bounds.minX - padding &&
    point.x <= bounds.maxX + padding &&
    point.y >= bounds.minY - padding &&
    point.y <= bounds.maxY + padding
  );
}

export function nodeIntersectsBounds(
  point: CanvasPoint,
  nodeWidth: number,
  nodeHeight: number,
  bounds: WorldBounds,
  padding = 0
): boolean {
  return (
    point.x + nodeWidth / 2 >= bounds.minX - padding &&
    point.x - nodeWidth / 2 <= bounds.maxX + padding &&
    point.y + nodeHeight / 2 >= bounds.minY - padding &&
    point.y - nodeHeight / 2 <= bounds.maxY + padding
  );
}

export function useCanvasViewport(initial: CanvasView = { x: 0, y: 0, zoom: 1 }) {
  const [view, setView] = useState<CanvasView>(initial);

  const zoomAtPoint = useCallback((point: CanvasPoint, factor: number) => {
    setView((current) => zoomAt(current, point, factor));
  }, []);

  const fitToBounds = useCallback((bounds: WorldBounds, size: CanvasSize, padding?: number) => {
    setView(fitBounds(bounds, size, padding));
  }, []);

  const centerOnPoint = useCallback((point: CanvasPoint, size: CanvasSize) => {
    setView((current) => centerOn(point, current, size));
  }, []);

  return {
    view,
    setView,
    zoomAtPoint,
    fitToBounds,
    centerOnPoint
  };
}
