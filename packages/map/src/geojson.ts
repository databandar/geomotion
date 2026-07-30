/**
 * Turning what someone pasted into the shape layer's box into something drawable.
 *
 * The field is a plain textarea, so the input is arbitrary: half-typed JSON, a bare
 * geometry copied out of a larger document, a `Feature` from a gist, a whole
 * `FeatureCollection` from an export. All four are things people actually paste, and
 * three of them are not what the map wants.
 *
 * Pure and separate from `mapsync` so the cases can be pinned exactly — the caching
 * and the GL calls stay there.
 */
import type { LngLat } from '@geomotion/core';

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Normalise pasted GeoJSON to a `FeatureCollection`.
 *
 * Anything unreadable becomes empty rather than throwing: the textarea commits as it
 * is typed, so every prefix of a valid document passes through here, and a parse error
 * on each keystroke would be noise rather than a signal. An empty collection draws
 * nothing, which is the honest picture of "not a shape yet".
 */
export function parseGeoJSON(raw: string): GeoJSON.FeatureCollection {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || 'null');
  } catch {
    return EMPTY;
  }
  if (!parsed || typeof parsed !== 'object') return EMPTY;

  const o = parsed as { type?: string; features?: unknown };
  if (o.type === 'FeatureCollection') {
    // `features` is what everything downstream iterates, and a collection missing it
    // is common enough in hand-written JSON to be worth surviving.
    return Array.isArray(o.features) ? (parsed as GeoJSON.FeatureCollection) : EMPTY;
  }
  if (o.type === 'Feature') {
    return { type: 'FeatureCollection', features: [parsed as GeoJSON.Feature] };
  }
  // A bare geometry — the common case when copying one shape out of a larger file.
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: parsed as GeoJSON.Geometry }],
  };
}

/**
 * Every line of every ring, flattened, for tracing an outline.
 *
 * Polygon holes are included deliberately: an outline that traced only the exterior
 * would leave a lake's edge undrawn while the coast around it animated.
 *
 * `GeometryCollection` recurses, and may nest — the spec permits it, and QGIS emits it.
 */
export function collectRings(g: GeoJSON.Geometry | null | undefined, out: LngLat[][] = []): LngLat[][] {
  if (!g) return out;
  switch (g.type) {
    case 'Polygon':
      for (const ring of g.coordinates) out.push(ring as LngLat[]);
      break;
    case 'MultiPolygon':
      for (const poly of g.coordinates) for (const ring of poly) out.push(ring as LngLat[]);
      break;
    case 'LineString':
      out.push(g.coordinates as LngLat[]);
      break;
    case 'MultiLineString':
      for (const l of g.coordinates) out.push(l as LngLat[]);
      break;
    case 'GeometryCollection':
      for (const sub of g.geometries) collectRings(sub, out);
      break;
    default:
      // Points and MultiPoints have no line to trace, and an unknown type from a
      // future spec is better ignored than guessed at.
      break;
  }
  return out;
}

/** Every ring in a collection, in feature order. */
export function outlineOf(data: GeoJSON.FeatureCollection): LngLat[][] {
  const out: LngLat[][] = [];
  for (const f of data.features) collectRings(f?.geometry, out);
  return out;
}
