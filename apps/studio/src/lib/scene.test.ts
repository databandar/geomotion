import { describe, expect, it } from 'vitest';
import type { Layer, Project, RegionsLayer, RegionTour, TextLayer } from '@geomotion/document';
import { createLayer, defaultTour, emptyProject, keyframe } from '@geomotion/document';
import { demoProject, indiaTourProject } from './fixtures';
import { cameraAt, clearPathCache, evaluate, layerAlpha, tourPhases } from './scene';
import { clearRegionCache } from './regions';

/**
 * Behavioural spec for scene evaluation — the contract at the centre of the
 * architecture.
 *
 * ENGINEERING_GUIDE §1.5 makes `evaluate(document, t)` a pure function; §12
 * requires a determinism suite for exactly this reason. A stray map event
 * re-rendering v1 export frames at the wrong `t` silently corrupted whole
 * renders, and only a test like this would have caught it.
 *
 * Bound for `packages/evaluator` (ARCHITECTURE §14).
 */

function fresh<T extends Project>(p: T): T {
  clearPathCache();
  clearRegionCache();
  return p;
}

const PROJECTS: [string, () => Project][] = [
  ['demo (routes, markers, text)', demoProject],
  ['india tour (regions, clouds, shape, text)', indiaTourProject],
];

describe('evaluate — determinism and purity', () => {
  for (const [name, make] of PROJECTS) {
    describe(name, () => {
      it('is deterministic: identical (document, t) yields deep-equal scenes', () => {
        const project = fresh(make());
        for (const t of [0, 0.5, 1, 3.7, 12, project.duration / 2, project.duration]) {
          const a = evaluate(project, t);
          const b = evaluate(project, t);
          expect(a, `t=${t}`).toEqual(b);
        }
      });

      it('does not mutate the document it is given', () => {
        const project = fresh(make());
        const before = JSON.stringify(project);
        for (let t = 0; t <= project.duration; t += project.duration / 20) evaluate(project, t);
        expect(JSON.stringify(project)).toBe(before);
      });

      it('produces a structured-clone-safe scene', () => {
        // ARCHITECTURE §14: the scene handed to the renderer must survive a
        // worker boundary, so it may contain no functions and no cycles.
        const project = fresh(make());
        const scene = evaluate(project, project.duration / 3);
        expect(() => structuredClone(scene)).not.toThrow();
      });

      it('evaluates every frame of the composition without throwing', () => {
        const project = fresh(make());
        const step = 1 / project.fps;
        for (let t = 0; t <= project.duration + step; t += step) {
          expect(() => evaluate(project, t)).not.toThrow();
        }
      });

      it('reports the time it was asked for', () => {
        const project = fresh(make());
        expect(evaluate(project, 2.25).time).toBe(2.25);
      });

      it('is order-independent across time — scrubbing backwards matches forwards', () => {
        // Guards against any hidden per-call state accumulating in the caches.
        const project = fresh(make());
        const times = [0, 2, 4, 6, 8];
        const forwards = times.map((t) => JSON.stringify(evaluate(project, t)));
        const backwards = [...times].reverse().map((t) => JSON.stringify(evaluate(project, t))).reverse();
        expect(backwards).toEqual(forwards);
      });
    });
  }
});

describe('layerAlpha — visibility and fade ramps', () => {
  const base = { in: 2, out: 6, fade: 1, visible: true };

  it('is zero outside the layer window', () => {
    expect(layerAlpha(base, 1.99)).toBe(0);
    expect(layerAlpha(base, 6.01)).toBe(0);
  });

  it('ramps in and out over the fade duration', () => {
    expect(layerAlpha(base, 2)).toBeCloseTo(0, 6);
    expect(layerAlpha(base, 2.5)).toBeCloseTo(0.5, 6);
    expect(layerAlpha(base, 3)).toBeCloseTo(1, 6);
    expect(layerAlpha(base, 5.5)).toBeCloseTo(0.5, 6);
    expect(layerAlpha(base, 6)).toBeCloseTo(0, 6);
  });

  it('is fully on across the middle', () => {
    expect(layerAlpha(base, 4)).toBe(1);
  });

  it('is zero when hidden, regardless of time', () => {
    expect(layerAlpha({ ...base, visible: false }, 4)).toBe(0);
  });

  it('snaps on with no fade', () => {
    const hard = { ...base, fade: 0 };
    expect(layerAlpha(hard, 2)).toBe(1);
    expect(layerAlpha(hard, 6)).toBe(1);
  });

  it('never exceeds 1 when the fades overlap on a very short layer', () => {
    const brief = { in: 0, out: 0.2, fade: 5, visible: true };
    for (let t = 0; t <= 0.2; t += 0.02) {
      const a = layerAlpha(brief, t);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
  });
});

describe('cameraAt — keyframe interpolation', () => {
  const project: Project = {
    ...emptyProject(),
    duration: 10,
    camera: [
      keyframe(0, [0, 0], 2, { bearing: 0, pitch: 0 }),
      keyframe(5, [10, 10], 6, { bearing: 90, pitch: 40 }),
      keyframe(10, [20, 0], 4, { bearing: 180, pitch: 0 }),
    ],
  };

  it('returns keyframe values exactly at keyframe times', () => {
    expect(cameraAt(project, 0).zoom).toBeCloseTo(2, 9);
    expect(cameraAt(project, 5).zoom).toBeCloseTo(6, 9);
    expect(cameraAt(project, 10).zoom).toBeCloseTo(4, 9);
    expect(cameraAt(project, 5).center[0]).toBeCloseTo(10, 9);
  });

  it('holds the first and last keyframe outside the range', () => {
    expect(cameraAt(project, -100)).toEqual(cameraAt(project, 0));
    expect(cameraAt(project, 1000)).toEqual(cameraAt(project, 10));
  });

  it('interpolates strictly between the surrounding keyframes', () => {
    const mid = cameraAt(project, 2.5);
    expect(mid.zoom).toBeGreaterThan(2);
    expect(mid.zoom).toBeLessThan(6);
    expect(mid.center[0]).toBeGreaterThan(0);
    expect(mid.center[0]).toBeLessThan(10);
  });

  it('falls back to a default camera when there are no keyframes', () => {
    const cam = cameraAt({ ...project, camera: [] }, 3);
    expect(Number.isFinite(cam.zoom)).toBe(true);
    expect(Number.isFinite(cam.center[0])).toBe(true);
  });

  it('holds a single keyframe for the whole composition', () => {
    const one = { ...project, camera: [keyframe(4, [7, 7], 5)] };
    expect(cameraAt(one, 0).zoom).toBe(5);
    expect(cameraAt(one, 99).center).toEqual([7, 7]);
  });

  it('tolerates unsorted keyframes', () => {
    const shuffled = { ...project, camera: [project.camera[2], project.camera[0], project.camera[1]] };
    expect(cameraAt(shuffled, 5).zoom).toBeCloseTo(cameraAt(project, 5).zoom, 9);
  });

  it('takes the short way around the compass between bearings', () => {
    const wrap: Project = {
      ...emptyProject(),
      camera: [keyframe(0, [0, 0], 2, { bearing: 350 }), keyframe(1, [0, 0], 2, { bearing: 10 })],
    };
    // Going forwards through 360, not backwards through 180.
    expect(cameraAt(wrap, 0.5).bearing).toBeCloseTo(360, 6);
  });

  it('dip pulls the zoom back mid-segment and vanishes at the endpoints', () => {
    const arc: Project = {
      ...emptyProject(),
      camera: [keyframe(0, [0, 0], 8, { dip: 3 }), keyframe(2, [10, 0], 8)],
    };
    expect(cameraAt(arc, 0).zoom).toBeCloseTo(8, 6);
    expect(cameraAt(arc, 2).zoom).toBeCloseTo(8, 6);
    expect(cameraAt(arc, 1).zoom).toBeCloseTo(5, 6); // 8 - 3 at the midpoint
  });

  it('never returns a negative zoom even with an aggressive dip', () => {
    const deep: Project = {
      ...emptyProject(),
      camera: [keyframe(0, [0, 0], 1, { dip: 40 }), keyframe(2, [1, 0], 1)],
    };
    for (let t = 0; t <= 2; t += 0.1) expect(cameraAt(deep, t).zoom).toBeGreaterThanOrEqual(0);
  });
});

describe('tourPhases — story timing', () => {
  function tour(patch: Partial<RegionTour>): RegionsLayer {
    const l = createLayer('regions', 3) as RegionsLayer;
    // The tour is one nested behaviour now, so a case overrides fields of it
    // rather than of the layer.
    return Object.assign(l, {
      tour: { ...defaultTour(), intro: 4, outro: 5, dwell: 2, stopDurations: [], ...patch },
    });
  }

  it('lays out intro, per-stop dwell, and outro end to end', () => {
    const p = tourPhases(tour({}), 3);
    expect(p.tourStart).toBe(7); // in 3 + intro 4
    expect(p.tourEnd).toBe(13); // + 3 stops x 2s
    expect(p.end).toBe(18); // + outro 5
  });

  it('honours per-stop durations over the uniform dwell', () => {
    const p = tourPhases(tour({ stopDurations: [1, 5, 2] }), 3);
    expect(p.holds).toEqual([1, 5, 2]);
    expect(p.offsets).toEqual([0, 1, 6, 8]);
    expect(p.tourEnd).toBe(15); // 7 + 8
  });

  it('falls back to dwell for stops with no measured duration', () => {
    const p = tourPhases(tour({ stopDurations: [1] }), 3);
    expect(p.holds).toEqual([1, 2, 2]);
  });

  it('ignores nonsensically short measured durations', () => {
    const p = tourPhases(tour({ stopDurations: [0, -3] }), 2);
    expect(p.holds).toEqual([2, 2]);
  });

  it('keeps offsets monotonic and one longer than the stop count', () => {
    const p = tourPhases(tour({ stopDurations: [2, 1, 3, 1] }), 4);
    expect(p.offsets).toHaveLength(5);
    for (let i = 1; i < p.offsets.length; i++) {
      expect(p.offsets[i]).toBeGreaterThan(p.offsets[i - 1]);
    }
  });

  it('degrades to an empty tour when there are no stops', () => {
    const p = tourPhases(tour({}), 0);
    expect(p.tourEnd).toBe(p.tourStart);
    expect(p.holds).toEqual([]);
  });

  it('clamps a non-positive dwell so time always advances', () => {
    const p = tourPhases(tour({ dwell: 0 }), 2);
    expect(p.tourEnd).toBeGreaterThan(p.tourStart);
  });
});

describe('evaluate — region tour phases', () => {
  const project = indiaTourProject();
  const regionsLayer = project.layers.find((l): l is RegionsLayer => l.type === 'regions')!;

  // The stop count is data-dependent (it is the joined, ordered region list), so
  // derive it from an evaluation rather than hardcoding a number that drifts
  // whenever the bundled dataset changes.
  clearRegionCache();
  const stopCount = evaluate(project, regionsLayer.in + 0.01).regions[0].set.order.length;
  const phases = tourPhases(regionsLayer, stopCount);

  it('has stops to tour', () => {
    expect(stopCount).toBeGreaterThan(1);
  });

  it('walks intro -> tour -> outro in order', () => {
    const { tourStart, tourEnd } = phases;
    clearRegionCache();
    expect(evaluate(project, regionsLayer.in + 0.1).regions[0].phase).toBe('intro');
    expect(evaluate(project, tourStart + 0.1).regions[0].phase).toBe('tour');
    expect(evaluate(project, tourEnd + 0.1).regions[0].phase).toBe('outro');
  });

  it('has no active region outside the tour, and exactly one inside it', () => {
    const { tourStart, tourEnd } = phases;
    clearRegionCache();
    expect(evaluate(project, regionsLayer.in + 0.1).regions[0].activeId).toBeNull();
    expect(evaluate(project, tourEnd + 0.5).regions[0].activeId).toBeNull();
    const mid = evaluate(project, tourStart + 1).regions[0];
    expect(mid.activeId).not.toBeNull();
    expect(mid.activeIndex).toBeGreaterThanOrEqual(0);
  });

  it('advances the active index monotonically through the tour', () => {
    const { tourStart, tourEnd } = phases;
    clearRegionCache();
    let last = -1;
    for (let t = tourStart + 0.05; t < tourEnd; t += 1) {
      const idx = evaluate(project, t).regions[0].activeIndex;
      expect(idx).toBeGreaterThanOrEqual(last);
      last = idx;
    }
  });

  it('keeps every normalised progress value inside 0..1', () => {
    clearRegionCache();
    for (let t = 0; t <= project.duration; t += 0.37) {
      const r = evaluate(project, t).regions[0];
      for (const [key, v] of Object.entries({
        trace: r.trace,
        introTrace: r.introTrace,
        outroProgress: r.outroProgress,
        reveal: r.reveal,
        calloutAlpha: r.calloutAlpha,
        alpha: r.alpha,
      })) {
        expect(v, `${key} at t=${t.toFixed(2)}`).toBeGreaterThanOrEqual(0);
        expect(v, `${key} at t=${t.toFixed(2)}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('drives the camera from the tour rather than the keyframes while it runs', () => {
    const { tourStart } = phases;
    clearRegionCache();
    const during = evaluate(project, tourStart + 1.5).camera;
    const keyframed = cameraAt(project, tourStart + 1.5);
    expect(during).not.toEqual(keyframed);
  });
});

describe('evaluate — text and clouds', () => {
  it('reveals a typewriter layer progressively and never past the full string', () => {
    const text = createLayer('text', 0, { anim: 'typewriter', fade: 0.5, out: 10 } as Partial<Layer>) as TextLayer;
    const project: Project = { ...emptyProject(), duration: 10, layers: [text] };
    const early = evaluate(project, 0.2).texts[0].reveal;
    const later = evaluate(project, 1.4).texts[0].reveal;
    expect(early).toBeLessThan(later);
    expect(evaluate(project, 9).texts[0].reveal).toBe(1);
  });

  it('parts the clouds monotonically across the dissipate window', () => {
    const clouds = createLayer('clouds', 0, {
      out: 10,
      dissipate: true,
      dissipateStart: 1,
      dissipateEnd: 4,
    } as Partial<Layer>);
    const project: Project = { ...emptyProject(), duration: 10, layers: [clouds] };
    expect(evaluate(project, 0.5).clouds[0].clear).toBe(0);
    expect(evaluate(project, 5).clouds[0].clear).toBe(1);
    let prev = -1;
    for (let t = 1; t <= 4; t += 0.25) {
      const clear = evaluate(project, t).clouds[0].clear;
      expect(clear).toBeGreaterThanOrEqual(prev);
      prev = clear;
    }
  });

  it('drifts clouds from absolute time so a scrub lands on the same frame', () => {
    const clouds = createLayer('clouds', 0, { out: 10 } as Partial<Layer>);
    const project: Project = { ...emptyProject(), duration: 10, layers: [clouds] };
    expect(evaluate(project, 3.5).clouds[0].drift).toBe(3.5);
    expect(evaluate(project, 3.5).clouds[0].drift).toBe(evaluate(project, 3.5).clouds[0].drift);
  });
});
