/**
 * "Is this route actually big enough on screen to read as a line" — the third
 * silent failure mode found across every produced episode, alongside the two
 * `@geomotion/geometry` checks (antimeridian, polar clip) and `overlap-lint.ts`'s
 * layer collisions.
 *
 * A route's stroke width is a fixed number of screen pixels (`style.width`, e.g.
 * 3.6) — it never literally "goes sub-pixel." What actually happened, twice
 * (Malacca's detour route, Dandi March's first zoom pass): the camera was zoomed
 * out far enough that the route's whole *length* compressed to a handful of
 * screen pixels, and a 3px-wide, 15px-long smudge doesn't read as a route no
 * matter how non-zero its width technically is. Caught both times only by
 * rendering a frame and looking at it.
 *
 * Reuses `overlap-lint.ts`'s viewport-clipping (`clipToViewport`, `boundsOf`) —
 * the same "only the part of the route the real renderer would actually draw"
 * correction that module's route-collision check needed, for the same underlying
 * reason: a route's full geometry exists once `progress` reaches 1 regardless of
 * where the camera is currently pointed.
 */
import type { Map as MLMap } from 'maplibre-gl';
import { layerAt } from '@geomotion/document';
import type { Project } from '@geomotion/document';
import { evaluate } from '@geomotion/evaluator';
import { boundsOf, clipToViewport, type Point } from './overlap-lint';

export interface TinyRouteFinding {
  time: number;
  layerId: string;
  layerName: string;
  /** Diagonal of the on-screen (viewport-clipped) portion of the route, in px. */
  onScreenDiagonalPx: number;
  /** That diagonal as a fraction of the full viewport's own diagonal. */
  onScreenFraction: number;
}

/**
 * Routes whose on-screen extent falls below `minFraction` of the viewport's own
 * diagonal (default 0.3) at one instant. `map` must already be positioned at `t` —
 * same requirement as `findOverlapsAt`, and for the same reason: projection
 * reflects the map's live camera, not a value derived from `t` alone.
 *
 * A route being small isn't inherently wrong — a wide establishing or context shot
 * legitimately shrinks everything, and flagging that would be noise. This answers
 * "is the route small *right now*," not "should it be bigger right now" — that
 * judgment belongs to whoever picks which times to check, the same way
 * `checkOverlaps` expects meaningful scene-boundary times, not every frame.
 * Confirmed on Dandi March itself: called at every beat, this correctly stays
 * silent at the route-focused S02-S04/S07 beats but *does* flag the route as tiny
 * at S05/S06 — which is right, because those are deliberately wide India-context
 * shots where the route is a small anchor, not the subject.
 *
 * A relative threshold, not an absolute pixel count: measured directly against
 * Dandi March's own real regression, an absolute cutoff couldn't separate the two
 * states cleanly at any one project's normal viewport size. At the *broken* zoom
 * (6.4 — the route a barely-there stub), the on-screen diagonal was 285px, which
 * sounds small but is still 13% of a 1080×1920 frame's ~2203px diagonal; at the
 * *fixed* zoom (8.9), the same route measured 1453-1612px — 66-73%. 0.3 sits with
 * more than 2x margin on both sides of that real gap.
 */
export function findTinyRoutesAt(project: Project, map: MLMap, t: number, minFraction = 0.3): TinyRouteFinding[] {
  const { width, height } = project;
  const viewportDiagonal = Math.hypot(width, height);
  const findings: TinyRouteFinding[] = [];
  const scene = evaluate(project, t);

  for (const rt of scene.routes) {
    if (rt.alpha <= 0.01 || rt.drawn.length < 2) continue;
    const allPts = rt.drawn.map((ll) => map.project(ll));
    const visible: Point[] = [];
    for (let i = 0; i < allPts.length - 1; i++) {
      const clipped = clipToViewport(allPts[i]!, allPts[i + 1]!, width, height);
      if (clipped) visible.push(...clipped);
    }
    if (visible.length === 0) continue; // not on screen at all right now isn't "tiny," it's absent

    const box = boundsOf(visible);
    const diagonal = Math.hypot(box.width, box.height);
    const fraction = diagonal / viewportDiagonal;
    if (fraction < minFraction) {
      findings.push({
        time: t,
        layerId: rt.style.id,
        layerName: layerAt(project, rt.style.id)?.name ?? rt.style.id,
        onScreenDiagonalPx: diagonal,
        onScreenFraction: fraction,
      });
    }
  }

  return findings;
}
