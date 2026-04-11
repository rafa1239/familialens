import { useMemo, useRef, useState, useEffect } from "react";
import { useStore } from "../store";
import type {
  FamilyEvent,
  Gender,
  Person,
  SourceReliability
} from "../types";
import { EVENT_META, EVENT_TYPES } from "../eventMeta";
import { parseDate } from "../dates";
import { addPhoto, removePhoto } from "../photos";
import { PhotoThumb } from "./PhotoThumb";
import { PersonPicker, type PickerResult } from "./PersonPicker";
import { PlaceAutocomplete } from "./PlaceAutocomplete";
import { RelationshipFinder } from "./RelationshipFinder";
import { generateStory } from "../story";
import {
  findBirthEvent,
  findDeathEvent,
  getChildren,
  getParents,
  getSiblings,
  getSpouses
} from "../relationships";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ═══════════════════════════════════════════════
// Inspector root
// ═══════════════════════════════════════════════

export function Inspector() {
  const data = useStore((s) => s.data);
  const selectedPersonId = useStore((s) => s.selectedPersonId);
  const selectedEventId = useStore((s) => s.selectedEventId);
  const selectEvent = useStore((s) => s.selectEvent);

  const person = selectedPersonId ? data.people[selectedPersonId] ?? null : null;
  const selectedEvent = selectedEventId ? data.events[selectedEventId] ?? null : null;

  if (!person) {
    return (
      <aside className="inspector">
        <div className="inspector-empty">
          <p>Select a person on the left, on the timeline, or on the tree.</p>
          <p className="kbd-hint">
            Press <kbd>N</kbd> to create a new person, <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> to switch views.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="inspector">
      <PersonHeader key={person.id} person={person} />
      <RelationshipsSection key={`rel-${person.id}`} person={person} />
      <StorySection key={`story-${person.id}`} person={person} />
      <PersonEvents key={`ev-${person.id}`} person={person} />
      {selectedEvent && selectedEvent.people.includes(person.id) && (
        <EventEditor
          key={selectedEvent.id}
          event={selectedEvent}
          onClose={() => selectEvent(null)}
        />
      )}
    </aside>
  );
}

// ═══════════════════════════════════════════════
// Story section — prose narrative + relate button
// ═══════════════════════════════════════════════

function StorySection({ person }: { person: Person }) {
  const data = useStore((s) => s.data);
  const pushToast = useStore((s) => s.pushToast);
  const [showFinder, setShowFinder] = useState(false);

  const story = useMemo(() => generateStory(data, person.id), [data, person.id]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(story);
      pushToast("Story copied to clipboard.", "success");
    } catch {
      pushToast("Couldn't copy.", "error");
    }
  };

  return (
    <section className="inspector-section">
      <div className="section-title">
        <h3>Story</h3>
        <div className="section-title-actions">
          <button
            className="ghost small"
            onClick={() => setShowFinder(true)}
            title="Compare with another person"
          >
            Compare
          </button>
          <button
            className="ghost small"
            onClick={copy}
            title="Copy the generated story"
          >
            Copy
          </button>
        </div>
      </div>
      <p className="story-text">{story}</p>
      {showFinder && (
        <RelationshipFinder
          aId={person.id}
          onClose={() => setShowFinder(false)}
        />
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════
// Person header — edit name, gender, photo, notes
// ═══════════════════════════════════════════════

function PersonHeader({ person }: { person: Person }) {
  const data = useStore((s) => s.data);
  const updatePerson = useStore((s) => s.updatePerson);
  const deletePerson = useStore((s) => s.deletePerson);
  const setBirthFact = useStore((s) => s.setBirthFact);
  const setDeathFact = useStore((s) => s.setDeathFact);
  const pushToast = useStore((s) => s.pushToast);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(person.name);
  const [gender, setGender] = useState<Gender>(person.gender);
  const [notes, setNotes] = useState(person.notes ?? "");

  // Quick fact inputs — birth/death date + place, pulled from derived events
  const birthEvent = useMemo(() => findBirthEvent(data, person.id), [data, person.id]);
  const deathEvent = useMemo(() => findDeathEvent(data, person.id), [data, person.id]);
  const [birthDate, setBirthDate] = useState(birthEvent?.date?.display ?? "");
  const [birthPlace, setBirthPlace] = useState(birthEvent?.place?.name ?? "");
  const [birthCoords, setBirthCoords] = useState<{ lat?: number; lon?: number } | null>(null);
  const [deathDate, setDeathDate] = useState(deathEvent?.date?.display ?? "");
  const [deathPlace, setDeathPlace] = useState(deathEvent?.place?.name ?? "");
  const [deathCoords, setDeathCoords] = useState<{ lat?: number; lon?: number } | null>(null);

  useEffect(() => {
    setBirthDate(birthEvent?.date?.display ?? "");
    setBirthPlace(birthEvent?.place?.name ?? "");
    setBirthCoords(null);
  }, [birthEvent?.id, birthEvent?.date?.display, birthEvent?.place?.name]);

  useEffect(() => {
    setDeathDate(deathEvent?.date?.display ?? "");
    setDeathPlace(deathEvent?.place?.name ?? "");
    setDeathCoords(null);
  }, [deathEvent?.id, deathEvent?.date?.display, deathEvent?.place?.name]);

  const commitBirth = () => {
    const currentDate = birthEvent?.date?.display ?? "";
    const currentPlace = birthEvent?.place?.name ?? "";
    if (
      birthDate === currentDate &&
      birthPlace === currentPlace &&
      !birthCoords
    )
      return;
    setBirthFact(person.id, {
      dateStr: birthDate,
      placeName: birthPlace,
      placeLat: birthCoords?.lat,
      placeLon: birthCoords?.lon
    });
  };
  const commitDeath = () => {
    const currentDate = deathEvent?.date?.display ?? "";
    const currentPlace = deathEvent?.place?.name ?? "";
    if (
      deathDate === currentDate &&
      deathPlace === currentPlace &&
      !deathCoords
    )
      return;
    setDeathFact(person.id, {
      dateStr: deathDate,
      placeName: deathPlace,
      placeLat: deathCoords?.lat,
      placeLon: deathCoords?.lon
    });
  };

  const handlePhotoUpload = async (file: File) => {
    try {
      const id = await addPhoto(file);
      if (
        person.photo &&
        !person.photo.startsWith("data:") &&
        !person.photo.startsWith("http")
      ) {
        removePhoto(person.photo).catch(() => undefined);
      }
      updatePerson(person.id, { photo: id });
      pushToast("Photo updated.", "success");
    } catch {
      pushToast("Couldn't load that image.", "error");
    }
  };

  const handleRemovePhoto = () => {
    if (!person.photo) return;
    if (!person.photo.startsWith("data:") && !person.photo.startsWith("http")) {
      removePhoto(person.photo).catch(() => undefined);
    }
    updatePerson(person.id, { photo: undefined });
  };

  const save = () => {
    updatePerson(person.id, {
      name: name.trim() || "Unnamed",
      gender,
      notes: notes || undefined
    });
    setEditing(false);
  };

  return (
    <section className="inspector-section inspector-header">
      <div
        className={`header-avatar gender-${person.gender}`}
        onClick={() => photoInputRef.current?.click()}
        title="Click to change photo"
      >
        {person.photo ? (
          <PhotoThumb id={person.photo} alt={person.name} />
        ) : (
          initials(person.name)
        )}
        <div className="avatar-hover">Photo</div>
      </div>
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handlePhotoUpload(f);
          e.currentTarget.value = "";
        }}
      />

      {editing ? (
        <div className="header-edit">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value as Gender)}
          >
            <option value="U">Unknown</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
          </select>
          <textarea
            placeholder="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
          <div className="header-edit-actions">
            <button className="primary" onClick={save}>
              Save
            </button>
            <button className="ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="header-view">
          <h2>{person.name || "Unnamed"}</h2>
          <div className="header-meta">
            {person.gender === "M" && "Male"}
            {person.gender === "F" && "Female"}
            {person.gender === "U" && "Unknown"}
          </div>

          {/* Quick facts — inline editing of birth/death */}
          <div className="facts-grid">
            <div className="fact-label">Born</div>
            <div className="fact-inputs">
              <input
                className="fact-date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                onBlur={commitBirth}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                placeholder="year"
              />
              <PlaceAutocomplete
                className="fact-place"
                value={birthPlace}
                onChange={(name, coords) => {
                  setBirthPlace(name);
                  if (coords) setBirthCoords(coords);
                }}
                onCommit={commitBirth}
                placeholder="place"
              />
            </div>

            <div className="fact-label">Died</div>
            <div className="fact-inputs">
              <input
                className="fact-date"
                value={deathDate}
                onChange={(e) => setDeathDate(e.target.value)}
                onBlur={commitDeath}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                placeholder="year"
              />
              <PlaceAutocomplete
                className="fact-place"
                value={deathPlace}
                onChange={(name, coords) => {
                  setDeathPlace(name);
                  if (coords) setDeathCoords(coords);
                }}
                onCommit={commitDeath}
                placeholder="place"
              />
            </div>
          </div>

          {person.notes && <p className="header-notes">{person.notes}</p>}
          <div className="header-actions">
            <button className="ghost" onClick={() => setEditing(true)}>
              Edit name / notes
            </button>
            {person.photo && (
              <button className="ghost" onClick={handleRemovePhoto}>
                Remove photo
              </button>
            )}
            <button
              className="ghost danger"
              onClick={() => {
                if (window.confirm(`Delete ${person.name || "this person"}?`)) {
                  deletePerson(person.id);
                  pushToast("Person deleted.", "info");
                }
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════
// Relationships section — parents/spouses/children as chips
// ═══════════════════════════════════════════════

type PickerMode = null | {
  relation: "parent" | "spouse" | "child";
};

function RelationshipsSection({ person }: { person: Person }) {
  const data = useStore((s) => s.data);
  const linkParent = useStore((s) => s.linkParent);
  const unlinkParent = useStore((s) => s.unlinkParent);
  const linkSpouse = useStore((s) => s.linkSpouse);
  const unlinkSpouse = useStore((s) => s.unlinkSpouse);
  const createRelative = useStore((s) => s.createRelative);
  const selectPerson = useStore((s) => s.selectPerson);
  const selectEvent = useStore((s) => s.selectEvent);
  const pushToast = useStore((s) => s.pushToast);
  const [picker, setPicker] = useState<PickerMode>(null);

  const parents = useMemo(() => getParents(data, person.id), [data, person.id]);
  const spouses = useMemo(() => getSpouses(data, person.id), [data, person.id]);
  const children = useMemo(() => getChildren(data, person.id), [data, person.id]);
  const siblings = useMemo(() => getSiblings(data, person.id), [data, person.id]);

  const handlePick = (result: PickerResult) => {
    if (!picker) return;
    const { relation } = picker;

    if (result.kind === "new") {
      const created = createRelative(person.id, relation, {
        name: result.name,
        gender: result.gender
      });
      if (!created.ok) {
        pushToast(created.reason, "error");
      } else {
        let msg =
          relation === "parent"
            ? `Added ${result.name} as parent.`
            : relation === "spouse"
              ? `Added ${result.name} as spouse.`
              : `Added ${result.name} as child.`;
        if (created.autoLinkedParent) {
          const otherParent = data.people[created.autoLinkedParent];
          if (otherParent) {
            msg += ` ${otherParent.name} auto-linked as second parent.`;
          }
        }
        pushToast(msg, "success");
      }
      setPicker(null);
      return;
    }

    // Existing person
    const otherId = result.person.id;
    let res;
    if (relation === "parent") res = linkParent(person.id, otherId);
    else if (relation === "spouse") res = linkSpouse(person.id, otherId);
    else res = linkParent(otherId, person.id); // child: person is the parent

    if (!res.ok) {
      pushToast(res.reason, "error");
    } else {
      const verb =
        relation === "parent"
          ? "parent"
          : relation === "spouse"
            ? "spouse"
            : "child";
      pushToast(`Linked ${result.person.name} as ${verb}.`, "success");
    }
    setPicker(null);
  };

  const excludeIds = useMemo(() => {
    const s = new Set<string>([person.id]);
    if (!picker) return s;
    if (picker.relation === "parent") {
      parents.forEach((p) => s.add(p.id));
    } else if (picker.relation === "spouse") {
      spouses.forEach((p) => s.add(p.id));
    } else {
      children.forEach((p) => s.add(p.id));
    }
    return s;
  }, [picker, person.id, parents, spouses, children]);

  const jumpTo = (id: string) => {
    selectPerson(id);
    selectEvent(null);
  };

  const pickerTitle =
    picker?.relation === "parent"
      ? `Add parent of ${person.name}`
      : picker?.relation === "spouse"
        ? `Add spouse of ${person.name}`
        : picker?.relation === "child"
          ? `Add child of ${person.name}`
          : "";

  return (
    <section className="inspector-section">
      <div className="section-title">
        <h3>Relationships</h3>
      </div>

      <RelationGroup
        label="Parents"
        people={parents}
        canAdd={parents.length < 2}
        onAdd={() => setPicker({ relation: "parent" })}
        onJump={jumpTo}
        onRemove={(otherId) => {
          unlinkParent(person.id, otherId);
          pushToast("Parent unlinked.", "info");
        }}
      />

      <RelationGroup
        label="Spouse(s)"
        people={spouses}
        canAdd={true}
        onAdd={() => setPicker({ relation: "spouse" })}
        onJump={jumpTo}
        onRemove={(otherId) => {
          unlinkSpouse(person.id, otherId);
          pushToast("Marriage unlinked.", "info");
        }}
      />

      <RelationGroup
        label="Children"
        people={children}
        canAdd={true}
        onAdd={() => setPicker({ relation: "child" })}
        onJump={jumpTo}
        onRemove={(childId) => {
          unlinkParent(childId, person.id);
          pushToast("Child unlinked.", "info");
        }}
      />

      {siblings.length > 0 && (
        <RelationGroup
          label="Siblings"
          people={siblings}
          canAdd={false}
          onAdd={() => undefined}
          onJump={jumpTo}
        />
      )}

      {picker && (
        <PersonPicker
          title={pickerTitle}
          excludeIds={excludeIds}
          onPick={handlePick}
          onCancel={() => setPicker(null)}
        />
      )}
    </section>
  );
}

function RelationGroup({
  label,
  people,
  canAdd,
  onAdd,
  onJump,
  onRemove
}: {
  label: string;
  people: Person[];
  canAdd: boolean;
  onAdd: () => void;
  onJump: (id: string) => void;
  onRemove?: (id: string) => void;
}) {
  if (people.length === 0 && !canAdd) return null;
  return (
    <div className="relation-group">
      <div className="relation-label">{label}</div>
      <div className="relation-chips">
        {people.map((p) => (
          <div key={p.id} className="relation-chip">
            <button className="chip-body" onClick={() => onJump(p.id)}>
              <div className={`chip-avatar gender-${p.gender}`}>
                {p.photo ? (
                  <PhotoThumb id={p.photo} alt={p.name} />
                ) : (
                  initials(p.name)
                )}
              </div>
              <span className="chip-name">{p.name || "Unnamed"}</span>
            </button>
            {onRemove && (
              <button
                className="chip-remove"
                onClick={() => onRemove(p.id)}
                title="Unlink"
                aria-label="Unlink"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {canAdd && (
          <button className="relation-add" onClick={onAdd}>
            + Add
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════
// Events section
// ═══════════════════════════════════════════════

function PersonEvents({ person }: { person: Person }) {
  const data = useStore((s) => s.data);
  const addEvent = useStore((s) => s.addEvent);
  const selectEvent = useStore((s) => s.selectEvent);
  const selectedEventId = useStore((s) => s.selectedEventId);
  const [adding, setAdding] = useState(false);

  const personEvents = useMemo(
    () =>
      Object.values(data.events)
        .filter((e) => e.people.includes(person.id))
        .sort((a, b) => {
          const ka = a.date?.sortKey ?? Number.POSITIVE_INFINITY;
          const kb = b.date?.sortKey ?? Number.POSITIVE_INFINITY;
          return ka - kb;
        }),
    [data.events, person.id]
  );

  const handleAddEvent = (type: FamilyEvent["type"]) => {
    const id = addEvent({ type, people: [person.id] });
    selectEvent(id);
    setAdding(false);
  };

  return (
    <section className="inspector-section">
      <div className="section-title">
        <h3>Events</h3>
        <button className="ghost small" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "+ Event"}
        </button>
      </div>

      {adding && (
        <div className="event-type-picker">
          {EVENT_TYPES.map((t) => (
            <button
              key={t}
              className="type-chip"
              style={{ borderColor: EVENT_META[t].color }}
              onClick={() => handleAddEvent(t)}
            >
              <span className="type-dot" style={{ background: EVENT_META[t].color }} />
              {EVENT_META[t].label}
            </button>
          ))}
        </div>
      )}

      {personEvents.length === 0 ? (
        <p className="helper">No events yet.</p>
      ) : (
        <ul className="event-list">
          {personEvents.map((ev) => {
            const meta = EVENT_META[ev.type];
            const isSelected = ev.id === selectedEventId;
            return (
              <li
                key={ev.id}
                className={`event-item ${isSelected ? "selected" : ""}`}
                onClick={() => selectEvent(ev.id)}
              >
                <span
                  className="event-list-dot"
                  style={{ background: meta.color }}
                />
                <div className="event-item-body">
                  <div className="event-item-title">
                    {ev.type === "custom" && ev.customTitle
                      ? ev.customTitle
                      : meta.label}
                  </div>
                  <div className="event-item-date">
                    {ev.date?.display ?? "— no date —"}
                    {ev.place && ` · ${ev.place.name}`}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════
// Event editor
// ═══════════════════════════════════════════════

function EventEditor({
  event,
  onClose
}: {
  event: FamilyEvent;
  onClose: () => void;
}) {
  const data = useStore((s) => s.data);
  const updateEvent = useStore((s) => s.updateEvent);
  const deleteEvent = useStore((s) => s.deleteEvent);
  const pushToast = useStore((s) => s.pushToast);

  const [dateStr, setDateStr] = useState(event.date?.display ?? "");
  const [placeStr, setPlaceStr] = useState(event.place?.name ?? "");
  const [latStr, setLatStr] = useState(
    event.place?.lat != null ? String(event.place.lat) : ""
  );
  const [lonStr, setLonStr] = useState(
    event.place?.lon != null ? String(event.place.lon) : ""
  );
  const [notes, setNotes] = useState(event.notes ?? "");
  const [customTitle, setCustomTitle] = useState(event.customTitle ?? "");
  const [picker, setPicker] = useState(false);

  // Reset local form state when the event id changes
  useEffect(() => {
    setDateStr(event.date?.display ?? "");
    setPlaceStr(event.place?.name ?? "");
    setLatStr(event.place?.lat != null ? String(event.place.lat) : "");
    setLonStr(event.place?.lon != null ? String(event.place.lon) : "");
    setNotes(event.notes ?? "");
    setCustomTitle(event.customTitle ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id]);

  const save = () => {
    const parsed = parseDate(dateStr);
    const trimmedPlace = placeStr.trim();
    const lat = latStr.trim() ? Number(latStr) : undefined;
    const lon = lonStr.trim() ? Number(lonStr) : undefined;
    const place = trimmedPlace
      ? {
          name: trimmedPlace,
          lat: Number.isFinite(lat) ? lat : undefined,
          lon: Number.isFinite(lon) ? lon : undefined
        }
      : undefined;
    updateEvent(event.id, {
      date: parsed,
      place,
      notes: notes || undefined,
      customTitle: event.type === "custom" ? customTitle : undefined
    });
  };

  const meta = EVENT_META[event.type];
  const eventPeople = event.people
    .map((pid) => data.people[pid])
    .filter(Boolean);

  const handleAddPerson = (result: PickerResult) => {
    if (result.kind === "existing") {
      if (event.people.includes(result.person.id)) {
        pushToast("Already in this event.", "error");
        setPicker(false);
        return;
      }
      updateEvent(event.id, { people: [...event.people, result.person.id] });
      pushToast(`Added ${result.person.name} to event.`, "success");
    }
    setPicker(false);
  };

  const handleRemovePerson = (pid: string) => {
    if (event.people.length === 1) {
      pushToast("An event needs at least one person.", "error");
      return;
    }
    updateEvent(event.id, { people: event.people.filter((p) => p !== pid) });
  };

  return (
    <section className="inspector-section event-editor">
      <div className="section-title">
        <h3>
          <span
            className="event-list-dot"
            style={{ background: meta.color, marginRight: 8 }}
          />
          {meta.label}
        </h3>
        <button className="ghost small" onClick={onClose}>
          Close
        </button>
      </div>

      {event.type === "custom" && (
        <label className="field">
          <span>Title</span>
          <input
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            onBlur={save}
            placeholder="Describe this event"
          />
        </label>
      )}

      <label className="field">
        <span>Date</span>
        <input
          value={dateStr}
          onChange={(e) => setDateStr(e.target.value)}
          onBlur={save}
          placeholder="1950, 1950-03, c. 1950, before 1950…"
        />
      </label>

      <div className="field">
        <span>Place</span>
        <PlaceAutocomplete
          value={placeStr}
          onChange={(name, coords) => {
            setPlaceStr(name);
            if (coords?.lat != null) setLatStr(String(coords.lat));
            if (coords?.lon != null) setLonStr(String(coords.lon));
          }}
          onCommit={save}
          placeholder="City, Country"
        />
      </div>

      <div className="field-row">
        <label className="field">
          <span>Latitude</span>
          <input
            value={latStr}
            onChange={(e) => setLatStr(e.target.value)}
            onBlur={save}
            placeholder="38.72"
          />
        </label>
        <label className="field">
          <span>Longitude</span>
          <input
            value={lonStr}
            onChange={(e) => setLonStr(e.target.value)}
            onBlur={save}
            placeholder="-9.14"
          />
        </label>
      </div>

      <label className="field">
        <span>Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={save}
          placeholder="Sources, context…"
          rows={3}
        />
      </label>

      <div className="field">
        <span>People involved</span>
        <div className="people-chips">
          {eventPeople.map((p) => (
            <div key={p.id} className="people-chip">
              <span>{p.name}</span>
              <button
                className="chip-x"
                onClick={() => handleRemovePerson(p.id)}
                aria-label="Remove"
              >
                ×
              </button>
            </div>
          ))}
          <button className="chip-add" onClick={() => setPicker(true)}>
            + Add
          </button>
        </div>
      </div>

      <EventSources event={event} />

      <div className="event-editor-actions">
        <button
          className="danger"
          onClick={() => {
            if (window.confirm(`Delete this ${meta.label.toLowerCase()} event?`)) {
              deleteEvent(event.id);
              pushToast("Event deleted.", "info");
            }
          }}
        >
          Delete event
        </button>
      </div>

      {picker && (
        <PersonPicker
          title="Add person to this event"
          excludeIds={new Set(event.people)}
          onPick={handleAddPerson}
          onCancel={() => setPicker(false)}
        />
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════
// Sources for an event
// ═══════════════════════════════════════════════

function EventSources({ event }: { event: FamilyEvent }) {
  const data = useStore((s) => s.data);
  const addSource = useStore((s) => s.addSource);
  const updateEvent = useStore((s) => s.updateEvent);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [citation, setCitation] = useState("");
  const [url, setUrl] = useState("");
  const [reliability, setReliability] = useState<SourceReliability>("secondary");

  const attached = event.sources.map((sid) => data.sources[sid]).filter(Boolean);

  const handleAdd = () => {
    if (!title.trim()) return;
    const sid = addSource({
      title: title.trim(),
      citation: citation.trim() || undefined,
      url: url.trim() || undefined,
      reliability
    });
    updateEvent(event.id, { sources: [...event.sources, sid] });
    setTitle("");
    setCitation("");
    setUrl("");
    setReliability("secondary");
    setAdding(false);
  };

  const handleDetach = (sid: string) => {
    updateEvent(event.id, { sources: event.sources.filter((s) => s !== sid) });
  };

  return (
    <div className="sources-block">
      <div className="sources-header">
        <span>Sources</span>
        <button className="ghost small" onClick={() => setAdding((v) => !v)}>
          {adding ? "Cancel" : "+ Source"}
        </button>
      </div>

      {attached.length === 0 && !adding && <p className="helper">No sources cited.</p>}

      {attached.map((src) => (
        <div key={src.id} className="source-row">
          <div className="source-body">
            <div className="source-title">
              {src.url ? (
                <a href={src.url} target="_blank" rel="noreferrer">
                  {src.title}
                </a>
              ) : (
                src.title
              )}
            </div>
            {src.citation && <div className="source-citation">{src.citation}</div>}
            <div className="source-meta">
              <span className={`reliability-tag ${src.reliability}`}>
                {src.reliability}
              </span>
            </div>
          </div>
          <button
            className="mini-btn"
            onClick={() => handleDetach(src.id)}
            title="Detach"
          >
            ×
          </button>
        </div>
      ))}

      {adding && (
        <div className="source-form">
          <input
            autoFocus
            placeholder="Title (e.g. Birth certificate, Bragança 1898)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            placeholder="Citation (optional)"
            value={citation}
            onChange={(e) => setCitation(e.target.value)}
          />
          <input
            placeholder="URL (optional)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <select
            value={reliability}
            onChange={(e) => setReliability(e.target.value as SourceReliability)}
          >
            <option value="primary">Primary (original document)</option>
            <option value="secondary">Secondary (transcription, book)</option>
            <option value="tertiary">Tertiary (encyclopedia, other tree)</option>
            <option value="unknown">Unknown</option>
          </select>
          <button className="primary" onClick={handleAdd}>
            Add source
          </button>
        </div>
      )}
    </div>
  );
}
