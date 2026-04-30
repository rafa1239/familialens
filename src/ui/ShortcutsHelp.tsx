/**
 * Keyboard shortcuts reference modal. Opened with `?`.
 */

import { useEscapeKey } from "./useEscapeKey";

type Shortcut = { keys: string[]; label: string };
type Group = { title: string; shortcuts: Shortcut[] };

const groups: Group[] = [
  {
    title: "Global",
    shortcuts: [
      { keys: ["?"], label: "Show this help" },
      { keys: ["Esc"], label: "Close dialogs / deselect" },
      { keys: ["⌘", "K"], label: "Global search" },
      { keys: ["⌘", "⇧", "K"], label: "Tell me (narrative input)" },
      { keys: ["⌘", "Z"], label: "Undo" },
      { keys: ["⌘", "⇧", "Z"], label: "Redo" }
    ]
  },
  {
    title: "Views",
    shortcuts: [
      { keys: ["1"], label: "Timeline view" },
      { keys: ["2"], label: "Tree view" },
      { keys: ["3"], label: "Map view" },
      { keys: ["4"], label: "Atlas (time+space)" }
    ]
  },
  {
    title: "Atlas",
    shortcuts: [
      { keys: ["Space"], label: "Play / pause scrubbing" },
      { keys: ["←"], label: "Year back" },
      { keys: ["→"], label: "Year forward" },
      { keys: ["⇧", "←"], label: "Decade back" },
      { keys: ["⇧", "→"], label: "Decade forward" },
      { keys: ["Home"], label: "Jump to earliest year" },
      { keys: ["End"], label: "Jump to latest year" }
    ]
  },
  {
    title: "People",
    shortcuts: [
      { keys: ["N"], label: "New person" },
      { keys: ["Double-click"], label: "Rename person inline" },
      { keys: ["Right-click"], label: "Context menu on any node" }
    ]
  },
  {
    title: "Relative navigation",
    shortcuts: [
      { keys: ["⌥", "↑"], label: "Go to parent" },
      { keys: ["⌥", "↓"], label: "Go to child" },
      { keys: ["⌥", "←"], label: "Go to spouse" },
      { keys: ["⌥", "→"], label: "Go to spouse" }
    ]
  },
  {
    title: "Timeline scrubber",
    shortcuts: [
      { keys: ["←"], label: "Year back (when scrubber active)" },
      { keys: ["→"], label: "Year forward" },
      { keys: ["⇧", "←"], label: "Decade back" },
      { keys: ["⇧", "→"], label: "Decade forward" }
    ]
  }
];

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  useEscapeKey(onClose);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal shortcuts-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="picker-header">
          <div>
            <h3>Keyboard shortcuts</h3>
            <p className="picker-sub">Press <kbd>Esc</kbd> to close.</p>
          </div>
          <button className="ghost small" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="shortcuts-body">
          {groups.map((group) => (
            <section key={group.title} className="shortcut-group">
              <h4>{group.title}</h4>
              <ul>
                {group.shortcuts.map((s, i) => (
                  <li key={i}>
                    <div className="shortcut-keys">
                      {s.keys.map((k, ki) => (
                        <kbd key={ki}>{k}</kbd>
                      ))}
                    </div>
                    <div className="shortcut-label">{s.label}</div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
