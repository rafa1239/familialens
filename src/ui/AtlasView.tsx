/**
 * The Living Atlas — 3D globe edition.
 *
 * Replaces the flat Leaflet map with an interactive Three.js/globe.gl
 * sphere. Uses the blue-marble earth texture from the TimeGlobe Atlas
 * project (copied into /public/textures).
 *
 * Year scrubber drives a live spatiotemporal snapshot:
 *   - Alive people → glowing points at their current residence
 *   - Migrations between years → animated arcs (dashed, flowing)
 *   - Lifetime trails → curved paths following the globe surface
 *   - Historical events → pulsing rings at the event location
 *   - Selected person → golden halo + camera focus
 *   - Life Tour mode → plays birth→death with the camera following
 *
 * The globe's Three.js scene is augmented with a star field for depth.
 */

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useStore } from "../store";
import {
  atlasYearBounds,
  buildLifetimeTrail,
  computeAtlasSnapshot,
  generationColor,
  aliveCount,
  placedCount,
  type AtlasPersonState
} from "../atlas";
import { eventsAtYear, type HistoricalEvent } from "../historicalEvents";
import { useFocusSet } from "./useFocusSet";
import type { GlobeInstance } from "../globals";
import { loadCities } from "../cities";
import { assetUrl } from "../assets";
import { DEMO_DATASET_ID } from "../demoFamily";

type Speed = 0.5 | 1 | 2 | 5 | 10;
type TourMode = "off" | "life";

type MigrationArc = {
  id: string;
  personId: string;
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  color: string;
  createdAt: number;
};

type GlobePoint = {
  personId: string;
  lat: number;
  lng: number;
  color: string;
  size: number;
  name: string;
  age: number | null;
  placeName: string;
  generation: number;
  selected: boolean;
};

type GlobePath = {
  personId: string;
  coords: Array<[number, number, number]>; // [lat, lng, alt]
  color: string;
};

type GlobeRing = {
  lat: number;
  lng: number;
  maxRadius: number;
  color: string;
  propagationSpeed: number;
  repeatPeriod: number;
  kind: "selection" | "history";
  title?: string;
};

// ─── Cinematic intro chapters ───────────────────────

type Chapter = {
  year: number;
  lat: number;
  lng: number;
  altitude: number;
  title: string;
  subtitle: string;
  durationMs: number;
  flyMs: number;
};

const CINEMATIC_CHAPTERS: Chapter[] = [
  { year: 1918, lat: 20, lng: -10, altitude: 2.6, title: "The Santos-Dupont Family", subtitle: "A story across four continents", durationMs: 3500, flyMs: 2000 },
  { year: 1920, lat: 38.72, lng: -9.14, altitude: 1.4, title: "António Santos", subtitle: "Lisbon · 1920", durationMs: 3000, flyMs: 1800 },
  { year: 1924, lat: 45.76, lng: 4.84, altitude: 1.4, title: "Marie Dupont", subtitle: "Lyon · 1924", durationMs: 2500, flyMs: 1500 },
  { year: 1945, lat: 38.72, lng: -9.14, altitude: 1.5, title: "A wedding in Lisbon", subtitle: "António & Marie · 1945", durationMs: 2800, flyMs: 1500 },
  { year: 1950, lat: 48.86, lng: 2.35, altitude: 1.4, title: "A new life in Paris", subtitle: "1950", durationMs: 2500, flyMs: 1500 },
  { year: 1946, lat: -34.60, lng: -58.38, altitude: 1.4, title: "Carlos Rivera", subtitle: "Buenos Aires · 1946", durationMs: 2800, flyMs: 2000 },
  { year: 1972, lat: 48.86, lng: 2.35, altitude: 1.5, title: "Isabel & Carlos", subtitle: "Married in Paris · 1972", durationMs: 2500, flyMs: 1800 },
  { year: 1975, lat: -23.55, lng: -46.63, altitude: 1.4, title: "Three children", subtitle: "São Paulo & Buenos Aires · 1975–1982", durationMs: 2800, flyMs: 2000 },
  { year: 2001, lat: 40.71, lng: -74.01, altitude: 1.4, title: "Lucia Rivera", subtitle: "New York · 2001", durationMs: 2200, flyMs: 1800 },
  { year: 2005, lat: 35.68, lng: 139.69, altitude: 1.4, title: "Miguel Rivera", subtitle: "Tokyo · 2005", durationMs: 2200, flyMs: 2000 },
  { year: 2010, lat: 38.72, lng: -9.14, altitude: 1.3, title: "Sofia Rivera", subtitle: "Back to where it all began · Lisbon · 2010", durationMs: 3200, flyMs: 2000 },
  { year: 2026, lat: 25, lng: 10, altitude: 2.5, title: "3 generations · 7 cities · 4 continents", subtitle: "", durationMs: 3500, flyMs: 2200 },
];

/** Module-level flag so the cinematic plays only once per page load. */
let cinematicPlayed = false;

// ─── Component ──────────────────────────────────────

export function AtlasView() {
  const data = useStore((s) => s.data);
  const selectedPersonId = useStore((s) => s.selectedPersonId);
  const selectPerson = useStore((s) => s.selectPerson);
  const pushToast = useStore((s) => s.pushToast);
  const focusSet = useFocusSet();
  const isDemoData = data.datasetId === DEMO_DATASET_ID;

  // ─── Focus filter ─────
  const scopedData = useMemo(() => {
    if (!focusSet) return data;
    const people = Object.fromEntries(
      Object.entries(data.people).filter(([id]) => focusSet.has(id))
    );
    const events = Object.fromEntries(
      Object.entries(data.events).filter(
        ([, ev]) =>
          ev.people.length === 0 || ev.people.every((pid) => focusSet.has(pid))
      )
    );
    return { ...data, people, events };
  }, [data, focusSet]);

  // ─── Year state ─────
  const yearBounds = useMemo(() => atlasYearBounds(scopedData), [scopedData]);
  // Start the demo at a "peak" year where most people are alive and
  // spread across cities. For non-demo, start at the beginning.
  const initialYear = isDemoData
    ? Math.min(1980, yearBounds.maxYear)
    : yearBounds.minYear;
  const [year, setYear] = useState(initialYear);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(2);
  // Trails on by default for demo so migration paths are visible immediately.
  const [trailsVisible, setTrailsVisible] = useState(isDemoData);
  const [hoveredPerson, setHoveredPerson] = useState<string | null>(null);
  const [tourMode, setTourMode] = useState<TourMode>("off");

  // ─── Cinematic intro state ─────
  const [cinematicIdx, setCinematicIdx] = useState(-1); // -1 = inactive
  const [cinematicText, setCinematicText] = useState<{ title: string; subtitle: string } | null>(null);
  const cinematicActive = cinematicIdx >= 0;

  useEffect(() => {
    setYear((y) => {
      if (y < yearBounds.minYear) return yearBounds.minYear;
      if (y > yearBounds.maxYear) return yearBounds.maxYear;
      return y;
    });
  }, [yearBounds.minYear, yearBounds.maxYear]);

  // Pre-load cities database for the autocomplete elsewhere
  useEffect(() => {
    loadCities();
  }, []);

  // ─── Snapshot at current year ─────
  const snapshot = useMemo(
    () => computeAtlasSnapshot(scopedData, year),
    [scopedData, year]
  );

  const alive = aliveCount(snapshot);
  const placed = placedCount(snapshot);
  const unplaced = snapshot.filter((s) => s.location == null).length;
  const historical = useMemo(() => eventsAtYear(year), [year]);

  // Selected person's state at the current year
  const selectedState = useMemo<AtlasPersonState | null>(() => {
    if (!selectedPersonId) return null;
    return snapshot.find((s) => s.person.id === selectedPersonId) ?? null;
  }, [snapshot, selectedPersonId]);

  // Convert snapshot into globe points
  const globePoints = useMemo<GlobePoint[]>(() => {
    const out: GlobePoint[] = [];
    for (const s of snapshot) {
      if (!s.location) continue;
      if (s.status === "unborn") continue;
      const isDeceased = s.status === "deceased";
      const isSelected = s.person.id === selectedPersonId;
      out.push({
        personId: s.person.id,
        lat: s.location.lat,
        lng: s.location.lon,
        color: isSelected
          ? "#ffe082"
          : isDeceased
            ? "#6b6157"
            : generationColor(s.generation),
        size: isSelected ? 0.45 : isDeceased ? 0.12 : 0.32,
        name: s.person.name,
        age: s.age,
        placeName: s.location.placeName,
        generation: s.generation,
        selected: isSelected
      });
    }
    return out;
  }, [snapshot, selectedPersonId]);

  // Lifetime trails as path objects
  const globePaths = useMemo<GlobePath[]>(() => {
    if (!trailsVisible && !hoveredPerson && !selectedPersonId) return [];
    const out: GlobePath[] = [];
    for (const s of snapshot) {
      if (!s.location) continue;
      // When a person is selected, always show their trail even if
      // global trails are off — it frames the "who they are" story.
      const show =
        trailsVisible ||
        s.person.id === hoveredPerson ||
        s.person.id === selectedPersonId;
      if (!show) continue;
      const points = buildLifetimeTrail(scopedData, s.person.id);
      if (points.length < 2) continue;
      const coords: Array<[number, number, number]> = points.map((p) => [
        p.lat,
        p.lon,
        0.002
      ]);
      out.push({
        personId: s.person.id,
        coords,
        color:
          s.person.id === selectedPersonId
            ? "#ffe082"
            : generationColor(s.generation)
      });
    }
    return out;
  }, [snapshot, scopedData, trailsVisible, hoveredPerson, selectedPersonId]);

  // ─── Rings (selection halo + historical events) ─────
  const globeRings = useMemo<GlobeRing[]>(() => {
    const out: GlobeRing[] = [];
    // Selection halo: big golden pulse at the selected person's current location
    if (selectedState?.location) {
      out.push({
        lat: selectedState.location.lat,
        lng: selectedState.location.lon,
        maxRadius: 4.5,
        color: "#ffc86b",
        propagationSpeed: 2.5,
        repeatPeriod: 900,
        kind: "selection"
      });
    }
    // Historical event pulses: a ring at each locatable event for the year
    for (const h of historical) {
      if (h.lat == null || h.lon == null) continue;
      out.push({
        lat: h.lat,
        lng: h.lon,
        maxRadius: 3.5,
        color: historicalRingColor(h),
        propagationSpeed: 1.8,
        repeatPeriod: 1600,
        kind: "history",
        title: h.title
      });
    }
    return out;
  }, [selectedState, historical]);

  // ─── Migration arcs (diff against previous snapshot) ─────
  const [arcs, setArcs] = useState<MigrationArc[]>([]);
  const prevSnapshotRef = useRef<AtlasPersonState[]>([]);

  useEffect(() => {
    const prev = prevSnapshotRef.current;
    if (prev.length === 0) {
      prevSnapshotRef.current = snapshot;
      return;
    }
    const newArcs: MigrationArc[] = [];
    for (const s of snapshot) {
      if (!s.location || s.status !== "alive") continue;
      const prevS = prev.find((p) => p.person.id === s.person.id);
      if (!prevS || !prevS.location || prevS.status !== "alive") continue;
      const moved =
        Math.abs(s.location.lat - prevS.location.lat) > 0.001 ||
        Math.abs(s.location.lon - prevS.location.lon) > 0.001;
      if (!moved) continue;
      newArcs.push({
        id: `${s.person.id}-${Date.now()}-${Math.random()}`,
        personId: s.person.id,
        startLat: prevS.location.lat,
        startLng: prevS.location.lon,
        endLat: s.location.lat,
        endLng: s.location.lon,
        color: generationColor(s.generation),
        createdAt: Date.now()
      });
    }
    if (newArcs.length > 0) {
      setArcs((prevArcs) => [
        ...prevArcs.filter((a) => Date.now() - a.createdAt < 3000),
        ...newArcs
      ]);
    }
    prevSnapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    if (arcs.length === 0) return;
    const timer = window.setTimeout(() => {
      setArcs((prev) => prev.filter((a) => Date.now() - a.createdAt < 3000));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [arcs]);

  // ─── Play loop ─────
  // Stop year:
  //   - Life Tour, deceased: deathYear + 1 (a beat of "afterward")
  //   - Life Tour, alive: today's real year (even past yearBounds.maxYear —
  //     the tree's latest event may pre-date now, but the person is still
  //     living. We want to see them reach the present.)
  //   - Normal play: yearBounds.maxYear
  const tourStopYear = useMemo(() => {
    if (tourMode !== "life" || !selectedState) return yearBounds.maxYear;
    if (selectedState.deathYear != null) {
      return selectedState.deathYear + 1;
    }
    const currentRealYear = new Date().getFullYear();
    return Math.max(yearBounds.maxYear, currentRealYear);
  }, [tourMode, selectedState, yearBounds.maxYear]);

  useEffect(() => {
    if (!playing) return;
    const intervalMs = 1000 / speed;
    const stopYear = tourStopYear;
    const id = window.setInterval(() => {
      setYear((y) => {
        if (y >= stopYear) {
          setPlaying(false);
          if (tourMode === "life") setTourMode("off");
          return stopYear;
        }
        return y + 1;
      });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [playing, speed, tourStopYear, tourMode]);

  // ─── Keyboard shortcuts ─────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.altKey || e.metaKey || e.ctrlKey) return;

      if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        const delta = e.shiftKey ? 10 : 1;
        setYear((y) => Math.max(yearBounds.minYear, y - delta));
        setPlaying(false);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        const delta = e.shiftKey ? 10 : 1;
        setYear((y) => Math.min(yearBounds.maxYear, y + delta));
        setPlaying(false);
      } else if (e.key === "Home") {
        e.preventDefault();
        setYear(yearBounds.minYear);
      } else if (e.key === "End") {
        e.preventDefault();
        setYear(yearBounds.maxYear);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [yearBounds.minYear, yearBounds.maxYear]);

  // ─── Globe instance ─────
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const [globeReady, setGlobeReady] = useState(false);
  const [libError, setLibError] = useState<string | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;

    const init = () => {
      if (cancelled) return;
      const GlobeCtor = (window as unknown as { Globe?: () => GlobeInstance })
        .Globe;
      if (typeof GlobeCtor !== "function") {
        setLibError(
          "Globe library didn't load. Reload the page or check the console."
        );
        return;
      }

      const rect = el.getBoundingClientRect();
      const globe = GlobeCtor()
        .globeImageUrl(assetUrl("/textures/earth-blue-marble.jpg"))
        .bumpImageUrl(assetUrl("/textures/earth-topology.png"))
        .backgroundColor("#02030a")
        .showAtmosphere(true)
        .atmosphereColor("#89c7ff")
        .atmosphereAltitude(0.25)
        .width(rect.width || window.innerWidth)
        .height(rect.height || window.innerHeight - 200);

      // Arc styling — animated dashes
      globe
        .arcAltitude(0.22)
        .arcStroke(0.75)
        .arcDashLength(0.5)
        .arcDashGap(0.2)
        .arcDashAnimateTime(1500)
        .arcColor((d) => (d as MigrationArc).color);

      // Path styling
      globe
        .pathPoints((d) => (d as GlobePath).coords)
        .pathPointLat(
          ((p: unknown) => (p as number[])[0]) as (p: unknown) => number
        )
        .pathPointLng(
          ((p: unknown) => (p as number[])[1]) as (p: unknown) => number
        )
        .pathColor((d) => (d as GlobePath).color)
        .pathStroke(1.5)
        .pathTransitionDuration(600);

      // Ring styling — selection halo + historical event pulses
      globe
        .ringLat((d) => (d as GlobeRing).lat)
        .ringLng((d) => (d as GlobeRing).lng)
        .ringAltitude(0.005)
        .ringColor((d) => {
          const color = (d as GlobeRing).color;
          // Return a function so globe.gl can fade alpha along the propagation.
          // t goes 0→1 as the ring expands.
          return (t: number) => withAlpha(color, 1 - t);
        })
        .ringMaxRadius((d) => (d as GlobeRing).maxRadius)
        .ringPropagationSpeed((d) => (d as GlobeRing).propagationSpeed)
        .ringRepeatPeriod((d) => (d as GlobeRing).repeatPeriod)
        .ringResolution(72);

      // Point styling — selected point is bigger, golden, and elevated
      globe
        .pointLat((d) => (d as GlobePoint).lat)
        .pointLng((d) => (d as GlobePoint).lng)
        .pointColor((d) => (d as GlobePoint).color)
        .pointAltitude((d) => {
          const p = d as GlobePoint;
          return p.selected ? 0.08 : p.size * 0.08 + 0.02;
        })
        .pointRadius((d) => (d as GlobePoint).size)
        .pointResolution(10)
        .pointsMerge(false)
        .pointsTransitionDuration(700)
        .pointLabel((d) => {
          const p = d as GlobePoint;
          const ageStr = p.age != null ? `Age ${p.age}` : "";
          const placeStr = p.placeName ?? "";
          return `<div class="globe-tooltip"><strong>${escapeHtml(p.name)}</strong><br/><span>${escapeHtml(ageStr)}${ageStr && placeStr ? " · " : ""}${escapeHtml(placeStr)}</span></div>`;
        })
        .onPointClick((d) => {
          const p = d as GlobePoint;
          selectPerson(p.personId);
          pushToast(`Selected ${p.name}`, "info");
        })
        .onPointHover((d) => {
          const p = d as GlobePoint | null;
          setHoveredPerson(p?.personId ?? null);
        });

      // Mount the globe to the container
      globe(el);

      const controls = globe.controls();
      if (controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.35;
      }

      // Inject a star field into the Three.js scene for depth
      try {
        addStarField(globe);
      } catch (err) {
        console.warn("[atlas] Could not inject star field", err);
      }

      globeRef.current = globe;
      setGlobeReady(true);

      // Resize observer
      resizeObserver = new ResizeObserver(() => {
        if (!globeRef.current || !el) return;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          globeRef.current.width(r.width).height(r.height);
        }
      });
      resizeObserver.observe(el);
    };

    // The vendor <script> may load after React mounts. Retry a few times.
    let attempts = 0;
    const check = () => {
      if (cancelled) return;
      const g = (window as unknown as { Globe?: () => GlobeInstance }).Globe;
      if (typeof g === "function") {
        init();
        return;
      }
      attempts += 1;
      if (attempts > 50) {
        setLibError(
          "Globe library didn't load in time. Check /vendor/globe.gl.min.js."
        );
        return;
      }
      setTimeout(check, 100);
    };
    check();

    return () => {
      cancelled = true;
      if (resizeObserver) resizeObserver.disconnect();
      if (globeRef.current) {
        try {
          globeRef.current.pauseAnimation();
        } catch {
          // ignore
        }
      }
      if (el) {
        while (el.firstChild) el.removeChild(el.firstChild);
      }
      globeRef.current = null;
      setGlobeReady(false);
    };
  }, [pushToast, selectPerson]);

  // ─── Push data into the globe ─────
  useEffect(() => {
    if (!globeRef.current || !globeReady) return;
    globeRef.current.pointsData(globePoints as unknown[]);
  }, [globePoints, globeReady]);

  useEffect(() => {
    if (!globeRef.current || !globeReady) return;
    globeRef.current.pathsData(globePaths as unknown[]);
  }, [globePaths, globeReady]);

  useEffect(() => {
    if (!globeRef.current || !globeReady) return;
    globeRef.current.arcsData(arcs as unknown[]);
  }, [arcs, globeReady]);

  useEffect(() => {
    if (!globeRef.current || !globeReady) return;
    globeRef.current.ringsData(globeRings as unknown[]);
  }, [globeRings, globeReady]);

  // Auto-rotate: faster when playing, stopped when a person is selected
  // Disabled entirely during cinematic intro (camera is scripted).
  useEffect(() => {
    if (!globeRef.current || !globeReady) return;
    const controls = globeRef.current.controls();
    if (!controls) return;
    if (cinematicActive) {
      controls.autoRotate = false;
    } else if (selectedPersonId) {
      controls.autoRotate = false;
    } else {
      controls.autoRotate = true;
      controls.autoRotateSpeed = playing ? 0.7 : 0.35;
    }
  }, [playing, globeReady, selectedPersonId, cinematicActive]);

  // ─── Cinematic intro ─────
  // Auto-starts once per page load when the demo dataset is active.
  // Flies the camera through the family history with text overlays.

  const dismissCinematic = useCallback(() => {
    setCinematicIdx(-1);
    setCinematicText(null);
    cinematicPlayed = true;
  }, []);

  // Trigger: globe ready + demo data + not played yet
  useEffect(() => {
    if (!globeReady || !isDemoData || cinematicPlayed) return;
    cinematicPlayed = true;
    const timer = setTimeout(() => setCinematicIdx(0), 900);
    return () => clearTimeout(timer);
  }, [globeReady, isDemoData]);

  // Advance through chapters
  useEffect(() => {
    if (cinematicIdx < 0 || !globeRef.current) return;
    const chapter = CINEMATIC_CHAPTERS[cinematicIdx];
    if (!chapter) {
      // Sequence finished — show final prompt
      setCinematicText({ title: "Click anywhere to explore", subtitle: "" });
      return;
    }

    // Fly camera + set year
    globeRef.current.pointOfView(
      { lat: chapter.lat, lng: chapter.lng, altitude: chapter.altitude },
      chapter.flyMs
    );
    setYear(chapter.year);

    // Show text after a small delay so the camera has started moving
    const textTimer = setTimeout(() => {
      setCinematicText({ title: chapter.title, subtitle: chapter.subtitle });
    }, Math.min(500, chapter.flyMs * 0.3));

    // Advance to next chapter after this one's duration
    const nextTimer = setTimeout(() => {
      setCinematicText(null); // brief gap between chapters
      setTimeout(() => setCinematicIdx((i) => i + 1), 250);
    }, chapter.durationMs);

    return () => {
      clearTimeout(textTimer);
      clearTimeout(nextTimer);
    };
  }, [cinematicIdx]);

  // Dismiss on any click or keypress
  useEffect(() => {
    if (!cinematicActive) return;
    const handler = () => dismissCinematic();
    // Use a short delay so the same click that opened Atlas doesn't dismiss immediately
    const timer = setTimeout(() => {
      document.addEventListener("pointerdown", handler, { once: true });
      document.addEventListener("keydown", handler, { once: true });
    }, 600);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", handler);
      document.removeEventListener("keydown", handler);
    };
  }, [cinematicActive, dismissCinematic]);

  // ─── Camera focus: smoothly fly to the selected person ─────
  // Fires on: selection change, location change, or tour mode change.
  // Uses a stable key so we don't refocus when unrelated state churns.
  const selLat = selectedState?.location?.lat;
  const selLng = selectedState?.location?.lon;
  const lastFocusKeyRef = useRef<string>("");

  useEffect(() => {
    if (!globeRef.current || !globeReady) return;
    if (selLat == null || selLng == null) {
      lastFocusKeyRef.current = "";
      return;
    }
    const key = `${selectedState?.person.id}|${selLat.toFixed(2)}|${selLng.toFixed(2)}|${tourMode}`;
    if (key === lastFocusKeyRef.current) return;
    lastFocusKeyRef.current = key;
    globeRef.current.pointOfView(
      {
        lat: selLat,
        lng: selLng,
        altitude: tourMode === "life" ? 1.35 : 1.75
      },
      tourMode === "life" ? 900 : 1400
    );
  }, [selLat, selLng, selectedState?.person.id, tourMode, globeReady]);

  // ─── Life Tour handlers ─────
  const canTourLife =
    selectedState != null &&
    selectedState.birthYear != null &&
    (selectedState.deathYear ?? yearBounds.maxYear) > selectedState.birthYear;

  const startLifeTour = () => {
    if (!canTourLife || !selectedState?.birthYear) return;
    setTourMode("life");
    setSpeed(5);
    setYear(selectedState.birthYear);
    setPlaying(true);
    pushToast(`Watching ${selectedState.person.name}'s life`, "info");
  };

  const stopLifeTour = () => {
    setTourMode("off");
    setPlaying(false);
  };

  // ─── Empty state ─────
  if (Object.keys(scopedData.people).length === 0) {
    return (
      <div className="atlas-empty">
        <p>No one to place on the globe yet.</p>
        <p className="helper">
          Add people with birth places or residence events that have
          coordinates. Try the Places panel, or type a city name in the
          Inspector — the autocomplete will suggest coordinates from its
          built-in database.
        </p>
      </div>
    );
  }

  return (
    <div className="atlas-view globe-view">
      <div className="atlas-map-wrap">
        <div ref={containerRef} className="globe-canvas" />

        {libError && (
          <div className="globe-error">
            <p>{libError}</p>
          </div>
        )}

        {/* Cinematic intro overlay */}
        {cinematicActive && (
          <div className="cinematic-overlay" onClick={dismissCinematic}>
            {cinematicText && (
              <div className="cinematic-text" key={cinematicIdx}>
                <div className="cinematic-title">{cinematicText.title}</div>
                {cinematicText.subtitle && (
                  <div className="cinematic-subtitle">{cinematicText.subtitle}</div>
                )}
              </div>
            )}
            <div className="cinematic-skip">Click anywhere to skip</div>
          </div>
        )}

        {/* Big year display — hidden during cinematic intro */}
        <div
          className={`atlas-year-huge ${playing ? "playing" : ""} ${
            tourMode === "life" ? "tour" : ""
          } ${cinematicActive ? "hidden" : ""}`}
        >
          <div className="atlas-year-huge-value">{year}</div>
          <div className="atlas-year-huge-sub">
            <span className="ay-stat">
              <strong>{alive}</strong> alive
            </span>
            <span className="ay-sep">·</span>
            <span className="ay-stat">
              <strong>{placed}</strong> placed
            </span>
            {tourMode === "life" && selectedState && (
              <>
                <span className="ay-sep">·</span>
                <span className="ay-stat tour-label">
                  Life of {selectedState.person.name}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Selection card — name, place, age, life-tour button */}
        {selectedState && (
          <SelectionCard
            state={selectedState}
            canTour={canTourLife}
            tourActive={tourMode === "life"}
            onStartTour={startLifeTour}
            onStopTour={stopLifeTour}
            onClear={() => selectPerson(null)}
          />
        )}

        {/* Historical context */}
        {historical.length > 0 && (
          <div className="atlas-historical">
            {historical.slice(0, 3).map((h, i) => (
              <div
                key={`${h.year}-${i}`}
                className={`atlas-hist-chip cat-${h.category}`}
                title={
                  h.lat != null && h.lon != null
                    ? "Location marked on the globe"
                    : undefined
                }
              >
                <span className="hist-dot" />
                {h.title}
              </div>
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="atlas-legend">
          <div className="legend-title">Generations</div>
          <div className="legend-row">
            {Array.from({
              length: Math.max(1, maxGenerationIn(snapshot) + 1)
            }).map((_, gen) => (
              <div key={gen} className="legend-item">
                <span
                  className="legend-swatch"
                  style={{ background: generationColor(gen) }}
                />
                <span className="legend-label">Gen {gen}</span>
              </div>
            ))}
          </div>
        </div>

        {unplaced > 0 && (
          <div
            className="atlas-unplaced"
            title="People with no known location"
          >
            <strong>{unplaced}</strong> not placed
          </div>
        )}
      </div>

      <AtlasSlider
        year={year}
        bounds={yearBounds}
        playing={playing}
        speed={speed}
        alive={alive}
        total={snapshot.length}
        trailsVisible={trailsVisible}
        tourMode={tourMode}
        onYear={(y) => {
          setYear(y);
          setPlaying(false);
          if (tourMode === "life") setTourMode("off");
        }}
        onTogglePlay={() => {
          if (year >= yearBounds.maxYear) setYear(yearBounds.minYear);
          setPlaying((p) => !p);
        }}
        onSpeed={setSpeed}
        onToggleTrails={() => setTrailsVisible((v) => !v)}
      />
    </div>
  );
}

// ─── Helper components ──────────────────────────────

function SelectionCard({
  state,
  canTour,
  tourActive,
  onStartTour,
  onStopTour,
  onClear
}: {
  state: AtlasPersonState;
  canTour: boolean;
  tourActive: boolean;
  onStartTour: () => void;
  onStopTour: () => void;
  onClear: () => void;
}) {
  const lifespan =
    state.birthYear != null
      ? state.deathYear != null
        ? `${state.birthYear}–${state.deathYear}`
        : `${state.birthYear}–`
      : null;

  return (
    <div className="atlas-selection-card">
      <button
        type="button"
        className="atlas-selection-clear"
        onClick={onClear}
        aria-label="Clear selection"
        title="Clear selection (Esc)"
      >
        ×
      </button>
      <div className="atlas-sel-name">{state.person.name}</div>
      <div className="atlas-sel-meta">
        {state.location?.placeName ? (
          <span>{state.location.placeName}</span>
        ) : (
          <span className="dim">No known location</span>
        )}
        {lifespan && <span className="atlas-sel-sep">·</span>}
        {lifespan && <span>{lifespan}</span>}
        {state.age != null && <span className="atlas-sel-sep">·</span>}
        {state.age != null && <span>Age {state.age}</span>}
      </div>
      <div className="atlas-sel-status">
        <span className={`status-pip status-${state.status}`} />
        {statusLabel(state.status)}
      </div>
      {canTour && (
        <button
          type="button"
          className={`atlas-life-tour-btn ${tourActive ? "active" : ""}`}
          onClick={tourActive ? onStopTour : onStartTour}
          title={
            tourActive
              ? "Stop the tour"
              : `Watch ${state.person.name}'s life unfold`
          }
        >
          {tourActive ? "■ Stop Tour" : "▶ Watch Life"}
        </button>
      )}
    </div>
  );
}

function statusLabel(s: AtlasPersonState["status"]): string {
  switch (s) {
    case "alive":
      return "Alive";
    case "unborn":
      return "Not yet born";
    case "deceased":
      return "Deceased";
    default:
      return "Unknown";
  }
}

// ─── Helpers ─────────────────────────────────────────

function historicalRingColor(h: HistoricalEvent): string {
  switch (h.category) {
    case "war":
      return "#ff5555";
    case "revolution":
      return "#ff9b3f";
    case "pandemic":
      return "#b07dff";
    case "economy":
      return "#e6c04a";
    case "tech":
      return "#5fd6c0";
    default:
      return "#8fb7ff";
  }
}

/**
 * Apply a numeric alpha to a hex color. Returns rgba(...) string.
 * globe.gl expects ring colors as functions that take a propagation
 * parameter 0→1 and return a color, so we use this to fade the ring
 * out as it expands.
 */
function withAlpha(hex: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
}

function maxGenerationIn(snapshot: AtlasPersonState[]): number {
  let max = 0;
  for (const s of snapshot) if (s.generation > max) max = s.generation;
  return max;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Add a sparse star field to the globe's Three.js scene. Pure eye-candy.
 * Uses the global `window.THREE` loaded via <script> tag alongside globe.gl.
 *
 * Silently no-ops if any of the required THREE classes are missing so the
 * globe keeps working even if the vendor bundle changes.
 */
function addStarField(globe: GlobeInstance): void {
  type ThreeModule = {
    BufferGeometry: new () => {
      setAttribute: (name: string, attr: unknown) => void;
    };
    Float32BufferAttribute: new (arr: ArrayLike<number>, size: number) => unknown;
    PointsMaterial: new (opts: Record<string, unknown>) => unknown;
    Points: new (geom: unknown, mat: unknown) => unknown;
  };
  const THREE = (window as unknown as { THREE?: ThreeModule }).THREE;
  if (
    !THREE ||
    typeof THREE.BufferGeometry !== "function" ||
    typeof THREE.Float32BufferAttribute !== "function" ||
    typeof THREE.PointsMaterial !== "function" ||
    typeof THREE.Points !== "function"
  ) {
    return;
  }
  const scene = globe.scene() as { add?: (obj: unknown) => void } | null;
  if (!scene || typeof scene.add !== "function") return;

  const starCount = 2500;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    // Spherical shell at ~radius 800 (globe.gl default globe radius is 100)
    const r = 700 + Math.random() * 500;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3)
  );
  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.2,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.85,
    depthWrite: false
  });
  const stars = new THREE.Points(geometry, material);
  scene.add(stars);
}

// ─── Year slider ────────────────────────────────────

function AtlasSlider({
  year,
  bounds,
  playing,
  speed,
  alive,
  total,
  trailsVisible,
  tourMode,
  onYear,
  onTogglePlay,
  onSpeed,
  onToggleTrails
}: {
  year: number;
  bounds: { minYear: number; maxYear: number };
  playing: boolean;
  speed: Speed;
  alive: number;
  total: number;
  trailsVisible: boolean;
  tourMode: TourMode;
  onYear: (y: number) => void;
  onTogglePlay: () => void;
  onSpeed: (s: Speed) => void;
  onToggleTrails: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const range = Math.max(1, bounds.maxYear - bounds.minYear);
  // Clamp visually — the play loop can push year past bounds during a
  // Life Tour for a still-alive person, but the slider handle must stay in
  // its track. The year label still shows the real year.
  const progressRaw = ((year - bounds.minYear) / range) * 100;
  const progress = Math.max(0, Math.min(100, progressRaw));

  const yearFromX = (clientX: number): number => {
    const el = trackRef.current;
    if (!el) return bounds.minYear;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(bounds.minYear + ratio * range);
  };

  const handleDown = (e: React.PointerEvent) => {
    setDragging(true);
    (e.target as Element).setPointerCapture?.(e.pointerId);
    onYear(yearFromX(e.clientX));
  };
  const handleMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    onYear(yearFromX(e.clientX));
  };
  const handleUp = () => setDragging(false);

  return (
    <div className={`atlas-slider-bar ${tourMode === "life" ? "tour" : ""}`}>
      <button
        className={`atlas-play-btn ${playing ? "playing" : ""}`}
        onClick={onTogglePlay}
        title={playing ? "Pause (Space)" : "Play (Space)"}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? "❚❚" : "▶"}
      </button>

      <div className="atlas-slider-main">
        <div className="atlas-slider-label">
          <span className="atlas-slider-year">{year}</span>
          <span className="atlas-slider-stats">
            {alive} of {total} alive
          </span>
        </div>

        <div
          ref={trackRef}
          className="atlas-slider-track"
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerLeave={handleUp}
        >
          <div className="atlas-slider-line" />
          <div className="atlas-slider-fill" style={{ width: `${progress}%` }} />
          <div
            className="atlas-slider-handle"
            style={{ left: `${progress}%` }}
          />
          <div className="atlas-slider-min">{bounds.minYear}</div>
          <div className="atlas-slider-max">{bounds.maxYear}</div>
        </div>
      </div>

      <div className="atlas-controls">
        <div className="atlas-speed">
          <label>Speed</label>
          <select
            value={speed}
            onChange={(e) => onSpeed(Number(e.target.value) as Speed)}
          >
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={5}>5×</option>
            <option value={10}>10×</option>
          </select>
        </div>

        <button
          className={`atlas-trail-toggle ${trailsVisible ? "active" : ""}`}
          onClick={onToggleTrails}
          title="Show lifetime trails for everyone"
        >
          Trails
        </button>
      </div>
    </div>
  );
}
