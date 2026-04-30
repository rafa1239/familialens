import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { search, type SearchResult } from "../search";
import { useEscapeKey } from "./useEscapeKey";

export function GlobalSearch({ onClose }: { onClose: () => void }) {
  const data = useStore((s) => s.data);
  const selectPerson = useStore((s) => s.selectPerson);
  const selectEvent = useStore((s) => s.selectEvent);
  const pushToast = useStore((s) => s.pushToast);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEscapeKey(onClose);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => search(query, data, 15), [query, data]);

  useEffect(() => {
    if (activeIndex >= results.length) setActiveIndex(0);
  }, [results.length, activeIndex]);

  const selectResult = (r: SearchResult) => {
    if (r.kind === "person") {
      selectPerson(r.person.id);
      selectEvent(null);
      pushToast(`Jumped to ${r.person.name}.`, "info");
    } else if (r.kind === "event") {
      if (r.firstPersonId) {
        selectPerson(r.firstPersonId);
      }
      selectEvent(r.event.id);
      pushToast("Event selected.", "info");
    } else if (r.kind === "place") {
      // Find the first event at this place and jump to its first person
      const ev = Object.values(data.events).find(
        (e) => e.place?.name === r.placeName
      );
      if (ev && ev.people[0]) {
        selectPerson(ev.people[0]);
        selectEvent(ev.id);
      }
      pushToast(`Jumped to "${r.placeName}".`, "info");
    }
    onClose();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter" && results[activeIndex]) {
      e.preventDefault();
      selectResult(results[activeIndex]);
      return;
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal search-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <input
          ref={inputRef}
          className="search-modal-input"
          placeholder="Search people, places, notes…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKey}
          autoComplete="off"
        />

        <div className="search-results">
          {query.trim() === "" ? (
            <div className="search-hint">
              Type to search across the whole dataset.
            </div>
          ) : results.length === 0 ? (
            <div className="search-hint">No matches.</div>
          ) : (
            results.map((r, i) => (
              <SearchResultRow
                key={resultKey(r, i)}
                result={r}
                active={i === activeIndex}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => selectResult(r)}
              />
            ))
          )}
        </div>

        <div className="picker-footer">
          <span className="kbd">↑↓</span> navigate &middot;
          <span className="kbd">↵</span> select &middot;
          <span className="kbd">Esc</span> close
        </div>
      </div>
    </div>
  );
}

function resultKey(r: SearchResult, i: number): string {
  if (r.kind === "person") return `p-${r.person.id}`;
  if (r.kind === "event") return `e-${r.event.id}-${i}`;
  return `pl-${r.placeName}`;
}

function SearchResultRow({
  result,
  active,
  onMouseEnter,
  onClick
}: {
  result: SearchResult;
  active: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  const typeLabel =
    result.kind === "person"
      ? "Person"
      : result.kind === "place"
        ? "Place"
        : "Note";

  let primary = "";
  let secondary = "";

  if (result.kind === "person") {
    primary = result.person.name;
    const parts = [];
    if (result.birthYear != null) parts.push(`b. ${result.birthYear}`);
    if (result.deathYear != null) parts.push(`d. ${result.deathYear}`);
    secondary = parts.join(" · ");
  } else if (result.kind === "place") {
    primary = result.placeName;
    secondary = `${result.eventCount} ${result.eventCount === 1 ? "event" : "events"}`;
  } else {
    primary = result.matchedText;
    secondary = result.event.type;
  }

  return (
    <button
      className={`search-result-row ${active ? "active" : ""}`}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      <span className={`result-type-tag type-${result.kind}`}>{typeLabel}</span>
      <div className="result-body">
        <div className="result-primary">{primary}</div>
        {secondary && <div className="result-secondary">{secondary}</div>}
      </div>
    </button>
  );
}
