/**
 * World city database — 490 cities with coordinates, country, population,
 * and flag emoji. Loaded once on first access and cached forever.
 *
 * Source: `/public/data/cities.json` (copied read-only from the TimeGlobe
 * Atlas project). Each entry:
 *
 *   {
 *     name: "Lisbon",
 *     lat: 38.72,
 *     lng: -9.14,
 *     timezone: "Europe/Lisbon",
 *     country: "Portugal",
 *     country_code: "PT",
 *     population: 505526,
 *     tier: "capital",
 *     emoji: "🇵🇹"
 *   }
 */

import { levenshtein, normalizeName } from "./places";

export type City = {
  name: string;
  lat: number;
  lng: number;
  timezone: string;
  country: string;
  country_code: string;
  population: number;
  tier: "capital" | "major" | "other";
  emoji: string;
};

let citiesPromise: Promise<City[]> | null = null;
let citiesSync: City[] | null = null;

/**
 * Load the city database. Subsequent calls return the same cached promise.
 * Safe to call from anywhere; network fetch runs only once per page.
 */
export async function loadCities(): Promise<City[]> {
  if (citiesSync) return citiesSync;
  if (!citiesPromise) {
    citiesPromise = fetch("/data/cities.json")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load cities: ${res.status}`);
        return res.json();
      })
      .then((data: City[]) => {
        citiesSync = data;
        return data;
      })
      .catch((err) => {
        console.warn("[cities] Failed to load:", err);
        citiesSync = [];
        return [];
      });
  }
  return citiesPromise;
}

/**
 * Synchronous accessor. Returns whatever's been loaded so far — empty
 * array if the database hasn't loaded yet. Used in React components
 * that want an immediate value and re-render once the data arrives.
 */
export function getCitiesSync(): City[] {
  return citiesSync ?? [];
}

// ─── Search / lookup ────────────────────────────────

/**
 * Search the city database. Ranking:
 *   0 — exact normalised match
 *   1 — starts-with match
 *   2 — contains match
 *   3+ — fuzzy (Levenshtein ≤ 2) on the first word
 *
 * Within the same rank, cities are sorted by tier (capital first) then
 * by population descending.
 */
export function searchCities(query: string, limit = 8): City[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const cities = getCitiesSync();
  if (cities.length === 0) return [];

  type Match = { city: City; score: number };
  const matches: Match[] = [];

  for (const city of cities) {
    const name = city.name.toLowerCase();
    const nameNormalized = normalizeName(city.name);
    const qNorm = normalizeName(query);

    let score: number | null = null;
    if (nameNormalized === qNorm) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (nameNormalized.startsWith(qNorm)) score = 1;
    else if (name.includes(q)) score = 2;
    else if (nameNormalized.includes(qNorm)) score = 2;
    else if (q.length >= 3) {
      const firstWord = nameNormalized.split(" ")[0];
      const dist = levenshtein(qNorm, firstWord);
      if (dist <= 2) score = 3 + dist;
    }

    if (score !== null) matches.push({ city, score });
  }

  matches.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    const tierRank: Record<City["tier"], number> = {
      capital: 0,
      major: 1,
      other: 2
    };
    const tA = tierRank[a.city.tier] ?? 3;
    const tB = tierRank[b.city.tier] ?? 3;
    if (tA !== tB) return tA - tB;
    return b.city.population - a.city.population;
  });

  return matches.slice(0, limit).map((m) => m.city);
}

/**
 * Exact lookup by name. Useful for resolving a place name into coords
 * when we already know we have a match. Case- and accent-insensitive.
 */
export function findCity(name: string): City | null {
  const cities = getCitiesSync();
  const key = normalizeName(name);
  for (const city of cities) {
    if (normalizeName(city.name) === key) return city;
  }
  return null;
}

/**
 * Format a city as a one-liner: "Lisbon 🇵🇹 · Portugal · 505k"
 */
export function formatCity(city: City): string {
  const pop = formatPopulation(city.population);
  return `${city.name} ${city.emoji} · ${city.country}${pop ? ` · ${pop}` : ""}`;
}

function formatPopulation(n: number): string {
  if (!n || n < 1000) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}k`;
  return String(n);
}
