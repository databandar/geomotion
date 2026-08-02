import { clamp01, type LngLat } from '@geomotion/core';

const R = 6371008.8; // mean earth radius, metres
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export function haversine(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * D2R;
  const dLng = (b[0] - a[0]) * D2R;
  const la1 = a[1] * D2R;
  const la2 = b[1] * D2R;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Compass bearing in degrees from a to b. */
export function bearing(a: LngLat, b: LngLat): number {
  const la1 = a[1] * D2R;
  const la2 = b[1] * D2R;
  const dLng = (b[0] - a[0]) * D2R;
  const y = Math.sin(dLng) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return (Math.atan2(y, x) * R2D + 360) % 360;
}

/** Great-circle interpolation between two points. */
export function slerp(a: LngLat, b: LngLat, f: number): LngLat {
  const la1 = a[1] * D2R;
  const lo1 = a[0] * D2R;
  const la2 = b[1] * D2R;
  const lo2 = b[0] * D2R;
  const d =
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2,
        ),
      ),
    );
  if (d === 0) return [a[0], a[1]];
  const A = Math.sin((1 - f) * d) / Math.sin(d);
  const B = Math.sin(f * d) / Math.sin(d);
  const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
  const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
  const z = A * Math.sin(la1) + B * Math.sin(la2);
  return [Math.atan2(y, x) * R2D, Math.atan2(z, Math.sqrt(x * x + y * y)) * R2D];
}

/**
 * Longitudes are kept continuous (they may run past ±180) so a path crossing the
 * antimeridian doesn't snap back across the whole world. MapLibre renders these fine.
 */
export function unwrap(coords: LngLat[]): LngLat[] {
  const out: LngLat[] = [];
  let prev: number | undefined;
  for (const [rawLng, lat] of coords) {
    let lng = rawLng;
    if (prev !== undefined) {
      while (lng - prev > 180) lng -= 360;
      while (lng - prev < -180) lng += 360;
    }
    out.push([lng, lat]);
    prev = lng;
  }
  return out;
}

/** Quadratic bezier in plate-carrée space — the classic "flight arc" look. */
function arcSegment(a: LngLat, b: LngLat, steps: number): LngLat[] {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  // Perpendicular offset, scaled so short hops bulge less than long ones.
  const bulge = Math.min(len * 0.22, 28);
  const cx = mx + (-dy / len) * bulge;
  const cy = my + (dx / len) * bulge;
  const out: LngLat[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]]);
  }
  return out;
}

/** Turn the control points you clicked into a dense renderable polyline. */
export function buildPath(control: LngLat[], curve: 'geodesic' | 'straight' | 'arc'): LngLat[] {
  const pts = unwrap(control);
  if (pts.length < 2) return pts;
  if (curve === 'straight') return pts;

  const out: LngLat[] = [];
  let a: LngLat | undefined;
  for (const b of pts) {
    if (a) {
      const steps = Math.max(24, Math.min(256, Math.round(haversine(a, b) / 20000)));
      const seg = curve === 'arc' ? arcSegment(a, b, steps) : geodesicSegment(a, b, steps);
      // Drop the vertex shared with the previous segment, except on the first.
      if (out.length) seg.shift();
      out.push(...seg);
    }
    a = b;
  }
  return unwrap(out);
}

function geodesicSegment(a: LngLat, b: LngLat, steps: number): LngLat[] {
  const out: LngLat[] = [];
  for (let i = 0; i <= steps; i++) out.push(slerp(a, b, i / steps));
  return out;
}

export interface MeasuredPath {
  coords: LngLat[];
  /** cumulative distance at each vertex, metres */
  cum: number[];
  length: number;
}

export function measure(coords: LngLat[]): MeasuredPath {
  const cum = [0];
  let total = 0;
  let prev: LngLat | undefined;
  for (const c of coords) {
    if (prev) {
      total += haversine(prev, c);
      cum.push(total);
    }
    prev = c;
  }
  return { coords, cum, length: total };
}

/**
 * The segment of the path containing `target` metres along it.
 *
 * The bounds invariant lives here, once, instead of in a comment on each caller:
 * a returned segment always has both endpoints and both cumulative distances, so
 * `pointAt`, `headingAt` and `sliceAt` work with values rather than with indices
 * they have to trust.
 */
interface PathSegment {
  a: LngLat;
  b: LngLat;
  /** cumulative distance at `a` and at `b`, metres */
  start: number;
  end: number;
  /** index of `b`, which is also the vertex count of the path up to `a` */
  index: number;
}

function segmentAt(path: MeasuredPath, target: number): PathSegment | null {
  const { coords, cum } = path;
  if (coords.length < 2) return null;

  // First index whose cumulative distance is >= target (min 1).
  let lo = 1;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    // `mid` is strictly between lo and hi, both of which index `cum`.
    if (cum[mid]! < target) lo = mid + 1;
    else hi = mid;
  }

  const a = coords[lo - 1];
  const b = coords[lo];
  const start = cum[lo - 1];
  const end = cum[lo];
  if (!a || !b || start === undefined || end === undefined) return null;
  return { a, b, start, end, index: lo };
}

/** Point at a 0..1 fraction of the measured path. */
export function pointAt(path: MeasuredPath, f: number): LngLat {
  const { coords, length } = path;
  const first = coords[0];
  if (!first) return [0, 0];
  const target = clamp01(f) * length;
  const seg = length === 0 ? null : segmentAt(path, target);
  if (!seg) return first;

  const segLen = seg.end - seg.start;
  const local = segLen === 0 ? 0 : (target - seg.start) / segLen;
  return [seg.a[0] + (seg.b[0] - seg.a[0]) * local, seg.a[1] + (seg.b[1] - seg.a[1]) * local];
}

/** Heading (degrees) of the path at a 0..1 fraction. */
export function headingAt(path: MeasuredPath, f: number): number {
  const seg = segmentAt(path, clamp01(f) * path.length);
  return seg ? bearing(seg.a, seg.b) : 0;
}

/** The leading portion of the path, ending exactly at fraction f. */
export function sliceAt(path: MeasuredPath, f: number): LngLat[] {
  const { coords, length } = path;
  if (coords.length < 2) return coords.slice();
  const ff = clamp01(f);
  if (ff <= 0) return [];
  if (ff >= 1) return coords.slice();

  const seg = segmentAt(path, ff * length);
  if (!seg) return coords.slice();
  const head = coords.slice(0, seg.index);
  head.push(pointAt(path, ff));
  return head;
}

/**
 * `fitBounds` — the camera center/zoom that fits a set of coordinates inside a
 * viewport.
 *
 * Built after hand-guessing a route's camera zoom turned out to be the single
 * biggest source of wasted render cycles across every produced episode: a 387 km
 * regional route and a 12,000 km chokepoint-to-chokepoint route need wildly
 * different zoom levels, and neither was ever obvious without rendering, looking,
 * and adjusting. This computes it directly instead.
 *
 * The math is MapLibre's own, not an approximation of it — pulled from its bundled
 * source (`cameraForBoxAndBearing` / `projectToWorldCoordinates`) rather than
 * assumed, because an earlier hand-derived formula (implicitly assuming a 256px-tile
 * convention) was close enough to look plausible but wrong enough to cost several
 * rebuild cycles finding the working value by bisection instead. MapLibre defines
 * `worldSize = tileSize(512) * 2^zoom` — a *512px* tile convention, not the classic
 * 256px one — which is why a zoom computed by the wrong convention lands roughly one
 * zoom level off from what actually renders.
 */
export interface FitBoundsPadding {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface FitBoundsOptions {
  /** Viewport size in pixels the camera will render at. */
  width: number;
  height: number;
  /**
   * Margin to leave around the bounds, as a fraction of the viewport (0-1) per
   * side. A single number applies uniformly; per-side values let a caller reserve
   * room for fixed UI — a bottom text band, a corner image card — without the
   * bounds sitting underneath it. Defaults to no padding.
   */
  padding?: number | FitBoundsPadding;
  /** MapLibre's tile size in pixels, i.e. what its zoom levels are defined against.
   * Only present so a test can pin the exact number to something other than the
   * live library's — real callers should never set this. */
  tileSize?: number;
  /** Zoom is clamped to this range, matching MapLibre's own `fitBounds({maxZoom})`
   * — without it, a single point (zero-size bounds) computes an unbounded zoom. */
  minZoom?: number;
  maxZoom?: number;
}

export interface FitBoundsResult {
  center: LngLat;
  zoom: number;
}

// MapLibre's own clamp on latitude passed to its Mercator projection — the same
// ±85.0511° limit that silently breaks polygon fills past this line (see the
// arctic-route episode's post-mortem). Applied here too, so a bounding box that
// includes a too-far-north point doesn't skew the fit around an unrepresentable
// coordinate. Exported so a lint pass can flag a coordinate that crosses it, not
// just quietly clamp around it.
export const MAX_MERCATOR_LATITUDE = 85.051129;

function mercatorX(lng: number): number {
  return (180 + lng) / 360;
}
function mercatorY(lat: number): number {
  const clamped = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, lat));
  return (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360))) / 360;
}
function lngFromMercatorX(x: number): number {
  return x * 360 - 180;
}
function latFromMercatorY(y: number): number {
  const y2 = 180 - y * 360;
  return (360 / Math.PI) * Math.atan(Math.exp((y2 * Math.PI) / 180)) - 90;
}
function wrapLng(lng: number): number {
  let l = lng;
  while (l > 180) l -= 360;
  while (l < -180) l += 360;
  return l;
}
function resolvePadding(p: FitBoundsOptions['padding']): Required<FitBoundsPadding> {
  if (p === undefined) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof p === 'number') return { top: p, right: p, bottom: p, left: p };
  return { top: p.top ?? 0, right: p.right ?? 0, bottom: p.bottom ?? 0, left: p.left ?? 0 };
}

export function fitBounds(coords: readonly LngLat[], opts: FitBoundsOptions): FitBoundsResult {
  if (coords.length === 0) throw new Error('fitBounds: coords is empty');
  const tileSize = opts.tileSize ?? 512;
  const pad = resolvePadding(opts.padding);

  // Unwrapped first — an antimeridian-crossing set of points (e.g. a route from
  // Japan to the US west coast) would otherwise compute a bounding box spanning
  // nearly the whole world instead of the narrow span it actually occupies.
  const pts = unwrap([...coords]);
  let west = Infinity;
  let east = -Infinity;
  let south = Infinity;
  let north = -Infinity;
  for (const [lng, lat] of pts) {
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }

  const x0 = mercatorX(west);
  const x1 = mercatorX(east);
  const y0 = mercatorY(north); // north has the smaller mercator Y (Y increases southward)
  const y1 = mercatorY(south);
  // A single point (or a route with zero extent) has zero size — clamped away from
  // literal zero so the division below produces a very large, then-clamped zoom
  // rather than Infinity/NaN.
  const sizeX = Math.max(1e-9, x1 - x0);
  const sizeY = Math.max(1e-9, y1 - y0);

  const availW = opts.width * (1 - pad.left - pad.right);
  const availH = opts.height * (1 - pad.top - pad.bottom);
  if (availW <= 0 || availH <= 0) throw new Error('fitBounds: padding leaves no visible area');

  const worldSize = Math.min(availW / sizeX, availH / sizeY);
  const rawZoom = Math.log2(worldSize / tileSize);
  const zoom = Math.min(opts.maxZoom ?? 20, Math.max(opts.minZoom ?? 0, rawZoom));
  // Padding was computed against `rawZoom`'s worldSize, but the actual render uses
  // the clamped `zoom` — recompute so the offset (and thus the center) matches what
  // will actually be on screen, not the pre-clamp target.
  const finalWorldSize = tileSize * 2 ** zoom;

  // Asymmetric padding shifts the center, not just the zoom — the same "offset the
  // frame, don't just center the raw bounds" step MapLibre's own fitBounds does, so
  // the visible content centers in the *unpadded* remaining area, not the full
  // viewport.
  const midX = (x0 + x1) / 2;
  const midY = (y0 + y1) / 2;
  const offsetXFrac = (opts.width * (pad.left - pad.right)) / (2 * finalWorldSize);
  const offsetYFrac = (opts.height * (pad.top - pad.bottom)) / (2 * finalWorldSize);

  return {
    center: [wrapLng(lngFromMercatorX(midX - offsetXFrac)), latFromMercatorY(midY - offsetYFrac)],
    zoom,
  };
}

/**
 * Two coordinate-only checks — no camera, no rendering — for the two silent
 * geometry failure modes actually hit while producing episodes, both invisible in
 * the coordinate list and only obvious once rendered:
 *
 *  - A polygon or route crossing the antimeridian without continuous (unwrapped)
 *    longitude renders as a self-intersecting mess (the arctic-route ice shapes,
 *    first draft: a broken crescent from wide out, a nonsense edge from close in).
 *    A route's own path-builder already unwraps automatically (see `buildPath`);
 *    a shape layer's raw GeoJSON does not, and is exactly what broke.
 *
 *  - A vertex beyond MapLibre's ±85.0511° Mercator limit doesn't degrade
 *    gracefully — it clips into a genuinely broken fill, confirmed by testing 5°
 *    and 1.5° vertex spacing and getting a pixel-identical broken shape both
 *    times, which is what revealed it wasn't an edge-straightness problem at all.
 *
 * Both run in plain Node against raw coordinates, so a build script can call them
 * immediately after constructing a ring or route — no browser, no render.
 */
export interface AntimeridianRisk {
  /** Index of the second point in the offending pair — the jump is between i-1 and i. */
  index: number;
  from: LngLat;
  to: LngLat;
}

/**
 * Whether consecutive points jump more than 180° in raw longitude — the ambiguous
 * case where "the short way" and "the long way round" can't be told apart, and a
 * polygon fill (which doesn't auto-unwrap) picks the wrong one.
 */
export function antimeridianRisks(coords: readonly LngLat[]): AntimeridianRisk[] {
  const risks: AntimeridianRisk[] = [];
  for (let i = 1; i < coords.length; i++) {
    const [lngA] = coords[i - 1]!;
    const [lngB] = coords[i]!;
    if (Math.abs(lngB - lngA) > 180) risks.push({ index: i, from: coords[i - 1]!, to: coords[i]! });
  }
  return risks;
}

/** Every point beyond MapLibre's ±85.0511° Mercator limit. */
export function polarClipRisks(coords: readonly LngLat[]): LngLat[] {
  return coords.filter(([, lat]) => Math.abs(lat) > MAX_MERCATOR_LATITUDE);
}
