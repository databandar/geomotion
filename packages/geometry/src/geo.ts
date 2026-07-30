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
