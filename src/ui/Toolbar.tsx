import { useStore } from "../store";

export function Toolbar() {
  const linkMode = useStore((s) => s.linkMode);
  const searchQuery = useStore((s) => s.searchQuery);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const respectPins = useStore((s) => s.respectPins);
  const viewMode = useStore((s) => s.viewMode);
  const {
    addPerson,
    setLinkMode,
    setStatusMessage,
    setSearchQuery,
    relayout,
    undo,
    redo,
    setRespectPins,
    setViewMode
  } = useStore();

  const fit = () => window.dispatchEvent(new CustomEvent("familialens:fit"));
  const zoomIn = () =>
    window.dispatchEvent(
      new CustomEvent("familialens:zoom", { detail: { direction: 1 } })
    );
  const zoomOut = () =>
    window.dispatchEvent(
      new CustomEvent("familialens:zoom", { detail: { direction: -1 } })
    );

  return (
    <div className="toolbar">
      <button
        className="primary"
        onClick={() => addPerson()}
        title="Add person (N)"
      >
        + Person
      </button>

      <div className="divider" />

      <button
        className={linkMode.type === "parent" ? "teal" : "ghost"}
        onClick={() => {
          setLinkMode("parent", null);
          setStatusMessage("Parent link mode — click first person.");
        }}
        title="Link parent (P)"
      >
        Parent
      </button>
      <button
        className={linkMode.type === "spouse" ? "teal" : "ghost"}
        onClick={() => {
          setLinkMode("spouse", null);
          setStatusMessage("Spouse link mode — click first person.");
        }}
        title="Link spouse (S)"
      >
        Spouse
      </button>
      {linkMode.type && (
        <button
          className="ghost"
          onClick={() => {
            setLinkMode(null, null);
            setStatusMessage("Link cancelled.");
          }}
        >
          Cancel
        </button>
      )}

      <div className="divider" />

      <input
        className="search-input"
        placeholder="Search..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      <div className="divider" />

      <button className="ghost icon-btn" onClick={zoomOut} title="Zoom out (-)">
        -
      </button>
      <button className="ghost icon-btn" onClick={zoomIn} title="Zoom in (+)">
        +
      </button>
      <button className="ghost" onClick={fit} title="Fit view (F)">
        Fit
      </button>

      <div className="divider" />

      <button className="ghost" onClick={relayout} title="Re-layout tree">
        Layout
      </button>
      <button
        className={respectPins ? "teal" : "ghost"}
        onClick={() => setRespectPins(!respectPins)}
        title="Toggle pin respect"
      >
        Pins
      </button>

      <div className="divider" />

      <button className="ghost" onClick={undo} disabled={!canUndo} title="Undo (Cmd+Z)">
        Undo
      </button>
      <button className="ghost" onClick={redo} disabled={!canRedo} title="Redo (Cmd+Shift+Z)">
        Redo
      </button>

      <div className="divider" />

      <button
        className={viewMode === "tree" ? "teal" : "ghost"}
        onClick={() => setViewMode("tree")}
      >
        Tree
      </button>
      <button
        className={viewMode === "timeline" ? "teal" : "ghost"}
        onClick={() => setViewMode("timeline")}
      >
        Timeline
      </button>
    </div>
  );
}
