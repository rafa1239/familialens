import { useEffect, useState } from "react";
import { useStore } from "./store";
import { TopBar } from "./ui/TopBar";
import { PeopleList } from "./ui/PeopleList";
import { Timeline } from "./ui/Timeline";
import { TreeView } from "./ui/TreeView";
import { MapView } from "./ui/MapView";
import { AtlasView } from "./ui/AtlasView";
import { Inspector } from "./ui/Inspector";
import { Toasts } from "./ui/Toasts";
import { EmptyWorkspace } from "./ui/EmptyWorkspace";
import { PlacesPanel } from "./ui/PlacesPanel";
import { StatsPanel } from "./ui/StatsPanel";
import { DuplicatesPanel } from "./ui/DuplicatesPanel";
import { GlobalSearch } from "./ui/GlobalSearch";
import { ShortcutsHelp } from "./ui/ShortcutsHelp";
import { NarrativeInput } from "./ui/NarrativeInput";
import {
  getChildren,
  getParents,
  getSpouses
} from "./relationships";

export function App() {
  const init = useStore((s) => s.init);
  const hydrated = useStore((s) => s.hydrated);
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const selectPerson = useStore((s) => s.selectPerson);
  const selectEvent = useStore((s) => s.selectEvent);
  const addPerson = useStore((s) => s.addPerson);
  const peopleCount = useStore((s) => Object.keys(s.data.people).length);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [narrativeOpen, setNarrativeOpen] = useState(false);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const inInput =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        t?.isContentEditable;

      const mod = e.metaKey || e.ctrlKey;

      // Cmd+Shift+K → narrative input (must come before Cmd+K)
      if (mod && e.shiftKey && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setNarrativeOpen(true);
        return;
      }

      // Cmd+K global search — works even inside inputs
      if (mod && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }

      // ? opens shortcuts help (outside of inputs)
      if (!mod && !inInput && e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }

      // Undo / redo work everywhere, even inside inputs, except textarea
      if (mod && (e.key === "z" || e.key === "Z")) {
        if (tag === "TEXTAREA") return; // let the textarea handle its own undo
        e.preventDefault();
        if (e.shiftKey) useStore.getState().redo();
        else useStore.getState().undo();
        return;
      }
      if (mod && (e.key === "y" || e.key === "Y")) {
        if (tag === "TEXTAREA") return;
        e.preventDefault();
        useStore.getState().redo();
        return;
      }

      // ─── Alt+arrows: navigate between relatives ───
      if (e.altKey && !e.shiftKey) {
        const { selectedPersonId, data, pushToast } = useStore.getState();
        if (!selectedPersonId) return;

        const jumpTo = (id: string, label: string) => {
          const person = data.people[id];
          if (!person) return;
          selectPerson(id);
          selectEvent(null);
          pushToast(`${label}: ${person.name}`, "info");
        };

        if (e.key === "ArrowUp") {
          e.preventDefault();
          const parents = getParents(data, selectedPersonId);
          if (parents.length > 0) jumpTo(parents[0].id, "Parent");
          else pushToast("No parent linked.", "info");
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          const children = getChildren(data, selectedPersonId);
          if (children.length > 0) jumpTo(children[0].id, "Child");
          else pushToast("No child linked.", "info");
          return;
        }
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          const spouses = getSpouses(data, selectedPersonId);
          if (spouses.length > 0) jumpTo(spouses[0].id, "Spouse");
          else pushToast("No spouse linked.", "info");
          return;
        }
      }

      if (inInput) return;

      if (e.key === "Escape") {
        selectPerson(null);
        selectEvent(null);
        return;
      }
      if (e.key === "1") {
        setViewMode("timeline");
        return;
      }
      if (e.key === "2") {
        setViewMode("tree");
        return;
      }
      if (e.key === "3") {
        setViewMode("map");
        return;
      }
      if (e.key === "4") {
        setViewMode("atlas");
        return;
      }
      if (e.key === "n" || e.key === "N") {
        const id = addPerson({ name: "New person", gender: "U" });
        selectPerson(id);
        return;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [addPerson, selectEvent, selectPerson, setViewMode]);

  if (!hydrated) {
    return (
      <div className="boot-screen">
        <p>Loading…</p>
      </div>
    );
  }

  // First-run: completely empty dataset → full-workspace welcome
  if (peopleCount === 0) {
    return (
      <div className="app">
        <TopBar
          onOpenPlaces={() => setPlacesOpen(true)}
          onOpenStats={() => setStatsOpen(true)}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenNarrative={() => setNarrativeOpen(true)}
        />
        <EmptyWorkspace onOpenNarrative={() => setNarrativeOpen(true)} />
        <Toasts />
        {placesOpen && <PlacesPanel onClose={() => setPlacesOpen(false)} />}
        {statsOpen && (
          <StatsPanel
            onClose={() => setStatsOpen(false)}
            onOpenDuplicates={() => {
              setStatsOpen(false);
              setDuplicatesOpen(true);
            }}
          />
        )}
        {duplicatesOpen && (
          <DuplicatesPanel onClose={() => setDuplicatesOpen(false)} />
        )}
        {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
        {narrativeOpen && <NarrativeInput onClose={() => setNarrativeOpen(false)} />}
        {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
      </div>
    );
  }

  return (
    <div className="app">
      <TopBar
        onOpenPlaces={() => setPlacesOpen(true)}
        onOpenStats={() => setStatsOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenNarrative={() => setNarrativeOpen(true)}
      />
      <div className="workspace">
        <PeopleList />
        {viewMode === "timeline" && <Timeline />}
        {viewMode === "tree" && <TreeView />}
        {viewMode === "map" && <MapView />}
        {viewMode === "atlas" && <AtlasView />}
        <Inspector />
      </div>
      <Toasts />
      {placesOpen && <PlacesPanel onClose={() => setPlacesOpen(false)} />}
      {statsOpen && (
        <StatsPanel
          onClose={() => setStatsOpen(false)}
          onOpenDuplicates={() => {
            setStatsOpen(false);
            setDuplicatesOpen(true);
          }}
        />
      )}
      {duplicatesOpen && (
        <DuplicatesPanel onClose={() => setDuplicatesOpen(false)} />
      )}
      {searchOpen && <GlobalSearch onClose={() => setSearchOpen(false)} />}
      {narrativeOpen && (
        <NarrativeInput onClose={() => setNarrativeOpen(false)} />
      )}
      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
