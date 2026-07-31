import { describe, expect, it } from 'vitest';
import { cameraFromShots, createCamera, keyframe, patchShot, removeShot, shotAt, shotsOf, upsertShot } from './camera.ts';
import type { CameraNode } from './types.ts';

/**
 * Behavioural spec for the camera node (docs/features/camera-node.md, ARCHITECTURE §04).
 *
 * The editor speaks of *shots* — one row carrying all four channels, easing and arc
 * together — while the document stores per-channel tracks. The two must round-trip: a
 * row an author wrote has to come back with the same four values, same easing, same id,
 * and a shot re-aimed at the playhead has to replace, not stack.
 */

const SHOT = () => keyframe(2, [10, 20], 6, { bearing: 45, pitch: 30, easing: 'easeIn' });

function zoomKeys(camera: CameraNode) {
  const t = camera.tracks.zoom;
  return t.kind === 'keyframed' ? t.keys : [];
}

describe('cameraFromShots / shotsOf', () => {
  it('round-trips every channel of a shot', () => {
    const camera = cameraFromShots([SHOT()]);
    const [back] = shotsOf(camera);
    expect(back).toMatchObject({ t: 2, center: [10, 20], zoom: 6, bearing: 45, pitch: 30, easing: 'easeIn' });
  });

  it('shares one id across the channels, so shots group back into rows', () => {
    const shot = SHOT();
    const camera = cameraFromShots([shot]);
    const t = camera.tracks;
    expect(t.center.kind === 'keyframed' && t.center.keys[0]?.id).toBe(shot.id);
    expect(t.zoom.kind === 'keyframed' && t.zoom.keys[0]?.id).toBe(shot.id);
    expect(t.bearing.kind === 'keyframed' && t.bearing.keys[0]?.id).toBe(shot.id);
  });

  it('sorts rows by time on the way in', () => {
    const camera = cameraFromShots([keyframe(5, [0, 0], 1), keyframe(1, [0, 0], 1), keyframe(3, [0, 0], 1)]);
    expect(shotsOf(camera).map((s) => s.t)).toEqual([1, 3, 5]);
  });

  it('rides the arc on the zoom key, omitted when zero', () => {
    const arced = cameraFromShots([keyframe(0, [0, 0], 8, { dip: 0.4 })]);
    expect(zoomKeys(arced)[0]?.dip).toBe(0.4);
    const plain = cameraFromShots([keyframe(0, [0, 0], 8)]);
    expect(zoomKeys(plain)[0]).not.toHaveProperty('dip');
  });

  it('a node with no keyframed centre channel has no shots', () => {
    const camera = createCamera();
    camera.tracks.center = { kind: 'static', value: [0, 0] };
    expect(shotsOf(camera)).toEqual([]);
  });
});

describe('upsertShot', () => {
  it('inserts a new shot in time order', () => {
    const camera = cameraFromShots([keyframe(0, [0, 0], 1)]);
    upsertShot(camera, keyframe(5, [1, 1], 2));
    expect(shotsOf(camera).map((s) => s.t)).toEqual([0, 5]);
  });

  it('replaces the shot already at the time, keeping its id and time', () => {
    const camera = cameraFromShots([keyframe(0, [0, 0], 1)]);
    const first = shotsOf(camera)[0]!;
    upsertShot(camera, keyframe(0.01, [9, 9], 4));
    const out = shotsOf(camera)[0]!;
    expect(shotsOf(camera)).toHaveLength(1);
    expect(out.id).toBe(first.id);
    expect(out.t).toBe(first.t);
    expect(out.zoom).toBe(4);
    expect(out.center).toEqual([9, 9]);
  });
});

describe('patchShot', () => {
  it('edits one field across its channel', () => {
    const shot = SHOT();
    const camera = cameraFromShots([shot]);
    patchShot(camera, shot.id, { zoom: 9 });
    expect(shotsOf(camera)[0]?.zoom).toBe(9);
    expect(shotsOf(camera)[0]?.bearing).toBe(45);
  });

  it('moves the key to a new time, resorting every channel', () => {
    const camera = cameraFromShots([keyframe(0, [0, 0], 1), keyframe(2, [1, 1], 2)]);
    const other = shotsOf(camera)[1]!;
    patchShot(camera, other.id, { t: -1 });
    expect(shotsOf(camera).map((s) => s.t)).toEqual([-1, 0]);
  });

  it('removes the arc when it is set to zero, so files stay canonical', () => {
    const camera = cameraFromShots([keyframe(0, [0, 0], 8, { dip: 0.4 })]);
    patchShot(camera, shotsOf(camera)[0]!.id, { dip: 0 });
    expect(zoomKeys(camera)[0]).not.toHaveProperty('dip');
    expect(shotsOf(camera)[0]?.dip).toBe(0);
  });

  it('sets the easing on every channel at once', () => {
    const shot = SHOT();
    const camera = cameraFromShots([shot]);
    patchShot(camera, shot.id, { easing: 'linear' });
    const t = camera.tracks;
    for (const c of [t.center, t.zoom, t.bearing, t.pitch] as const) {
      if (c.kind === 'keyframed') expect(c.keys[0]?.easing).toBe('linear');
    }
  });
});

describe('removeShot / shotAt', () => {
  it('removes the shot from every channel', () => {
    const camera = cameraFromShots([keyframe(0, [0, 0], 1), keyframe(2, [1, 1], 2)]);
    const gone = shotsOf(camera)[1]!;
    removeShot(camera, gone.id);
    expect(shotsOf(camera)).toHaveLength(1);
    expect(shotAt(camera, gone.id)).toBeUndefined();
    expect(zoomKeys(camera).map((k) => k.id)).not.toContain(gone.id);
  });

  it('shotAt looks a shot up by id', () => {
    const shot = SHOT();
    const camera = cameraFromShots([shot]);
    expect(shotAt(camera, shot.id)).toMatchObject({ zoom: 6 });
    expect(shotAt(camera, 'missing')).toBeUndefined();
  });
});

describe('keyframe / createCamera', () => {
  it('defaults the cinematic fields so interpolation always has numbers', () => {
    const k = keyframe(0, [0, 0], 1);
    expect(k.bearing).toBe(0);
    expect(k.pitch).toBe(0);
    expect(k.dip).toBe(0);
    expect(typeof k.easing).toBe('string');
  });

  it('createCamera yields one establishing shot', () => {
    const camera = createCamera();
    expect(shotsOf(camera)).toHaveLength(1);
    expect(shotsOf(camera)[0]?.zoom).toBe(1.8);
  });
});
