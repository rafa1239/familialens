import { useMemo, useRef, useState, useEffect } from "react";
import { useStore } from "../store";
import type { DataState, Person } from "../types";
import { PhotoThumb } from "./PhotoThumb";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { PersonPicker, type PickerResult } from "./PersonPicker";

function countEvents(data: DataState, personId: string): number {
  let n = 0;
  for (const ev of Object.values(data.events)) {
    if (ev.people.includes(personId)) n += 1;
  }
  return n;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function PeopleList() {
  const data = useStore((s) => s.data);
  const selectedPersonId = useStore((s) => s.selectedPersonId);
  const selectPerson = useStore((s) => s.selectPerson);
  const selectEvent = useStore((s) => s.selectEvent);
  const addPerson = useStore((s) => s.addPerson);
  const updatePerson = useStore((s) => s.updatePerson);
  const deletePerson = useStore((s) => s.deletePerson);
  const createRelative = useStore((s) => s.createRelative);
  const linkParent = useStore((s) => s.linkParent);
  const linkSpouse = useStore((s) => s.linkSpouse);
  const pushToast = useStore((s) => s.pushToast);

  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGender, setNewGender] = useState<"M" | "F" | "U">("U");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    personId: string;
  } | null>(null);
  const [picker, setPicker] = useState<{
    personId: string;
    relation: "parent" | "spouse" | "child";
  } | null>(null);

  const filtered = useMemo(() => {
    const list = Object.values(data.people);
    const q = query.trim().toLowerCase();
    const matched = q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list;
    return matched.sort((a, b) => a.name.localeCompare(b.name));
  }, [data.people, query]);

  const handleCreate = () => {
    const name = newName.trim() || "Unnamed";
    const id = addPerson({ name, gender: newGender });
    selectPerson(id);
    selectEvent(null);
    setNewName("");
    setNewGender("U");
    setAdding(false);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <input
          className="search"
          placeholder="Search people..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="people-scroll">
        {filtered.length === 0 && (
          <div className="sidebar-empty">
            {data.people && Object.keys(data.people).length === 0
              ? "No people yet."
              : "No matches."}
          </div>
        )}

        {filtered.map((person) => (
          <PersonRow
            key={person.id}
            person={person}
            eventCount={countEvents(data, person.id)}
            selected={person.id === selectedPersonId}
            editing={editingId === person.id}
            onSelect={() => {
              selectPerson(person.id);
              selectEvent(null);
            }}
            onStartEdit={() => setEditingId(person.id)}
            onEndEdit={(newName) => {
              if (newName.trim() && newName.trim() !== person.name) {
                updatePerson(person.id, { name: newName.trim() });
              }
              setEditingId(null);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              selectPerson(person.id);
              setContextMenu({ x: e.clientX, y: e.clientY, personId: person.id });
            }}
          />
        ))}
      </div>

      {contextMenu &&
        (() => {
          const items: MenuItem[] = [
            {
              kind: "action",
              label: "Rename",
              onClick: () => setEditingId(contextMenu.personId)
            },
            { kind: "separator" },
            {
              kind: "action",
              label: "Add parent…",
              onClick: () => setPicker({ personId: contextMenu.personId, relation: "parent" })
            },
            {
              kind: "action",
              label: "Add spouse…",
              onClick: () => setPicker({ personId: contextMenu.personId, relation: "spouse" })
            },
            {
              kind: "action",
              label: "Add child…",
              onClick: () => setPicker({ personId: contextMenu.personId, relation: "child" })
            },
            { kind: "separator" },
            {
              kind: "action",
              label: "Delete",
              danger: true,
              onClick: () => {
                const p = data.people[contextMenu.personId];
                if (p && window.confirm(`Delete ${p.name}?`)) {
                  deletePerson(contextMenu.personId);
                  pushToast("Person deleted.", "info");
                }
              }
            }
          ];
          return (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              items={items}
              onClose={() => setContextMenu(null)}
            />
          );
        })()}

      {picker &&
        (() => {
          const anchor = data.people[picker.personId];
          if (!anchor) return null;
          const title =
            picker.relation === "parent"
              ? `Add parent of ${anchor.name}`
              : picker.relation === "spouse"
                ? `Add spouse of ${anchor.name}`
                : `Add child of ${anchor.name}`;
          const handlePick = (result: PickerResult) => {
            if (result.kind === "new") {
              const res = createRelative(picker.personId, picker.relation, {
                name: result.name,
                gender: result.gender
              });
              if (!res.ok) pushToast(res.reason, "error");
              else {
                let msg = `Added ${result.name}.`;
                if (res.autoLinkedParent) {
                  const p = data.people[res.autoLinkedParent];
                  if (p) msg += ` ${p.name} auto-linked as second parent.`;
                }
                pushToast(msg, "success");
              }
            } else {
              let res;
              if (picker.relation === "parent")
                res = linkParent(picker.personId, result.person.id);
              else if (picker.relation === "spouse")
                res = linkSpouse(picker.personId, result.person.id);
              else res = linkParent(result.person.id, picker.personId);
              if (!res.ok) pushToast(res.reason, "error");
              else pushToast(`Linked ${result.person.name}.`, "success");
            }
            setPicker(null);
            setContextMenu(null);
          };
          return (
            <PersonPicker
              title={title}
              excludeIds={new Set([picker.personId])}
              onPick={handlePick}
              onCancel={() => setPicker(null)}
            />
          );
        })()}

      <div className="sidebar-footer">
        {adding ? (
          <div className="add-form">
            <input
              autoFocus
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") setAdding(false);
              }}
            />
            <select
              value={newGender}
              onChange={(e) => setNewGender(e.target.value as "M" | "F" | "U")}
            >
              <option value="U">Unknown</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
            <div className="add-form-actions">
              <button className="primary" onClick={handleCreate}>
                Add
              </button>
              <button className="ghost" onClick={() => setAdding(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="add-btn" onClick={() => setAdding(true)}>
            + Add person
          </button>
        )}
      </div>
    </aside>
  );
}

function PersonRow({
  person,
  eventCount,
  selected,
  editing,
  onSelect,
  onStartEdit,
  onEndEdit,
  onContextMenu
}: {
  person: Person;
  eventCount: number;
  selected: boolean;
  editing: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onEndEdit: (newName: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(person.name);

  useEffect(() => {
    if (editing) {
      setDraft(person.name);
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [editing, person.name]);

  if (editing) {
    return (
      <div className={`person-row editing ${selected ? "selected" : ""}`}>
        <div className={`person-avatar gender-${person.gender}`}>
          {person.photo ? (
            <PhotoThumb id={person.photo} alt={person.name} />
          ) : (
            initials(person.name)
          )}
        </div>
        <input
          ref={inputRef}
          className="inline-rename"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onEndEdit(draft);
            if (e.key === "Escape") onEndEdit(person.name);
          }}
          onBlur={() => onEndEdit(draft)}
        />
      </div>
    );
  }

  return (
    <button
      className={`person-row ${selected ? "selected" : ""}`}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onStartEdit();
      }}
      onContextMenu={onContextMenu}
    >
      <div className={`person-avatar gender-${person.gender}`}>
        {person.photo ? (
          <PhotoThumb id={person.photo} alt={person.name} />
        ) : (
          initials(person.name)
        )}
      </div>
      <div className="person-info">
        <div className="person-name">{person.name || "Unnamed"}</div>
        <div className="person-meta">
          {eventCount} {eventCount === 1 ? "event" : "events"}
        </div>
      </div>
    </button>
  );
}
