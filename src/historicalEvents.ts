/**
 * A small curated list of major world events, used by the Atlas view
 * to show historical context at the currently-scrubbed year.
 *
 * Curation principles:
 *   - Global or widely-impactful events (wars, pandemics, revolutions,
 *     major economic crises, space/tech milestones)
 *   - Readable single-line titles — not full sentences
 *   - `span` is optional: for multi-year events (e.g., WWII 1939-1945)
 *     we mark the full duration so the chip is visible during the span
 *
 * The list is deliberately short (~50 items). Users can ignore it
 * entirely; it's purely contextual eye candy.
 */

export type HistoricalEvent = {
  year: number;
  /** If set, the event covers [year, year + span]. Defaults to just `year`. */
  span?: number;
  title: string;
  category: "war" | "pandemic" | "revolution" | "economy" | "tech" | "other";
  /**
   * Approximate lat/lon for the event so it can pulse on the 3D globe.
   * For multi-country events we pick a symbolic capital (Paris for WWI,
   * etc.) — it's eye-candy, not a geography lesson. Omit for global/
   * unlocatable events (they still show up as chips, just no ring).
   */
  lat?: number;
  lon?: number;
};

export const HISTORICAL_EVENTS: HistoricalEvent[] = [
  // ─── 19th century ───
  { year: 1804, title: "Haitian independence", category: "revolution", lat: 18.59, lon: -72.31 }, // Port-au-Prince
  { year: 1815, title: "Napoleonic Wars end", category: "war", lat: 50.72, lon: 4.41 }, // Waterloo
  { year: 1848, title: "European revolutions", category: "revolution", lat: 48.21, lon: 16.37 }, // Vienna
  { year: 1861, span: 4, title: "American Civil War", category: "war", lat: 38.90, lon: -77.04 }, // Washington DC
  { year: 1870, title: "Franco-Prussian War", category: "war", lat: 48.85, lon: 2.35 }, // Paris
  { year: 1876, title: "Telephone invented", category: "tech", lat: 42.36, lon: -71.06 }, // Boston
  { year: 1889, title: "Eiffel Tower built", category: "other", lat: 48.86, lon: 2.29 }, // Paris
  { year: 1898, title: "Spanish-American War", category: "war", lat: 23.13, lon: -82.38 }, // Havana

  // ─── Early 20th ───
  { year: 1903, title: "First powered flight", category: "tech", lat: 36.02, lon: -75.67 }, // Kitty Hawk
  { year: 1910, title: "Mexican Revolution", category: "revolution", lat: 19.43, lon: -99.13 }, // Mexico City
  { year: 1912, title: "Titanic sinks", category: "other", lat: 41.73, lon: -49.95 }, // North Atlantic
  { year: 1914, span: 4, title: "World War I", category: "war", lat: 50.85, lon: 4.35 }, // Brussels
  { year: 1917, title: "Russian Revolution", category: "revolution", lat: 59.93, lon: 30.31 }, // St. Petersburg
  { year: 1918, span: 2, title: "Spanish flu pandemic", category: "pandemic", lat: 40.42, lon: -3.70 }, // Madrid
  { year: 1929, title: "Wall Street Crash", category: "economy", lat: 40.71, lon: -74.01 }, // NYC
  { year: 1933, title: "Great Depression peaks", category: "economy", lat: 40.71, lon: -74.01 }, // NYC
  { year: 1936, span: 3, title: "Spanish Civil War", category: "war", lat: 40.42, lon: -3.70 }, // Madrid
  { year: 1939, span: 6, title: "World War II", category: "war", lat: 52.23, lon: 21.01 }, // Warsaw

  // ─── Postwar ───
  { year: 1945, title: "Atomic bombs · UN founded", category: "other", lat: 34.40, lon: 132.46 }, // Hiroshima
  { year: 1947, title: "Indian independence", category: "revolution", lat: 28.61, lon: 77.21 }, // Delhi
  { year: 1948, title: "Israel founded", category: "other", lat: 32.07, lon: 34.78 }, // Tel Aviv
  { year: 1949, title: "People's Republic of China", category: "revolution", lat: 39.90, lon: 116.40 }, // Beijing
  { year: 1950, span: 3, title: "Korean War", category: "war", lat: 37.57, lon: 126.98 }, // Seoul
  { year: 1957, title: "Sputnik · Space Age begins", category: "tech", lat: 45.92, lon: 63.34 }, // Baikonur
  { year: 1961, title: "Berlin Wall built", category: "other", lat: 52.52, lon: 13.40 }, // Berlin
  { year: 1962, title: "Cuban Missile Crisis", category: "other", lat: 23.13, lon: -82.38 }, // Havana
  { year: 1963, title: "JFK assassinated", category: "other", lat: 32.78, lon: -96.80 }, // Dallas
  { year: 1965, span: 10, title: "Vietnam War", category: "war", lat: 10.82, lon: 106.63 }, // Saigon
  { year: 1968, title: "Prague Spring", category: "revolution", lat: 50.09, lon: 14.42 }, // Prague
  { year: 1969, title: "Moon landing", category: "tech", lat: 28.57, lon: -80.65 }, // Cape Canaveral

  // ─── Late 20th ───
  { year: 1973, title: "Oil crisis", category: "economy", lat: 24.47, lon: 54.37 }, // Abu Dhabi
  { year: 1974, title: "Portuguese Carnation Revolution", category: "revolution", lat: 38.72, lon: -9.14 }, // Lisbon
  { year: 1975, title: "End of Portuguese colonial wars", category: "war", lat: -8.84, lon: 13.24 }, // Luanda
  { year: 1978, title: "First test-tube baby", category: "tech", lat: 53.48, lon: -2.24 }, // Manchester
  { year: 1979, title: "Iranian Revolution", category: "revolution", lat: 35.70, lon: 51.42 }, // Tehran
  { year: 1981, title: "AIDS epidemic recognised", category: "pandemic", lat: 34.05, lon: -118.24 }, // LA
  { year: 1986, title: "Chernobyl disaster", category: "other", lat: 51.39, lon: 30.10 }, // Chernobyl
  { year: 1989, title: "Berlin Wall falls", category: "revolution", lat: 52.52, lon: 13.40 }, // Berlin
  { year: 1991, title: "Soviet Union dissolves", category: "revolution", lat: 55.75, lon: 37.62 }, // Moscow
  { year: 1994, title: "End of apartheid · Rwandan genocide", category: "other", lat: -26.20, lon: 28.05 }, // Johannesburg
  { year: 1997, title: "Asian financial crisis", category: "economy", lat: 13.75, lon: 100.50 }, // Bangkok

  // ─── 21st century ───
  { year: 2001, title: "September 11 attacks", category: "other", lat: 40.71, lon: -74.01 }, // NYC
  { year: 2003, title: "Iraq War begins", category: "war", lat: 33.32, lon: 44.37 }, // Baghdad
  { year: 2008, title: "Global financial crisis", category: "economy", lat: 40.71, lon: -74.01 }, // NYC
  { year: 2011, title: "Arab Spring · Fukushima", category: "revolution", lat: 30.04, lon: 31.24 }, // Cairo
  { year: 2016, title: "Brexit vote", category: "other", lat: 51.51, lon: -0.13 }, // London
  { year: 2020, span: 3, title: "COVID-19 pandemic", category: "pandemic", lat: 30.59, lon: 114.31 }, // Wuhan
  { year: 2022, title: "Russian invasion of Ukraine", category: "war", lat: 50.45, lon: 30.52 } // Kyiv
];

/**
 * Returns the historical events that "cover" a given year. An event
 * covers a year if year === event.year, or if event.span is set and
 * year ∈ [event.year, event.year + event.span].
 */
export function eventsAtYear(year: number): HistoricalEvent[] {
  const results: HistoricalEvent[] = [];
  for (const e of HISTORICAL_EVENTS) {
    const end = e.span != null ? e.year + e.span : e.year;
    if (year >= e.year && year <= end) results.push(e);
  }
  return results;
}

/**
 * Returns the closest historical event to the given year, or null.
 * Used as a "flavour label" when no event is active at the exact year
 * but one is nearby.
 */
export function nearestEvent(year: number, maxDistance = 3): HistoricalEvent | null {
  let best: HistoricalEvent | null = null;
  let bestDist = Infinity;
  for (const e of HISTORICAL_EVENTS) {
    const dist = Math.abs(e.year - year);
    if (dist < bestDist) {
      bestDist = dist;
      best = e;
    }
  }
  if (!best || bestDist > maxDistance) return null;
  return best;
}
