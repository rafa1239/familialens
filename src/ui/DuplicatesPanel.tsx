import { useMemo, useState } from "react";
import { useStore } from "../store";
import { findDuplicatePeople, type DuplicatePersonGroup } from "../peopleDedup";
import { findBirthEvent, findDeathEvent } from "../relationships";
import { yearOf } from "../dates";
import { PhotoThumb } from "./PhotoThumb";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function DuplicatesPanel({ onClose }: { onClose: () => void }) {
  const data = useStore((s) => s.data);
  const mergePeople = useStore((s) => s.mergePeople);
  const pushToast = useStore((s) => s.pushToast);
  const selectPerson = useStore((s) => s.selectPerson);

  const groups = useMemo(() => findDuplicatePeople(data), [data]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal dupes-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="picker-header">
          <div>
            <h3>Possible duplicate people</h3>
            <p className="picker-sub">
              {groups.length === 0
                ? "No duplicates detected."
                : `${groups.length} ${groups.length === 1 ? "group" : "groups"} found. Review each carefully before merging.`}
            </p>
          </div>
          <button className="ghost small" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="dupes-body">
          {groups.length === 0 ? (
            <div className="dupes-empty">
              <p>Your dataset looks clean.</p>
              <p className="helper">
                Duplicates are detected by matching normalized names and
                compatible birth years. Imported GEDCOMs and multi-branch
                merges are the usual suspects.
              </p>
            </div>
          ) : (
            groups.map((group, i) => (
              <DuplicateGroupCard
                key={i}
                group={group}
                onJump={(id) => {
                  selectPerson(id);
                  pushToast(`Jumped to ${data.people[id]?.name ?? "person"}.`, "info");
                }}
                onMerge={(canonicalId, dupeIds) => {
                  const name = data.people[canonicalId]?.name ?? "person";
                  mergePeople(canonicalId, dupeIds);
                  pushToast(
                    `Merged ${dupeIds.length + 1} people into "${name}".`,
                    "success"
                  );
                }}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Group card ─────────────────────────────────────

function DuplicateGroupCard({
  group,
  onJump,
  onMerge
}: {
  group: DuplicatePersonGroup;
  onJump: (id: string) => void;
  onMerge: (canonicalId: string, dupeIds: string[]) => void;
}) {
  const data = useStore((s) => s.data);
  const [canonicalId, setCanonicalId] = useState(group.canonical.person.id);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const allIds = useMemo(
    () => [group.canonical.person.id, ...group.duplicates.map((d) => d.person.id)],
    [group]
  );
  const activeIds = allIds.filter((id) => !excluded.has(id));
  const dupeIds = activeIds.filter((id) => id !== canonicalId);

  const toggleExcluded = (id: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="dupe-card">
      <div className="dupe-card-header">
        <span className={`confidence ${group.confidence}`}>
          {group.confidence === "high" ? "High confidence" : "Possible match"}
        </span>
        <span className="dupe-count-badge">
          {activeIds.length} people
        </span>
      </div>

      <div className="dupe-people">
        {allIds.map((id) => {
          const person = data.people[id];
          if (!person) return null;
          const isExcluded = excluded.has(id);
          const isCanonical = id === canonicalId;
          const birth = findBirthEvent(data, id);
          const death = findDeathEvent(data, id);
          const by = yearOf(birth?.date);
          const dy = yearOf(death?.date);
          const eventCount = Object.values(data.events).filter((e) =>
            e.people.includes(id)
          ).length;

          return (
            <div
              key={id}
              className={`dupe-person ${isCanonical ? "canonical" : ""} ${isExcluded ? "excluded" : ""}`}
            >
              <div className={`dupe-person-avatar gender-${person.gender}`}>
                {person.photo ? (
                  <PhotoThumb id={person.photo} alt={person.name} />
                ) : (
                  initials(person.name)
                )}
              </div>
              <div className="dupe-person-body">
                <div className="dupe-person-name">{person.name}</div>
                <div className="dupe-person-meta">
                  {by != null && <span>b. {by}</span>}
                  {dy != null && <span>d. {dy}</span>}
                  {birth?.place && <span>{birth.place.name}</span>}
                  <span className="meta-sep">·</span>
                  <span>{eventCount} events</span>
                </div>
              </div>
              <div className="dupe-person-actions">
                {isCanonical && <span className="canonical-badge">Kept</span>}
                {!isExcluded && !isCanonical && (
                  <button
                    className="ghost small"
                    onClick={() => setCanonicalId(id)}
                    title="Use this as the canonical"
                  >
                    Keep this
                  </button>
                )}
                <button
                  className="ghost small"
                  onClick={() => onJump(id)}
                  title="View in inspector"
                >
                  View
                </button>
                {!isCanonical && (
                  <button
                    className="ghost small"
                    onClick={() => toggleExcluded(id)}
                    title={isExcluded ? "Include in merge" : "Exclude from merge"}
                  >
                    {isExcluded ? "Include" : "Skip"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="dupe-card-footer">
        <button
          className="primary"
          disabled={dupeIds.length === 0}
          onClick={() => onMerge(canonicalId, dupeIds)}
        >
          Merge {dupeIds.length + 1} into "{data.people[canonicalId]?.name}"
        </button>
      </div>
    </div>
  );
}
