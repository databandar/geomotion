import type { Map as MLMap, GeoJSONSource, LayerSpecification } from 'maplibre-gl';
import type { LngLat, ShapeLayer } from '../types';
import type { Scene } from './scene';
import { measure, sliceAt, type MeasuredPath } from './geo';

/**
 * Slicing a border every frame would otherwise rebuild its cumulative-length
 * table each time. Rings are stable objects, so the measurement can ride along.
 */
const ringMeasures = new WeakMap<LngLat[], MeasuredPath>();
function measuredRing(ring: LngLat[]): MeasuredPath {
  let m = ringMeasures.get(ring);
  if (!m) {
    m = measure(ring);
    ringMeasures.set(ring, m);
  }
  return m;
}

/**
 * Owns every GL source/layer we push into the map. Route lines and shapes live
 * here because they have to drape onto the map and respect the projection.
 * Markers, labels and text are drawn in the 2D overlay instead — see overlay.ts.
 */

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

const paintCache = new Map<string, unknown>();

/** Arrays/objects compare by value so we don't re-set line-dasharray every frame. */
const cacheKeyOf = (v: unknown) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v);

function setPaint(map: MLMap, layerId: string, prop: string, value: unknown) {
  const key = layerId + '|' + prop;
  const next = cacheKeyOf(value);
  if (paintCache.get(key) === next) return;
  paintCache.set(key, next);
  map.setPaintProperty(layerId, prop, value as never);
}

function setLayout(map: MLMap, layerId: string, prop: string, value: unknown) {
  const key = layerId + '#' + prop;
  const next = cacheKeyOf(value);
  if (paintCache.get(key) === next) return;
  paintCache.set(key, next);
  map.setLayoutProperty(layerId, prop, value as never);
}

export function resetSyncCache() {
  paintCache.clear();
  shapeCache.clear();
}

const lineFeature = (coords: LngLat[]): GeoJSON.FeatureCollection =>
  coords.length < 2
    ? EMPTY
    : {
        type: 'FeatureCollection',
        features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } }],
      };

/* --------------------------------------------------------------- geojson */

interface ShapeCacheEntry {
  raw: string;
  data: GeoJSON.FeatureCollection;
  outline: LngLat[][];
}
const shapeCache = new Map<string, ShapeCacheEntry>();

function parseShape(layer: ShapeLayer): ShapeCacheEntry {
  const hit = shapeCache.get(layer.id);
  if (hit && hit.raw === layer.geojson) return hit;

  let data: GeoJSON.FeatureCollection = EMPTY;
  try {
    const parsed = JSON.parse(layer.geojson || 'null');
    if (parsed) {
      if (parsed.type === 'FeatureCollection') data = parsed;
      else if (parsed.type === 'Feature') data = { type: 'FeatureCollection', features: [parsed] };
      else data = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: parsed }] };
    }
  } catch {
    data = EMPTY;
  }

  const outline: LngLat[][] = [];
  for (const f of data.features) collectRings(f.geometry, outline);

  const entry = { raw: layer.geojson, data, outline };
  shapeCache.set(layer.id, entry);
  return entry;
}

function collectRings(g: GeoJSON.Geometry | null, out: LngLat[][]) {
  if (!g) return;
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
      break;
  }
}

/* ------------------------------------------------------------------ sync */

export function syncScene(map: MLMap, scene: Scene) {
  if (!map.isStyleLoaded()) return;

  const wanted = new Set<string>();

  for (const s of scene.shapes) {
    const { layer } = s;
    const src = `gm-shape-${layer.id}`;
    const entry = parseShape(layer);
    wanted.add(src);

    ensureSource(map, src, entry.data);
    (map.getSource(src) as GeoJSONSource | undefined)?.setData(entry.data);

    const fillId = `${src}-fill`;
    const lineId = `${src}-line`;
    const traceId = `${src}-trace`;
    const extrudeId = `${src}-3d`;

    ensureLayer(map, { id: fillId, type: 'fill', source: src, paint: { 'fill-color': layer.fillColor } });
    setPaint(map, fillId, 'fill-color', layer.fillColor);
    setPaint(map, fillId, 'fill-opacity', layer.fillOpacity * s.alpha);

    if (layer.extrude) {
      ensureLayer(map, { id: extrudeId, type: 'fill-extrusion', source: src, paint: {} });
      setPaint(map, extrudeId, 'fill-extrusion-color', layer.fillColor);
      setPaint(map, extrudeId, 'fill-extrusion-height', layer.extrudeHeight);
      setPaint(map, extrudeId, 'fill-extrusion-opacity', 0.7 * s.alpha);
    } else {
      removeLayer(map, extrudeId);
    }

    if (layer.traceOutline) {
      removeLayer(map, lineId);
      ensureSource(map, `${src}-trace-src`, EMPTY);
      wanted.add(`${src}-trace-src`);
      const traced: GeoJSON.Feature[] = entry.outline.map((ring) => ({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: sliceAt(measure(ring), s.trace) },
      }));
      (map.getSource(`${src}-trace-src`) as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: traced.filter((f) => (f.geometry as GeoJSON.LineString).coordinates.length > 1),
      });
      ensureLayer(map, { id: traceId, type: 'line', source: `${src}-trace-src`, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {} });
      setPaint(map, traceId, 'line-color', layer.lineColor);
      setPaint(map, traceId, 'line-width', layer.lineWidth);
      setPaint(map, traceId, 'line-opacity', s.alpha);
    } else {
      removeLayer(map, traceId);
      ensureLayer(map, { id: lineId, type: 'line', source: src, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {} });
      setPaint(map, lineId, 'line-color', layer.lineColor);
      setPaint(map, lineId, 'line-width', layer.lineWidth);
      setPaint(map, lineId, 'line-opacity', s.alpha);
    }
  }

  for (const r of scene.regions) {
    const { layer, set } = r;
    if (!set.regions.length) continue;
    const src = `gm-regions-${layer.id}`;
    const traceSrc = `${src}-active`;
    wanted.add(src);
    wanted.add(traceSrc);

    ensureSource(map, src, set.data);
    // Colours are baked into the features, so this only runs when the data,
    // values or ramp actually change — not every frame.
    const dataKey = `${src}!data`;
    const stamp = set.data.features.length + ':' + (set.regions[0]?.fill ?? '') + ':' + set.domain.join(',');
    if (paintCache.get(dataKey) !== stamp) {
      paintCache.set(dataKey, stamp);
      (map.getSource(src) as GeoJSONSource | undefined)?.setData(set.data);
    }

    const fillId = `${src}-fill`;
    const lineId = `${src}-line`;
    const activeId = `${src}-active-line`;

    ensureLayer(map, { id: fillId, type: 'fill', source: src, paint: {} });
    setPaint(map, fillId, 'fill-color', ['get', '_fill']);
    // The active region's fill ramps in behind its border trace; everything else
    // holds at the dimmed level.
    setPaint(map, fillId, 'fill-opacity', [
      'case',
      ['boolean', ['feature-state', 'active'], false],
      layer.fillOpacity * r.alpha * (1 - r.dim + r.dim * r.fillIn),
      layer.fillOpacity * r.alpha * (1 - r.dim),
    ]);

    // Borders only appear once the intro has drawn them on.
    const bordersIn = r.introTrace >= 1;
    const casingId = `${src}-line-casing`;
    if (layer.borderCasing) {
      ensureLayer(map, { id: casingId, type: 'line', source: src, layout: { 'line-join': 'round' }, paint: {} });
      setPaint(map, casingId, 'line-color', 'rgba(0,0,0,0.55)');
      setPaint(map, casingId, 'line-width', layer.borderWidth + 1.6);
      setPaint(map, casingId, 'line-opacity', bordersIn ? 0.85 * r.alpha : 0);
    } else {
      removeLayer(map, casingId);
    }

    ensureLayer(map, { id: lineId, type: 'line', source: src, layout: { 'line-join': 'round' }, paint: {} });
    setPaint(map, lineId, 'line-color', layer.borderColor);
    setPaint(map, lineId, 'line-width', layer.borderWidth);
    setPaint(map, lineId, 'line-opacity', bordersIn ? 0.85 * r.alpha : 0);

    // Intro: every border draws itself on at once.
    const introId = `${src}-intro-line`;
    const introSrc = `${src}-intro`;
    if (r.phase === 'intro' && layer.introTrace && r.introTrace > 0 && r.introTrace < 1) {
      wanted.add(introSrc);
      ensureSource(map, introSrc, EMPTY);
      (map.getSource(introSrc) as GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: set.regions.flatMap((region) =>
          region.rings
            .map((ring) => ({
              type: 'Feature' as const,
              properties: {},
              geometry: { type: 'LineString' as const, coordinates: sliceAt(measuredRing(ring), r.introTrace) },
            }))
            .filter((f) => f.geometry.coordinates.length > 1),
        ),
      });
      ensureLayer(map, {
        id: introId,
        type: 'line',
        source: introSrc,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {},
      });
      setPaint(map, introId, 'line-color', layer.highlightColor);
      setPaint(map, introId, 'line-width', Math.max(layer.borderWidth, layer.highlightWidth * 0.55));
      setPaint(map, introId, 'line-opacity', r.alpha);
    } else {
      removeLayer(map, introId);
    }

    // Only the active region changes state, so touch just the two that moved.
    const prevKey = `${src}!active`;
    const prevActive = paintCache.get(prevKey) as number | undefined;
    if (prevActive !== r.activeId) {
      if (prevActive) map.setFeatureState({ source: src, id: prevActive }, { active: false });
      if (r.activeId) map.setFeatureState({ source: src, id: r.activeId }, { active: true });
      paintCache.set(prevKey, r.activeId ?? undefined);
    }

    ensureSource(map, traceSrc, EMPTY);
    const active = r.activeId ? set.regions.find((x) => x.id === r.activeId) : undefined;
    const traced: GeoJSON.Feature[] =
      active && r.alpha > 0
        ? active.rings
            .map((ring) => ({
              type: 'Feature' as const,
              properties: {},
              geometry: { type: 'LineString' as const, coordinates: sliceAt(measuredRing(ring), r.trace) },
            }))
            .filter((f) => f.geometry.coordinates.length > 1)
        : [];
    (map.getSource(traceSrc) as GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: traced,
    });

    const glowId = `${src}-active-glow`;
    if (r.glow > 0.01) {
      ensureLayer(map, {
        id: glowId,
        type: 'line',
        source: traceSrc,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {},
      });
      setPaint(map, glowId, 'line-color', layer.highlightColor);
      setPaint(map, glowId, 'line-width', layer.highlightWidth * 4);
      setPaint(map, glowId, 'line-blur', layer.highlightWidth * 3);
      setPaint(map, glowId, 'line-opacity', 0.55 * r.glow * r.alpha);
    } else {
      removeLayer(map, glowId);
    }

    ensureLayer(map, {
      id: activeId,
      type: 'line',
      source: traceSrc,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {},
    });
    setPaint(map, activeId, 'line-color', layer.highlightColor);
    setPaint(map, activeId, 'line-width', layer.highlightWidth);
    setPaint(map, activeId, 'line-opacity', r.alpha);
    setPaint(map, activeId, 'line-blur', 0.4);
  }

  for (const r of scene.routes) {
    const { layer } = r;
    const src = `gm-route-${layer.id}`;
    wanted.add(src);
    ensureSource(map, src, EMPTY);
    (map.getSource(src) as GeoJSONSource | undefined)?.setData(lineFeature(r.drawn));

    const glowId = `${src}-glow`;
    const lineId = `${src}-line`;

    if (layer.glow) {
      ensureLayer(map, { id: glowId, type: 'line', source: src, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {} });
      setPaint(map, glowId, 'line-color', layer.color);
      setPaint(map, glowId, 'line-width', layer.width * 3.2);
      setPaint(map, glowId, 'line-blur', layer.width * 2.4);
      setPaint(map, glowId, 'line-opacity', 0.4 * r.alpha * layer.opacity);
    } else {
      removeLayer(map, glowId);
    }

    ensureLayer(map, { id: lineId, type: 'line', source: src, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {} });
    setPaint(map, lineId, 'line-color', layer.color);
    setPaint(map, lineId, 'line-width', layer.width);
    setPaint(map, lineId, 'line-opacity', r.alpha * layer.opacity);
    setLayout(map, lineId, 'line-dasharray', layer.dashed ? [2, 1.6] : undefined);
  }

  // Drop anything belonging to layers that no longer exist.
  for (const source of Object.keys(map.getStyle()?.sources ?? {})) {
    if (!source.startsWith('gm-')) continue;
    if (wanted.has(source)) continue;
    for (const suffix of ['-fill', '-line', '-line-casing', '-trace', '-3d', '-glow', '-active-line', '-active-glow', '-intro-line']) removeLayer(map, source + suffix);
    if (map.getSource(source)) {
      try {
        map.removeSource(source);
      } catch {
        /* still referenced this tick — it'll go next frame */
      }
    }
  }
}

function ensureSource(map: MLMap, id: string, data: GeoJSON.FeatureCollection) {
  if (map.getSource(id)) return;
  map.addSource(id, { type: 'geojson', data });
}

function ensureLayer(map: MLMap, spec: LayerSpecification & { source: string }) {
  if (map.getLayer(spec.id)) return;
  map.addLayer(spec as LayerSpecification);
}

function removeLayer(map: MLMap, id: string) {
  if (map.getLayer(id)) map.removeLayer(id);
}
