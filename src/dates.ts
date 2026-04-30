import type { EventDate } from "./types";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

// Lookup of English month names (long + short) → month number (1-12)
const MONTH_LOOKUP: Record<string, number> = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12
};

/**
 * Parse a free-form date string into an EventDate.
 * Recognised forms:
 *   "1950"            → year precision
 *   "1950-03"         → month precision
 *   "1950-03-15"      → exact precision
 *   "c. 1950"         → approx
 *   "circa 1950"      → approx
 *   "~1950"           → approx
 *   "before 1950"     → before
 *   "bef. 1950"       → before
 *   "after 1950"      → after
 *   "aft. 1950"       → after
 * Anything else is returned as "raw" precision with sortKey = NaN,
 * preserving the original string for display.
 *
 * Empty / whitespace input returns undefined.
 */
export function parseDate(raw: string | undefined | null): EventDate | undefined {
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  // Full ISO YYYY-MM-DD
  const ymd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    if (isValidYMD(year, month, day)) {
      return {
        display: formatExact(year, month, day),
        iso: `${pad4(year)}-${pad2(month)}-${pad2(day)}`,
        sortKey: year + (dayOfYear(year, month, day) - 1) / daysInYear(year),
        precision: "exact"
      };
    }
  }

  // ISO YYYY-MM
  const ym = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (ym) {
    const year = Number(ym[1]);
    const month = Number(ym[2]);
    if (month >= 1 && month <= 12) {
      return {
        display: `${MONTH_NAMES[month - 1]} ${year}`,
        iso: `${pad4(year)}-${pad2(month)}`,
        sortKey: year + (month - 1) / 12,
        precision: "month"
      };
    }
  }

  // European slash/dot date: DD/MM/YYYY or DD.MM.YYYY
  const dmyNumeric = trimmed.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
  if (dmyNumeric) {
    const day = Number(dmyNumeric[1]);
    const month = Number(dmyNumeric[2]);
    const year = Number(dmyNumeric[3]);
    if (isValidYMD(year, month, day)) {
      return {
        display: formatExact(year, month, day),
        iso: `${pad4(year)}-${pad2(month)}-${pad2(day)}`,
        sortKey: year + (dayOfYear(year, month, day) - 1) / daysInYear(year),
        precision: "exact"
      };
    }
  }

  // Numeric month/year: MM/YYYY or MM.YYYY
  const myNumeric = trimmed.match(/^(\d{1,2})[/.](\d{4})$/);
  if (myNumeric) {
    const month = Number(myNumeric[1]);
    const year = Number(myNumeric[2]);
    if (month >= 1 && month <= 12) {
      return {
        display: `${MONTH_NAMES[month - 1]} ${year}`,
        iso: `${pad4(year)}-${pad2(month)}`,
        sortKey: year + (month - 1) / 12,
        precision: "month"
      };
    }
  }

  // Year only
  const y = trimmed.match(/^(\d{4})$/);
  if (y) {
    const year = Number(y[1]);
    return {
      display: String(year),
      iso: pad4(year),
      sortKey: year,
      precision: "year"
    };
  }

  // Approximate: "c. 1890", "circa 1890", "about 1890", "~1890", "1890?"
  const approx = trimmed.match(/^(?:(?:c\.?|ca\.?|circa|abt\.?|about|around|~)\s*)?(\d{4})\??$/i);
  if (approx) {
    const year = Number(approx[1]);
    const plainYear = /^\d{4}$/.test(trimmed);
    if (plainYear) {
      return {
        display: String(year),
        iso: pad4(year),
        sortKey: year,
        precision: "year"
      };
    }
    return {
      display: `c. ${year}`,
      iso: pad4(year),
      sortKey: year,
      precision: "approx"
    };
  }

  // Before
  const before = trimmed.match(/^(?:before|bef\.?)\s+(\d{4})$/i);
  if (before) {
    const year = Number(before[1]);
    return {
      display: `before ${year}`,
      iso: pad4(year),
      sortKey: year - 0.5,
      precision: "before"
    };
  }

  // After
  const after = trimmed.match(/^(?:after|aft\.?)\s+(\d{4})$/i);
  if (after) {
    const year = Number(after[1]);
    return {
      display: `after ${year}`,
      iso: pad4(year),
      sortKey: year + 0.5,
      precision: "after"
    };
  }

  // Natural: "15 March 1950" or "15 Mar 1950"
  const dmy = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const monthKey = dmy[2].toLowerCase();
    const year = Number(dmy[3]);
    const month = MONTH_LOOKUP[monthKey];
    if (month && isValidYMD(year, month, day)) {
      return {
        display: formatExact(year, month, day),
        iso: `${pad4(year)}-${pad2(month)}-${pad2(day)}`,
        sortKey: year + (dayOfYear(year, month, day) - 1) / daysInYear(year),
        precision: "exact"
      };
    }
  }

  // Natural: "March 1950" or "Mar 1950"
  const my = trimmed.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (my) {
    const monthKey = my[1].toLowerCase();
    const year = Number(my[2]);
    const month = MONTH_LOOKUP[monthKey];
    if (month) {
      return {
        display: `${MONTH_NAMES[month - 1]} ${year}`,
        iso: `${pad4(year)}-${pad2(month)}`,
        sortKey: year + (month - 1) / 12,
        precision: "month"
      };
    }
  }

  // Unparseable — preserve display, mark as raw with NaN sortKey
  return {
    display: trimmed,
    sortKey: Number.NaN,
    precision: "raw"
  };
}

/**
 * Return the year of an EventDate for simple ordering/filtering, or null
 * when the date is raw/unknown.
 */
export function yearOf(date: EventDate | undefined): number | null {
  if (!date) return null;
  if (Number.isNaN(date.sortKey)) return null;
  return Math.floor(date.sortKey);
}

// ─── helpers ─────────────────────────────────────────

function pad2(n: number): string { return n.toString().padStart(2, "0"); }
function pad4(n: number): string { return n.toString().padStart(4, "0"); }

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeap(year) ? 29 : 28;
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}

function daysInYear(year: number): number { return isLeap(year) ? 366 : 365; }

function isValidYMD(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > daysInMonth(y, m)) return false;
  return true;
}

function dayOfYear(y: number, m: number, d: number): number {
  let total = 0;
  for (let i = 1; i < m; i += 1) total += daysInMonth(y, i);
  return total + d;
}

function formatExact(y: number, m: number, d: number): string {
  return `${d} ${MONTH_NAMES[m - 1]} ${y}`;
}
