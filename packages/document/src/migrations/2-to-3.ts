import { createId } from '@geomotion/core';

/**
 * Format 2 → 3: the two "window with a curve" tweens become property tracks.
 *
 * `drawStart` / `drawEnd` / `drawEasing` on a route, and `dissipate` /
 * `dissipateStart` / `dissipateEnd` on clouds, were the same thing written twice: a
 * value ramping 0 → 1 between two times under one easing curve. That is a two-key track
 * spelled out longhand, and ENGINEERING_GUIDE §126 forbids exactly this — "no bespoke
 * tween fields".
 *
 * Converting them is not only tidying. A window can only ever ramp once, straight
 * through; a track can pause mid-draw, run backwards, or ease each segment differently.
 * Every project gains that the moment it is opened.
 *
 * The remaining tween fields are deliberately left alone. `pop`, `pulse`, `anim`, `fade`
 * and the region tour are *rules applied to a value* rather than values authored over
 * time — behaviours in the §06 sense — and they belong on the behaviour stack, not here.
 * Forcing them into tracks would replace one wrong shape with another.
 */

interface LooseLayer {
  type?: unknown;
  [key: string]: unknown;
}

/** A 0..1 ramp between two times, easing on the opening key. */
function windowTrack(from: unknown, to: unknown, easing: unknown) {
  const a = typeof from === 'number' && Number.isFinite(from) ? from : 0;
  const b = typeof to === 'number' && Number.isFinite(to) ? to : a;
  const curve = typeof easing === 'string' ? easing : 'easeInOutCubic';
  return {
    kind: 'keyframed',
    keys: [
      { id: createId(), t: a, value: 0, easing: curve },
      { id: createId(), t: Math.max(a, b), value: 1, easing: curve },
    ],
  };
}

export function migrate2to3(doc: Record<string, unknown>): Record<string, unknown> {
  const out = { ...doc };
  const layers = Array.isArray(out.layers) ? (out.layers as LooseLayer[]) : [];

  out.layers = layers.map((layer) => {
    if (!layer || typeof layer !== 'object') return layer;

    if (layer.type === 'route' && !('progress' in layer)) {
      const next: LooseLayer = { ...layer, progress: windowTrack(layer.drawStart, layer.drawEnd, layer.drawEasing) };
      delete next.drawStart;
      delete next.drawEnd;
      delete next.drawEasing;
      return next;
    }

    if (layer.type === 'clouds' && !('clear' in layer)) {
      /*
       * `dissipate: false` meant the cloud never cleared, so the track is a flat zero
       * rather than a ramp — the same picture, said in the new form. Dropping the flag
       * and keeping the window would start every previously-static cloud dissipating.
       */
      const next: LooseLayer = {
        ...layer,
        clear:
          layer.dissipate === false
            ? { kind: 'static', value: 0 }
            : windowTrack(layer.dissipateStart, layer.dissipateEnd, 'easeInOutCubic'),
      };
      delete next.dissipate;
      delete next.dissipateStart;
      delete next.dissipateEnd;
      return next;
    }

    return layer;
  });

  return out;
}
