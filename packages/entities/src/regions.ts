import type { CameraState, LngLat, RegionsLayer } from '@geomotion/document';
import { getRamp, rampColor } from '@geomotion/core';

/* ------------------------------------------------------------- geometry */

export interface Region {
  /** stable numeric id, used for MapLibre feature state */
  id: number;
  name: string;
  value: number | null;
  /** [west, south, east, north] */
  bounds: [number, number, number, number];
  /** area-weighted centre of the largest ring — a sane label anchor */
  anchor: LngLat;
  rings: LngLat[][];
  fill: string;
  /** 1-based rank by value, descending; null when there is no value */
  rank: number | null;
}

export interface RegionSet {
  regions: Region[];
  /** tour order, as indices into `regions` */
  order: number[];
  /** bounds of everything, for the opening overview shot */
  bounds: [number, number, number, number];
  domain: [number, number];
  withValues: number;
  /** ready to hand to MapLibre, with `_fill` baked into each feature */
  data: GeoJSON.FeatureCollection;
}

const EMPTY_SET: RegionSet = {
  regions: [],
  order: [],
  bounds: [0, 0, 0, 0],
  domain: [0, 1],
  withValues: 0,
  data: { type: 'FeatureCollection', features: [] },
};

function ringsOf(g: GeoJSON.Geometry | null, out: LngLat[][]) {
  if (!g) return;
  if (g.type === 'Polygon') for (const r of g.coordinates) out.push(r as LngLat[]);
  else if (g.type === 'MultiPolygon') for (const p of g.coordinates) for (const r of p) out.push(r as LngLat[]);
  else if (g.type === 'GeometryCollection') for (const s of g.geometries) ringsOf(s, out);
}

function ringArea(r: LngLat[]): number {
  let prev = r[r.length - 1];
  if (!prev) return 0;
  let a = 0;
  for (const cur of r) {
    a += (prev[0] + cur[0]) * (prev[1] - cur[1]);
    prev = cur;
  }
  return Math.abs(a / 2);
}

function ringCentroid(r: LngLat[]): LngLat {
  const first = r[0];
  let prev = r[r.length - 1];
  if (!first || !prev) return [0, 0];
  let x = 0;
  let y = 0;
  let a = 0;
  for (const cur of r) {
    const f = prev[0] * cur[1] - cur[0] * prev[1];
    a += f;
    x += (prev[0] + cur[0]) * f;
    y += (prev[1] + cur[1]) * f;
    prev = cur;
  }
  if (a === 0) return first;
  return [x / (3 * a), y / (3 * a)];
}

function boundsOfRings(rings: LngLat[][]): [number, number, number, number] {
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const r of rings)
    for (const [lng, lat] of r) {
      if (lng < w) w = lng;
      if (lng > e) e = lng;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
  return [w, s, e, n];
}

/* ----------------------------------------------------------------- cache */

interface CacheEntry {
  sig: string;
  set: RegionSet;
}
const cache = new Map<string, CacheEntry>();

export function clearRegionCache(id?: string) {
  if (id) cache.delete(id);
  else cache.clear();
}

/** Parsing + colouring is memoised on everything that can change the result. */
export function regionSet(layer: RegionsLayer, basemapIsDark: boolean): RegionSet {
  const sig = [
    layer.geojson.length,
    layer.geojson.slice(0, 64),
    layer.nameKey,
    JSON.stringify(layer.values),
    layer.ramp,
    String(layer.flipRamp),
    layer.autoDomain ? 'auto' : `${layer.min}-${layer.max}`,
    layer.tour.order,
    layer.tour.customOrder.join('|'),
    basemapIsDark,
    layer.noDataColor,
  ].join('~');

  const hit = cache.get(layer.id);
  if (hit && hit.sig === sig) return hit.set;

  const set = build(layer, basemapIsDark);
  cache.set(layer.id, { sig, set });
  return set;
}

function build(layer: RegionsLayer, basemapIsDark: boolean): RegionSet {
  let parsed: GeoJSON.FeatureCollection;
  try {
    const j = JSON.parse(layer.geojson || 'null');
    if (!j) return EMPTY_SET;
    parsed = j.type === 'FeatureCollection' ? j : { type: 'FeatureCollection', features: [j] };
  } catch {
    return EMPTY_SET;
  }
  if (!Array.isArray(parsed.features) || parsed.features.length === 0) return EMPTY_SET;

  const regions: Region[] = [];
  parsed.features.forEach((f, i) => {
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const name = String(props[layer.nameKey] ?? props.name ?? props.NAME ?? `Region ${i + 1}`);
    const rings: LngLat[][] = [];
    ringsOf(f.geometry, rings);
    if (!rings.length) return;
    const biggest = rings.reduce((a, b) => (ringArea(b) > ringArea(a) ? b : a));
    const raw = layer.values[name];
    regions.push({
      id: i + 1,
      name,
      value: typeof raw === 'number' && isFinite(raw) ? raw : null,
      bounds: boundsOfRings(rings),
      anchor: ringCentroid(biggest),
      rings,
      fill: layer.noDataColor,
      rank: null,
    });
  });

  if (!regions.length) return EMPTY_SET;

  const valued = regions.filter((r) => r.value !== null);
  const nums = valued.map((r) => r.value as number);
  const domain: [number, number] = layer.autoDomain
    ? [nums.length ? Math.min(...nums) : 0, nums.length ? Math.max(...nums) : 1]
    : [layer.min, layer.max];
  if (domain[1] === domain[0]) domain[1] = domain[0] + 1;

  const ramp = getRamp(layer.ramp);
  const flip = layer.flipRamp ?? basemapIsDark;
  for (const r of regions) {
    if (r.value === null) continue;
    r.fill = rampColor(ramp, (r.value - domain[0]) / (domain[1] - domain[0]), flip);
  }

  [...valued]
    .sort((a, b) => (b.value as number) - (a.value as number))
    .forEach((r, i) => (r.rank = i + 1));

  const order = buildOrder(layer, regions);

  /*
   * Each region is paired back to the feature it came from by `id`, which is the
   * 1-based index into `parsed.features`.
   *
   * NOT by position in `regions`: features with no rings are skipped when building
   * the list above, so the two arrays are only index-aligned when every feature has
   * geometry. With one geometry-less feature anywhere but the end, every region
   * after it was being drawn with the *next* feature's shape — the right name and
   * colour on the wrong polygon, silently. Found by noUncheckedIndexedAccess.
   */
  const data: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: regions.flatMap((r) => {
      const source = parsed.features[r.id - 1];
      if (!source) return [];
      return [
        {
          ...source,
          id: r.id,
          properties: { ...(source.properties ?? {}), _name: r.name, _fill: r.fill },
        },
      ];
    }),
  };

  return {
    regions,
    order,
    bounds: boundsOfRings(regions.flatMap((r) => r.rings)),
    domain,
    withValues: valued.length,
    data,
  };
}

function buildOrder(layer: RegionsLayer, regions: Region[]): number[] {
  const idx = regions.map((_, i) => i);
  const val = (i: number) => regions[i]?.value ?? null;

  switch (layer.tour.order) {
    case 'valueDesc':
      // Regions without a value would otherwise lead the tour; park them last.
      return idx
        .filter((i) => val(i) !== null)
        .sort((a, b) => (val(b) as number) - (val(a) as number));
    case 'valueAsc':
      return idx
        .filter((i) => val(i) !== null)
        .sort((a, b) => (val(a) as number) - (val(b) as number));
    case 'alpha':
      return idx.sort((a, b) => (regions[a]?.name ?? '').localeCompare(regions[b]?.name ?? ''));
    case 'custom': {
      const byName = new Map(regions.map((r, i) => [r.name.toLowerCase(), i]));
      const picked = layer.tour.customOrder
        .map((n) => byName.get(n.trim().toLowerCase()))
        .filter((i): i is number => i !== undefined);
      return picked.length ? picked : idx;
    }
    default:
      return idx;
  }
}

/* ------------------------------------------------------------- framing */

const MAX_LAT = 85.051129;

const mercY = (lat: number) => {
  const l = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  return 0.5 - Math.log(Math.tan(Math.PI / 4 + (l * Math.PI) / 360)) / (2 * Math.PI);
};

const invMercY = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

/**
 * The camera that frames `bounds` in a viewport of exactly width×height pixels.
 *
 * This is the same maths MapLibre's own fitBounds uses, kept pure so a frame can
 * be evaluated without touching the map — which is what makes offline export
 * reproducible. It depends on the pixel size, which is precisely why the preview
 * stage renders at full output resolution.
 */
/**
 * The region a tour stop refers to.
 *
 * `order` holds indices into `regions`, so reaching a stop's region is a double
 * lookup, and both halves can miss — an empty tour, or an order built before the
 * geometry changed. One named helper beats the same two-step indexing repeated at
 * every call site.
 */
export const regionAtStop = (set: RegionSet, stop: number): Region | undefined => {
  const index = set.order[stop];
  return index === undefined ? undefined : set.regions[index];
};

export function fitBounds(
  bounds: [number, number, number, number],
  width: number,
  height: number,
  padding: number,
  pitch: number,
  maxZoom = 22,
): CameraState {
  const [w, s, e, n] = bounds;
  const x1 = w / 360 + 0.5;
  const x2 = e / 360 + 0.5;
  const y1 = mercY(n);
  const y2 = mercY(s);

  const dx = Math.max(1e-9, x2 - x1);
  const dy = Math.max(1e-9, y2 - y1);
  const usable = Math.max(0.1, 1 - 2 * Math.max(0, Math.min(0.45, padding)));

  const zx = Math.log2((usable * width) / (dx * 512));
  const zy = Math.log2((usable * height) / (dy * 512));
  // A pitched camera sees further, so ease off the zoom a little to compensate.
  const zoom = Math.max(0, Math.min(20, maxZoom, Math.min(zx, zy) - (pitch / 85) * 0.55));

  return {
    center: [((x1 + x2) / 2 - 0.5) * 360, invMercY((y1 + y2) / 2)],
    zoom,
    bearing: 0,
    pitch,
  };
}
