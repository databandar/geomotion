/**
 * The ground the composition actually covers.
 *
 * Used by the viewport's Fit control to answer "show me everything" — a question the
 * camera keyframes alone cannot answer, because a project can have geometry nowhere near
 * any shot yet, which is exactly when you want to find it.
 *
 * Editor-only, so it lives in the app rather than in `geometry`: it is a framing
 * convenience, not part of what a render means, and nothing in the pipeline uses it.
 */
import { camerasOf, layersOf, shotsOf } from '@geomotion/document';
import type { Layer, Project, LngLat } from '@geomotion/document';

/** `[west, south, east, north]`, or nothing if the project has no geography. */
export type Bounds = [number, number, number, number];

/**
 * Every coordinate a layer puts on the map.
 *
 * Text and image layers are deliberately absent: they are placed in *frame* space (`x`,
 * `y` normalised across the canvas) and follow the camera wherever it goes, so including
 * them would mean inventing a position they do not have.
 */
function coordsOf(layer: Layer): LngLat[] {
  switch (layer.type) {
    case 'route':
      return layer.coords;
    case 'marker':
      return [layer.coord];
    case 'shape':
      return geojsonCoords(layer.geojson);
    default:
      return [];
  }
}

/**
 * Positions out of raw GeoJSON text, at any nesting depth.
 *
 * A shape layer holds whatever someone pasted, so this walks rather than switching on
 * geometry type: a `GeometryCollection` inside a `FeatureCollection` is legal, and a
 * type-by-type reader would silently return nothing for it. A position is the base case
 * — two or more finite numbers — and anything unparseable yields no coordinates rather
 * than throwing, because the Fit button is not where a bad paste should be reported.
 */
function geojsonCoords(text: string): LngLat[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }

  const out: LngLat[] = [];
  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) {
      if (node && typeof node === 'object') {
        for (const v of Object.values(node)) walk(v);
      }
      return;
    }
    const [a, b] = node;
    if (typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)) {
      out.push([a, b]);
      return;
    }
    for (const v of node) walk(v);
  };
  walk(parsed);
  return out;
}

/**
 * The extent of everything in the project, camera shots included.
 *
 * Camera centres count as geography: a project whose only content is a sequence of
 * framed shots still has somewhere to fit to, and Fit doing nothing there would read as
 * a broken button.
 *
 * A single point gives a degenerate box. That is left to the caller — `fitBounds` on a
 * zero-size box picks its maximum zoom, which is the right answer for one marker.
 */
export function projectExtent(project: Project): Bounds | undefined {
  const points: LngLat[] = [
    ...layersOf(project).flatMap(coordsOf),
    ...camerasOf(project).flatMap((c) => shotsOf(c).map((k) => k.center)),
  ].filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));

  if (points.length === 0) return undefined;

  let w = 180;
  let s = 90;
  let e = -180;
  let n = -90;
  for (const [lng, lat] of points) {
    if (lng < w) w = lng;
    if (lng > e) e = lng;
    if (lat < s) s = lat;
    if (lat > n) n = lat;
  }
  return [w, s, e, n];
}
