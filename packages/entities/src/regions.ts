import type { CameraState, LngLat, RegionsLayer } from '@geomotion/document';
import { getRamp, rampColor, rampPosition } from '@geomotion/core';
import { fitBounds as fitBoundsGeo } from '@geomotion/geometry';

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
  /** the diverging reference value, carried so the legend reads the same scale the fills do */
  midpoint: number | null;
  withValues: number;
  /** ready to hand to MapLibre, with `_fill` baked into each feature */
  data: GeoJSON.FeatureCollection;
}

const EMPTY_SET: RegionSet = {
  regions: [],
  order: [],
  bounds: [0, 0, 0, 0],
  domain: [0, 1],
  midpoint: null,
  withValues: 0,
  data: { type: 'FeatureCollection', features: [] },
};

/**
 * The midpoint as the scale actually used it, or `null`.
 *
 * `rampPosition` ignores a midpoint at or outside the domain — an arm of zero width
 * cannot be read. The legend has to make the same call, or it would draw a tick for a
 * boundary the fills never honoured.
 */
function effectiveMidpoint(mid: number | null, domain: [number, number]): number | null {
  if (mid === null || !isFinite(mid)) return null;
  return mid > domain[0] && mid < domain[1] ? mid : null;
}

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
    String(layer.midpoint),
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
    r.fill = rampColor(ramp, rampPosition(r.value, domain[0], domain[1], layer.midpoint), flip);
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
    midpoint: effectiveMidpoint(layer.midpoint, domain),
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

/**
 * The camera that frames `bounds` in a viewport of exactly width×height pixels.
 *
 * A thin, signature-preserving wrapper around `@geomotion/geometry`'s `fitBounds` —
 * this function used to carry its own copy of the Mercator fit math (the exact same
 * formulas, independently written), which went undiscovered by a whole separate
 * video-production effort that hand-derived and hand-calibrated camera zooms from
 * scratch instead, at real cost (see that package's changelog). One implementation,
 * used from both places, so that doesn't happen again. Only the pieces this
 * region-tour caller actually needs are added back here: a plain `[w,s,e,n]` tuple
 * (regions never span the antimeridian, so two opposite corners are a complete
 * bounding box) and the pitch compensation, which is specific to touring a flat
 * region layer and has no equivalent in the general geographic helper.
 */
export function fitBounds(
  bounds: [number, number, number, number],
  width: number,
  height: number,
  padding: number,
  pitch: number,
  maxZoom = 22,
): CameraState {
  const [w, s, e, n] = bounds;
  const p = Math.max(0, Math.min(0.45, padding));
  const fit = fitBoundsGeo([[w, s], [e, n]], { width, height, padding: p, maxZoom: Math.min(20, maxZoom) });
  // A pitched camera sees further, so ease off the zoom a little to compensate.
  const zoom = Math.max(0, fit.zoom - (pitch / 85) * 0.55);
  return { center: fit.center, zoom, bearing: 0, pitch };
}
