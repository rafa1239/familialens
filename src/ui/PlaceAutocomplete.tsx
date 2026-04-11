import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { extractPlaces, suggestPlaces, type PlaceAggregate } from "../places";
import { loadCities, searchCities, type City } from "../cities";

/**
 * Place input with inline autocomplete dropdown.
 *
 * Two suggestion sources, shown together:
 *   1. Places already used in the user's tree — so reusing them merges
 *      coordinates and keeps the dataset clean
 *   2. World cities from the built-in database (490 capitals + major
 *      cities with flag emoji + population)
 *
 * Picking a city fills name + lat/lon automatically. Picking an
 * existing place reuses its coords.
 *
 * Keyboard: ↑↓ to navigate, Enter to pick, Esc to close.
 */

type Suggestion =
  | { kind: "existing"; place: PlaceAggregate }
  | { kind: "city"; city: City };

export function PlaceAutocomplete({
  value,
  onChange,
  onCommit,
  placeholder = "City, Country",
  className
}: {
  value: string;
  onChange: (name: string, coords?: { lat?: number; lon?: number }) => void;
  onCommit?: () => void;
  placeholder?: string;
  className?: string;
}) {
  const data = useStore((s) => s.data);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [citiesLoaded, setCitiesLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Load the city database once. The cities module caches it globally.
  useEffect(() => {
    loadCities().then(() => setCitiesLoaded(true));
  }, []);

  const existingPlaces = useMemo(() => extractPlaces(data), [data]);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!open) return [];

    const fromExisting = suggestPlaces(value, existingPlaces, 5).map<Suggestion>(
      (p) => ({ kind: "existing", place: p })
    );

    // Exclude cities whose name already matches something in existing places
    // (so we don't show duplicates). Comparison is case-insensitive + accent-strip.
    const normalised = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
    const existingNames = new Set(
      fromExisting.map((s) =>
        s.kind === "existing" ? normalised(s.place.name) : ""
      )
    );

    // Only query the city database if the user has typed something OR
    // if there are fewer than 3 existing matches (so we can pad the list)
    let fromCities: Suggestion[] = [];
    if (citiesLoaded && (value.trim().length > 0 || fromExisting.length < 3)) {
      const cityHits = searchCities(value, 8);
      fromCities = cityHits
        .filter((c) => !existingNames.has(normalised(c.name)))
        .slice(0, 8 - fromExisting.length)
        .map<Suggestion>((c) => ({ kind: "city", city: c }));
    }

    return [...fromExisting, ...fromCities];
  }, [value, existingPlaces, open, citiesLoaded]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (activeIndex >= suggestions.length) setActiveIndex(0);
  }, [suggestions.length, activeIndex]);

  const pick = (s: Suggestion) => {
    if (s.kind === "existing") {
      onChange(s.place.name, { lat: s.place.lat, lon: s.place.lon });
    } else {
      onChange(s.city.name, { lat: s.city.lat, lon: s.city.lng });
    }
    setOpen(false);
    inputRef.current?.blur();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, Math.max(0, suggestions.length - 1)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      if (open && suggestions[activeIndex]) {
        e.preventDefault();
        pick(suggestions[activeIndex]);
      } else {
        (e.target as HTMLInputElement).blur();
      }
      return;
    }
  };

  return (
    <div ref={wrapRef} className={`place-autocomplete ${className ?? ""}`}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setTimeout(() => {
            setOpen(false);
            if (onCommit) onCommit();
          }, 100);
        }}
        onKeyDown={handleKey}
        placeholder={placeholder}
        autoComplete="off"
      />

      {open && suggestions.length > 0 && (
        <div className="place-dropdown" role="listbox">
          {suggestions.map((s, i) => (
            <button
              key={
                s.kind === "existing"
                  ? `ex-${s.place.name}`
                  : `city-${s.city.name}-${s.city.country_code}`
              }
              type="button"
              className={`place-option ${
                i === activeIndex ? "active" : ""
              } ${s.kind === "city" ? "place-option-city" : ""}`}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
            >
              {s.kind === "existing" ? (
                <>
                  <span className="place-option-name">{s.place.name}</span>
                  <span className="place-option-meta">
                    {s.place.eventCount}{" "}
                    {s.place.eventCount === 1 ? "event" : "events"}
                    {s.place.lat != null && s.place.lon != null && " · ⊙"}
                  </span>
                </>
              ) : (
                <>
                  <span className="place-option-name">
                    <span className="place-option-emoji">{s.city.emoji}</span>
                    {s.city.name}
                    <span className="place-option-country">
                      · {s.city.country}
                    </span>
                  </span>
                  <span className="place-option-meta">
                    {formatPop(s.city.population)} · ⊙
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function formatPop(n: number): string {
  if (!n || n < 1000) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  return `${Math.round(n / 1000)}k`;
}
