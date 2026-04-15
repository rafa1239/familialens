/**
 * Generates SVG cameo-style avatar data URLs.
 *
 * Used to give the demo family unique visual identities — each person
 * gets a deterministic sepia gradient + their initials in Georgia serif,
 * styled like a vintage daguerreotype monogram.
 *
 * The result is a `data:image/svg+xml;utf8,...` URL that can be assigned
 * directly to a Person.photo field. PhotoThumb already handles data URLs.
 *
 * Pure function — same input always produces the same output. Safe to
 * call from anywhere (no DOM, no fetch, no IndexedDB).
 */

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (!parts[0]) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Eight warm earth-tone palettes — vintage sepia variations.
 * Each entry: [highlight color (top-left), shadow color (bottom-right)].
 * Picked from a curated set so even the worst pair looks intentional.
 */
const PALETTES: [string, string][] = [
  ["#9a6432", "#3c2310"], // burnt amber
  ["#8a5a30", "#2e1908"], // espresso
  ["#a87545", "#5a3318"], // copper
  ["#7a4220", "#2c1505"], // dark mahogany
  ["#b58050", "#6b3d1c"], // tan gold
  ["#825533", "#3d2110"], // chestnut
  ["#956030", "#46280f"], // hazelnut
  ["#6f3e1a", "#241004"]  // walnut
];

/**
 * Generate a portrait avatar SVG data URL for a given name.
 * The `salt` parameter lets you bias the palette selection — useful
 * when you want grouped people (e.g. siblings) to look related.
 */
export function generateAvatar(name: string, salt = ""): string {
  const ini = initials(name);
  const h = hash(name + salt);
  const [c1, c2] = PALETTES[h % PALETTES.length];
  const id = `g${h.toString(36)}`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><radialGradient id="${id}" cx="35%" cy="28%" r="85%"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></radialGradient></defs><circle cx="50" cy="50" r="50" fill="url(#${id})"/><circle cx="50" cy="50" r="47" fill="none" stroke="rgba(255,230,200,0.28)" stroke-width="0.8"/><text x="50" y="64" font-family="Georgia, 'Times New Roman', serif" font-size="38" font-weight="500" fill="rgba(255,240,220,0.94)" text-anchor="middle" letter-spacing="-1">${escapeXml(ini)}</text></svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
