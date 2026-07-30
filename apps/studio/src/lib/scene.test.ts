import { describe, expect, it } from 'vitest';
import type { Layer, Project, RegionsLayer, TextLayer } from '@geomotion/document';
import { createLayer, emptyProject } from '@geomotion/document';
import { clearRegionCache } from '@geomotion/entities';
import { cameraAt, clearPathCache, evaluate, tourPhases } from '@geomotion/evaluator';
import { demoProject, indiaTourProject } from './fixtures';

/**
 * Evaluation against realistic compositions.
 *
 * These live here rather than in `packages/evaluator` because they run against the
 * bundled example projects, and those embed boundary data — content, not engine. The
 * evaluator keeps the suites that need only a hand-built document.
 *
 * ENGINEERING_GUIDE §1.5 makes `evaluate(document, t)` pure; §12 requires a
 * determinism suite for exactly this reason. A stray map event re-rendering v1 export
 * frames at the wrong `t` silently corrupted whole renders.
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

describe('evaluate — region tour phases', () => {
  /** The regions render at `t`. Absent means the layer stopped evaluating at all. */
  function regionsAt(p: Project, t: number) {
    const r = evaluate(p, t).regions[0];
    if (!r) throw new Error(`no regions render at t=${t}`);
    return r;
  }

  const project = indiaTourProject();
  const regionsLayer = project.layers.find((l): l is RegionsLayer => l.type === 'regions')!;

  // The stop count is data-dependent (it is the joined, ordered region list), so
  // derive it from an evaluation rather than hardcoding a number that drifts
  // whenever the bundled dataset changes.
  clearRegionCache();
  const stopCount = regionsAt(project, regionsLayer.in + 0.01).set.order.length;
  const phases = tourPhases(regionsLayer, stopCount);

  it('has stops to tour', () => {
    expect(stopCount).toBeGreaterThan(1);
  });

  it('walks intro -> tour -> outro in order', () => {
    const { tourStart, tourEnd } = phases;
    clearRegionCache();
    expect(regionsAt(project, regionsLayer.in + 0.1).phase).toBe('intro');
    expect(regionsAt(project, tourStart + 0.1).phase).toBe('tour');
    expect(regionsAt(project, tourEnd + 0.1).phase).toBe('outro');
  });

  it('has no active region outside the tour, and exactly one inside it', () => {
    const { tourStart, tourEnd } = phases;
    clearRegionCache();
    expect(regionsAt(project, regionsLayer.in + 0.1).activeId).toBeNull();
    expect(regionsAt(project, tourEnd + 0.5).activeId).toBeNull();
    const mid = regionsAt(project, tourStart + 1);
    expect(mid.activeId).not.toBeNull();
    expect(mid.activeIndex).toBeGreaterThanOrEqual(0);
  });

  it('advances the active index monotonically through the tour', () => {
    const { tourStart, tourEnd } = phases;
    clearRegionCache();
    let last = -1;
    for (let t = tourStart + 0.05; t < tourEnd; t += 1) {
      const idx = regionsAt(project, t).activeIndex;
      expect(idx).toBeGreaterThanOrEqual(last);
      last = idx;
    }
  });

  it('keeps every normalised progress value inside 0..1', () => {
    clearRegionCache();
    for (let t = 0; t <= project.duration; t += 0.37) {
      const r = regionsAt(project, t);
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
  /** The first text/clouds render at `t`; absent means the layer did not evaluate. */
  const textAt = (p: Project, t: number) => {
    const r = evaluate(p, t).texts[0];
    if (!r) throw new Error(`no text render at t=${t}`);
    return r;
  };
  const cloudsAt = (p: Project, t: number) => {
    const r = evaluate(p, t).clouds[0];
    if (!r) throw new Error(`no clouds render at t=${t}`);
    return r;
  };

  it('reveals a typewriter layer progressively and never past the full string', () => {
    const text = createLayer('text', 0, { anim: 'typewriter', fade: 0.5, out: 10 } as Partial<Layer>) as TextLayer;
    const project: Project = { ...emptyProject(), duration: 10, layers: [text] };
    const early = textAt(project, 0.2).reveal;
    const later = textAt(project, 1.4).reveal;
    expect(early).toBeLessThan(later);
    expect(textAt(project, 9).reveal).toBe(1);
  });

  it('parts the clouds monotonically across the dissipate window', () => {
    const clouds = createLayer('clouds', 0, {
      out: 10,
      dissipate: true,
      dissipateStart: 1,
      dissipateEnd: 4,
    } as Partial<Layer>);
    const project: Project = { ...emptyProject(), duration: 10, layers: [clouds] };
    expect(cloudsAt(project, 0.5).clear).toBe(0);
    expect(cloudsAt(project, 5).clear).toBe(1);
    let prev = -1;
    for (let t = 1; t <= 4; t += 0.25) {
      const clear = cloudsAt(project, t).clear;
      expect(clear).toBeGreaterThanOrEqual(prev);
      prev = clear;
    }
  });

  it('drifts clouds from absolute time so a scrub lands on the same frame', () => {
    const clouds = createLayer('clouds', 0, { out: 10 } as Partial<Layer>);
    const project: Project = { ...emptyProject(), duration: 10, layers: [clouds] };
    expect(cloudsAt(project, 3.5).drift).toBe(3.5);
    expect(cloudsAt(project, 3.5).drift).toBe(cloudsAt(project, 3.5).drift);
  });
});
