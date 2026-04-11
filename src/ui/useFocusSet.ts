import { useMemo } from "react";
import { useStore } from "../store";
import { computeFocusSet } from "../relationships";

/**
 * Hook that returns the set of currently-focused person ids.
 *
 *   null                → no focus (show everyone)
 *   Set<string>         → only show these people (and the events that
 *                         reference only them)
 *
 * Focus is active when both `focusMode !== "all"` AND a person is selected.
 */
export function useFocusSet(): Set<string> | null {
  const data = useStore((s) => s.data);
  const focusMode = useStore((s) => s.focusMode);
  const selectedPersonId = useStore((s) => s.selectedPersonId);

  return useMemo(() => {
    if (focusMode === "all" || !selectedPersonId) return null;
    if (!data.people[selectedPersonId]) return null;
    return computeFocusSet(data, selectedPersonId, focusMode);
  }, [data, focusMode, selectedPersonId]);
}

/**
 * Check whether an event should be shown under the current focus.
 * An event is visible if ANY of its people are in the focus set.
 * (Event filters are lenient — a shared event involving one in-focus
 * person stays visible even if the other isn't.)
 */
export function eventInFocus(focusSet: Set<string> | null, eventPeople: string[]): boolean {
  if (!focusSet) return true;
  return eventPeople.some((pid) => focusSet.has(pid));
}
