import type { LngLat } from '../types';
import { clamp01 } from './easing';

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
  if (coords.length === 0) return [];
  const out: LngLat[] = [[coords[0][0], coords[0][1]]];
  for (let i = 1; i < coords.length; i++) {
    const prev = out[i - 1][0];
    let lng = coords[i][0];
    while (lng - prev > 180) lng -= 360;
    while (lng - prev < -180) lng += 360;
    out.push([lng, coords[i][1]]);
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
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const steps = Math.max(24, Math.min(256, Math.round(haversine(a, b) / 20000)));
    const seg = curve === 'arc' ? arcSegment(a, b, steps) : geodesicSegment(a, b, steps);
    if (i > 0) seg.shift();
    out.push(...seg);
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
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  return { coords, cum, length: cum[cum.length - 1] ?? 0 };
}

/** Point at a 0..1 fraction of the measured path. */
export function pointAt(path: MeasuredPath, f: number): LngLat {
  const { coords, cum, length } = path;
  if (coords.length === 0) return [0, 0];
  if (coords.length === 1 || length === 0) return coords[0];
  const target = clamp01(f) * length;
  const i = upperBound(cum, target);
  const a = coords[i - 1];
  const b = coords[i];
  const segLen = cum[i] - cum[i - 1];
  const local = segLen === 0 ? 0 : (target - cum[i - 1]) / segLen;
  return [a[0] + (b[0] - a[0]) * local, a[1] + (b[1] - a[1]) * local];
}

/** Heading (degrees) of the path at a 0..1 fraction. */
export function headingAt(path: MeasuredPath, f: number): number {
  const { coords, cum, length } = path;
  if (coords.length < 2) return 0;
  const target = clamp01(f) * length;
  const i = upperBound(cum, target);
  return bearing(coords[i - 1], coords[i]);
}

/** The leading portion of the path, ending exactly at fraction f. */
export function sliceAt(path: MeasuredPath, f: number): LngLat[] {
  const { coords, cum, length } = path;
  if (coords.length < 2) return coords.slice();
  const ff = clamp01(f);
  if (ff <= 0) return [];
  if (ff >= 1) return coords.slice();
  const target = ff * length;
  const i = upperBound(cum, target);
  const head = coords.slice(0, i);
  head.push(pointAt(path, ff));
  return head;
}

/** First index whose cumulative distance is >= target (min 1). */
function upperBound(cum: number[], target: number): number {
  let lo = 1;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function boundsOf(coords: LngLat[]): [[number, number], [number, number]] | null {
  if (!coords.length) return null;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < w) w = lng;
    if (lng > e) e = lng;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  return [
    [w, s],
    [e, n],
  ];
}

/** Pull every coordinate out of arbitrary GeoJSON, for framing/fitting. */
export function collectCoords(geo: unknown, out: LngLat[] = []): LngLat[] {
  if (!geo || typeof geo !== 'object') return out;
  const g = geo as Record<string, unknown>;
  if (Array.isArray(g.features)) {
    for (const f of g.features) collectCoords(f, out);
  } else if (g.geometry) {
    collectCoords(g.geometry, out);
  } else if (g.coordinates) {
    walk(g.coordinates as unknown[], out);
  }
  return out;
}

function walk(arr: unknown[], out: LngLat[]) {
  if (arr.length && typeof arr[0] === 'number') {
    out.push([arr[0] as number, arr[1] as number]);
    return;
  }
  for (const v of arr) if (Array.isArray(v)) walk(v, out);
}
