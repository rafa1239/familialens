import { useRef, useState, useEffect } from "react";
import { useStore } from "../store";
import { convertV5toV7 } from "../converter";
import { exportGedcom, parseGedcom } from "../gedcom";
import { exportHtmlAlbum } from "../htmlAlbum";
import { getPhotoUrl } from "../photos";

type TopBarProps = {
  onOpenPlaces: () => void;
  onOpenStats: () => void;
  onOpenSearch: () => void;
  onOpenNarrative: () => void;
};

export function TopBar({
  onOpenPlaces,
  onOpenStats,
  onOpenSearch,
  onOpenNarrative
}: TopBarProps) {
  const data = useStore((s) => s.data);
  const importData = useStore((s) => s.importData);
  const reset = useStore((s) => s.reset);
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const focusMode = useStore((s) => s.focusMode);
  const setFocusMode = useStore((s) => s.setFocusMode);
  const selectedPersonId = useStore((s) => s.selectedPersonId);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const pastLen = useStore((s) => s.past.length);
  const futureLen = useStore((s) => s.future.length);
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const peopleCount = Object.keys(data.people).length;
  const eventCount = Object.keys(data.events).length;

  // Close export dropdown on outside click
  useEffect(() => {
    if (!exportOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [exportOpen]);

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json"
    });
    downloadBlob(blob, `familialens-v8-${data.datasetId}.json`);
    setStatus("Exported JSON.");
    setTimeout(() => setStatus(null), 2000);
  };

  const handleExportGedcom = () => {
    const text = exportGedcom(data);
    const blob = new Blob([text], { type: "text/plain" });
    downloadBlob(blob, `familialens-v8-${data.datasetId}.ged`);
    setStatus("Exported GEDCOM.");
    setTimeout(() => setStatus(null), 2000);
  };

  const handleExportAlbum = async () => {
    setStatus("Preparing album…");
    // Resolve blob photos to data URLs so they're embedded in the HTML
    const photoIds = new Set<string>();
    for (const p of Object.values(data.people)) {
      if (p.photo && !p.photo.startsWith("data:") && !p.photo.startsWith("http")) {
        photoIds.add(p.photo);
      }
    }
    const resolvedPhotos = new Map<string, string>();
    for (const id of photoIds) {
      try {
        const url = await getPhotoUrl(id);
        if (!url) continue;
        // Convert object URL to data URL so it survives outside this page
        const resp = await fetch(url);
        const blob = await resp.blob();
        const dataUrl = await blobToDataUrl(blob);
        resolvedPhotos.set(id, dataUrl);
      } catch {
        // ignore
      }
    }
    const html = exportHtmlAlbum(data, {
      title: "Family album",
      resolvedPhotos
    });
    const blob = new Blob([html], { type: "text/html" });
    downloadBlob(blob, `familialens-v8-${data.datasetId}.html`);
    setStatus("Exported HTML album.");
    setTimeout(() => setStatus(null), 2500);
  };

  const blobToDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });

  const downloadBlob = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    try {
      const text = await file.text();
      const lower = file.name.toLowerCase();

      // GEDCOM file by extension or content sniff
      if (
        lower.endsWith(".ged") ||
        lower.endsWith(".gedcom") ||
        (text.includes("0 HEAD") && text.includes("1 GEDC"))
      ) {
        const result = parseGedcom(text);
        if (!result.ok) {
          setStatus(result.reason);
          setTimeout(() => setStatus(null), 4000);
          return;
        }
        importData(result.data);
        setStatus(
          `Imported GEDCOM: ${Object.keys(result.data.people).length} people, ${Object.keys(result.data.events).length} events`
        );
        setTimeout(() => setStatus(null), 4000);
        return;
      }

      // Otherwise assume JSON
      const parsed = JSON.parse(text);
      if (parsed.relationships && !parsed.events) {
        const report = convertV5toV7(parsed);
        importData(report.data);
        setStatus(
          `Imported v5 → v7: ${report.stats.peopleConverted} people, ${
            report.stats.birthEventsCreated +
            report.stats.deathEventsCreated +
            report.stats.marriageEventsCreated
          } events`
        );
      } else if (parsed.events) {
        importData(parsed);
        setStatus(
          `Imported: ${Object.keys(parsed.people ?? {}).length} people, ${
            Object.keys(parsed.events ?? {}).length
          } events`
        );
      } else {
        setStatus("Unrecognised file format.");
      }
    } catch {
      setStatus("Import failed.");
    }
    setTimeout(() => setStatus(null), 4000);
  };

  const handleReset = () => {
    if (
      peopleCount > 0 &&
      !window.confirm("Clear the entire dataset? This can't be undone.")
    )
      return;
    reset();
    setStatus("Cleared.");
    setTimeout(() => setStatus(null), 1500);
  };

  return (
    <header className="topbar">
      <div className="brand">
        <h1>FamiliaLens</h1>
        <span className="version">v8</span>
      </div>

      <div className="topbar-stats">
        <span>
          <strong>{peopleCount}</strong> people
        </span>
        <span>
          <strong>{eventCount}</strong> events
        </span>
      </div>

      <div className="view-switcher">
        <button
          className={viewMode === "timeline" ? "active" : ""}
          onClick={() => setViewMode("timeline")}
        >
          Timeline
        </button>
        <button
          className={viewMode === "tree" ? "active" : ""}
          onClick={() => setViewMode("tree")}
        >
          Tree
        </button>
        <button
          className={viewMode === "map" ? "active" : ""}
          onClick={() => setViewMode("map")}
        >
          Map
        </button>
        <button
          className={viewMode === "atlas" ? "active" : ""}
          onClick={() => setViewMode("atlas")}
          title="The Living Atlas — time + space fused"
        >
          Atlas
        </button>
      </div>

      <div
        className={`focus-switcher ${focusMode !== "all" ? "active" : ""}`}
        title={
          selectedPersonId
            ? "Filter to the selected person's lineage"
            : "Select a person first to enable focus"
        }
      >
        <label>Focus</label>
        <select
          value={focusMode}
          disabled={!selectedPersonId}
          onChange={(e) =>
            setFocusMode(e.target.value as "all" | "ancestors" | "descendants")
          }
        >
          <option value="all">All</option>
          <option value="ancestors">Ancestors</option>
          <option value="descendants">Descendants</option>
        </select>
      </div>

      <div className="topbar-actions">
        {status && <span className="topbar-status">{status}</span>}
        <button
          className="ghost"
          onClick={undo}
          disabled={pastLen === 0}
          title="Undo (⌘Z)"
        >
          ↶
        </button>
        <button
          className="ghost"
          onClick={redo}
          disabled={futureLen === 0}
          title="Redo (⌘⇧Z)"
        >
          ↷
        </button>
        <span className="topbar-separator" />
        <button className="ghost" onClick={onOpenSearch} title="Search (⌘K)">
          Search
        </button>
        <button
          className="ghost tell-me-btn"
          onClick={onOpenNarrative}
          title="Tell me your family (⌘⇧K)"
        >
          Tell me
        </button>
        <span className="topbar-separator" />
        <button className="ghost" onClick={onOpenStats}>Stats</button>
        <button className="ghost" onClick={onOpenPlaces}>Places</button>
        <span className="topbar-separator" />
        <button className="ghost" onClick={() => fileRef.current?.click()}>
          Import
        </button>
        <div className="topbar-dropdown-wrap" ref={exportRef}>
          <button
            className={`ghost ${exportOpen ? "active" : ""}`}
            onClick={() => setExportOpen((o) => !o)}
          >
            Export ▾
          </button>
          {exportOpen && (
            <div className="topbar-dropdown">
              <button onClick={() => { handleExportJson(); setExportOpen(false); }}>
                JSON
              </button>
              <button onClick={() => { handleExportGedcom(); setExportOpen(false); }}>
                GEDCOM 5.5
              </button>
              <button onClick={() => { handleExportAlbum(); setExportOpen(false); }}>
                HTML Album
              </button>
              <hr />
              <button className="danger" onClick={() => { handleReset(); setExportOpen(false); }}>
                Clear all data
              </button>
            </div>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".json,.ged,.gedcom"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImport(f);
          e.currentTarget.value = "";
        }}
      />
    </header>
  );
}
