import { useEffect, useRef } from "react";
import { useStore } from "../store";

export function ContextMenu() {
  const ctx = useStore((s) => s.contextMenu);
  const data = useStore((s) => s.data);
  const {
    setContextMenu,
    createRelative,
    setLinkMode,
    deletePerson,
    setStatusMessage,
    selectOnly
  } = useStore();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ctx) return;
    const close = () => setContextMenu(null);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", handleKey);
    };
  }, [ctx, setContextMenu]);

  if (!ctx) return null;

  const person = data.people[ctx.targetId];
  if (!person) return null;

  const handle = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
    setContextMenu(null);
  };

  const addRelative = (relation: "parent" | "child" | "spouse") => {
    const result = createRelative(ctx.targetId, relation);
    if (!result.ok) setStatusMessage(result.reason);
    else {
      selectOnly(result.id);
      window.dispatchEvent(
        new CustomEvent("familialens:focus", {
          detail: { targetId: result.id }
        })
      );
      setStatusMessage(
        `Added ${relation === "parent" ? "a parent" : relation === "child" ? "a child" : "a spouse"}.`
      );
    }
  };

  const jumpTo = () => {
    selectOnly(ctx.targetId);
    window.dispatchEvent(
      new CustomEvent("familialens:focus", {
        detail: { targetId: ctx.targetId }
      })
    );
  };

  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: ctx.x, top: ctx.y }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button onClick={handle(jumpTo)}>Center on {person.name || "person"}</button>
      <div className="menu-divider" />
      <button onClick={handle(() => addRelative("parent"))}>Add Parent</button>
      <button onClick={handle(() => addRelative("child"))}>Add Child</button>
      <button onClick={handle(() => addRelative("spouse"))}>Add Spouse</button>
      <div className="menu-divider" />
      <button
        onClick={handle(() => {
          setLinkMode("parent", ctx.targetId);
          setStatusMessage("Click another person to link as parent.");
        })}
      >
        Start Parent Link
      </button>
      <button
        onClick={handle(() => {
          setLinkMode("spouse", ctx.targetId);
          setStatusMessage("Click another person to link as spouse.");
        })}
      >
        Start Spouse Link
      </button>
      <div className="menu-divider" />
      <button
        className="danger-item"
        onClick={handle(() => {
          if (window.confirm(`Delete ${person.name || "this person"}?`)) {
            deletePerson(person.id);
            setStatusMessage("Person deleted.");
          }
        })}
      >
        Delete
      </button>
    </div>
  );
}
