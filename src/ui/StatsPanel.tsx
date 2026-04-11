import { useMemo } from "react";
import { useStore } from "../store";
import { computeStats } from "../stats";
import { EVENT_META } from "../eventMeta";
import { findDuplicatePeople } from "../peopleDedup";

export function StatsPanel({
  onClose,
  onOpenDuplicates
}: {
  onClose: () => void;
  onOpenDuplicates: () => void;
}) {
  const data = useStore((s) => s.data);
  const stats = useMemo(() => computeStats(data), [data]);
  const duplicateGroups = useMemo(() => findDuplicatePeople(data), [data]);

  const total =
    stats.demographics.living +
    stats.demographics.deceased +
    stats.demographics.unknown;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));

  const maxEventCount = stats.eventsByType.reduce(
    (m, e) => Math.max(m, e.count),
    0
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal stats-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="picker-header">
          <div>
            <h3>Dataset overview</h3>
            <p className="picker-sub">
              {stats.totals.people} people · {stats.totals.events} events
              {stats.yearRange.earliest != null && stats.yearRange.latest != null && (
                <> · {stats.yearRange.earliest}–{stats.yearRange.latest}</>
              )}
            </p>
          </div>
          <button className="ghost small" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="stats-body">
          {/* Totals */}
          <section className="stats-section">
            <h4>Totals</h4>
            <div className="stat-tiles">
              <StatTile label="People" value={stats.totals.people} />
              <StatTile label="Events" value={stats.totals.events} />
              <StatTile label="Places" value={stats.totals.places} />
              <StatTile label="Sources" value={stats.totals.sources} />
              <StatTile label="Photos" value={stats.totals.photos} />
              <StatTile label="Generations" value={stats.generations} />
            </div>
          </section>

          {/* Demographics */}
          {total > 0 && (
            <section className="stats-section">
              <h4>Living vs deceased</h4>
              <div className="demo-bar">
                {stats.demographics.living > 0 && (
                  <div
                    className="demo-seg demo-living"
                    style={{ width: `${pct(stats.demographics.living)}%` }}
                    title={`${stats.demographics.living} living`}
                  >
                    {pct(stats.demographics.living) >= 10 &&
                      `${pct(stats.demographics.living)}%`}
                  </div>
                )}
                {stats.demographics.deceased > 0 && (
                  <div
                    className="demo-seg demo-deceased"
                    style={{ width: `${pct(stats.demographics.deceased)}%` }}
                    title={`${stats.demographics.deceased} deceased`}
                  >
                    {pct(stats.demographics.deceased) >= 10 &&
                      `${pct(stats.demographics.deceased)}%`}
                  </div>
                )}
                {stats.demographics.unknown > 0 && (
                  <div
                    className="demo-seg demo-unknown"
                    style={{ width: `${pct(stats.demographics.unknown)}%` }}
                    title={`${stats.demographics.unknown} unknown`}
                  >
                    {pct(stats.demographics.unknown) >= 10 &&
                      `${pct(stats.demographics.unknown)}%`}
                  </div>
                )}
              </div>
              <div className="demo-legend">
                <span><span className="dot living" /> {stats.demographics.living} living</span>
                <span><span className="dot deceased" /> {stats.demographics.deceased} deceased</span>
                <span><span className="dot unknown" /> {stats.demographics.unknown} unknown</span>
              </div>
            </section>
          )}

          {/* Events by type */}
          {stats.eventsByType.length > 0 && (
            <section className="stats-section">
              <h4>Events by type</h4>
              <ul className="event-bars">
                {stats.eventsByType.map((e) => {
                  const meta = EVENT_META[e.type as keyof typeof EVENT_META];
                  const pctOfMax =
                    maxEventCount > 0 ? (e.count / maxEventCount) * 100 : 0;
                  return (
                    <li key={e.type} className="event-bar-row">
                      <span
                        className="event-bar-dot"
                        style={{ background: meta?.color ?? "#888" }}
                      />
                      <span className="event-bar-label">
                        {meta?.label ?? e.type}
                      </span>
                      <div className="event-bar-track">
                        <div
                          className="event-bar-fill"
                          style={{
                            width: `${pctOfMax}%`,
                            background: meta?.color ?? "#888"
                          }}
                        />
                      </div>
                      <span className="event-bar-count">{e.count}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Top places + top surnames */}
          <div className="stats-two-col">
            {stats.topPlaces.length > 0 && (
              <section className="stats-section">
                <h4>Top places</h4>
                <ul className="top-list">
                  {stats.topPlaces.map((p) => (
                    <li key={p.name}>
                      <span className="top-label">{p.name}</span>
                      <span className="top-count">{p.count}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {stats.topSurnames.length > 0 && (
              <section className="stats-section">
                <h4>Top surnames</h4>
                <ul className="top-list">
                  {stats.topSurnames.map((s) => (
                    <li key={s.surname}>
                      <span className="top-label">{s.surname}</span>
                      <span className="top-count">{s.count}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          {/* Data quality */}
          {(hasQualityIssues(stats) || duplicateGroups.length > 0) && (
            <section className="stats-section quality-section">
              <h4>Data quality</h4>
              <ul className="quality-list">
                {duplicateGroups.length > 0 && (
                  <li>
                    <strong>{duplicateGroups.length}</strong> possible duplicate
                    {duplicateGroups.length === 1 ? " group" : " groups"}
                    {" "}
                    <button
                      className="ghost small quality-action"
                      onClick={onOpenDuplicates}
                    >
                      Review →
                    </button>
                  </li>
                )}
                {stats.dataQuality.missingBirthDate > 0 && (
                  <li>
                    <strong>{stats.dataQuality.missingBirthDate}</strong> people
                    have no birth date
                  </li>
                )}
                {stats.dataQuality.missingName > 0 && (
                  <li>
                    <strong>{stats.dataQuality.missingName}</strong> people are
                    unnamed
                  </li>
                )}
                {stats.dataQuality.isolatedPeople > 0 && (
                  <li>
                    <strong>{stats.dataQuality.isolatedPeople}</strong> people
                    are not linked to any event
                  </li>
                )}
                {stats.dataQuality.unlinkedEvents > 0 && (
                  <li>
                    <strong>{stats.dataQuality.unlinkedEvents}</strong> events
                    reference no people
                  </li>
                )}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function hasQualityIssues(stats: ReturnType<typeof computeStats>): boolean {
  return (
    stats.dataQuality.missingBirthDate > 0 ||
    stats.dataQuality.missingName > 0 ||
    stats.dataQuality.isolatedPeople > 0 ||
    stats.dataQuality.unlinkedEvents > 0
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat-tile">
      <div className="stat-tile-value">{value}</div>
      <div className="stat-tile-label">{label}</div>
    </div>
  );
}
