/**
 * Layer-overlap detection — "does anything visually collide at this instant."
 *
 * Built after the fact from a real pattern: nearly every bug found while producing
 * docs/brand/* episodes was some flavour of two things occupying the same screen
 * space — a closing title landing on a marker's label, a series tag overlapping the
 * source citation, an image card sitting on top of a route's approach into its
 * destination. Every one of those was caught by rendering a frame and looking at
 * it, one spot-check at a time. This computes the same answer directly from the
 * evaluated scene, so a build script can ask "does anything collide here" before
 * spending a render on it.
 *
 * Deliberately runs in the browser, not as a pure Node function: text sizing uses
 * the exact same `measureTracked`/`FONT_STACK` the real renderer draws with (real
 * canvas metrics, not a guessed characters-per-em constant), and geographic
 * layers (markers, routes) are projected with the live MapLibre map's own
 * `project()` — which accounts for the actual globe curvature, pitch and bearing,
 * not the flat-Mercator approximation `@geomotion/geometry`'s `fitBounds` uses.
 * A pure-Node version of this would inherit the same "close at regional zoom,
 * looser at wide/global zoom" caveat that helper has.
 *
 * Not a duplicate of `packages/renderer/src/labels.ts`'s `collides`/`labelBox`: that
 * one is a narrower, runtime auto-avoidance system for a single feature (region-tour
 * closing-shot labels pushing each other apart live), not a build-time diagnostic
 * across every layer type and every beat in the timeline. Different problem, kept
 * separate rather than forced to share code that doesn't actually overlap in scope.
 */
import type { Map as MLMap } from 'maplibre-gl';
import { layerAt } from '@geomotion/document';
import type { Project } from '@geomotion/document';
import { evaluate } from '@geomotion/evaluator';
import {
  alignLeft, FONT_STACK, fontStackFor, getImage, measureTracked, scaleFor,
  type ImageStyle, type MarkerStyle, type TextStyle,
} from '@geomotion/renderer';

export interface OverlapRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverlapItem {
  id: string;
  name: string;
  kind: 'text' | 'marker' | 'image' | 'route';
  rect: OverlapRect;
}

export interface OverlapFinding {
  time: number;
  a: OverlapItem;
  b: OverlapItem;
}

let measureCtxCache: CanvasRenderingContext2D | null = null;
function measureCtx(): CanvasRenderingContext2D {
  if (!measureCtxCache) {
    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) throw new Error('checkOverlaps: 2D canvas context unavailable');
    measureCtxCache = ctx;
  }
  return measureCtxCache;
}

/**
 * Mirrors `drawText`'s own layout exactly (shrink-to-fit at 92% width, the same
 * `1.22` line-height multiplier) — a second, looser estimate here would give a
 * false sense of precision while still drifting from what actually gets drawn.
 */
function textRect(ctx: CanvasRenderingContext2D, style: TextStyle, width: number, height: number, scale: number): OverlapRect {
  let size = style.size * scale;
  const x = style.x * width;
  const y = style.y * height;
  const lines = style.text.split('\n');

  const maxW = width * 0.92;
  // The layer's own stack, not the default one: `condensed` measures ~15% narrower than
  // `sans`, and measuring every layer in `sans` reported overflow on titles that fit.
  const stack = fontStackFor(style.fontFamily);
  ctx.font = `${style.weight} ${size}px ${stack}`;
  let spacing = style.letterSpacing * scale;
  let widest = Math.max(...lines.map((l) => measureTracked(ctx, l, spacing)), 1);
  if (widest > maxW) {
    const fit = maxW / widest;
    size *= fit;
    spacing *= fit;
    ctx.font = `${style.weight} ${size}px ${stack}`;
    widest = Math.max(...lines.map((l) => measureTracked(ctx, l, spacing)), 1);
  }

  const lineHeight = size * 1.22;
  const left = alignLeft(x, widest, style.align);
  // Baselines sit at y, y+lineHeight, ... — one size above the first for ascender
  // room, ~0.3 size below the last for descenders, roughly bounding the ink rather
  // than the type's nominal em box.
  const top = y - size;
  const bottom = y + (lines.length - 1) * lineHeight + size * 0.3;
  return { x: left, y: top, width: widest, height: bottom - top };
}

/** Mirrors `drawMarker`'s label placement — centered above the dot by `labelOffset`. */
function markerLabelRect(
  ctx: CanvasRenderingContext2D, style: MarkerStyle, dotScreen: { x: number; y: number }, dotRadius: number, scale: number,
): OverlapRect | null {
  if (!style.label.trim()) return null;
  const size = style.labelSize * scale;
  ctx.font = `600 ${size}px ${FONT_STACK}`;
  const w = measureTracked(ctx, style.label, 0);
  const baselineY = dotScreen.y - (style.labelOffset * scale + dotRadius);
  return { x: dotScreen.x - w / 2, y: baselineY - size, width: w, height: size * 1.25 };
}

/** Mirrors `drawImageLayer`'s anchor math, using the real decoded image's aspect
 * ratio (via the renderer's own image cache) rather than assuming one. */
function imageRect(style: ImageStyle, zoom: number, width: number, height: number): OverlapRect {
  const entry = getImage(style.src);
  const natural =
    entry?.ready && entry.img.naturalWidth && entry.img.naturalHeight
      ? entry.img.naturalWidth / entry.img.naturalHeight
      : 9 / 16; // a portrait-card guess if the image hasn't decoded — better than 1:1
  const w = style.width * width * zoom;
  const h = w / natural;
  let x = style.x * width;
  let y = style.y * height;
  if (style.anchor === 'center') {
    x -= w / 2;
    y -= h / 2;
  } else if (style.anchor === 'topRight' || style.anchor === 'bottomRight') x -= w;
  if (style.anchor === 'bottomLeft' || style.anchor === 'bottomRight') y -= h;
  return { x, y, width: w, height: h };
}

export function rectsOverlap(a: OverlapRect, b: OverlapRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function boundsOf(pts: readonly { x: number; y: number }[]): OverlapRect {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Standard segment-segment intersection test (proper crossing or touching). */
function segsIntersect(
  p1: { x: number; y: number }, p2: { x: number; y: number },
  p3: { x: number; y: number }, p4: { x: number; y: number },
): boolean {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (d === 0) return false; // parallel — a real collision elsewhere on the route will still be caught
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

export type Point = { x: number; y: number };

/**
 * Liang-Barsky segment-vs-rect clip — the portion of `p1`→`p2` inside `rect`, or
 * `null` if none of it is.
 *
 * A route's full drawn geometry exists once `progress` reaches 1, regardless of
 * where the camera is currently pointed — at a tight zoom (e.g. this project's S04
 * close-up on Dandi, zoom ~10.5), most of an 8-waypoint, ~390km route legitimately
 * projects to screen coordinates thousands of pixels outside the tiny viewport,
 * confirmed empirically (a bounding box 4643px tall in a 1920px-tall frame). A raw
 * straight-line intersection test against the *unclipped* segment would falsely
 * "cross" any on-screen UI rect on its way to a point that's nowhere near the
 * frame — exactly what the real renderer clips away and never draws. Clipping to
 * the viewport first, the same way, is the actual fix; an arbitrary "how far is
 * too far" margin was tried first and turned out to be guessing at a value real
 * clipping makes unnecessary.
 */
export function clipToViewport(p1: Point, p2: Point, width: number, height: number): [Point, Point] | null {
  if (![p1.x, p1.y, p2.x, p2.y].every(Number.isFinite)) return null;
  let t0 = 0;
  let t1 = 1;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const edges: [number, number][] = [
    [-dx, p1.x], // left: x >= 0
    [dx, width - p1.x], // right: x <= width
    [-dy, p1.y], // top: y >= 0
    [dy, height - p1.y], // bottom: y <= height
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null; // parallel to this edge and entirely outside it
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [{ x: p1.x + t0 * dx, y: p1.y + t0 * dy }, { x: p1.x + t1 * dx, y: p1.y + t1 * dy }];
}

function segIntersectsRect(p1: { x: number; y: number }, p2: { x: number; y: number }, rect: OverlapRect): boolean {
  const inside = (p: { x: number; y: number }) =>
    p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height;
  if (inside(p1) || inside(p2)) return true;
  const c = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
  for (let i = 0; i < 4; i++) if (segsIntersect(p1, p2, c[i]!, c[(i + 1) % 4]!)) return true;
  return false;
}

/**
 * Every visible pairwise overlap among text/marker-label/image layers, plus every
 * point where a drawn route crosses one of those, at one instant.
 *
 * `map` must be the project's live MapLibre instance, already positioned at `t` —
 * geographic layers (marker dots, route polylines) are projected through its real
 * `project()`, which reflects whatever camera state the map currently holds, not
 * whatever `t` nominally is. A caller checking several times must move the camera
 * (`renderFrameAt(t)`, wait for it to settle) before each call — see
 * `HeadlessApi.checkOverlaps`, which does exactly that in a loop. This function
 * doesn't drive the camera itself because *how* to move it (and how long to wait
 * for tiles) is a render-host concern, not a geometry one.
 */
export function findOverlapsAt(project: Project, map: MLMap, t: number): OverlapFinding[] {
  const ctx = measureCtx();
  const { width, height } = project;
  const scale = scaleFor(height);
  const findings: OverlapFinding[] = [];

  const scene = evaluate(project, t);
  const items: OverlapItem[] = [];

  for (const tr of scene.texts) {
    if (tr.alpha <= 0.01) continue;
    items.push({
      id: tr.style.id,
      name: layerAt(project, tr.style.id)?.name ?? tr.style.id,
      kind: 'text',
      rect: textRect(ctx, tr.style, width, height, scale),
    });
  }
  for (const mk of scene.markers) {
    if (mk.alpha <= 0.01) continue;
    const p = map.project(mk.style.coord);
    const dotRadius = mk.style.size * scale * mk.scale;
    const rect = markerLabelRect(ctx, mk.style, p, dotRadius, scale);
    if (rect) {
      items.push({ id: mk.style.id, name: layerAt(project, mk.style.id)?.name ?? mk.style.id, kind: 'marker', rect });
    }
  }
  for (const im of scene.images) {
    if (im.alpha <= 0.01) continue;
    items.push({
      id: im.style.id,
      name: layerAt(project, im.style.id)?.name ?? im.style.id,
      kind: 'image',
      rect: imageRect(im.style, im.zoom, width, height),
    });
  }

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (rectsOverlap(items[i]!.rect, items[j]!.rect)) findings.push({ time: t, a: items[i]!, b: items[j]! });
    }
  }

  for (const rt of scene.routes) {
    if (rt.alpha <= 0.01 || rt.drawn.length < 2) continue;
    const allPts = rt.drawn.map((ll) => map.project(ll));
    // Only the portion of each segment actually inside the viewport counts — the
    // rest is exactly what the real renderer clips away and never draws (see
    // `clipToViewport`'s doc comment for why this replaced an earlier, wrong
    // "how far off-screen is too far" margin heuristic).
    const visibleSegments: [Point, Point][] = [];
    for (let i = 0; i < allPts.length - 1; i++) {
      const clipped = clipToViewport(allPts[i]!, allPts[i + 1]!, width, height);
      if (clipped) visibleSegments.push(clipped);
    }
    if (visibleSegments.length === 0) continue; // none of the route is on screen right now

    const routeItem: OverlapItem = {
      id: rt.style.id,
      name: layerAt(project, rt.style.id)?.name ?? rt.style.id,
      kind: 'route',
      rect: boundsOf(visibleSegments.flat()),
    };
    for (const item of items) {
      for (const [p1, p2] of visibleSegments) {
        if (segIntersectsRect(p1, p2, item.rect)) {
          findings.push({ time: t, a: routeItem, b: item });
          break;
        }
      }
    }
  }

  return findings;
}

export interface TextFitFinding {
  layerId: string;
  layerName: string;
  time: number;
  /** which frame edges the laid-out text crosses */
  sides: ('left' | 'right' | 'top' | 'bottom')[];
  /** worst overshoot in project pixels */
  overflow: number;
}

/**
 * Text laid out past the edge of the frame, at one instant.
 *
 * `drawText` already shrinks a line to fit 92% of the frame width — which sounds like
 * this cannot happen, and is why it went unnoticed. That guard bounds the text's
 * *width*; it says nothing about where the block is *placed*. A left-aligned headline
 * anchored at x=0.075 is free to occupy the full 92% starting from there and run
 * straight off the right edge, which is exactly what a two-line masthead did — twice,
 * because the first size reduction was still not enough and nothing but an extracted
 * frame could say so.
 *
 * Screen-space only, so unlike `findOverlapsAt` this needs no map and no settled
 * tiles: the camera cannot move a text layer.
 */
export function findTextOverflowAt(project: Project, t: number): TextFitFinding[] {
  const ctx = measureCtx();
  const { width, height } = project;
  const scale = scaleFor(height);
  const findings: TextFitFinding[] = [];

  /*
   * Measured against a safe area, not the hard edge — otherwise this check is
   * technically correct and practically useless.
   *
   * `drawText` shrinks a line to 92% of the frame width, which sounds like it makes
   * overflow impossible. It caps the text's *width*; it does not know where the block
   * is anchored. A left-aligned headline at x=0.075 may use that entire 92% budget
   * starting from 7.5%, landing its right edge at 99.5% — inside the frame by a hair,
   * and visibly jammed against the edge in the render. That is the exact shape of the
   * bug this was written for, and a hard-edge test misses it.
   *
   * The margin is the renderer's own budget rather than a taste call: 92% centred
   * leaves 4% each side, so text reaching into that 4% is using room its own layout
   * rule already reserved.
   */
  const marginX = width * 0.04;
  const marginY = height * 0.02;

  for (const tr of evaluate(project, t).texts) {
    if (tr.alpha <= 0.01) continue;
    const rect = textRect(ctx, tr.style, width, height, scale);
    const sides: TextFitFinding['sides'] = [];
    if (rect.x < marginX) sides.push('left');
    if (rect.x + rect.width > width - marginX) sides.push('right');
    if (rect.y < marginY) sides.push('top');
    if (rect.y + rect.height > height - marginY) sides.push('bottom');
    if (!sides.length) continue;

    findings.push({
      layerId: tr.style.id,
      layerName: layerAt(project, tr.style.id)?.name ?? tr.style.id,
      time: t,
      sides,
      overflow: Math.round(
        Math.max(
          marginX - rect.x,
          rect.x + rect.width - (width - marginX),
          marginY - rect.y,
          rect.y + rect.height - (height - marginY),
        ),
      ),
    });
  }

  return findings;
}
