import { useMemo, useState } from "react";
import { useStore } from "../store";
import { findRelationship } from "../pathfinder";
import type { Person } from "../types";
import { PhotoThumb } from "./PhotoThumb";
import { PersonPicker, type PickerResult } from "./PersonPicker";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Relationship finder modal.
 *
 * Opens with an anchor person pre-selected (aId). User picks a second
 * person (bId) via a PersonPicker. We compute the path and render it
 * with a big label and a visual chain of intermediate people.
 */
export function RelationshipFinder({
  aId,
  onClose
}: {
  aId: string;
  onClose: () => void;
}) {
  const data = useStore((s) => s.data);
  const selectPerson = useStore((s) => s.selectPerson);
  const pushToast = useStore((s) => s.pushToast);
  const [bId, setBId] = useState<string | null>(null);
  const [picker, setPicker] = useState(bId === null);

  const a = data.people[aId];
  const b = bId ? data.people[bId] : null;

  const result = useMemo(() => {
    if (!bId) return null;
    return findRelationship(data, aId, bId);
  }, [data, aId, bId]);

  const handlePick = (r: PickerResult) => {
    if (r.kind === "existing") {
      setBId(r.person.id);
      setPicker(false);
    } else {
      pushToast("Pick an existing person to compare.", "error");
    }
  };

  if (picker) {
    return (
      <PersonPicker
        title={`Compare ${a?.name ?? "this person"} with…`}
        excludeIds={new Set([aId])}
        onPick={handlePick}
        onCancel={onClose}
      />
    );
  }

  if (!a || !b || !result) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal relationship-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="picker-header">
          <div>
            <h3>How are they related?</h3>
          </div>
          <button className="ghost small" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="relationship-body">
          {/* Headline */}
          <div className="relationship-headline">
            <div className="rel-person">
              <div className={`rel-avatar gender-${a.gender}`}>
                {a.photo ? <PhotoThumb id={a.photo} alt={a.name} /> : initials(a.name)}
              </div>
              <div className="rel-name">{a.name}</div>
            </div>
            <div className="rel-connector">
              <div className="rel-label">{result.shortLabel}</div>
              <div className="rel-arrow">
                {result.kind === "unrelated" ? "✗" : "—"}
              </div>
            </div>
            <div className="rel-person">
              <div className={`rel-avatar gender-${b.gender}`}>
                {b.photo ? <PhotoThumb id={b.photo} alt={b.name} /> : initials(b.name)}
              </div>
              <div className="rel-name">{b.name}</div>
            </div>
          </div>

          {/* Descriptive sentences */}
          <div className="relationship-sentences">
            <p>{result.aIsToB}</p>
            {result.aIsToB !== result.bIsToA && (
              <p className="secondary">{result.bIsToA}</p>
            )}
          </div>

          {/* Visual path */}
          {result.path.length > 2 && result.kind !== "unrelated" && (
            <div className="relationship-path">
              <div className="path-label">Path</div>
              <div className="path-chain">
                {result.path.map((id, i) => {
                  const p = data.people[id];
                  if (!p) return null;
                  const isLCA = id === result.lcaId;
                  const isFirst = i === 0;
                  const isLast = i === result.path.length - 1;
                  return (
                    <div key={id} className="path-step">
                      <button
                        className={`path-chip ${isLCA ? "lca" : ""} ${isFirst || isLast ? "endpoint" : ""}`}
                        onClick={() => {
                          selectPerson(id);
                          onClose();
                        }}
                        title={p.name}
                      >
                        <div className={`path-avatar gender-${p.gender}`}>
                          {p.photo ? (
                            <PhotoThumb id={p.photo} alt={p.name} />
                          ) : (
                            initials(p.name)
                          )}
                        </div>
                        <span className="path-name">{p.name}</span>
                      </button>
                      {i < result.path.length - 1 && (
                        <div className="path-arrow">↓</div>
                      )}
                    </div>
                  );
                })}
              </div>
              {result.lcaId && (
                <div className="path-meta">
                  Common ancestor:{" "}
                  <strong>{data.people[result.lcaId]?.name}</strong>
                  {result.generationsA > 0 && result.generationsB > 0 && (
                    <>
                      {" "}· {result.generationsA} up, {result.generationsB} down
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="relationship-actions">
            <button className="ghost" onClick={() => setPicker(true)}>
              Compare with someone else
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
