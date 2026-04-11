import { useMemo, useState } from "react";
import { useStore } from "../store";
import {
  extractPlaces,
  findNearDuplicates,
  type PlaceAggregate,
  type DuplicateGroup
} from "../places";

/**
 * Global places manager. Shows:
 *  - Suspected duplicates at the top (with one-click merge)
 *  - All unique places with event counts
 *  - Per-place: rename inline, set coordinates
 */
export function PlacesPanel({ onClose }: { onClose: () => void }) {
  const data = useStore((s) => s.data);
  const renamePlace = useStore((s) => s.renamePlace);
  const mergePlaces = useStore((s) => s.mergePlaces);
  const setPlaceCoords = useStore((s) => s.setPlaceCoords);
  const pushToast = useStore((s) => s.pushToast);

  const places = useMemo(() => extractPlaces(data), [data]);
  const duplicateGroups = useMemo(() => findNearDuplicates(places), [places]);

  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingCoords, setEditingCoords] = useState<string | null>(null);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal places-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="picker-header">
          <div>
            <h3>Places</h3>
            <p className="picker-sub">
              {places.length} {places.length === 1 ? "place" : "places"} across{" "}
              {places.reduce((n, p) => n + p.eventCount, 0)} events
            </p>
          </div>
          <button className="ghost small" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="places-body">
          {places.length === 0 ? (
            <div className="picker-empty">
              No places yet. Add a birth/death/event place to get started.
            </div>
          ) : (
            <>
              {duplicateGroups.length > 0 && (
                <DuplicatesSection
                  groups={duplicateGroups}
                  onMerge={(group) => {
                    const dupeNames = group.duplicates.map((d) => d.name);
                    mergePlaces(dupeNames, group.canonical.name, {
                      lat: group.canonical.lat,
                      lon: group.canonical.lon
                    });
                    pushToast(
                      `Merged ${dupeNames.length + 1} places into "${group.canonical.name}".`,
                      "success"
                    );
                  }}
                />
              )}

              <section className="places-section">
                <div className="places-section-header">
                  <h4>All places</h4>
                </div>
                <ul className="places-list">
                  {places.map((place) => (
                    <PlaceRow
                      key={place.name}
                      place={place}
                      isEditingName={editingName === place.name}
                      isEditingCoords={editingCoords === place.name}
                      onStartRename={() => {
                        setEditingName(place.name);
                        setEditingCoords(null);
                      }}
                      onRename={(next) => {
                        if (next !== place.name) {
                          renamePlace(place.name, next);
                          pushToast(
                            `Renamed "${place.name}" to "${next}".`,
                            "success"
                          );
                        }
                        setEditingName(null);
                      }}
                      onCancelRename={() => setEditingName(null)}
                      onStartCoords={() => {
                        setEditingCoords(place.name);
                        setEditingName(null);
                      }}
                      onSetCoords={(lat, lon) => {
                        setPlaceCoords(place.name, lat, lon);
                        pushToast(
                          `Set coordinates for "${place.name}".`,
                          "success"
                        );
                        setEditingCoords(null);
                      }}
                      onClearCoords={() => {
                        setPlaceCoords(place.name, undefined, undefined);
                        pushToast(
                          `Cleared coordinates for "${place.name}".`,
                          "info"
                        );
                      }}
                      onCancelCoords={() => setEditingCoords(null)}
                    />
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Duplicates section ─────────────────────────────

function DuplicatesSection({
  groups,
  onMerge
}: {
  groups: DuplicateGroup[];
  onMerge: (group: DuplicateGroup) => void;
}) {
  return (
    <section className="places-section dupe-section">
      <div className="places-section-header">
        <h4>Possible duplicates</h4>
        <span className="places-section-count">
          {groups.length} {groups.length === 1 ? "group" : "groups"}
        </span>
      </div>
      <ul className="dupe-groups">
        {groups.map((group, i) => (
          <li key={i} className="dupe-group">
            <div className="dupe-group-canonical">
              <span className="dupe-tag">Keeps</span>
              <strong>{group.canonical.name}</strong>
              <span className="dupe-count">
                {group.canonical.eventCount}
                {group.canonical.eventCount === 1 ? " event" : " events"}
              </span>
            </div>
            <div className="dupe-group-duplicates">
              <span className="dupe-tag dupe-tag-merge">Merges</span>
              {group.duplicates.map((d) => (
                <span key={d.name} className="dupe-item">
                  {d.name}
                  <span className="dupe-count">({d.eventCount})</span>
                </span>
              ))}
            </div>
            <button className="primary small" onClick={() => onMerge(group)}>
              Merge
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Per-place row ──────────────────────────────────

function PlaceRow({
  place,
  isEditingName,
  isEditingCoords,
  onStartRename,
  onRename,
  onCancelRename,
  onStartCoords,
  onSetCoords,
  onClearCoords,
  onCancelCoords
}: {
  place: PlaceAggregate;
  isEditingName: boolean;
  isEditingCoords: boolean;
  onStartRename: () => void;
  onRename: (name: string) => void;
  onCancelRename: () => void;
  onStartCoords: () => void;
  onSetCoords: (lat: number | undefined, lon: number | undefined) => void;
  onClearCoords: () => void;
  onCancelCoords: () => void;
}) {
  const [nameDraft, setNameDraft] = useState(place.name);
  const [latDraft, setLatDraft] = useState(
    place.lat != null ? String(place.lat) : ""
  );
  const [lonDraft, setLonDraft] = useState(
    place.lon != null ? String(place.lon) : ""
  );

  const hasCoords = place.lat != null && place.lon != null;

  return (
    <li className="place-row">
      {isEditingName ? (
        <div className="place-rename">
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRename(nameDraft.trim() || place.name);
              if (e.key === "Escape") onCancelRename();
            }}
          />
          <button className="primary small" onClick={() => onRename(nameDraft.trim() || place.name)}>
            Save
          </button>
          <button className="ghost small" onClick={onCancelRename}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="place-row-main">
          <div className="place-row-name">
            {place.name}
            {hasCoords && <span className="place-geo-badge" title="Has coordinates">⊙</span>}
          </div>
          <div className="place-row-meta">
            {place.eventCount} {place.eventCount === 1 ? "event" : "events"}
            {hasCoords && ` · ${place.lat!.toFixed(2)}, ${place.lon!.toFixed(2)}`}
          </div>
        </div>
      )}

      {!isEditingName && !isEditingCoords && (
        <div className="place-row-actions">
          <button className="ghost small" onClick={onStartRename}>
            Rename
          </button>
          <button className="ghost small" onClick={onStartCoords}>
            {hasCoords ? "Edit coords" : "Set coords"}
          </button>
          {hasCoords && (
            <button className="ghost small danger" onClick={onClearCoords}>
              Clear
            </button>
          )}
        </div>
      )}

      {isEditingCoords && (
        <div className="place-coords-edit">
          <input
            placeholder="Latitude"
            value={latDraft}
            onChange={(e) => setLatDraft(e.target.value)}
          />
          <input
            placeholder="Longitude"
            value={lonDraft}
            onChange={(e) => setLonDraft(e.target.value)}
          />
          <button
            className="primary small"
            onClick={() => {
              const lat = latDraft.trim() ? Number(latDraft) : undefined;
              const lon = lonDraft.trim() ? Number(lonDraft) : undefined;
              if (
                (latDraft.trim() && !Number.isFinite(lat)) ||
                (lonDraft.trim() && !Number.isFinite(lon))
              ) {
                return;
              }
              onSetCoords(lat, lon);
            }}
          >
            Save
          </button>
          <button className="ghost small" onClick={onCancelCoords}>
            Cancel
          </button>
        </div>
      )}
    </li>
  );
}
