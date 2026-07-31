import { describe, expect, it } from 'vitest';
import type { CameraKeyframe, Project, RegionsLayer, RegionTour } from '@geomotion/document';
import { createLayer, defaultTour, emptyProject, keyframe } from '@geomotion/document';
import type { CameraState } from './scene.ts';
import { cameraAt, layerAlpha, resolveCamera, tourPhases } from './scene.ts';

/**
 * Behavioural spec for the parts of evaluation that need nothing but a document.
 *
 * The suites that exercise `evaluate` against realistic compositions live with the
 * fixtures, in the app: those embed bundled boundary data, which is example content
 * rather than engine, and §2 keeps it out of the packages.
 *
 * Bound for `packages/evaluator` (ARCHITECTURE §14).
 */

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
    const [k0, k1, k2] = project.camera;
    const shuffled = { ...project, camera: [k2!, k0!, k1!] };
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
      expect(p.offsets[i]).toBeGreaterThan(p.offsets[i - 1]!);
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

describe('resolveCamera', () => {
  const cam = (zoom: number): CameraState => ({ center: [0, 0], zoom, bearing: 0, pitch: 0 });

  it('leaves the camera to the keyframes when nothing claims it', () => {
    expect(resolveCamera([])).toBeNull();
  });

  it('gives it to the topmost claimant', () => {
    const winner = resolveCamera([
      { layer: 'a', kind: 'tour', camera: cam(4) },
      { layer: 'b', kind: 'follow', camera: cam(9) },
    ]);
    expect(winner?.zoom).toBe(9);
  });

  it('does not care which behaviour asked, only where the layer sits', () => {
    // The inverse of the case above. Before this was written down, the winner
    // depended on which branch of the evaluator's loop assigned last, so a rule
    // stated in one direction is not evidence it holds in the other.
    const winner = resolveCamera([
      { layer: 'b', kind: 'follow', camera: cam(9) },
      { layer: 'a', kind: 'tour', camera: cam(4) },
    ]);
    expect(winner?.zoom).toBe(4);
  });

  it('hands back a claim untouched rather than blending', () => {
    const only = cam(7);
    expect(resolveCamera([{ layer: 'a', kind: 'tour', camera: only }])).toEqual(only);
  });
});

describe('cameraAt — the channels that resolve through evalTrack', () => {
  /*
   * `zoom` and `pitch` are read through the property-track evaluator (M1). The tests
   * above exercise the camera at its keyframes and outside its range, where `cameraAt`
   * returns early and the track is never consulted — so without these, breaking
   * `evalTrack` outright left the whole evaluator suite green.
   */
  const ramp = (): Project => ({
    ...emptyProject(),
    duration: 10,
    camera: [
      { ...keyframe(0, [0, 0], 4), pitch: 0, easing: 'linear' },
      { ...keyframe(4, [0, 0], 8), pitch: 60, easing: 'linear' },
    ],
  });

  it('interpolates zoom across a segment, not just at its ends', () => {
    expect(cameraAt(ramp(), 2).zoom).toBeCloseTo(6, 6);
    expect(cameraAt(ramp(), 1).zoom).toBeCloseTo(5, 6);
    expect(cameraAt(ramp(), 3).zoom).toBeCloseTo(7, 6);
  });

  it('interpolates pitch across a segment', () => {
    expect(cameraAt(ramp(), 2).pitch).toBeCloseTo(30, 6);
  });

  it('reads the authored value exactly at each key', () => {
    expect(cameraAt(ramp(), 0).zoom).toBe(4);
    expect(cameraAt(ramp(), 4).zoom).toBe(8);
  });

  it('holds the ends rather than extrapolating past them', () => {
    expect(cameraAt(ramp(), -3).zoom).toBe(4);
    expect(cameraAt(ramp(), 99).zoom).toBe(8);
  });

  it('picks the right segment when there are several', () => {
    const p: Project = {
      ...emptyProject(),
      duration: 10,
      camera: [
        { ...keyframe(0, [0, 0], 2), easing: 'linear' },
        { ...keyframe(2, [0, 0], 6), easing: 'linear' },
        { ...keyframe(6, [0, 0], 4), easing: 'linear' },
      ],
    };
    expect(cameraAt(p, 1).zoom).toBeCloseTo(4, 6);
    expect(cameraAt(p, 4).zoom).toBeCloseTo(5, 6);
  });
});

describe('cameraAt — the per-channel interpolators', () => {
  /*
   * The camera moved onto property tracks in M2. Equivalence with the previous
   * hand-rolled implementation was established by a differential run — 60 random
   * projects x 241 times each, over 14,000 pairs, exactly equal — which is not kept as a
   * test because it embeds a frozen copy of the old code that would block any intended
   * change to camera behaviour. These pin the properties instead.
   */
  const at = (a: Partial<CameraKeyframe>, b: Partial<CameraKeyframe>, t: number) =>
    cameraAt(
      {
        ...emptyProject(),
        duration: 10,
        camera: [
          { ...keyframe(0, [0, 0], 4), easing: 'linear', ...a },
          { ...keyframe(4, [0, 0], 4), easing: 'linear', ...b },
        ],
      },
      t,
    );

  it('crosses the antimeridian the short way', () => {
    // Tokyo to San Francisco is across the Pacific, not backwards over Eurasia. The
    // result deliberately runs past 180 — that is what keeps the move continuous.
    const c = at({ center: [170, 0] }, { center: [-170, 0] }, 2).center;
    expect(c[0]).toBeCloseTo(180, 6);
  });

  it('turns the short way round the compass', () => {
    const b = at({ bearing: 350 }, { bearing: 10 }, 2).bearing;
    expect(b).toBeCloseTo(360, 6);
  });

  it('pulls the zoom back mid-move and settles it again', () => {
    // `dip` is a modifier over the segment, not an authored value at either end.
    const withDip = at({ zoom: 6, dip: 2 }, { zoom: 6 }, 2).zoom;
    const without = at({ zoom: 6 }, { zoom: 6 }, 2).zoom;
    expect(without).toBeCloseTo(6, 6);
    expect(withDip).toBeCloseTo(4, 6);
    // Gone by each end.
    expect(at({ zoom: 6, dip: 2 }, { zoom: 6 }, 0).zoom).toBeCloseTo(6, 6);
    expect(at({ zoom: 6, dip: 2 }, { zoom: 6 }, 4).zoom).toBeCloseTo(6, 6);
  });

  it('peaks the dip in raw time, not eased time', () => {
    // It is an arc through the move; easing retimes the values, not the arc.
    const eased = at({ zoom: 6, dip: 2, easing: 'easeInOutCubic' }, { zoom: 6 }, 2).zoom;
    expect(eased).toBeCloseTo(4, 6);
  });

  it('never returns a negative zoom', () => {
    expect(at({ zoom: 1, dip: 5 }, { zoom: 1 }, 2).zoom).toBe(0);
  });

  it('hands back a centre the caller cannot use to corrupt the document', () => {
    /*
     * The channel tracks are cached per keyframe array, so a returned coordinate that
     * aliased the cache would let one frame's mutation change every later frame — and
     * the document with it.
     */
    const project: Project = {
      ...emptyProject(),
      camera: [{ ...keyframe(0, [10, 20], 4), easing: 'linear' }],
    };
    const got = cameraAt(project, 0);
    got.center[0] = 999;
    expect(cameraAt(project, 0).center[0]).toBe(10);
    expect(project.camera[0]!.center[0]).toBe(10);
  });
});
