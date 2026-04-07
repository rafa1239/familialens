import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "./store";
import { Canvas } from "./ui/Canvas";
import { Toolbar } from "./ui/Toolbar";
import { Sidebar } from "./ui/Sidebar";
import { ContextMenu } from "./ui/ContextMenu";
import { Timeline } from "./ui/Timeline";
import { validateData } from "./utils/validate";
import {
  computeDatasetInsights,
  computeFocusSet,
  extractYear,
  parseYearInput
} from "./utils/insights";
import { exportJson, parseJson } from "./utils/json";
import { detectFormat } from "./utils/importer";
import { parseGedcom, exportGedcom } from "./utils/gedcom";
import {
  findConflicts,
  mergeData,
  strategyToMode,
  type ImportStrategy
} from "./utils/merge";
import type { DataState, Person } from "./types";
import type { ValidationReport } from "./utils/validate";

type ImportPreview = {
  fileName: string;
  format: "json" | "gedcom";
  data: DataState;
  report: ValidationReport;
  warnings: string[];
  errors: string[];
  conflicts: string[];
  strategy: ImportStrategy;
};

export function App() {
  const data = useStore((s) => s.data);
  const hydrated = useStore((s) => s.hydrated);
  const selectedIds = useStore((s) => s.selectedIds);
  const searchQuery = useStore((s) => s.searchQuery);
  const focusMode = useStore((s) => s.focusMode);
  const filters = useStore((s) => s.filters);
  const viewMode = useStore((s) => s.viewMode);
  const theme = useStore((s) => s.theme);
  const {
    init,
    setTheme,
    setStatusMessage,
    selectOnly,
    undo,
    redo,
    addPerson,
    setLinkMode,
    importData
  } = useStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(
    null
  );

  // Init
  useEffect(() => {
    init();
  }, [init]);

  // Apply theme to DOM
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  // Derived data
  const relationships = useMemo(
    () => Object.values(data.relationships),
    [data.relationships]
  );
  const validationReport = useMemo(() => validateData(data), [data]);
  const insights = useMemo(
    () => computeDatasetInsights(data, validationReport),
    [data, validationReport]
  );

  const selectedPerson =
    selectedIds.length === 1 ? data.people[selectedIds[0]] ?? null : null;

  // Focus set
  const focusSet = useMemo(() => {
    if (focusMode === "all" || selectedIds.length === 0) return null;
    return computeFocusSet(relationships, selectedIds[0], focusMode);
  }, [focusMode, relationships, selectedIds]);

  // Search & filter
  const searchTerm = searchQuery.trim().toLowerCase();
  const yearFromValue = parseYearInput(filters.yearFrom);
  const yearToValue = parseYearInput(filters.yearTo);

  const filteredPeople = useMemo(() => {
    const entries = Object.entries(data.people).filter(([, person]) => {
      if (focusSet && !focusSet.has(person.id)) return false;
      if (searchTerm) {
        const haystack = `${person.name} ${person.notes ?? ""}`.toLowerCase();
        if (!haystack.includes(searchTerm)) return false;
      }
      if (filters.gender !== "all" && person.gender !== filters.gender)
        return false;
      if (yearFromValue || yearToValue) {
        const year = extractYear(person.birthDate);
        if (!year) return false;
        if (yearFromValue && year < yearFromValue) return false;
        if (yearToValue && year > yearToValue) return false;
      }
      return true;
    });
    return Object.fromEntries(entries);
  }, [data.people, focusSet, filters.gender, searchTerm, yearFromValue, yearToValue]);

  const filteredIds = useMemo(
    () => new Set(Object.keys(filteredPeople)),
    [filteredPeople]
  );
  const filteredRelationships = useMemo(
    () =>
      relationships.filter(
        (r) => filteredIds.has(r.from) && filteredIds.has(r.to)
      ),
    [filteredIds, relationships]
  );

  const searchResults = useMemo(
    () => (searchTerm ? Object.values(filteredPeople).slice(0, 10) : []),
    [filteredPeople, searchTerm]
  );

  const searchMatchIds = useMemo(
    () => new Set(searchResults.map((p) => p.id)),
    [searchResults]
  );

  // Jump to person
  const handleJumpTo = (id: string) => {
    selectOnly(id);
    window.dispatchEvent(
      new CustomEvent("familialens:focus", { detail: { targetId: id } })
    );
  };

  const handleUpdate = (patch: Partial<Person>) => {
    if (!selectedPerson) return;
    if (typeof patch.name === "string") {
      const norm = patch.name.trim().toLowerCase();
      if (norm) {
        const dup = Object.values(data.people).find(
          (p) =>
            p.id !== selectedPerson.id &&
            p.name.trim().toLowerCase() === norm
        );
        if (dup) setStatusMessage(`Possible duplicate: ${dup.name}`);
      }
    }
    useStore.getState().updatePerson(selectedPerson.id, patch);
  };

  // Import / Export
  const download = (payload: string, name: string, type: string) => {
    const blob = new Blob([payload], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJson = () => {
    download(
      exportJson(data),
      `familialens-v6-${data.datasetId}.json`,
      "application/json"
    );
    setStatusMessage("Exported JSON.");
  };

  const handleExportGedcom = () => {
    download(
      exportGedcom(data),
      `familialens-v6-${data.datasetId}.ged`,
      "text/plain"
    );
    setStatusMessage("Exported GEDCOM.");
  };

  const handleImportFile = async (file: File) => {
    const content = await file.text();
    const format = detectFormat(file.name, content);

    const parsed =
      format === "gedcom" ? parseGedcom(content) : parseJson(content);

    if (!parsed.ok) {
      setStatusMessage((parsed as { reason: string }).reason);
      return;
    }

    const report = validateData(parsed.data);
    const conflicts = findConflicts(data, parsed.data);
    const warnings = [
      ...("warnings" in parsed ? parsed.warnings : []),
      ...report.warnings
    ];
    setImportPreview({
      fileName: file.name,
      format,
      data: parsed.data,
      report,
      warnings,
      errors: report.errors,
      conflicts,
      strategy: conflicts.length > 0 ? "merge-keep" : "replace"
    });
    setStatusMessage("Import preview ready.");
  };

  const handleApplyImport = () => {
    if (!importPreview) return;
    const mode = strategyToMode(importPreview.strategy);
    if (!mode) {
      if (
        Object.keys(data.people).length > 0 &&
        !window.confirm("Replace current dataset?")
      )
        return;
      importData(importPreview.data);
      setStatusMessage("Imported dataset.");
    } else {
      const merged = mergeData(data, importPreview.data, mode);
      importData(merged.data);
      setStatusMessage(
        merged.warnings.length > 0
          ? `Merged with ${merged.warnings.length} warnings.`
          : "Merged import."
      );
    }
    setImportPreview(null);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (e.target as HTMLElement)?.isContentEditable
      )
        return;

      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (mod && key === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (key === "n") {
        e.preventDefault();
        addPerson();
        return;
      }
      if (key === "p") {
        e.preventDefault();
        setLinkMode("parent", null);
        setStatusMessage("Parent link mode.");
        return;
      }
      if (key === "s") {
        e.preventDefault();
        setLinkMode("spouse", null);
        setStatusMessage("Spouse link mode.");
        return;
      }
      if (key === "escape") {
        setLinkMode(null, null);
        setStatusMessage(null);
        return;
      }
      if (key === "f") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("familialens:fit"));
        return;
      }
      if (key === "+" || key === "=") {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("familialens:zoom", { detail: { direction: 1 } })
        );
        return;
      }
      if (key === "-" || key === "_") {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("familialens:zoom", { detail: { direction: -1 } })
        );
        return;
      }
      if (
        (key === "delete" || key === "backspace") &&
        selectedIds.length > 0
      ) {
        e.preventDefault();
        const s = useStore.getState();
        if (s.selectedIds.length === 1) {
          const person = data.people[s.selectedIds[0]];
          if (person && window.confirm(`Delete ${person.name}?`)) {
            s.deletePerson(person.id);
            setStatusMessage("Deleted.");
          }
        } else {
          if (
            window.confirm(`Delete ${s.selectedIds.length} people?`)
          ) {
            s.deleteSelected();
            setStatusMessage(`${s.selectedIds.length} deleted.`);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [addPerson, data.people, redo, selectedIds, setLinkMode, setStatusMessage, undo]);

  if (!hydrated) {
    return (
      <div
        className="app"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        <p style={{ color: "var(--text-tertiary)" }}>Loading...</p>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Top bar */}
      <header className="topbar">
        <div className="brand">
          <h1>FamiliaLens</h1>
          <span className="version">v6</span>
        </div>

        <div className="topbar-stats">
          <div className="stat">
            <strong>{Object.keys(data.people).length}</strong> people
          </div>
          <div className="stat">
            <strong>{relationships.length}</strong> links
          </div>
          <div className="stat">
            <strong>{insights.generations}</strong> gen
          </div>
        </div>

        <div className="topbar-actions">
          <button className="ghost" onClick={handleExportJson}>
            JSON
          </button>
          <button className="ghost" onClick={handleExportGedcom}>
            GEDCOM
          </button>
          <button className="ghost" onClick={() => fileInputRef.current?.click()}>
            Import
          </button>
          <button
            className="ghost icon-btn"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title="Toggle theme"
          >
            {theme === "dark" ? "\u2600" : "\u263E"}
          </button>
        </div>
      </header>

      {/* Main area */}
      <div className="main-area">
        {viewMode === "tree" ? (
          <Canvas
            people={filteredPeople}
            relationships={filteredRelationships}
            searchMatchIds={searchMatchIds}
          />
        ) : (
          <Timeline people={filteredPeople} />
        )}

        <Toolbar />

        <Sidebar
          selectedPerson={selectedPerson}
          people={data.people}
          relationships={relationships}
          searchResults={searchResults}
          insights={insights}
          validationReport={validationReport}
          importPreview={importPreview}
          onJumpTo={handleJumpTo}
          onUpdate={handleUpdate}
          onApplyImport={handleApplyImport}
          onCancelImport={() => setImportPreview(null)}
          onImportStrategyChange={(s) =>
            setImportPreview((prev) =>
              prev ? { ...prev, strategy: s } : prev
            )
          }
        />

        <ContextMenu />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.ged,.gedcom"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleImportFile(file).catch(() =>
              setStatusMessage("Import failed.")
            );
            e.currentTarget.value = "";
          }
        }}
      />
    </div>
  );
}
