/**
 * Base-path-aware URL helper for runtime asset references.
 *
 * FamiliaLens is deployed as an embedded sub-app at
 * `raphaelaltieri.com/familialens/`, so `vite.config.ts` sets
 * `base: "/familialens/"` during build. Vite automatically rewrites
 * absolute paths inside HTML/CSS (e.g. `<script src="/vendor/...">`),
 * ES module imports, and `new URL("./foo", import.meta.url)`.
 *
 * It does NOT rewrite string literals inside JS that are consumed at
 * runtime — `fetch("/data/foo.json")` or globe.gl's
 * `.globeImageUrl("/textures/bar.jpg")` would stay as-is and resolve
 * against the document origin, which in prod becomes
 * `raphaelaltieri.com/data/foo.json` (404 — Cloudflare Pages' SPA
 * fallback masks it with a 200 + index.html, even worse).
 *
 * Always wrap runtime asset references with `assetUrl(...)`. It uses
 * `import.meta.env.BASE_URL`, which Vite injects as `/` in dev and
 * `/familialens/` in prod.
 *
 * ```ts
 * fetch(assetUrl("/data/cities.json"));
 * globe.globeImageUrl(assetUrl("/textures/earth-blue-marble.jpg"));
 * ```
 */
export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL; // "/" in dev, "/familialens/" in prod
  return `${base}${path.replace(/^\//, "")}`;
}
