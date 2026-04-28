import { useCallback, useEffect, useMemo, useState } from "react";
import type { DataState } from "../../types";
import type { FreeCanvasPositions } from "./canvasModel";

const STORAGE_PREFIX = "familialens:v8-free-canvas";

type PositionState = {
  storageKey: string;
  positions: FreeCanvasPositions;
};

export function useFreeCanvasPositions(data: DataState) {
  const storageKey = useMemo(() => `${STORAGE_PREFIX}:${data.datasetId}`, [data.datasetId]);
  const [state, setState] = useState<PositionState>(() => ({
    storageKey,
    positions: readFreeCanvasPositions(storageKey)
  }));
  const positions = state.storageKey === storageKey ? state.positions : {};

  useEffect(() => {
    setState({
      storageKey,
      positions: readFreeCanvasPositions(storageKey)
    });
  }, [storageKey]);

  useEffect(() => {
    const peopleIds = new Set(Object.keys(data.people));
    setState((current) => {
      if (current.storageKey !== storageKey) return current;
      return {
        storageKey,
        positions: pruneFreeCanvasPositions(current.positions, peopleIds)
      };
    });
  }, [data.people, storageKey]);

  useEffect(() => {
    if (state.storageKey !== storageKey) return;
    writeFreeCanvasPositions(storageKey, state.positions);
  }, [state, storageKey]);

  const setPersonPosition = useCallback((personId: string, x: number, y: number) => {
    setState((current) => {
      const base =
        current.storageKey === storageKey
          ? current.positions
          : readFreeCanvasPositions(storageKey);
      return {
        storageKey,
        positions: {
          ...base,
          [personId]: {
            x: roundCoordinate(x),
            y: roundCoordinate(y),
            pinned: true
          }
        }
      };
    });
  }, [storageKey]);

  const releasePersonPosition = useCallback((personId: string) => {
    setState((current) => {
      const base =
        current.storageKey === storageKey
          ? current.positions
          : readFreeCanvasPositions(storageKey);
      if (!base[personId]) return current.storageKey === storageKey ? current : { storageKey, positions: base };
      const next = { ...base };
      delete next[personId];
      return { storageKey, positions: next };
    });
  }, [storageKey]);

  const clearPositions = useCallback(() => {
    setState({ storageKey, positions: {} });
  }, [storageKey]);

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

function readFreeCanvasPositions(storageKey: string): FreeCanvasPositions {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as FreeCanvasPositions;
    if (!parsed || typeof parsed !== "object") return {};
    return pruneFreeCanvasPositions(parsed, new Set(Object.keys(parsed)));
  } catch {
    return {};
  }
}

function writeFreeCanvasPositions(storageKey: string, positions: FreeCanvasPositions) {
  if (typeof window === "undefined") return;
  try {
    if (Object.keys(positions).length === 0) {
      window.localStorage.removeItem(storageKey);
    } else {
      window.localStorage.setItem(storageKey, JSON.stringify(positions));
    }
  } catch {
    // Ignore quota/privacy failures; the canvas still works for this session.
  }
}

function roundCoordinate(value: number): number {
  return Math.round(value * 10) / 10;
}
