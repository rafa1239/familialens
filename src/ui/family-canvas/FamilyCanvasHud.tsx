import type { DataState, FamilyEvent, Person } from "../../types";
import { EVENT_META } from "../../eventMeta";
import {
  getChildren,
  getParents,
  getSiblings,
  getSpouses
} from "../../relationships";
import { buildPersonInsight, eventsForPerson, lifespanLabel, type StoryLine } from "./canvasModel";

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
  const siblings = getSiblings(data, person.id);
  const events = eventsForPerson(data, person.id);
  const insight = buildPersonInsight(data, person.id);
  const evidencePercent = Math.round(insight.evidenceRatio * 100);

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

      <div className="family-hud-statrail" aria-label="Selected person summary">
        <button onClick={() => onPickRelation("parent")}>
          <strong>{parents.length}</strong>
          <span>parents</span>
        </button>
        <button onClick={() => onPickRelation("child")}>
          <strong>{children.length}</strong>
          <span>children</span>
        </button>
        <button onClick={() => onPickRelation("spouse")}>
          <strong>{spouses.length}</strong>
          <span>spouses</span>
        </button>
        <button onClick={onOpenTimeline}>
          <strong>{events.length}</strong>
          <span>events</span>
        </button>
      </div>

      <div className="family-hud-actions">
        <button onClick={() => onPickRelation("parent")}>Child of...</button>
        <button onClick={() => onPickRelation("child")}>Parent of...</button>
        <button onClick={() => onPickRelation("spouse")}>Married with...</button>
        <button className="primary" onClick={onAddEvent}>Add event</button>
      </div>

      <section className="family-story-panel" aria-label="Story and evidence">
        <div className="family-story-lines">
          {insight.storyLines.map((line, index) => (
            <StoryLineRow key={`${line.tone}-${index}`} line={line} />
          ))}
        </div>
        <div className="family-evidence">
          <div className="family-evidence-head">
            <span>Evidence</span>
            <strong>{insight.sourcedEvents}/{insight.events}</strong>
          </div>
          <div className="family-evidence-track" aria-hidden="true">
            <span style={{ width: `${evidencePercent}%` }} />
          </div>
          <p>
            {insight.events === 0
              ? "No records yet."
              : insight.missingSources === 0
                ? `${insight.sources} source${insight.sources === 1 ? "" : "s"} attached.`
                : `${insight.missingSources} event${insight.missingSources === 1 ? "" : "s"} without a source.`}
          </p>
        </div>
      </section>

      <section className="family-hud-section">
        <div className="family-hud-section-title">Relations</div>
        <RelationRow
          label="Child of"
          people={parents}
          empty="No parents linked"
          addLabel="Add parent"
          onSelectPerson={onSelectPerson}
          onAdd={() => onPickRelation("parent")}
        />
        <RelationRow
          label="Parent of"
          people={children}
          empty="No children linked"
          addLabel="Add child"
          onSelectPerson={onSelectPerson}
          onAdd={() => onPickRelation("child")}
        />
        <RelationRow
          label="Married with"
          people={spouses}
          empty="No spouse linked"
          addLabel="Add spouse"
          onSelectPerson={onSelectPerson}
          onAdd={() => onPickRelation("spouse")}
        />
        <RelationRow
          label="Sibling of"
          people={siblings}
          empty="No siblings inferred"
          onSelectPerson={onSelectPerson}
        />
      </section>

      <section className="family-hud-section">
        <div className="family-hud-section-title">
          Timeline <span>{events.length} events / {insight.sources} sources</span>
        </div>
        {events.length === 0 ? (
          <p className="family-hud-empty">No events yet.</p>
        ) : (
          <>
            <MiniTimeline events={events} onSelectEvent={onSelectEvent} />
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
                    <small>{eventMetaLine(event)}</small>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </section>
    </aside>
  );
}

function StoryLineRow({ line }: { line: StoryLine }) {
  return (
    <p className={`family-story-line tone-${line.tone}`}>
      <span aria-hidden="true" />
      {line.text}
    </p>
  );
}

function MiniTimeline({
  events,
  onSelectEvent
}: {
  events: FamilyEvent[];
  onSelectEvent: (eventId: string) => void;
}) {
  const timedEvents = events.filter((event) => {
    const year = event.date?.sortKey;
    return typeof year === "number" && Number.isFinite(year);
  });
  if (timedEvents.length < 2) return null;

  const years = timedEvents.map((event) => event.date!.sortKey);
  const min = Math.min(...years);
  const max = Math.max(...years);
  const span = Math.max(1, max - min);

  return (
    <div className="family-mini-timeline" aria-label="Selected person timeline">
      <div className="family-mini-timeline-track" />
      {timedEvents.map((event) => {
        const left = ((event.date!.sortKey - min) / span) * 100;
        return (
          <button
            key={event.id}
            className="family-mini-timeline-dot"
            style={{
              left: `${left}%`,
              background: EVENT_META[event.type].color
            }}
            title={`${eventTitle(event)} - ${event.date?.display ?? "Date unknown"}`}
            onClick={() => onSelectEvent(event.id)}
          />
        );
      })}
      <div className="family-mini-timeline-labels">
        <span>{formatTimelineYear(min)}</span>
        <span>{formatTimelineYear(max)}</span>
      </div>
    </div>
  );
}

function RelationRow({
  label,
  people,
  empty,
  addLabel,
  onSelectPerson,
  onAdd
}: {
  label: string;
  people: Person[];
  empty: string;
  addLabel?: string;
  onSelectPerson: (personId: string) => void;
  onAdd?: () => void;
}) {
  return (
    <div className="family-relation-row">
      <div className="family-relation-row-head">
        <span>{label}</span>
        {onAdd && <button className="ghost small" onClick={onAdd}>Add</button>}
      </div>
      {people.length === 0 ? (
        onAdd && addLabel ? (
          <button className="family-relation-empty-action" onClick={onAdd}>
            <span>{empty}</span>
            <strong>{addLabel}</strong>
          </button>
        ) : (
          <p>{empty}</p>
        )
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

function eventMetaLine(event: FamilyEvent): string {
  const parts = [event.date?.display ?? "Date unknown"];
  if (event.place?.name) parts.push(event.place.name);
  if (event.sources.length > 0) {
    parts.push(`${event.sources.length} source${event.sources.length === 1 ? "" : "s"}`);
  }
  return parts.join(" - ");
}

function formatTimelineYear(year: number): string {
  return Number.isInteger(year) ? `${year}` : `${Math.floor(year)}`;
}
