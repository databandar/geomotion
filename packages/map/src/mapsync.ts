import type { Map as MLMap, GeoJSONSource, LayerSpecification } from 'maplibre-gl';
import type { LngLat } from '@geomotion/core';
import type { ShapeStyle, Scene } from '@geomotion/renderer';
import { measure, sliceAt, type MeasuredPath } from '@geomotion/geometry';
import { outlineOf, parseGeoJSON } from './geojson.ts';

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

/**
 * Base dash patterns, in multiples of line width — `line-dasharray` units, not px.
 *
 * `dotted`'s "on" length has to clear `DASH_PHASE_STEPS`' own step size (cycle /
 * steps) with real margin, or `animateDash` quantizing the phase can land on a
 * step where almost all of that frame's dot has already been consumed and what's
 * left rounds away to nothing — found rendering it animated at 0.1 (a fifth of a
 * 1.6-unit cycle's 24 steps, ~0.067 each): it looked completely solid, no visible
 * dots at all, on a route this session shipped with exactly that combination.
 * 0.3 stays a dot rather than reading as a dash, and survives every step.
 */
const DASH_PATTERNS: Record<'dashed' | 'dotted' | 'longdash', number[]> = {
  dashed: [2, 1.6],
  dotted: [0.3, 1.5],
  longdash: [4, 1.8],
};

/** How many distinct phase positions `dashArrayFor` cycles through per pattern
 * repeat. See the function's own comment for why this exists at all. */
const DASH_PHASE_STEPS = 24;

/**
 * The dasharray for a line style, optionally animated.
 *
 * `line-dasharray` has no phase/offset property of its own — the only way to make a
 * dash pattern crawl is to hand MapLibre a *different array* each frame, one whose
 * first entry is the previous first entry shortened by however far the pattern has
 * travelled.
 *
 * The phase is quantised to `DASH_PHASE_STEPS` positions per cycle rather than
 * computed as a true continuous value. A first version did exactly that — a fresh
 * float-precision offset every frame, meaning a genuinely unique array on every
 * single call — and it rendered correctly for a handful of frames but reliably
 * crashed MapLibre's internal dash renderer (`setConstantDashPositions`, reading
 * `.y` off `null`) after roughly 30+ seconds of continuous playback on the same
 * layer: found rendering a real episode (`docs/brand/hormuz`) whose main route
 * animates for the video's full length, not in any unit test, because nothing
 * before this exercised the same layer's dasharray changing every frame for that
 * long. MapLibre's dash rendering rasterises each unique pattern into a bounded
 * atlas; an unbounded stream of never-repeated arrays is not a supported input,
 * confirmed by the fix — capping the phase to a small reused set stopped the
 * crash outright over the same 60+ second sequential render that reproduced it
 * every time beforehand. 24 steps is smooth at any frame rate this renders at
 * (a full cycle takes ~1.7s, so a step is ~70ms) and keeps the atlas bounded.
 */
function dashArrayFor(style: 'solid' | 'dashed' | 'dotted' | 'longdash' | 'rail', animate: boolean | undefined, time: number): number[] | undefined {
  if (style === 'solid' || style === 'rail') return undefined;
  const base = DASH_PATTERNS[style];
  if (!animate) return base;

  const cycle = base.reduce((a, b) => a + b, 0);
  const speed = cycle * 0.6; // one full pattern cycle every ~1.7s
  const raw = ((time * speed) % cycle + cycle) % cycle;
  let offset = (Math.round((raw / cycle) * DASH_PHASE_STEPS) / DASH_PHASE_STEPS) * cycle;
  if (offset >= cycle) offset -= cycle; // the round can land exactly on the next cycle's 0

  // Enough repeats that consuming `offset` (< one cycle) never runs off the end.
  const repeated = [...base, ...base, ...base];
  let i = 0;
  while (offset >= repeated[i]!) {
    offset -= repeated[i]!;
    i++;
  }
  return [repeated[i]! - offset, ...repeated.slice(i + 1)];
}

/** The last `fraction` of a path's length, in original point order — used for the
 * comet tail, which needs the stretch just behind the head, not just ahead of it. */
function tailOf(coords: LngLat[], fraction: number): LngLat[] {
  if (coords.length < 2) return coords;
  const reversed = measure([...coords].reverse());
  return sliceAt(reversed, fraction).slice().reverse();
}

/**
 * What each map has already been told, so a still frame re-sends nothing.
 *
 * Keyed by the map itself rather than held in one module-level Map. The cache mirrors
 * *that map's* GL state, so a second map — a preview thumbnail, a comparison view, a
 * test running two in one process — would read the first one's answers and skip
 * properties it had never actually set. Nothing does that today, which is exactly the
 * kind of "safe because of something nothing states" that produced the dasharray bug
 * two milestones ago.
 *
 * Weak, so a discarded map takes its cache with it.
 */
const paintCaches = new WeakMap<MLMap, Map<string, unknown>>();

function cacheFor(map: MLMap): Map<string, unknown> {
  let c = paintCaches.get(map);
  if (!c) {
    c = new Map();
    paintCaches.set(map, c);
  }
  return c;
}

/** Arrays/objects compare by value so we don't re-set line-dasharray every frame. */
const cacheKeyOf = (v: unknown) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v);

function setPaint(map: MLMap, layerId: string, prop: string, value: unknown) {
  const cache = cacheFor(map);
  const key = layerId + '|' + prop;
  const next = cacheKeyOf(value);
  /*
   * `has` before `get`, because `undefined` is a real value here — it is how a paint
   * property is cleared back to its default, and `line-dasharray` is set to it on every
   * undashed line. A plain `get(key) === next` cannot tell "never set" from "set to
   * undefined", so the first attempt to clear a property was skipped.
   */
  if (cache.has(key) && cache.get(key) === next) return;
  cache.set(key, next);
  map.setPaintProperty(layerId, prop, value as never);
}

/**
 * Forget what a map has been told.
 *
 * Called when the style reloads, which destroys every layer we added — so the cache
 * must go with them or it will claim properties are set on layers that no longer exist.
 */
export function resetSyncCache(map?: MLMap) {
  if (map) paintCaches.delete(map);
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

function parseShape(style: ShapeStyle): ShapeCacheEntry {
  const hit = shapeCache.get(style.id);
  if (hit && hit.raw === style.geojson) return hit;

  const data = parseGeoJSON(style.geojson);
  const entry = { raw: style.geojson, data, outline: outlineOf(data) };
  shapeCache.set(style.id, entry);
  return entry;
}

/* ------------------------------------------------------------------ sync */

export function syncScene(map: MLMap, scene: Scene) {
  if (!map.isStyleLoaded()) return;

  const cache = cacheFor(map);

  const wanted = new Set<string>();

  for (const s of scene.shapes) {
    const { style } = s;
    const src = `gm-shape-${style.id}`;
    const entry = parseShape(style);
    wanted.add(src);

    ensureSource(map, src, entry.data);
    (map.getSource(src) as GeoJSONSource | undefined)?.setData(entry.data);

    const fillId = `${src}-fill`;
    const lineId = `${src}-line`;
    const traceId = `${src}-trace`;
    const extrudeId = `${src}-3d`;

    ensureLayer(map, { id: fillId, type: 'fill', source: src, paint: { 'fill-color': style.fillColor } });
    setPaint(map, fillId, 'fill-color', style.fillColor);
    setPaint(map, fillId, 'fill-opacity', style.fillOpacity * s.alpha);

    if (style.extrude) {
      ensureLayer(map, { id: extrudeId, type: 'fill-extrusion', source: src, paint: {} });
      setPaint(map, extrudeId, 'fill-extrusion-color', style.fillColor);
      setPaint(map, extrudeId, 'fill-extrusion-height', style.extrudeHeight);
      setPaint(map, extrudeId, 'fill-extrusion-opacity', 0.7 * s.alpha);
    } else {
      removeLayer(map, extrudeId);
    }

    if (style.traceOutline) {
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
      setPaint(map, traceId, 'line-color', style.lineColor);
      setPaint(map, traceId, 'line-width', style.lineWidth);
      setPaint(map, traceId, 'line-opacity', s.alpha);
    } else {
      removeLayer(map, traceId);
      ensureLayer(map, { id: lineId, type: 'line', source: src, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {} });
      setPaint(map, lineId, 'line-color', style.lineColor);
      setPaint(map, lineId, 'line-width', style.lineWidth);
      setPaint(map, lineId, 'line-opacity', s.alpha);
    }
  }

  for (const r of scene.regions) {
    const { style, set } = r;
    if (!set.regions.length) continue;
    const src = `gm-regions-${style.id}`;
    const traceSrc = `${src}-active`;
    wanted.add(src);
    wanted.add(traceSrc);

    ensureSource(map, src, set.data);
    // Colours are baked into the features, so this only runs when the data,
    // values or ramp actually change — not every frame.
    const dataKey = `${src}!data`;
    const stamp = set.data.features.length + ':' + (set.regions[0]?.fill ?? '') + ':' + set.domain.join(',');
    if (cache.get(dataKey) !== stamp) {
      cache.set(dataKey, stamp);
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
      style.fillOpacity * r.alpha * (1 - r.dim + r.dim * r.fillIn),
      style.fillOpacity * r.alpha * (1 - r.dim),
    ]);

    // Borders only appear once the intro has drawn them on.
    const bordersIn = r.introTrace >= 1;
    const casingId = `${src}-line-casing`;
    if (style.borderCasing) {
      ensureLayer(map, { id: casingId, type: 'line', source: src, layout: { 'line-join': 'round' }, paint: {} }, lineId);
      setPaint(map, casingId, 'line-color', 'rgba(0,0,0,0.55)');
      setPaint(map, casingId, 'line-width', style.borderWidth + 1.6);
      setPaint(map, casingId, 'line-opacity', bordersIn ? 0.85 * r.alpha : 0);
    } else {
      removeLayer(map, casingId);
    }

    ensureLayer(map, { id: lineId, type: 'line', source: src, layout: { 'line-join': 'round' }, paint: {} });
    setPaint(map, lineId, 'line-color', style.borderColor);
    setPaint(map, lineId, 'line-width', style.borderWidth);
    setPaint(map, lineId, 'line-opacity', bordersIn ? 0.85 * r.alpha : 0);

    // Intro: every border draws itself on at once.
    const introId = `${src}-intro-line`;
    const introSrc = `${src}-intro`;
    if (r.phase === 'intro' && style.tour.introTrace && r.introTrace > 0 && r.introTrace < 1) {
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
      setPaint(map, introId, 'line-color', style.highlightColor);
      setPaint(map, introId, 'line-width', Math.max(style.borderWidth, style.highlightWidth * 0.55));
      setPaint(map, introId, 'line-opacity', r.alpha);
    } else {
      removeLayer(map, introId);
    }

    // Only the active region changes state, so touch just the two that moved.
    const prevKey = `${src}!active`;
    const prevActive = cache.get(prevKey) as number | undefined;
    if (prevActive !== r.activeId) {
      if (prevActive) map.setFeatureState({ source: src, id: prevActive }, { active: false });
      if (r.activeId) map.setFeatureState({ source: src, id: r.activeId }, { active: true });
      cache.set(prevKey, r.activeId ?? undefined);
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
      ensureLayer(
        map,
        {
          id: glowId,
          type: 'line',
          source: traceSrc,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {},
        },
        activeId,
      );
      setPaint(map, glowId, 'line-color', style.highlightColor);
      setPaint(map, glowId, 'line-width', style.highlightWidth * 4);
      setPaint(map, glowId, 'line-blur', style.highlightWidth * 3);
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
    setPaint(map, activeId, 'line-color', style.highlightColor);
    setPaint(map, activeId, 'line-width', style.highlightWidth);
    setPaint(map, activeId, 'line-opacity', r.alpha);
    setPaint(map, activeId, 'line-blur', 0.4);
  }

  for (const r of scene.routes) {
    const { style } = r;
    const src = `gm-route-${style.id}`;
    wanted.add(src);
    ensureSource(map, src, EMPTY);
    (map.getSource(src) as GeoJSONSource | undefined)?.setData(lineFeature(r.drawn));

    const lineStyle = style.lineStyle ?? (style.dashed ? 'dashed' : 'solid');
    const isRail = lineStyle === 'rail';
    const dash = dashArrayFor(lineStyle, style.animateDash, scene.time);

    const glowId = `${src}-glow`;
    const lineId = `${src}-line`;
    const railAId = `${src}-rail-a`;
    const railBId = `${src}-rail-b`;
    const cometSrc = `${src}-comet-src`;
    const cometId = `${cometSrc}-line`;

    if (style.glow && !isRail) {
      ensureLayer(map, { id: glowId, type: 'line', source: src, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {} }, lineId);
      setPaint(map, glowId, 'line-color', style.color);
      setPaint(map, glowId, 'line-width', style.width * 3.2);
      setPaint(map, glowId, 'line-blur', style.width * 2.4);
      setPaint(map, glowId, 'line-opacity', 0.4 * r.alpha * style.opacity);
    } else {
      removeLayer(map, glowId);
    }

    if (isRail) {
      // Two parallel offset lines with tick-mark dashing — a railway/shipping-lane
      // mark, not a route someone walked. `line-offset` is perpendicular, in px,
      // so it tracks `width` the same way the glow's own width multiple does.
      removeLayer(map, lineId);
      for (const [id, sign] of [[railAId, 1], [railBId, -1]] as const) {
        ensureLayer(map, { id, type: 'line', source: src, layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: {} });
        setPaint(map, id, 'line-color', style.color);
        setPaint(map, id, 'line-width', Math.max(1, style.width * 0.55));
        setPaint(map, id, 'line-offset', sign * style.width * 1.15);
        setPaint(map, id, 'line-opacity', r.alpha * style.opacity);
        setPaint(map, id, 'line-dasharray', dashArrayFor('longdash', style.animateDash, scene.time));
      }
    } else {
      removeLayer(map, railAId);
      removeLayer(map, railBId);
      ensureLayer(map, { id: lineId, type: 'line', source: src, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {} });
      setPaint(map, lineId, 'line-color', style.color);
      setPaint(map, lineId, 'line-width', style.width);
      setPaint(map, lineId, 'line-opacity', r.alpha * style.opacity);
      // `line-dasharray` is a *paint* property; MapLibre throws if it arrives through
      // setLayoutProperty. This went unnoticed because the cache used to skip the very
      // first `undefined`, so an undashed route never made the call — and a dashed one
      // threw inside the render loop every time.
      setPaint(map, lineId, 'line-dasharray', dash);
    }

    /*
     * Comet tail: a short, brighter, wider re-draw of just the last stretch before
     * the head — not a `line-gradient` (which needs `lineMetrics` on the source and
     * fights `line-dasharray` on some GL implementations). A second short line on
     * top of the first is simpler and composes with every other style here.
     */
    if (style.cometTail && r.drawn.length >= 2) {
      wanted.add(cometSrc);
      ensureSource(map, cometSrc, EMPTY);
      (map.getSource(cometSrc) as GeoJSONSource | undefined)?.setData(lineFeature(tailOf(r.drawn, 0.18)));
      ensureLayer(map, { id: cometId, type: 'line', source: cometSrc, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {} });
      setPaint(map, cometId, 'line-color', style.color);
      setPaint(map, cometId, 'line-width', style.width * (isRail ? 0.9 : 1.6));
      setPaint(map, cometId, 'line-blur', style.width * 0.5);
      setPaint(map, cometId, 'line-opacity', r.alpha * style.opacity);
    } else {
      removeLayer(map, cometId);
    }
  }

  // Drop anything belonging to layers that no longer exist.
  for (const source of Object.keys(map.getStyle()?.sources ?? {})) {
    if (!source.startsWith('gm-')) continue;
    if (wanted.has(source)) continue;
    for (const suffix of ['-fill', '-line', '-line-casing', '-trace', '-3d', '-glow', '-active-line', '-active-glow', '-intro-line', '-rail-a', '-rail-b']) removeLayer(map, source + suffix);
    if (map.getSource(source)) {
      try {
        map.removeSource(source);
      } catch {
        /* still referenced this tick — it'll go next frame */
      }
    }
  }
}

function ensureSource(map: MLMap, id: string, data: GeoJSON.FeatureCollection, opts?: { lineMetrics?: boolean }) {
  if (map.getSource(id)) return;
  map.addSource(id, { type: 'geojson', data, ...(opts?.lineMetrics ? { lineMetrics: true } : {}) });
}

/**
 * Add a layer once, optionally *beneath* an existing one.
 *
 * `addLayer` with no anchor appends to the top of the style, which is only correct for
 * a layer created before its neighbours. Every glow and casing here is conditional, so
 * the first time one is switched on its partner already exists and it lands on top —
 * a blurred halo three times the width of the line, drawn over the line.
 *
 * Measured on the route glow: built with it on the order is `[glow, line]`, but
 * switched on afterwards it is `[line, glow]`. So a project rendered one way when
 * opened and another way when the toggle was flipped, and the editor disagreed with the
 * export, which always builds its layers fresh. The region casing and the tour's
 * highlight glow are the same construct and take the same anchor; neither was observed
 * misordered, because the shipped fixtures do not switch them on mid-session.
 *
 * `beneath` is only honoured once that layer exists; MapLibre throws on an unknown
 * anchor, and on the first pass the partner has not been created yet — in which case
 * appending is already the right answer.
 */
function ensureLayer(map: MLMap, spec: LayerSpecification & { source: string }, beneath?: string) {
  if (map.getLayer(spec.id)) return;
  if (beneath && map.getLayer(beneath)) map.addLayer(spec as LayerSpecification, beneath);
  else map.addLayer(spec as LayerSpecification);
}

function removeLayer(map: MLMap, id: string) {
  if (map.getLayer(id)) map.removeLayer(id);
}
