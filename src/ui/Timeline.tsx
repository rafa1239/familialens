import { useMemo } from "react";
import type { Person } from "../types";
import { useStore } from "../store";
import { extractYear } from "../utils/insights";

type TimelineEvent = {
  year: number;
  type: "birth" | "death";
  person: Person;
};

export function Timeline({ people }: { people: Record<string, Person> }) {
  const { selectOnly } = useStore();

  const events = useMemo(() => {
    const list: TimelineEvent[] = [];
    for (const person of Object.values(people)) {
      const birthYear = extractYear(person.birthDate);
      if (birthYear) list.push({ year: birthYear, type: "birth", person });
      const deathYear = extractYear(person.deathDate);
      if (deathYear) list.push({ year: deathYear, type: "death", person });
    }
    list.sort((a, b) => a.year - b.year);
    return list;
  }, [people]);

  const handleClick = (person: Person) => {
    selectOnly(person.id);
    window.dispatchEvent(
      new CustomEvent("familialens:focus", {
        detail: { targetId: person.id }
      })
    );
  };

  if (events.length === 0) {
    return (
      <div className="timeline-container">
        <p className="helper-text" style={{ textAlign: "center", paddingTop: 60 }}>
          No dates in the dataset yet. Add birth or death years to see the timeline.
        </p>
      </div>
    );
  }

  return (
    <div className="timeline-container">
      <div className="timeline-axis" />
      {events.map((ev, i) => {
        const color =
          ev.person.gender === "M"
            ? "var(--node-male)"
            : ev.person.gender === "F"
              ? "var(--node-female)"
              : "var(--node-unknown)";
        return (
          <div key={`${ev.person.id}-${ev.type}-${i}`} className="timeline-row">
            <div className="timeline-year">{ev.year}</div>
            <div
              className="timeline-dot"
              style={{
                background: color,
                boxShadow: `0 0 8px ${color}`
              }}
            />
            <div
              className="timeline-card"
              onClick={() => handleClick(ev.person)}
            >
              <span className="tc-name">{ev.person.name || "Unnamed"}</span>
              <span className="tc-event">
                {ev.type === "birth" ? "Born" : "Died"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
