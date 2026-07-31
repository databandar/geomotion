import type {
  CameraState,
  CloudsRender,
  ImageRender,
  MarkerRender,
  RegionPhase,
  RegionsRender,
  RouteRender,
  Scene,
  ShapeRender,
  TextRender,
} from '@geomotion/renderer';
import type { CameraKeyframe, LngLat, Project, RegionsLayer, RouteLayer, Track } from '@geomotion/document';
import { clamp01, invLerp, lerp, lerpAngle, lerpLngLat } from '@geomotion/core';
import { ease, evalTrack, trackSegment } from '@geomotion/animation';
import type { EasingName } from '@geomotion/document';
import { buildPath, headingAt, measure, pointAt, sliceAt, type MeasuredPath } from '@geomotion/geometry';
import { fitBounds, regionAtStop, regionSet, type RegionSet } from '@geomotion/entities';
import { getBasemap } from '@geomotion/map';

const DEFAULT_CAMERA: CameraState = {
  center: [0, 20],
  zoom: 1.6,
  bearing: 0,
  pitch: 0,
};

/**
 * The evaluator produces the renderer's types; re-exported so the rest of the app can
 * name a scene without reaching past this module.
 */
export type { CameraState, Scene } from '@geomotion/renderer';

/* ------------------------------------------------------------------ camera */

/**
 * The camera as four property tracks.
 *
 * Camera keyframes are stored as whole-camera rows — one keyframe carries centre, zoom,
 * bearing and pitch together. §04 wants per-channel tracks, and this is the seam: the
 * rows are projected into four tracks and every channel resolves through `evalTrack`,
 * so the camera animates by the same rule as everything else will. The document shape
 * changes in a later milestone; this proves the evaluation first.
 *
 * Each channel brings its own interpolator, which is the whole reason `evalTrack` takes
 * one: longitude wraps at the antimeridian, bearing takes the short way round the
 * compass, zoom and pitch are ordinary numbers.
 */
interface CameraTracks {
  keys: CameraKeyframe[];
  center: Track<LngLat>;
  zoom: Track<number>;
  bearing: Track<number>;
  pitch: Track<number>;
}

/*
 * Built once per keyframe array rather than per frame.
 *
 * The array's identity changes whenever the camera is edited — transactions produce a
 * new one — so a weak key is exactly right: the tracks live as long as the edit they
 * describe and go with it. This also removes a sort that used to run on every frame.
 */
const cameraTrackCache = new WeakMap<readonly CameraKeyframe[], CameraTracks>();

function cameraTracks(camera: readonly CameraKeyframe[]): CameraTracks {
  const hit = cameraTrackCache.get(camera);
  if (hit) return hit;

  const keys = [...camera].sort((a, b) => a.t - b.t);
  const channel = <T>(of: (k: CameraKeyframe) => T): Track<T> => ({
    kind: 'keyframed',
    keys: keys.map((k) => ({ id: k.id, t: k.t, value: of(k), easing: k.easing })),
  });

  const built: CameraTracks = {
    keys,
    // Copied, so nothing downstream can reach through the scene into the document and
    // mutate a keyframe's coordinate in place.
    center: channel((k) => [k.center[0], k.center[1]] as LngLat),
    zoom: channel((k) => k.zoom),
    bearing: channel((k) => k.bearing),
    pitch: channel((k) => k.pitch),
  };
  cameraTrackCache.set(camera, built);
  return built;
}

export function cameraAt(project: Project, time: number): CameraState {
  const tracks = cameraTracks(project.camera);
  if (tracks.keys.length === 0) return DEFAULT_CAMERA;

  /*
   * `dip` pulls the camera back mid-move and settles it again — the cinematic arc. It is
   * not an authored value at any keyframe, it is a modifier over the segment, and it
   * peaks at the middle in raw time regardless of the easing. That makes it the first
   * real behaviour in §06's sense, and it is written here rather than in a track until
   * the behaviour stack exists to hold it.
   */
  const seg = trackSegment(tracks.zoom, time);
  const dip = seg ? (tracks.keys[seg.index]?.dip ?? 0) * Math.sin(Math.PI * seg.u) : 0;

  const center = evalTrack(tracks.center, time, lerpLngLat, DEFAULT_CAMERA.center);
  return {
    // Copied on the way out: a caller that mutated this would be writing into the cache.
    center: [center[0], center[1]],
    zoom: Math.max(0, evalTrack(tracks.zoom, time) - dip),
    bearing: evalTrack(tracks.bearing, time, lerpAngle),
    pitch: evalTrack(tracks.pitch, time),
  };
}


/* -------------------------------------------------------------- path cache */

interface CacheEntry {
  sig: string;
  path: MeasuredPath;
}
const pathCache = new Map<string, CacheEntry>();

export function routePath(layer: RouteLayer): MeasuredPath {
  const sig = layer.curve + '|' + layer.coords.map((c) => c[0].toFixed(6) + ',' + c[1].toFixed(6)).join(';');
  const hit = pathCache.get(layer.id);
  if (hit && hit.sig === sig) return hit.path;
  const path = measure(buildPath(layer.coords, layer.curve));
  pathCache.set(layer.id, { sig, path });
  return path;
}

export function clearPathCache(id?: string) {
  if (id) pathCache.delete(id);
  else pathCache.clear();
}

/* --------------------------------------------------------------- lifecycle */

/** 0 when fully hidden, 1 when fully on — includes the fade ramps. */
export function layerAlpha(l: { in: number; out: number; fade: number; visible: boolean }, t: number): number {
  if (!l.visible) return 0;
  if (t < l.in || t > l.out) return 0;
  const f = Math.max(0, l.fade);
  if (f <= 0) return 1;
  const rampIn = clamp01((t - l.in) / f);
  const rampOut = clamp01((l.out - t) / f);
  return Math.min(rampIn, rampOut);
}

/* --------------------------------------------------------- region tours */

/**
 * The reveal is a sequence, not a state change: the border draws itself, the
 * fill follows it in, a glow peaks as the fill lands, and only then does the
 * number start counting. Each element arriving separately is what reads as
 * deliberate rather than as a value simply appearing.
 */
const TRACE_TIME = 0.6;
const FILL_DELAY = 0.28;
const FILL_TIME = 0.5;
const COUNT_DELAY = 0.42;
const COUNT_TIME = 0.85;
const GLOW_TIME = 0.75;

/** Where the camera sits for a given stop on the tour (-1 = the opening overview). */
function tourCamera(layer: RegionsLayer, set: RegionSet, project: Project, stop: number): CameraState {
  const region = stop < 0 ? undefined : regionAtStop(set, stop);
  if (!region) {
    // The opening overview, and the fallback if a stop no longer resolves to a
    // region — framing the whole area is always a defensible shot.
    // Half the per-region pad: the overview is meant to fill the frame.
    return fitBounds(set.bounds, project.width, project.height, Math.max(0.06, layer.tour.padding * 0.5), 0);
  }
  return fitBounds(region.bounds, project.width, project.height, layer.tour.padding, layer.tour.pitch, layer.tour.maxZoom);
}

/**
 * `bow` pushes the midpoint of the path sideways, so the camera swings between
 * two states instead of tracking along the straight line between them. Small
 * values only — this is a flourish, and at high bow it reads as a mistake.
 */
function blendCamera(a: CameraState, b: CameraState, e: number, bow = 0): CameraState {
  const lngA = a.center[0];
  let lngB = b.center[0];
  while (lngB - lngA > 180) lngB -= 360;
  while (lngB - lngA < -180) lngB += 360;

  let lng = lerp(lngA, lngB, e);
  let lat = lerp(a.center[1], b.center[1], e);

  if (bow !== 0) {
    const dx = lngB - lngA;
    const dy = b.center[1] - a.center[1];
    const len = Math.hypot(dx, dy);
    if (len > 1e-6) {
      // Perpendicular offset, peaking at the midpoint.
      const k = Math.sin(Math.PI * e) * bow * len * 0.25;
      lng += (-dy / len) * k;
      lat += (dx / len) * k;
    }
  }

  return {
    center: [lng, lat],
    zoom: lerp(a.zoom, b.zoom, e),
    bearing: lerpAngle(a.bearing, b.bearing, e),
    pitch: lerp(a.pitch, b.pitch, e),
  };
}

/**
 * A tour runs in three beats: an opening overview, the per-region visits, and a
 * closing overview where the whole picture is on screen at once.
 */
export function tourPhases(layer: RegionsLayer, stops: number) {
  const dwell = Math.max(0.2, layer.tour.dwell);
  const intro = Math.max(0, layer.tour.intro);
  const outro = Math.max(0, layer.tour.outro);
  const tourStart = layer.in + intro;

  // Per-stop times let a narrated tour give each region exactly as long as its
  // line takes; falling back to a uniform dwell keeps hand-built tours simple.
  const holds: number[] = [];
  for (let i = 0; i < stops; i++) {
    const d = layer.tour.stopDurations?.[i];
    holds.push(typeof d === 'number' && d > 0.05 ? d : dwell);
  }
  const offsets: number[] = [0];
  {
    let acc = 0;
    for (const h of holds) offsets.push((acc += h));
  }

  const tourEnd = tourStart + (offsets[stops] ?? 0);
  return { dwell, intro, outro, tourStart, tourEnd, holds, offsets, end: tourEnd + outro };
}

/** Which stop is on screen at `local` seconds into the tour, and how far into it. */
function stopAt(offsets: number[], holds: number[], local: number) {
  const stops = holds.length;
  if (stops === 0) return { index: -1, local: 0, hold: 0 };
  let i = 0;
  while (i < stops - 1 && local >= (offsets[i + 1] ?? Infinity)) i++;
  return { index: i, local: local - (offsets[i] ?? 0), hold: holds[i] ?? 0 };
}

function evaluateRegions(layer: RegionsLayer, project: Project, time: number, alpha: number) {
  const dark = getBasemap(project.basemap).dark;
  const set = regionSet(layer, dark);
  const stops = set.order.length;
  const { intro, outro, tourStart, tourEnd, holds, offsets } = tourPhases(layer, stops);
  const touring = layer.tour.enabled && stops > 0;

  let phase: RegionPhase = 'tour';
  let activeIndex = -1;
  let local = 0;
  let hold = Math.max(0.2, layer.tour.dwell);

  if (!touring || time < tourStart) {
    phase = 'intro';
  } else if (time >= tourEnd && outro > 0) {
    phase = 'outro';
  } else {
    const at = stopAt(offsets, holds, time - tourStart);
    activeIndex = at.index;
    local = at.local;
    hold = at.hold;
  }

  // A stop shorter than the fly-in would never settle, so cap the move.
  const move = Math.max(0, Math.min(layer.tour.moveTime, hold * 0.6));
  const settled = Math.max(0, local - move);
  const render: RegionsRender = {
    style: layer,
    set,
    alpha,
    phase,
    activeIndex,
    activeId: activeIndex >= 0 ? (regionAtStop(set, activeIndex)?.id ?? null) : null,
    trace: layer.traceBorder ? ease('easeInOutCubic', settled / TRACE_TIME) : activeIndex >= 0 ? 1 : 0,
    fillIn:
      activeIndex < 0
        ? 1
        : layer.tour.sequenceReveal
          ? ease('easeOut', (settled - FILL_DELAY) / FILL_TIME)
          : 1,
    // Rises with the fill, then decays — a flash, not a permanent halo.
    glow:
      activeIndex < 0 || !layer.tour.sequenceReveal
        ? 0
        : Math.sin(Math.PI * clamp01((settled - FILL_DELAY) / GLOW_TIME)),
    // With the trace switched off the borders are simply present from frame one —
    // a cold open has nothing to draw on.
    introTrace:
      phase === 'intro' && layer.tour.introTrace
        ? ease('easeInOutCubic', clamp01((time - layer.in) / Math.max(0.2, intro * 0.75)))
        : 1,
    outroProgress:
      phase === 'outro'
        ? clamp01((time - (layer.tour.labelAt >= 0 ? layer.tour.labelAt : tourEnd)) / Math.max(0.2, outro * 0.4))
        : 0,
    reveal: layer.tour.countUp ? ease('easeOut', (settled - COUNT_DELAY) / COUNT_TIME) : 1,
    calloutAlpha: activeIndex >= 0 ? clamp01((settled - 0.18) / 0.3) : 0,
    pop: activeIndex >= 0 ? 0.86 + 0.14 * ease('easeOutBack', clamp01((settled - 0.18) / 0.42)) : 1,
    legendFill:
      phase === 'intro' ? ease('easeInOutCubic', clamp01((time - layer.in) / Math.max(0.3, intro * 0.5))) : 1,
    // In the overview beats every region is the subject, so nothing is dimmed.
    dim: phase === 'tour' ? layer.tour.dimOthers : 0,
    flip: layer.flipRamp ?? dark,
  };

  let camera: CameraState | null = null;
  if (layer.tour.driveCamera && stops > 0 && alpha > 0) {
    const overview = tourCamera(layer, set, project, -1);
    if (phase === 'intro' || phase === 'outro') {
      camera = overview;
    } else {
      const to = tourCamera(layer, set, project, activeIndex);
      const from = activeIndex === 0 ? overview : tourCamera(layer, set, project, activeIndex - 1);
      // easeOutBack overshoots and settles, which is what makes the move feel
      // like it has weight instead of braking to a stop.
      const curve: EasingName = layer.tour.overshoot ? 'easeOutBack' : 'easeInOutCubic';
      camera = move <= 0 ? to : blendCamera(from, to, ease(curve, clamp01(local / move)), layer.tour.bow);
    }
    // Ease back out to the overview rather than cutting to it.
    if (phase === 'outro' && stops > 0) {
      const last = tourCamera(layer, set, project, stops - 1);
      camera = blendCamera(last, overview, ease('easeInOutCubic', clamp01((time - tourEnd) / Math.max(0.2, Math.min(1.4, outro)))));
    }
  }

  return { render, camera };
}

/**
 * One layer's request to drive the camera for this frame.
 *
 * `kind` is not used to resolve the winner — it is here so a caller can say *why* the
 * camera moved, which is the question asked when a render surprises someone.
 */
export interface CameraClaim {
  layer: string;
  kind: 'follow' | 'tour';
  camera: CameraState;
}

/**
 * The topmost claimant wins.
 *
 * Layers are ordered back to front, so the last one to ask is the one nearest the
 * viewer — the same rule that decides what draws on top, which is the only ordering
 * the timeline actually shows. Blending two claims was rejected: averaging a route
 * follow with a region tour lands the camera somewhere neither behaviour asked for,
 * and there is no interpretation of that a user could have predicted.
 *
 * This matches what the code did before it was written down, so no render changes.
 * The point is that it is now a stated rule with a test, rather than a consequence of
 * two branches assigning to the same variable in loop order.
 */
export function resolveCamera(claims: readonly CameraClaim[]): CameraState | null {
  return claims.length ? claims[claims.length - 1]!.camera : null;
}

export function evaluate(project: Project, time: number): Scene {
  const routes: RouteRender[] = [];
  const markers: MarkerRender[] = [];
  const texts: TextRender[] = [];
  const shapes: ShapeRender[] = [];
  const regions: RegionsRender[] = [];
  const clouds: CloudsRender[] = [];
  const images: ImageRender[] = [];

  /*
   * Layers that want to drive the camera this frame, in layer order.
   *
   * Two behaviours can ask for it — a route's follow and a region tour's
   * `driveCamera` — and nothing stops a project from enabling both, or from having
   * two touring region layers. Collecting the claims and resolving them once states
   * the rule instead of leaving it to whichever branch assigned last: see
   * `resolveCamera`. A third claimant is then an entry here, not a fourth place that
   * quietly overwrites the same variable.
   */
  const claims: CameraClaim[] = [];

  for (const layer of project.layers) {
    const alpha = layerAlpha(layer, time);

    if (layer.type === 'route') {
      const path = routePath(layer);
      const raw = invLerp(layer.drawStart, layer.drawEnd, time);
      const progress = time < layer.drawStart ? 0 : time > layer.drawEnd ? 1 : ease(layer.drawEasing, raw);
      const drawn = alpha > 0 ? sliceAt(path, progress) : [];
      const head = path.coords.length >= 2 && progress > 0 ? pointAt(path, progress) : null;
      const heading = path.coords.length >= 2 ? headingAt(path, progress) : 0;
      routes.push({ style: layer, alpha, progress, drawn, head, heading });

      const following =
        layer.follow.enabled && layer.visible && time >= layer.drawStart && time <= layer.drawEnd && head;
      if (following) {
        claims.push({
          layer: layer.id,
          kind: 'follow',
          camera: {
            center: head as LngLat,
            zoom: layer.follow.zoom,
            pitch: layer.follow.pitch,
            bearing: layer.follow.faceHeading ? heading : cameraAt(project, time).bearing,
          },
        });
      }
    } else if (layer.type === 'marker') {
      const local = time - layer.in;
      const popT = layer.pop ? clamp01(local / 0.55) : 1;
      // Slight overshoot so markers land with a bit of weight.
      const scale = layer.pop ? overshoot(popT) : 1;
      /*
       * Tracks resolve here and nowhere downstream.
       *
       * §1.5 makes the evaluator the one place that turns a document plus a time into
       * plain data, so the renderer keeps receiving a number and never learns what a
       * track is. That is also what lets the renderer stay testable without a document,
       * and it is why `style` is now a built object rather than the layer passed through.
       */
      markers.push({
        style: { ...layer, size: evalTrack(layer.size, time) },
        alpha,
        scale,
        pulse: layer.pulse ? (local % 1.6) / 1.6 : 0,
      });
    } else if (layer.type === 'text') {
      const span = Math.max(0.0001, layer.fade || 0.5);
      const entering = clamp01((time - layer.in) / span);
      texts.push({
        style: layer,
        alpha,
        offsetY: layer.anim === 'slideUp' ? (1 - ease('easeOut', entering)) * 26 : 0,
        reveal: layer.anim === 'typewriter' ? clamp01((time - layer.in) / Math.max(0.2, layer.fade * 3)) : 1,
        wipe: layer.anim === 'wipe' ? ease('easeInOutCubic', entering) : 1,
      });
    } else if (layer.type === 'shape') {
      const trace = layer.traceOutline
        ? ease('easeInOutCubic', invLerp(layer.in, Math.min(layer.out, layer.in + 2), time))
        : 1;
      shapes.push({ style: layer, alpha, trace });
    } else if (layer.type === 'regions') {
      const { render, camera } = evaluateRegions(layer, project, time, alpha);
      regions.push(render);
      if (camera) claims.push({ layer: layer.id, kind: 'tour', camera });
    } else if (layer.type === 'image') {
      const span = Math.max(0.0001, layer.out - layer.in);
      const through = clamp01((time - layer.in) / span);
      const entering = clamp01((time - layer.in) / Math.max(0.0001, layer.fade || 0.5));
      images.push({
        style: layer,
        alpha,
        offsetY: layer.anim === 'slideUp' ? (1 - ease('easeOut', entering)) * 40 : 0,
        // A still that never moves reads as a freeze; 4% over the shot is enough.
        zoom: layer.anim === 'kenBurns' ? 1 + 0.04 * through : 1,
      });
    } else {
      const span = Math.max(0.01, layer.dissipateEnd - layer.dissipateStart);
      clouds.push({
        style: layer,
        alpha,
        // Drift is absolute time, so scrubbing lands on the same frame every time.
        drift: time,
        clear: layer.dissipate ? ease('easeInOutCubic', clamp01((time - layer.dissipateStart) / span)) : 0,
      });
    }
  }

  return {
    time,
    camera: resolveCamera(claims) ?? cameraAt(project, time),
    routes,
    markers,
    texts,
    shapes,
    regions,
    clouds,
    images,
  };
}

/** Total run time a region tour needs, intro and outro included. */
export function tourDuration(layer: RegionsLayer, basemapIsDark: boolean): number {
  const set = regionSet(layer, basemapIsDark);
  const { end } = tourPhases(layer, set.order.length);
  return end - layer.in;
}

function overshoot(t: number): number {
  if (t >= 1) return 1;
  const c = 1.70158 + 1;
  return 1 + c * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
}
