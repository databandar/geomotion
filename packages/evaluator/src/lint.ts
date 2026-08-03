/**
 * Static geometry checks — no camera, no rendering, no browser.
 *
 * Thin glue over `@geomotion/geometry`'s pure `antimeridianRisks`/`polarClipRisks`:
 * this file's only job is walking a `Project`'s layers (route coords, marker
 * coords, shape/region GeoJSON — parsed ring by ring, since the antimeridian check
 * needs each ring's own point *sequence*, not a flattened bag of coordinates) and
 * calling those checks on what it finds. Lives here rather than in `document`
 * (which the layer types come from) or `geometry` (which the checks come from)
 * because it needs both, and neither package is allowed to depend on the other —
 * `evaluator` already depends on both for the same reason `routePath` does.
 *
 * Not the same walk as `apps/studio/src/lib/extent.ts`'s `geojsonCoords`: that one
 * deliberately flattens every position in a shape into one unordered list, which is
 * exactly right for a bounding box (order never mattered there) and exactly wrong
 * here (a false "antimeridian jump" would appear at the seam between two unrelated
 * rings in a MultiPolygon). Also editor-only and in the app layer, so a package
 * couldn't depend on it either way.
 */
import type { Layer, Project } from '@geomotion/document';
import { layersOf } from '@geomotion/document';
import type { LngLat } from '@geomotion/core';
import { antimeridianRisks, buildPath, haversine, landCrossingRisks, polarClipRisks } from '@geomotion/geometry';

export interface GeometryFinding {
  layerId: string;
  layerName: string;
  kind: 'antimeridian' | 'polar-clip' | 'land-crossing';
  /** The offending coordinate(s), for a message that points somewhere specific. */
  detail: string;
}

export interface CheckProjectGeometryOptions {
  /**
   * Land polygons for the `overWater` land-crossing check — typically the same
   * countries FeatureCollection the renderer draws (`world-countries.json`).
   * Absent means the check is skipped entirely, `overWater` or not: this
   * package stays data-agnostic the same way `antimeridianRisks` doesn't know
   * what a country is, so the caller (the headless API, the lint CLI) decides
   * what "land" means and supplies it.
   */
  land?: GeoJSON.FeatureCollection;
}

/** Every ring (or line) of positions in a GeoJSON Geometry/Feature/FeatureCollection,
 * kept separate so each one's point order stays intact for the antimeridian check. */
function ringsOfGeoJSON(text: string): LngLat[][] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return []; // invalid GeoJSON is a different problem, not this lint's job
  }

  const rings: LngLat[][] = [];
  const isPosition = (n: unknown): n is LngLat =>
    Array.isArray(n) && typeof n[0] === 'number' && typeof n[1] === 'number' && Number.isFinite(n[0]) && Number.isFinite(n[1]);
  const isRing = (n: unknown): n is LngLat[] => Array.isArray(n) && n.length > 0 && n.every(isPosition);

  const walk = (node: unknown): void => {
    if (isRing(node)) {
      rings.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const v of node) walk(v);
      return;
    }
    if (node && typeof node === 'object') {
      for (const v of Object.values(node)) walk(v);
    }
  };
  walk(parsed);
  return rings;
}

function checkCoords(layer: Layer, coords: readonly LngLat[], findings: GeometryFinding[]): void {
  for (const risk of antimeridianRisks(coords)) {
    findings.push({
      layerId: layer.id,
      layerName: layer.name,
      kind: 'antimeridian',
      detail: `jump from [${risk.from}] to [${risk.to}] at point ${risk.index}`,
    });
  }
  for (const [lng, lat] of polarClipRisks(coords)) {
    findings.push({ layerId: layer.id, layerName: layer.name, kind: 'polar-clip', detail: `[${lng}, ${lat}]` });
  }
}

/**
 * `buildPath(coords, 'straight')` deliberately returns just the given control
 * points — correct for rendering (MapLibre draws the exact same straight line
 * regardless of how many collinear points sit along it) but not dense enough
 * for a land-crossing check, which can only see land at an actual sample
 * point. This inserts purely linear (not great-circle) intermediate points
 * along each straight segment — the same straight line, just sampled closely
 * enough to notice what it passes over. `arc`/`geodesic`/`smooth` already come
 * back densely sampled from `buildPath` itself and skip this.
 */
function denseStraightPath(coords: readonly LngLat[]): LngLat[] {
  if (coords.length < 2) return [...coords];
  const out: LngLat[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i]!;
    const b = coords[i + 1]!;
    const steps = Math.max(8, Math.min(256, Math.round(haversine(a, b) / 20000)));
    for (let s = i === 0 ? 0 : 1; s <= steps; s++) {
      const t = s / steps;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/**
 * Every antimeridian-crossing, polar-clipping, and (when `opts.land` is given)
 * land-crossing risk in a project's geography — all silent failure modes that
 * render as broken shapes or a route drawn across a continent, and were only
 * ever caught by rendering a frame and looking at it (see `@geomotion/geometry`'s
 * `antimeridianRisks`/`polarClipRisks`/`landCrossingRisks` for the specific
 * episodes each one broke). Pure and synchronous — call this on a project
 * straight out of a build script, before ever opening a browser.
 */
export function checkProjectGeometry(project: Project, opts: CheckProjectGeometryOptions = {}): GeometryFinding[] {
  const findings: GeometryFinding[] = [];
  for (const layer of layersOf(project)) {
    if (layer.type === 'route') {
      checkCoords(layer, layer.coords, findings);
      if (layer.overWater && opts.land) {
        const built = buildPath(layer.coords, layer.curve);
        const drawn = layer.curve === 'straight' ? denseStraightPath(built) : built;
        for (const risk of landCrossingRisks(drawn, opts.land)) {
          findings.push({
            layerId: layer.id,
            layerName: layer.name,
            kind: 'land-crossing',
            detail: `crosses ${risk.name} near [${risk.point[0].toFixed(2)}, ${risk.point[1].toFixed(2)}]`,
          });
        }
      }
    } else if (layer.type === 'marker') {
      checkCoords(layer, [layer.coord], findings); // a single point has no "jump" to check, but still a lat to clamp
    } else if (layer.type === 'shape' || layer.type === 'regions') {
      for (const ring of ringsOfGeoJSON(layer.geojson)) checkCoords(layer, ring, findings);
    }
  }
  return findings;
}
