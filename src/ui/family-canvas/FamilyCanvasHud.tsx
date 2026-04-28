import type { DataState, FamilyEvent, Person } from "../../types";
import { EVENT_META } from "../../eventMeta";
import {
  getChildren,
  getParents,
  getSpouses
} from "../../relationships";
import { eventsForPerson, lifespanLabel } from "./canvasModel";

type Relation = "parent" | "spouse" | "child";

type FamilyCanvasHudProps = {
  person: Person;
  data: DataState;
  birthYear: number | null;
  deathYear: number | null;
  onPickRelation: (relation: Relation) => void;
  onAddEvent: () => void;
  onOpenTimeline: () => void;
  onSelectPerson: (personId: string) => void;
  onSelectEvent: (eventId: string) => void;
};

export function FamilyCanvasHud({
  person,
  data,
  birthYear,
  deathYear,
  onPickRelation,
  onAddEvent,
  onOpenTimeline,
  onSelectPerson,
  onSelectEvent
}: FamilyCanvasHudProps) {
  const parents = getParents(data, person.id);
  const children = getChildren(data, person.id);
  const spouses = getSpouses(data, person.id);
  const events = eventsForPerson(data, person.id);
  const sourceCount = new Set(events.flatMap((event) => event.sources)).size;

  return (
    <aside
      className="family-hud"
      aria-label={`Canvas tools for ${person.name}`}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <header className="family-hud-header">
        <div>
          <p className="family-hud-kicker">Selected</p>
          <h2>{person.name || "Unnamed"}</h2>
          <span>{lifespanLabel(birthYear, deathYear)}</span>
        </div>
        <button className="ghost small" onClick={onOpenTimeline}>
          Timeline
        </button>
      </header>

      <div className="family-hud-actions">
        <button onClick={() => onPickRelation("parent")}>Child of...</button>
        <button onClick={() => onPickRelation("child")}>Parent of...</button>
        <button onClick={() => onPickRelation("spouse")}>Married with...</button>
        <button className="primary" onClick={onAddEvent}>Add event</button>
      </div>

      <section className="family-hud-section">
        <div className="family-hud-section-title">Relations</div>
        <RelationRow
          label="Child of"
          people={parents}
          empty="No parents linked"
          onSelectPerson={onSelectPerson}
          onAdd={() => onPickRelation("parent")}
        />
        <RelationRow
          label="Parent of"
          people={children}
          empty="No children linked"
          onSelectPerson={onSelectPerson}
          onAdd={() => onPickRelation("child")}
        />
        <RelationRow
          label="Married with"
          people={spouses}
          empty="No spouse linked"
          onSelectPerson={onSelectPerson}
          onAdd={() => onPickRelation("spouse")}
        />
      </section>

      <section className="family-hud-section">
        <div className="family-hud-section-title">
          Timeline <span>{events.length} events / {sourceCount} sources</span>
        </div>
        {events.length === 0 ? (
          <p className="family-hud-empty">No events yet.</p>
        ) : (
          <div className="family-hud-events">
            {events.slice(0, 5).map((event) => (
              <button
                key={event.id}
                className="family-event-row"
                onClick={() => onSelectEvent(event.id)}
              >
                <span
                  className="family-event-dot"
                  style={{ background: EVENT_META[event.type].color }}
                />
                <span className="family-event-main">
                  <strong>{eventTitle(event)}</strong>
                  <small>{event.date?.display ?? "Date unknown"}</small>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </aside>
  );
}

function RelationRow({
  label,
  people,
  empty,
  onSelectPerson,
  onAdd
}: {
  label: string;
  people: Person[];
  empty: string;
  onSelectPerson: (personId: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="family-relation-row">
      <div className="family-relation-row-head">
        <span>{label}</span>
        <button className="ghost small" onClick={onAdd}>Add</button>
      </div>
      {people.length === 0 ? (
        <p>{empty}</p>
      ) : (
        <div className="family-relation-chips">
          {people.map((person) => (
            <button key={person.id} onClick={() => onSelectPerson(person.id)}>
              {person.name || "Unnamed"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function eventTitle(event: FamilyEvent): string {
  if (event.type === "custom" && event.customTitle) return event.customTitle;
  return EVENT_META[event.type].label;
}
