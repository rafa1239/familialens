/**
 * Demo family dataset — the Santos-Dupont family.
 *
 * 8 people, 3 generations, 7 cities across 4 continents.
 * Designed to show off every FamiliaLens feature on first open:
 *   - Globe dots in Lisbon, Lyon, Paris, Buenos Aires, São Paulo, NYC, Tokyo
 *   - Migration arcs when scrubbing the timeline
 *   - Life Tour mode (3 people still alive → slider reaches "now")
 *   - Parent–child and spouse relationships in the tree view
 *   - Historical event pulses overlapping their lifetimes (WWII, Moon landing, etc.)
 *   - A "full circle" narrative (grandfather from Lisbon → granddaughter returns to Lisbon)
 *
 * This dataset auto-loads on first visit so the portfolio experience is instant.
 */

import type { DataState, FamilyEvent, Person, Place, EventDate } from "./types";

export const DEMO_DATASET_ID = "dataset_demo_santos_dupont";

// ─── Helpers ──────────────────────────────────────────

function d(year: string): EventDate {
  const y = parseInt(year, 10);
  return { display: year, iso: year, sortKey: y, precision: "year" };
}

function dExact(y: number, m: number, day: number): EventDate {
  const mm = String(m).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const months = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  return {
    display: `${day} ${months[m]} ${y}`,
    iso: `${y}-${mm}-${dd}`,
    sortKey: y + (m - 1) / 12 + (day - 1) / 365,
    precision: "exact"
  };
}

function place(name: string, lat: number, lon: number): Place {
  return { name, lat, lon };
}

// ─── Locations ────────────────────────────────────────

const LISBON   = place("Lisbon, Portugal",     38.72,   -9.14);
const LYON     = place("Lyon, France",         45.76,    4.84);
const PARIS    = place("Paris, France",        48.86,    2.35);
const BAIRES   = place("Buenos Aires, Argentina", -34.60, -58.38);
const SAOPAULO = place("São Paulo, Brazil",   -23.55,  -46.63);
const NYC      = place("New York, USA",        40.71,  -74.01);
const TOKYO    = place("Tokyo, Japan",         35.68,  139.69);

// ─── Person IDs ───────────────────────────────────────

const ANTONIO = "person_demo_antonio";
const MARIE   = "person_demo_marie";
const ISABEL  = "person_demo_isabel";
const CARLOS  = "person_demo_carlos";
const LUCIA   = "person_demo_lucia";
const MIGUEL  = "person_demo_miguel";
const SOFIA   = "person_demo_sofia";
const DAVID   = "person_demo_david";

// ─── People ───────────────────────────────────────────

const people: Record<string, Person> = {
  [ANTONIO]: {
    id: ANTONIO, name: "António Santos", gender: "M",
    notes: "Born in Alfama, Lisbon. Moved to Paris after the war to work in construction."
  },
  [MARIE]: {
    id: MARIE, name: "Marie Dupont", gender: "F",
    notes: "Grew up in the Croix-Rousse district of Lyon. Met António at a dance in Lisbon."
  },
  [ISABEL]: {
    id: ISABEL, name: "Isabel Santos", gender: "F",
    notes: "Raised in Paris but always felt drawn to warmer latitudes."
  },
  [CARLOS]: {
    id: CARLOS, name: "Carlos Rivera", gender: "M",
    notes: "Son of Spanish immigrants in Buenos Aires. Came to Europe on a scholarship."
  },
  [LUCIA]: {
    id: LUCIA, name: "Lucia Rivera", gender: "F",
    notes: "Born in São Paulo during a thunderstorm. Works as a translator in New York."
  },
  [MIGUEL]: {
    id: MIGUEL, name: "Miguel Rivera", gender: "M",
    notes: "Software engineer who moved to Tokyo for a startup. Speaks Japanese fluently."
  },
  [SOFIA]: {
    id: SOFIA, name: "Sofia Rivera", gender: "F",
    notes: "Returned to Lisbon — the city her grandfather left. Runs a ceramics studio in Alfama."
  },
  [DAVID]: {
    id: DAVID, name: "David Chen", gender: "M",
    notes: "Born in Queens, New York. Met Lucia at a book club in the East Village."
  }
};

// ─── Events ───────────────────────────────────────────

let eventSeq = 0;
function eid(): string { return `event_demo_${++eventSeq}`; }

function ev(
  type: FamilyEvent["type"],
  personIds: string[],
  date: EventDate,
  loc?: Place,
  notes?: string
): FamilyEvent {
  return {
    id: eid(),
    type,
    people: personIds,
    date,
    place: loc,
    notes,
    sources: [],
    photos: []
  };
}

const events: Record<string, FamilyEvent> = {};

function add(e: FamilyEvent) { events[e.id] = e; }

// ── Generation 0: António & Marie ──

add(ev("birth",     [ANTONIO],           dExact(1920, 3, 15),  LISBON));
add(ev("birth",     [MARIE],             dExact(1924, 7, 22),  LYON));
add(ev("marriage",  [ANTONIO, MARIE],    d("1945"),            LISBON,
  "Married at Igreja de Santo António, the patron saint of Lisbon."));
add(ev("migration", [ANTONIO],           d("1950"),            PARIS,
  "Moved to Paris for post-war reconstruction work."));
add(ev("migration", [MARIE],             d("1950"),            PARIS,
  "Joined António in Paris."));
add(ev("death",     [ANTONIO],           dExact(1992, 11, 8),  PARIS));
add(ev("death",     [MARIE],             dExact(2005, 3, 14),  PARIS));

// ── Generation 1: Isabel & Carlos ──

// Isabel's birth: people[0]=child, [1..]=parents
add(ev("birth",     [ISABEL, ANTONIO, MARIE], dExact(1948, 9, 3), PARIS));
add(ev("birth",     [CARLOS],            dExact(1946, 4, 18),  BAIRES));
add(ev("marriage",  [ISABEL, CARLOS],    d("1972"),            PARIS,
  "Met at the Sorbonne where Carlos was studying engineering."));
add(ev("migration", [ISABEL],            d("1975"),            SAOPAULO,
  "Carlos got a job offer at an engineering firm in São Paulo."));
add(ev("migration", [CARLOS],            d("1975"),            SAOPAULO));
add(ev("migration", [ISABEL],            d("1990"),            BAIRES,
  "Moved to Buenos Aires after Carlos's mother fell ill."));
add(ev("migration", [CARLOS],            d("1990"),            BAIRES));
add(ev("death",     [CARLOS],            dExact(2018, 12, 20), BAIRES));

// ── Generation 2: Lucia, Miguel, Sofia, David ──

add(ev("birth",     [LUCIA, ISABEL, CARLOS],  dExact(1975, 6, 12),  SAOPAULO));
add(ev("birth",     [MIGUEL, ISABEL, CARLOS], dExact(1978, 1, 29),  SAOPAULO));
add(ev("birth",     [SOFIA, ISABEL, CARLOS],  dExact(1982, 11, 14), BAIRES));
add(ev("birth",     [DAVID],                  dExact(1974, 8, 5),   NYC));

add(ev("migration", [LUCIA],             d("2000"),            NYC,
  "Moved to New York to study at Columbia University."));
add(ev("marriage",  [LUCIA, DAVID],      d("2001"),            NYC,
  "Married at City Hall in Lower Manhattan."));

add(ev("migration", [MIGUEL],            d("2005"),            TOKYO,
  "Joined a tech startup in Shibuya."));
add(ev("occupation",[MIGUEL],            d("2005"),            TOKYO,
  "Software engineer at a fintech startup."));

add(ev("migration", [SOFIA],             d("2010"),            LISBON,
  "Returned to Lisbon — the city her grandfather left 60 years earlier."));
add(ev("occupation",[SOFIA],             d("2012"),            LISBON,
  "Opened a ceramics studio in Alfama, the neighborhood where António grew up."));

add(ev("residence", [LUCIA],             d("2003"),            NYC,
  "Settled in Brooklyn with David."));
add(ev("residence", [DAVID],             d("2003"),            NYC));

// ─── Export ───────────────────────────────────────────

export function createDemoData(): DataState {
  const now = new Date().toISOString();
  return {
    schemaVersion: 3,
    datasetId: DEMO_DATASET_ID,
    createdAt: now,
    updatedAt: now,
    people: { ...people },
    events: { ...events },
    sources: {}
  };
}
