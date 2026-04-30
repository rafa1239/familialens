/**
 * Ambient declarations for libraries loaded as Atlas-only global scripts.
 *
 * We use three.min.js and globe.gl.min.js from /public/vendor/ rather than
 * npm packages because they come as a matched pair from the TimeGlobe Atlas
 * project and we want to avoid peer-dependency drift. AtlasView loads them
 * on demand; they expose `THREE` and `Globe` as globals on the window.
 */

// Minimal, pragmatic shape for globe.gl — only the pieces we actually use.
// The real lib has ~200 methods; we declare only the chain we need.
export interface GlobeInstance {
  (element: HTMLElement): GlobeInstance;

  // Lifecycle
  pauseAnimation(): GlobeInstance;
  resumeAnimation(): GlobeInstance;
  _destructor?(): void;

  // Texture + appearance
  globeImageUrl(url: string): GlobeInstance;
  bumpImageUrl(url: string): GlobeInstance;
  backgroundColor(color: string): GlobeInstance;
  showGlobe(show: boolean): GlobeInstance;
  showAtmosphere(show: boolean): GlobeInstance;
  atmosphereColor(color: string): GlobeInstance;
  atmosphereAltitude(alt: number): GlobeInstance;

  // Sizing
  width(w: number): GlobeInstance;
  height(h: number): GlobeInstance;

  // Points
  pointsData(data: unknown[]): GlobeInstance;
  pointLat(accessor: string | ((d: unknown) => number)): GlobeInstance;
  pointLng(accessor: string | ((d: unknown) => number)): GlobeInstance;
  pointColor(accessor: string | ((d: unknown) => string)): GlobeInstance;
  pointAltitude(accessor: number | ((d: unknown) => number)): GlobeInstance;
  pointRadius(accessor: number | ((d: unknown) => number)): GlobeInstance;
  pointLabel(accessor: string | ((d: unknown) => string)): GlobeInstance;
  pointResolution(n: number): GlobeInstance;
  pointsMerge(merge: boolean): GlobeInstance;
  pointsTransitionDuration(ms: number): GlobeInstance;
  onPointClick(cb: (point: unknown, ev?: MouseEvent) => void): GlobeInstance;
  onPointHover(cb: (point: unknown | null, prev: unknown | null) => void): GlobeInstance;

  // Arcs (for migrations)
  arcsData(data: unknown[]): GlobeInstance;
  arcStartLat(accessor: string | ((d: unknown) => number)): GlobeInstance;
  arcStartLng(accessor: string | ((d: unknown) => number)): GlobeInstance;
  arcEndLat(accessor: string | ((d: unknown) => number)): GlobeInstance;
  arcEndLng(accessor: string | ((d: unknown) => number)): GlobeInstance;
  arcColor(accessor: string | ((d: unknown) => string | string[])): GlobeInstance;
  arcAltitude(accessor: number | ((d: unknown) => number)): GlobeInstance;
  arcAltitudeAutoScale(n: number): GlobeInstance;
  arcStroke(accessor: number | ((d: unknown) => number)): GlobeInstance;
  arcDashLength(accessor: number | ((d: unknown) => number)): GlobeInstance;
  arcDashGap(accessor: number | ((d: unknown) => number)): GlobeInstance;
  arcDashAnimateTime(accessor: number | ((d: unknown) => number)): GlobeInstance;
  arcsTransitionDuration(ms: number): GlobeInstance;

  // Paths (for trails)
  pathsData(data: unknown[]): GlobeInstance;
  pathPoints(accessor: string | ((d: unknown) => unknown[])): GlobeInstance;
  pathPointLat(accessor: number | ((p: unknown) => number)): GlobeInstance;
  pathPointLng(accessor: number | ((p: unknown) => number)): GlobeInstance;
  pathColor(accessor: string | ((d: unknown) => string | string[])): GlobeInstance;
  pathStroke(accessor: number | ((d: unknown) => number)): GlobeInstance;
  pathDashLength(accessor: number | ((d: unknown) => number)): GlobeInstance;
  pathDashGap(accessor: number | ((d: unknown) => number)): GlobeInstance;
  pathDashAnimateTime(accessor: number | ((d: unknown) => number)): GlobeInstance;
  pathTransitionDuration(ms: number): GlobeInstance;

  // Rings (selection halos + historical event pulses)
  ringsData(data: unknown[]): GlobeInstance;
  ringLat(accessor: number | ((d: unknown) => number)): GlobeInstance;
  ringLng(accessor: number | ((d: unknown) => number)): GlobeInstance;
  ringAltitude(accessor: number | ((d: unknown) => number)): GlobeInstance;
  ringColor(
    accessor: string | ((d: unknown) => string | ((t: number) => string))
  ): GlobeInstance;
  ringMaxRadius(accessor: number | ((d: unknown) => number)): GlobeInstance;
  ringPropagationSpeed(
    accessor: number | ((d: unknown) => number)
  ): GlobeInstance;
  ringRepeatPeriod(accessor: number | ((d: unknown) => number)): GlobeInstance;
  ringResolution(n: number): GlobeInstance;

  // HTML overlays (floating labels that track lat/lng)
  htmlElementsData(data: unknown[]): GlobeInstance;
  htmlLat(accessor: number | ((d: unknown) => number)): GlobeInstance;
  htmlLng(accessor: number | ((d: unknown) => number)): GlobeInstance;
  htmlAltitude(accessor: number | ((d: unknown) => number)): GlobeInstance;
  htmlElement(accessor: (d: unknown) => HTMLElement): GlobeInstance;
  htmlTransitionDuration(ms: number): GlobeInstance;

  // Camera / controls
  pointOfView(
    coords?: { lat?: number; lng?: number; altitude?: number },
    ms?: number
  ): { lat: number; lng: number; altitude: number } | GlobeInstance;
  controls(): {
    autoRotate?: boolean;
    autoRotateSpeed?: number;
    enabled?: boolean;
    enableZoom?: boolean;
    addEventListener?: (ev: string, cb: () => void) => void;
    removeEventListener?: (ev: string, cb: () => void) => void;
  };

  // Three.js escape hatches — unknown-typed so consumers cast carefully
  scene(): unknown;
  camera(): unknown;
  renderer(): unknown;

  // Globe info
  getGlobeRadius?(): number;
}

declare global {
  interface Window {
    Globe: () => GlobeInstance;
    THREE: unknown;
  }
}

export {};
