import { useCallback, useMemo } from "react";
import { useStore } from "../../store";
import type { DataState } from "../../types";
import type { FreeCanvasPositions } from "./canvasModel";

export function useFreeCanvasPositions(data: DataState) {
  const updateCanvasPositions = useStore((s) => s.updateCanvasPositions);
  const peopleIds = useMemo(() => new Set(Object.keys(data.people)), [data.people]);
  const positions = useMemo(
    () => pruneFreeCanvasPositions(data.canvas?.freePositions ?? {}, peopleIds),
    [data.canvas?.freePositions, peopleIds]
  );

  const setPersonPosition = useCallback((personId: string, x: number, y: number) => {
    updateCanvasPositions({
      ...positions,
      [personId]: {
        x: roundCoordinate(x),
        y: roundCoordinate(y),
        pinned: true
      }
    });
  }, [positions, updateCanvasPositions]);

  const releasePersonPosition = useCallback((personId: string) => {
    if (!positions[personId]) return;
    const next = { ...positions };
    delete next[personId];
    updateCanvasPositions(next);
  }, [positions, updateCanvasPositions]);

  const clearPositions = useCallback(() => {
    updateCanvasPositions({});
  }, [updateCanvasPositions]);

  return {
    positions,
    setPersonPosition,
    releasePersonPosition,
    clearPositions
  };
}

export function pruneFreeCanvasPositions(
  positions: FreeCanvasPositions,
  peopleIds: Set<string>
): FreeCanvasPositions {
  const next: FreeCanvasPositions = {};
  for (const [personId, position] of Object.entries(positions)) {
    if (!peopleIds.has(personId)) continue;
    if (!position || typeof position !== "object") continue;
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) continue;
    next[personId] = position;
  }
  return next;
}

function roundCoordinate(value: number): number {
  return Math.round(value * 10) / 10;
}
