import { useEffect, useMemo, useRef, useState } from "react";
import {
  findBirthEvent,
  findDeathEvent,
  getParents,
  isParentOf,
  isSpouseOf,
  relationLabel,
  wouldCreateCycle
} from "../relationships";
import { useStore } from "../store";
import type { DataState, Gender, Person } from "../types";
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

type PickerRelation = "parent" | "spouse" | "child";
type CandidateTone = "linked" | "blocked" | "neutral";

type PickerCandidate = {
  person: Person;
  life: string;
  stats: string;
  relationText: string;
  relationTone: CandidateTone;
  disabledReason: string | null;
  searchText: string;
};

export function PersonPicker({
  title,
  subtitle,
  excludeIds = new Set(),
  anchorPersonId,
  relation,
  onPick,
  onCancel
}: {
  title: string;
  subtitle?: string;
  excludeIds?: Set<string>;
  anchorPersonId?: string;
  relation?: PickerRelation;
  onPick: (result: PickerResult) => void;
  onCancel: () => void;
}) {
  const data = useStore((s) => s.data);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [newGender, setNewGender] = useState<Gender>("U");
  const inputRef = useRef<HTMLInputElement>(null);
  const anchor = anchorPersonId ? data.people[anchorPersonId] : null;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const candidates = useMemo(
    () =>
      Object.values(data.people)
        .filter((person) => !excludeIds.has(person.id))
        .map((person) => describeCandidate(data, person, anchorPersonId, relation)),
    [anchorPersonId, data, excludeIds, relation]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? candidates.filter((candidate) => candidate.searchText.includes(q))
      : candidates;
    return list
      .sort((a, b) => {
        const ax = q && a.person.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bx = q && b.person.name.toLowerCase().startsWith(q) ? 0 : 1;
        if (ax !== bx) return ax - bx;
        if (a.disabledReason && !b.disabledReason) return 1;
        if (!a.disabledReason && b.disabledReason) return -1;
        return a.person.name.localeCompare(b.person.name);
      })
      .slice(0, 40);
  }, [candidates, query]);

  const createDisabledReason = anchorPersonId && relation
    ? disabledReasonForNewPerson(data, anchorPersonId, relation)
    : null;
  const showCreate = query.trim().length > 0;
  const canCreate = showCreate && !createDisabledReason;
  const totalOptions = filtered.length + (showCreate ? 1 : 0);
  const optionEnabled = (index: number) =>
    index < filtered.length ? !filtered[index]?.disabledReason : canCreate;

  useEffect(() => {
    if (totalOptions <= 0) {
      if (activeIndex !== 0) setActiveIndex(0);
      return;
    }
    const clamped = Math.min(activeIndex, totalOptions - 1);
    if (optionEnabled(clamped)) {
      if (clamped !== activeIndex) setActiveIndex(clamped);
      return;
    }
    const firstEnabled = Array.from({ length: totalOptions }, (_, index) => index).find(optionEnabled);
    setActiveIndex(firstEnabled ?? clamped);
  }, [activeIndex, canCreate, filtered, totalOptions]);

  const pickActive = () => {
    if (activeIndex < filtered.length) {
      const candidate = filtered[activeIndex];
      if (!candidate.disabledReason) onPick({ kind: "existing", person: candidate.person });
    } else if (canCreate && query.trim()) {
      onPick({ kind: "new", name: query.trim(), gender: newGender });
    }
  };

  const moveActive = (delta: number) => {
    if (totalOptions <= 0) return;
    setActiveIndex((current) => {
      for (let step = 1; step <= totalOptions; step += 1) {
        const next = (current + delta * step + totalOptions) % totalOptions;
        if (optionEnabled(next)) return next;
      }
      return current;
    });
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
      moveActive(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveActive(-1);
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
          placeholder={anchor ? `Search people or create a new ${relationName(relation)}` : "Search by name or type a new person..."}
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

          {filtered.map((candidate, i) => (
            <button
              key={candidate.person.id}
              className={`picker-item ${i === activeIndex ? "active" : ""}`}
              disabled={!!candidate.disabledReason}
              title={candidate.disabledReason ?? undefined}
              onMouseEnter={() => {
                if (!candidate.disabledReason) setActiveIndex(i);
              }}
              onClick={() => {
                if (!candidate.disabledReason) onPick({ kind: "existing", person: candidate.person });
              }}
            >
              <div className={`picker-avatar gender-${candidate.person.gender}`}>
                {candidate.person.photo ? (
                  <PhotoThumb id={candidate.person.photo} alt={candidate.person.name} />
                ) : (
                  initials(candidate.person.name)
                )}
              </div>
              <div className="picker-item-body">
                <div className="picker-item-name">{candidate.person.name || "Unnamed"}</div>
                <div className="picker-item-sub">
                  <span>{candidate.life}</span>
                  <span className={`picker-relation-tag tone-${candidate.relationTone}`}>
                    {candidate.disabledReason ?? candidate.relationText}
                  </span>
                  <span>{candidate.stats}</span>
                </div>
              </div>
            </button>
          ))}

          {showCreate && (
            <button
              className={`picker-item picker-create ${createDisabledReason ? "disabled" : ""} ${
                activeIndex === filtered.length ? "active" : ""
              }`}
              disabled={!canCreate}
              title={createDisabledReason ?? undefined}
              onMouseEnter={() => {
                if (canCreate) setActiveIndex(filtered.length);
              }}
              onClick={() => {
                if (canCreate) onPick({ kind: "new", name: query.trim(), gender: newGender });
              }}
            >
              <div className="picker-avatar create-avatar">+</div>
              <div className="picker-item-body">
                <div className="picker-item-name">
                  Create "<strong>{query.trim()}</strong>"
                </div>
                <div className="picker-item-sub">
                  {createDisabledReason ?? createRelationLabel(anchor, relation)}
                </div>
              </div>
              <div
                className="create-gender"
                aria-label="New person gender"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => event.stopPropagation()}
              >
                {(["U", "M", "F"] as Gender[]).map((gender) => (
                  <span
                    key={gender}
                    role="button"
                    tabIndex={-1}
                    className={newGender === gender ? "active" : ""}
                    onClick={() => setNewGender(gender)}
                  >
                    {gender}
                  </span>
                ))}
              </div>
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

function describeCandidate(
  data: DataState,
  person: Person,
  anchorPersonId: string | undefined,
  relation: PickerRelation | undefined
): PickerCandidate {
  const life = lifespanFor(data, person.id);
  const stats = statsForPerson(data, person.id);
  const currentRelation = anchorPersonId
    ? relationLabel(data, anchorPersonId, person.id)
    : null;
  const disabledReason =
    anchorPersonId && relation
      ? disabledReasonForExistingPerson(data, anchorPersonId, person.id, relation)
      : null;
  const relationText = currentRelation
    ? currentRelationText(currentRelation)
    : "Not linked";
  return {
    person,
    life,
    stats,
    relationText,
    relationTone: disabledReason ? "blocked" : currentRelation ? "linked" : "neutral",
    disabledReason,
    searchText: `${person.name} ${life} ${stats} ${relationText}`.toLowerCase()
  };
}

function disabledReasonForExistingPerson(
  data: DataState,
  anchorPersonId: string,
  candidatePersonId: string,
  relation: PickerRelation
): string | null {
  if (relation === "parent") {
    if (isParentOf(data, candidatePersonId, anchorPersonId)) return "Already parent";
    if (getParents(data, anchorPersonId).length >= 2) return "Already has two parents";
    if (wouldCreateCycle(data, candidatePersonId, anchorPersonId)) return "Would create cycle";
    return null;
  }
  if (relation === "child") {
    if (isParentOf(data, anchorPersonId, candidatePersonId)) return "Already child";
    if (getParents(data, candidatePersonId).length >= 2) return "Already has two parents";
    if (wouldCreateCycle(data, anchorPersonId, candidatePersonId)) return "Would create cycle";
    return null;
  }
  if (isSpouseOf(data, anchorPersonId, candidatePersonId)) return "Already married";
  return null;
}

function disabledReasonForNewPerson(
  data: DataState,
  anchorPersonId: string,
  relation: PickerRelation
): string | null {
  if (relation === "parent" && getParents(data, anchorPersonId).length >= 2) {
    return "Already has two parents";
  }
  return null;
}

function lifespanFor(data: DataState, personId: string): string {
  const birth = findBirthEvent(data, personId)?.date?.display;
  const death = findDeathEvent(data, personId)?.date?.display;
  if (birth && death) return `${birth}-${death}`;
  if (birth) return `b. ${birth}`;
  if (death) return `d. ${death}`;
  return "Dates unknown";
}

function statsForPerson(data: DataState, personId: string): string {
  const sourceIds = new Set<string>();
  let events = 0;
  for (const event of Object.values(data.events)) {
    if (!event.people.includes(personId)) continue;
    events += 1;
    for (const sourceId of event.sources) {
      if (data.sources[sourceId]) sourceIds.add(sourceId);
    }
  }
  return `${events} event${events === 1 ? "" : "s"} / ${sourceIds.size} source${sourceIds.size === 1 ? "" : "s"}`;
}

function currentRelationText(relation: string): string {
  if (relation === "self") return "Selected";
  if (relation === "parent") return "Parent";
  if (relation === "child") return "Child";
  if (relation === "spouse") return "Spouse";
  if (relation === "sibling") return "Sibling";
  return "Linked";
}

function relationName(relation: PickerRelation | undefined): string {
  if (relation === "parent") return "parent";
  if (relation === "child") return "child";
  if (relation === "spouse") return "spouse";
  return "person";
}

function createRelationLabel(anchor: Person | null, relation: PickerRelation | undefined): string {
  if (!anchor || !relation) return "as a new person";
  const name = anchor.name || "Unnamed";
  if (relation === "parent") return `as parent of ${name}`;
  if (relation === "child") return `as child of ${name}`;
  return `as spouse of ${name}`;
}
