import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import type { Gender, Person } from "../types";
import { PhotoThumb } from "./PhotoThumb";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export type PickerResult =
  | { kind: "existing"; person: Person }
  | { kind: "new"; name: string; gender: Gender };

export function PersonPicker({
  title,
  subtitle,
  excludeIds = new Set(),
  onPick,
  onCancel
}: {
  title: string;
  subtitle?: string;
  excludeIds?: Set<string>;
  onPick: (result: PickerResult) => void;
  onCancel: () => void;
}) {
  const people = useStore((s) => s.data.people);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [newGender, setNewGender] = useState<Gender>("U");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const list = Object.values(people).filter((p) => !excludeIds.has(p.id));
    const q = query.trim().toLowerCase();
    if (!q) return list.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 40);
    return list
      .filter((p) => p.name.toLowerCase().includes(q))
      .sort((a, b) => {
        // Prefix matches rank higher
        const ax = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bx = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        if (ax !== bx) return ax - bx;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 40);
  }, [people, query, excludeIds]);

  const canCreate = query.trim().length > 0;
  const totalOptions = filtered.length + (canCreate ? 1 : 0);

  useEffect(() => {
    if (activeIndex >= totalOptions) setActiveIndex(Math.max(0, totalOptions - 1));
  }, [totalOptions, activeIndex]);

  const pickActive = () => {
    if (activeIndex < filtered.length) {
      onPick({ kind: "existing", person: filtered[activeIndex] });
    } else if (canCreate) {
      onPick({ kind: "new", name: query.trim(), gender: newGender });
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    } else if (e.key === "Enter") {
      e.preventDefault();
      pickActive();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, totalOptions - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    }
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal picker"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="picker-header">
          <div>
            <h3>{title}</h3>
            {subtitle && <p className="picker-sub">{subtitle}</p>}
          </div>
          <button className="ghost small" onClick={onCancel}>
            Esc
          </button>
        </div>

        <input
          ref={inputRef}
          className="picker-search"
          placeholder="Search by name or type a new person…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleKey}
        />

        <div className="picker-results">
          {filtered.length === 0 && !canCreate && (
            <div className="picker-empty">No people to pick from.</div>
          )}

          {filtered.map((p, i) => (
            <button
              key={p.id}
              className={`picker-item ${i === activeIndex ? "active" : ""}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => onPick({ kind: "existing", person: p })}
            >
              <div className={`picker-avatar gender-${p.gender}`}>
                {p.photo ? <PhotoThumb id={p.photo} alt={p.name} /> : initials(p.name)}
              </div>
              <div className="picker-item-body">
                <div className="picker-item-name">{p.name || "Unnamed"}</div>
              </div>
            </button>
          ))}

          {canCreate && (
            <button
              className={`picker-item picker-create ${
                activeIndex === filtered.length ? "active" : ""
              }`}
              onMouseEnter={() => setActiveIndex(filtered.length)}
              onClick={() =>
                onPick({ kind: "new", name: query.trim(), gender: newGender })
              }
            >
              <div className="picker-avatar create-avatar">+</div>
              <div className="picker-item-body">
                <div className="picker-item-name">
                  Create "<strong>{query.trim()}</strong>"
                </div>
                <div className="picker-item-sub">as a new person</div>
              </div>
              <select
                value={newGender}
                onChange={(e) => {
                  e.stopPropagation();
                  setNewGender(e.target.value as Gender);
                }}
                onClick={(e) => e.stopPropagation()}
                className="create-gender"
              >
                <option value="U">?</option>
                <option value="M">M</option>
                <option value="F">F</option>
              </select>
            </button>
          )}
        </div>

        <div className="picker-footer">
          <span className="kbd">↑↓</span> navigate &middot;
          <span className="kbd">↵</span> select &middot;
          <span className="kbd">Esc</span> cancel
        </div>
      </div>
    </div>
  );
}
