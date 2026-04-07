import { useRef, useState } from "react";
import type { Gender, Person, Relationship } from "../types";
import type { ImportStrategy } from "../utils/merge";
import type { DatasetInsights } from "../utils/insights";
import type { ValidationReport } from "../utils/validate";
import { useStore } from "../store";

const genderOptions: { label: string; value: Gender | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Male", value: "M" },
  { label: "Female", value: "F" },
  { label: "Unknown", value: "U" }
];

type ImportPreview = {
  fileName: string;
  format: "json" | "gedcom";
  report: ValidationReport;
  warnings: string[];
  errors: string[];
  conflicts: string[];
  strategy: ImportStrategy;
};

function Section({
  title,
  defaultOpen = true,
  badge,
  children
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: string | number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sidebar-section">
      <button className="section-toggle" onClick={() => setOpen(!open)}>
        <span>
          {title}
          {badge !== undefined && (
            <span
              style={{
                marginLeft: 8,
                fontSize: "0.7rem",
                opacity: 0.6
              }}
            >
              {badge}
            </span>
          )}
        </span>
        <span className={`chevron ${open ? "open" : ""}`}>&#9654;</span>
      </button>
      <div className={`section-body ${open ? "" : "hidden"}`}>{children}</div>
    </div>
  );
}

export function Sidebar({
  selectedPerson,
  people,
  relationships,
  searchResults,
  insights,
  validationReport,
  importPreview,
  onJumpTo,
  onUpdate,
  onApplyImport,
  onCancelImport,
  onImportStrategyChange
}: {
  selectedPerson: Person | null;
  people: Record<string, Person>;
  relationships: Relationship[];
  searchResults: Person[];
  insights: DatasetInsights;
  validationReport: ValidationReport;
  importPreview: ImportPreview | null;
  onJumpTo: (id: string) => void;
  onUpdate: (patch: Partial<Person>) => void;
  onApplyImport: () => void;
  onCancelImport: () => void;
  onImportStrategyChange: (s: ImportStrategy) => void;
}) {
  const selectedIds = useStore((s) => s.selectedIds);
  const statusMessage = useStore((s) => s.statusMessage);
  const saveStatus = useStore((s) => s.saveStatus);
  const lastSavedAt = useStore((s) => s.lastSavedAt);
  const hydrated = useStore((s) => s.hydrated);
  const recentOps = useStore((s) => s.recentOps);
  const focusMode = useStore((s) => s.focusMode);
  const filters = useStore((s) => s.filters);
  const {
    setFilters,
    setFocusMode,
    deleteSelected,
    deleteRelationship,
    createRelative,
    setStatusMessage,
    selectOnly
  } = useStore();

  const photoRef = useRef<HTMLInputElement>(null);

  const parents = selectedPerson
    ? relationships.filter(
        (r) => r.type === "parent" && r.to === selectedPerson.id
      )
    : [];
  const children = selectedPerson
    ? relationships.filter(
        (r) => r.type === "parent" && r.from === selectedPerson.id
      )
    : [];
  const spouses = selectedPerson
    ? relationships.filter(
        (r) =>
          r.type === "spouse" &&
          (r.from === selectedPerson.id || r.to === selectedPerson.id)
      )
    : [];

  const saveLabel =
    saveStatus === "saving"
      ? "Saving..."
      : saveStatus === "error"
        ? "Save failed"
        : saveStatus === "saved" && lastSavedAt
          ? `Saved ${new Date(lastSavedAt).toLocaleTimeString()}`
          : hydrated
            ? "Ready"
            : "Loading...";

  const handleQuickAdd = (relation: "parent" | "child" | "spouse") => {
    if (!selectedPerson) return;
    const result = createRelative(selectedPerson.id, relation);
    if (!result.ok) {
      setStatusMessage(result.reason);
      return;
    }
    selectOnly(result.id);
    window.dispatchEvent(
      new CustomEvent("familialens:focus", {
        detail: { targetId: result.id }
      })
    );
    setStatusMessage(`Added ${relation}.`);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 200;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d")!;
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        onUpdate({ photo: canvas.toDataURL("image/jpeg", 0.8) });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <aside className="sidebar">
      {/* Workspace */}
      <Section title="Workspace" badge={saveLabel}>
        <div className="stats-row">
          <div className="stat-card">
            <span>People</span>
            <strong>{Object.keys(people).length}</strong>
          </div>
          <div className="stat-card">
            <span>Links</span>
            <strong>{relationships.length}</strong>
          </div>
          <div className="stat-card">
            <span>Generations</span>
            <strong>{insights.generations}</strong>
          </div>
          <div className="stat-card">
            <span>Isolated</span>
            <strong>{insights.isolatedPeople}</strong>
          </div>
        </div>
        {statusMessage && <div className="status-banner">{statusMessage}</div>}
      </Section>

      {/* Filters */}
      <Section title="Filters" defaultOpen={false}>
        <div className="field">
          <label>Focus Mode</label>
          <select
            value={focusMode}
            onChange={(e) =>
              setFocusMode(e.target.value as "all" | "ancestors" | "descendants")
            }
          >
            <option value="all">Entire Tree</option>
            <option value="ancestors">Ancestors</option>
            <option value="descendants">Descendants</option>
          </select>
        </div>
        <div className="field">
          <label>Gender</label>
          <select
            value={filters.gender}
            onChange={(e) =>
              setFilters({ gender: e.target.value as Gender | "all" })
            }
          >
            {genderOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Birth Year Range</label>
          <div className="range-row">
            <input
              placeholder="From"
              value={filters.yearFrom}
              onChange={(e) => setFilters({ yearFrom: e.target.value })}
            />
            <span>to</span>
            <input
              placeholder="To"
              value={filters.yearTo}
              onChange={(e) => setFilters({ yearTo: e.target.value })}
            />
          </div>
        </div>
      </Section>

      {/* Search Results */}
      {searchResults.length > 0 && (
        <Section title="Search Results" badge={searchResults.length}>
          {searchResults.map((p) => (
            <div
              key={p.id}
              className="search-result"
              onClick={() => onJumpTo(p.id)}
            >
              <span className="sr-name">{p.name || "Unnamed"}</span>
              <span className="sr-date">
                {p.birthDate ? `b. ${p.birthDate}` : ""}
              </span>
            </div>
          ))}
        </Section>
      )}

      {/* Inspector */}
      <Section
        title="Inspector"
        badge={
          selectedIds.length > 1
            ? `${selectedIds.length} selected`
            : selectedPerson
              ? selectedPerson.name
              : undefined
        }
      >
        {selectedIds.length > 1 ? (
          <>
            <p className="helper-text">
              {selectedIds.length} people selected. Shift-click to toggle.
            </p>
            <div className="action-row">
              <button
                className="danger"
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete ${selectedIds.length} selected people?`
                    )
                  ) {
                    deleteSelected();
                    setStatusMessage(
                      `${selectedIds.length} people deleted.`
                    );
                  }
                }}
              >
                Delete Selected
              </button>
            </div>
          </>
        ) : !selectedPerson ? (
          <p className="helper-text">
            Select a person on the canvas to inspect and edit their details.
          </p>
        ) : (
          <>
            {/* Photo */}
            <div className="photo-upload">
              <div className="photo-preview">
                {selectedPerson.photo ? (
                  <img src={selectedPerson.photo} alt="" />
                ) : (
                  <span className="photo-placeholder">+</span>
                )}
              </div>
              <div className="photo-actions">
                <button
                  className="ghost"
                  onClick={() => photoRef.current?.click()}
                  style={{ fontSize: "0.78rem", padding: "4px 10px" }}
                >
                  {selectedPerson.photo ? "Change" : "Add Photo"}
                </button>
                {selectedPerson.photo && (
                  <button
                    className="ghost"
                    onClick={() => onUpdate({ photo: undefined })}
                    style={{ fontSize: "0.78rem", padding: "4px 10px" }}
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                ref={photoRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handlePhotoUpload}
              />
            </div>

            <div className="field">
              <label>Name</label>
              <input
                value={selectedPerson.name}
                onChange={(e) => onUpdate({ name: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Gender</label>
              <select
                value={selectedPerson.gender}
                onChange={(e) =>
                  onUpdate({ gender: e.target.value as Gender })
                }
              >
                {genderOptions
                  .filter((o) => o.value !== "all")
                  .map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
              </select>
            </div>

            <div className="stats-row">
              <div className="field">
                <label>Birth Date</label>
                <input
                  placeholder="YYYY or YYYY-MM-DD"
                  value={selectedPerson.birthDate}
                  onChange={(e) => onUpdate({ birthDate: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Death Date</label>
                <input
                  placeholder="YYYY or YYYY-MM-DD"
                  value={selectedPerson.deathDate}
                  onChange={(e) => onUpdate({ deathDate: e.target.value })}
                />
              </div>
            </div>

            <div className="stats-row">
              <div className="field">
                <label>Birth Place</label>
                <input
                  placeholder="City, Country"
                  value={selectedPerson.birthPlace ?? ""}
                  onChange={(e) => onUpdate({ birthPlace: e.target.value })}
                />
              </div>
              <div className="field">
                <label>Death Place</label>
                <input
                  placeholder="City, Country"
                  value={selectedPerson.deathPlace ?? ""}
                  onChange={(e) => onUpdate({ deathPlace: e.target.value })}
                />
              </div>
            </div>

            <div className="field">
              <label>Notes</label>
              <textarea
                rows={3}
                placeholder="Sources, context..."
                value={selectedPerson.notes ?? ""}
                onChange={(e) => onUpdate({ notes: e.target.value })}
              />
            </div>

            {/* Quick add */}
            <div className="action-row">
              <button onClick={() => handleQuickAdd("parent")}>
                + Parent
              </button>
              <button onClick={() => handleQuickAdd("spouse")}>
                + Spouse
              </button>
              <button onClick={() => handleQuickAdd("child")}>
                + Child
              </button>
            </div>

            {/* Relations */}
            {(parents.length > 0 ||
              spouses.length > 0 ||
              children.length > 0) && (
              <div className="relation-stack">
                {parents.map((rel) => {
                  const p = people[rel.from];
                  return (
                    <div key={rel.id} className="relation-row">
                      <button
                        className="link-btn"
                        onClick={() => p && onJumpTo(p.id)}
                      >
                        Parent: {p?.name ?? "?"}
                      </button>
                      <button
                        className="mini-btn"
                        onClick={() => {
                          deleteRelationship(rel.id);
                          setStatusMessage("Relationship removed.");
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
                {spouses.map((rel) => {
                  const sid =
                    rel.from === selectedPerson.id ? rel.to : rel.from;
                  const p = people[sid];
                  return (
                    <div key={rel.id} className="relation-row">
                      <button
                        className="link-btn"
                        onClick={() => p && onJumpTo(p.id)}
                      >
                        Spouse: {p?.name ?? "?"}
                      </button>
                      <button
                        className="mini-btn"
                        onClick={() => {
                          deleteRelationship(rel.id);
                          setStatusMessage("Relationship removed.");
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
                {children.map((rel) => {
                  const p = people[rel.to];
                  return (
                    <div key={rel.id} className="relation-row">
                      <button
                        className="link-btn"
                        onClick={() => p && onJumpTo(p.id)}
                      >
                        Child: {p?.name ?? "?"}
                      </button>
                      <button
                        className="mini-btn"
                        onClick={() => {
                          deleteRelationship(rel.id);
                          setStatusMessage("Relationship removed.");
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="action-row">
              <button
                className="danger"
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete ${selectedPerson.name || "this person"}?`
                    )
                  ) {
                    const { deletePerson } = useStore.getState();
                    deletePerson(selectedPerson.id);
                    setStatusMessage("Person deleted.");
                  }
                }}
              >
                Delete Person
              </button>
            </div>
          </>
        )}
      </Section>

      {/* Health */}
      <Section title="Health" defaultOpen={false} badge={`${validationReport.errors.length}E ${validationReport.warnings.length}W`}>
        <div className="stats-row">
          <div className="stat-card">
            <span>Living</span>
            <strong>{insights.livingPeople}</strong>
          </div>
          <div className="stat-card">
            <span>Roots</span>
            <strong>{insights.rootPeople}</strong>
          </div>
          <div className="stat-card">
            <span>Couples</span>
            <strong>{insights.spousePairs}</strong>
          </div>
          <div className="stat-card">
            <span>Isolated</span>
            <strong>{insights.isolatedPeople}</strong>
          </div>
        </div>

        {insights.duplicateNames.length > 0 && (
          <div className="field">
            <label>Duplicate Names</label>
            <div className="tag-list">
              {insights.duplicateNames.map((n) => (
                <span key={n} className="tag warning">
                  {n}
                </span>
              ))}
            </div>
          </div>
        )}

        {validationReport.errors.length > 0 && (
          <div className="field">
            <label>Errors</label>
            <ul className="msg-list errors">
              {validationReport.errors.slice(0, 6).map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        {validationReport.warnings.length > 0 && (
          <div className="field">
            <label>Warnings</label>
            <ul className="msg-list warnings">
              {validationReport.warnings.slice(0, 6).map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* Import Preview */}
      {importPreview && (
        <Section title="Import Preview" badge={importPreview.fileName}>
          <div className="stats-row">
            <div className="stat-card">
              <span>People</span>
              <strong>{importPreview.report.people}</strong>
            </div>
            <div className="stat-card">
              <span>Links</span>
              <strong>{importPreview.report.relationships}</strong>
            </div>
          </div>

          <div className="field">
            <label>Strategy</label>
            <select
              value={importPreview.strategy}
              onChange={(e) =>
                onImportStrategyChange(e.target.value as ImportStrategy)
              }
            >
              <option value="replace">Replace current dataset</option>
              <option value="merge-keep">Merge (keep current)</option>
              <option value="merge-replace">Merge (replace matches)</option>
              <option value="merge-both">Merge (keep both)</option>
            </select>
          </div>

          {importPreview.conflicts.length > 0 && (
            <div className="field">
              <label>Conflicts</label>
              <div className="tag-list">
                {importPreview.conflicts.slice(0, 8).map((c) => (
                  <span key={c} className="tag warning">
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {importPreview.errors.length > 0 && (
            <ul className="msg-list errors">
              {importPreview.errors.slice(0, 4).map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}

          <div className="action-row">
            <button className="primary" onClick={onApplyImport}>
              Apply
            </button>
            <button onClick={onCancelImport}>Dismiss</button>
          </div>
        </Section>
      )}

      {/* Recent Activity */}
      <Section title="Activity" defaultOpen={false} badge={recentOps.length}>
        {recentOps.length === 0 ? (
          <p className="helper-text">No edits logged yet.</p>
        ) : (
          <ul className="msg-list activity">
            {recentOps.map((op) => (
              <li key={op.id}>
                <span>{op.type.replace(/\./g, " ")}</span>
                <time>{new Date(op.ts).toLocaleTimeString()}</time>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </aside>
  );
}
