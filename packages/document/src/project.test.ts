import { describe, expect, it } from 'vitest';
import type { Layer, RegionsLayer } from './types.ts';
import { createLayer, defaultTour, migrate } from './project.ts';
import { keyframe, shotsOf } from './camera.ts';
import { camerasOf, layersOf, liveCamera } from './nodes.ts';

/**
 * Behavioural spec for document construction and migration.
 *
 * ENGINEERING_GUIDE §3.7 makes migration a hard requirement: a document written by
 * an older build must open, with gaps filled rather than the file rejected. The
 * round-trip half of this contract is exercised against realistic fixtures in the
 * app, where the fixtures live.
 */

describe('migrate', () => {
  it('fills every default from a document holding only a layer stub', () => {
    // The shape an older build might have written.
    const p = migrate({ layers: [{ type: 'text', id: 'x', text: 'hi' }] });
    expect(p.fps).toBeGreaterThan(0);
    expect(p.duration).toBeGreaterThan(0);
    expect(p.width).toBeGreaterThan(0);
    expect(layersOf(p)).toHaveLength(1);
    const layer = layersOf(p)[0]!;
    expect(layer.type).toBe('text');
    expect(layer.id).toBe('x');
    expect(typeof layer.in).toBe('number');
    expect(typeof layer.visible).toBe('boolean');
  });

  it('never throws on junk input, returning a usable project', () => {
    for (const junk of [null, undefined, 0, 'nonsense', [], {}, { layers: null }, { camera: null }]) {
      const p = migrate(junk);
      expect(p.nodes).toBeTypeOf('object');
      expect(Array.isArray(layersOf(p))).toBe(true);
      expect(Array.isArray(camerasOf(p))).toBe(true);
      expect(p.fps).toBeGreaterThan(0);
    }
  });

  it('preserves values the document already sets', () => {
    const p = migrate({ name: 'Mine', fps: 24, duration: 99, layers: [], camera: [] });
    expect(p.name).toBe('Mine');
    expect(p.fps).toBe(24);
    expect(p.duration).toBe(99);
  });

  it('drops an audio block with nothing to play or mux', () => {
    expect(migrate({ audio: { cues: [] } }).audio).toBeUndefined();
    expect(migrate({ audio: { url: 'a.mp3' } }).audio).toBeUndefined();
  });

  it('keeps audio that has a playable URL', () => {
    expect(migrate({ audio: { url: 'a.mp3', cues: [] } }).audio).toEqual({ url: 'a.mp3', cues: [] });
  });

  it('keeps audio that has only a file, as the CLI renderer writes it', () => {
    // Requiring `url` used to delete this, so a project rendered on the command
    // line lost its narration the moment it was opened in the editor.
    const audio = { file: '/abs/voice.wav', cues: [{ t: 0, d: 1, text: 'hi' }] };
    expect(migrate({ audio }).audio).toEqual(audio);
  });

  it('keeps audio whose only asset is per-cue clips', () => {
    const audio = { cues: [{ id: 'c1', t: 0, d: 1, text: 'hi', file: '/abs/1.wav' }] };
    expect(migrate({ audio }).audio).toEqual(audio);
  });

  it('gives every cue an id, so it can be dragged and deleted', () => {
    const opened = migrate({ audio: { cues: [{ t: 0, d: 1, text: 'a', file: '/1.wav' }, { t: 2, d: 1, text: 'b', file: '/2.wav' }] } });
    const ids = opened.audio!.cues.map((c) => c.id);
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(2);
  });

  it('leaves an id a document already has', () => {
    const opened = migrate({ audio: { cues: [{ id: 'keep-me', t: 0, d: 1, text: 'a', file: '/1.wav' }] } });
    expect(opened.audio!.cues[0]!.id).toBe('keep-me');
  });

  it('fills camera keyframe defaults without discarding the authored values', () => {
    const p = migrate({ camera: [{ t: 3, center: [10, 20], zoom: 7 }] });
    const k = shotsOf(liveCamera(p)!)[0]!;
    expect(k.t).toBe(3);
    expect(k.center).toEqual([10, 20]);
    expect(k.zoom).toBe(7);
    expect(typeof k.easing).toBe('string');
    expect(typeof k.bearing).toBe('number');
  });

  it('fills the nested route marker and follow blocks', () => {
    // Nested objects are the easy place to lose defaults, since a shallow spread
    // over the layer would leave them undefined.
    const p = migrate({ layers: [{ type: 'route', id: 'r', points: [] }] });
    const route = layersOf(p)[0] as Extract<Layer, { type: 'route' }>;
    expect(route.marker).toBeTypeOf('object');
    expect(route.follow).toBeTypeOf('object');
    expect(typeof route.marker.size).toBe('number');
  });

  it('does not mutate the input it was handed', () => {
    const input = { layers: [{ type: 'text' as const, id: 'x' }], camera: [{ t: 0 }] };
    const before = JSON.stringify(input);
    migrate(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  describe('the pre-M9 flat tour', () => {
    /** A region layer as a document written before the tour was nested. */
    const legacy = () => ({
      type: 'regions' as const,
      id: 'r1',
      tour: true,
      order: 'valueAsc' as const,
      customOrder: ['Kerala'],
      dwell: 3.7,
      stopDurations: [1, 2, 3],
      moveTime: 1.4,
      driveCamera: false,
      padding: 0.31,
      maxZoom: 6,
      tourPitch: 42,
      countUp: false,
      sequenceReveal: false,
      cameraOvershoot: false,
      cameraBow: 0.8,
      dimOthers: 0.6,
      intro: 9,
      introTrace: false,
      outro: 11,
      labelAll: false,
      labelSize: 22,
      labelAt: 30,
    });

    const tourOf = (input: unknown) => (layersOf(migrate({ layers: [input] }))[0] as RegionsLayer).tour;

    it('lifts every flat field into the nested behaviour', () => {
      // A migration that silently resets someone's pacing to the defaults is data
      // loss that looks like a preference change.
      expect(tourOf(legacy())).toEqual({
        enabled: true,
        order: 'valueAsc',
        customOrder: ['Kerala'],
        dwell: 3.7,
        stopDurations: [1, 2, 3],
        moveTime: 1.4,
        driveCamera: false,
        padding: 0.31,
        maxZoom: 6,
        pitch: 42,
        overshoot: false,
        bow: 0.8,
        sequenceReveal: false,
        countUp: false,
        dimOthers: 0.6,
        intro: 9,
        introTrace: false,
        outro: 11,
        labelAll: false,
        labelSize: 22,
        labelAt: 30,
      });
    });

    it('carries the renamed fields across', () => {
      // tourPitch -> pitch, cameraOvershoot -> overshoot, cameraBow -> bow.
      const t = tourOf({ ...legacy(), tourPitch: 12, cameraOvershoot: true, cameraBow: 0.11 });
      expect(t.pitch).toBe(12);
      expect(t.overshoot).toBe(true);
      expect(t.bow).toBeCloseTo(0.11, 6);
    });

    it('reads the old boolean as the on/off switch', () => {
      expect(tourOf({ ...legacy(), tour: false }).enabled).toBe(false);
      expect(tourOf({ ...legacy(), tour: true }).enabled).toBe(true);
    });

    it('fills defaults for fields an old document never had', () => {
      const t = tourOf({ type: 'regions', id: 'r1', tour: true, dwell: 5 });
      expect(t.dwell).toBe(5);
      expect(t.order).toBe(defaultTour().order);
      expect(t.maxZoom).toBe(defaultTour().maxZoom);
    });

    it('leaves an already-nested tour alone, filling only what is missing', () => {
      const t = tourOf({ type: 'regions', id: 'r1', tour: { enabled: false, dwell: 8 } });
      expect(t.enabled).toBe(false);
      expect(t.dwell).toBe(8);
      expect(t.intro).toBe(defaultTour().intro);
    });

    it('distinguishes a false from a missing value', () => {
      // `driveCamera: false` must survive; `pick` has to test for undefined, not
      // falsiness, or every deliberate "off" silently reverts to the default.
      const t = tourOf({ type: 'regions', id: 'r1', tour: true, driveCamera: false, countUp: false, labelAt: 0 });
      expect(t.driveCamera).toBe(false);
      expect(t.countUp).toBe(false);
      expect(t.labelAt).toBe(0);
    });

    it('round-trips once migrated', () => {
      const once = migrate({ layers: [legacy()] });
      expect(migrate(JSON.parse(JSON.stringify(once)))).toEqual(once);
    });
  });

  it('is idempotent', () => {
    const once = migrate({ layers: [{ type: 'regions', id: 'g' }] });
    expect(migrate(once)).toEqual(once);
  });
});

describe('createLayer', () => {
  const TYPES = ['route', 'marker', 'text', 'shape', 'regions', 'clouds', 'image'] as const;

  it('produces a complete, serialisable layer for every type', () => {
    for (const type of TYPES) {
      const layer = createLayer(type, 2);
      expect(layer.type, type).toBe(type);
      expect(layer.id, type).toBeTruthy();
      expect(layer.in, type).toBe(2);
      expect(layer.out, type).toBeGreaterThan(layer.in);
      expect(() => JSON.parse(JSON.stringify(layer)), type).not.toThrow();
    }
  });

  it('gives every layer a distinct id', () => {
    const ids = Array.from({ length: 200 }, () => createLayer('text', 0).id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('applies overrides over the defaults', () => {
    const layer = createLayer('text', 0, { name: 'Title', out: 12 } as Partial<Layer>);
    expect(layer.name).toBe('Title');
    expect(layer.out).toBe(12);
  });

  it('starts every layer visible', () => {
    for (const type of TYPES) expect(createLayer(type, 0).visible, type).toBe(true);
  });
});

describe('keyframe', () => {
  it('carries the given time, centre and zoom', () => {
    const k = keyframe(4, [1, 2], 9);
    expect(k).toMatchObject({ t: 4, center: [1, 2], zoom: 9 });
  });

  it('defaults the cinematic fields so interpolation always has numbers', () => {
    const k = keyframe(0, [0, 0], 1);
    for (const field of ['bearing', 'pitch'] as const) {
      expect(Number.isFinite(k[field]), field).toBe(true);
    }
    expect(typeof k.easing).toBe('string');
  });

  it('accepts overrides', () => {
    expect(keyframe(0, [0, 0], 1, { bearing: 45, easing: 'easeIn' }).bearing).toBe(45);
  });
});

describe('migrate — a file with fields of the wrong type', () => {
  const load = (layer: Record<string, unknown>) =>
    layersOf(migrate({ version: 3, layers: [{ type: 'marker', in: 0, ...layer }], camera: [] } as never))[0] as unknown as Record<string, unknown>;
  /** The marker defaults, as a bag, so a test can name a field without narrowing. */
  const markerDefault = createLayer('marker', 0) as unknown as Record<string, unknown>;

  it('replaces a string field holding an object', () => {
    /*
     * The case that motivated this. `label` arriving as an object threw
     * `style.label.trim is not a function` inside the render loop — on every frame,
     * long after the try/catch around Open had returned successfully.
     */
    expect(load({ label: { text: 'Tokyo' } }).label).toBe(markerDefault.label);
  });

  it('replaces a number field holding a string', () => {
    expect(load({ size: '14' }).size).toEqual(markerDefault.size);
  });

  it('replaces a boolean field holding a number', () => {
    // `halo`, because the marker's booleans moved onto the behaviour stack in M10.
    expect(load({ halo: 1 }).halo).toBe(true);
  });

  it('rejects NaN and Infinity, which are typeof number and pass every other check', () => {
    // These propagate through the geometry into coordinates that simply never draw.
    expect(load({ size: NaN }).size).toEqual(markerDefault.size);
    expect(load({ size: Infinity }).size).toEqual(markerDefault.size);
  });

  it('keeps a correctly typed value, including a deliberate zero', () => {
    // A track now, so the deliberate zero has to survive inside it.
    expect(load({ size: 0 }).size).toEqual({ kind: 'static', value: 0 });
    expect(load({ label: 'Tokyo' }).label).toBe('Tokyo');
    expect(load({ halo: false }).halo).toBe(false);
  });

  it('replaces an array field holding something else', () => {
    const route = layersOf(migrate({
      version: 3, layers: [{ type: 'route', in: 0, coords: 'not an array' }], camera: [],
    } as never))[0] as unknown as Record<string, unknown>;
    expect(Array.isArray(route.coords)).toBe(true);
  });

  it('leaves the contents of an array alone', () => {
    // `coords` and `values` are user data; validating their elements belongs where
    // they are read, not here — and a coordinate list is too hot a path to walk twice.
    const route = layersOf(migrate({
      version: 3, layers: [{ type: 'route', in: 0, coords: [[1, 2], [3, 4]] }], camera: [],
    } as never))[0] as { coords: unknown };
    expect(route.coords).toEqual([[1, 2], [3, 4]]);
  });

  it('repairs a nested object without discarding its good fields', () => {
    const route = layersOf(migrate({
      version: 3,
      layers: [{ type: 'route', in: 0, marker: { enabled: 'yes', size: 20 } }],
      camera: [],
    } as never))[0] as { marker: Record<string, unknown> };
    expect(route.marker.enabled).toBe(true); // the default, not the string
    expect(route.marker.size).toBe(20); // kept
  });

  it('keeps a null-defaulted field, which has no type to check against', () => {
    // `flipRamp` is `boolean | null`, where null means "follow the basemap".
    const regions = (v: unknown) =>
      (layersOf(migrate({ version: 3, layers: [{ type: 'regions', in: 0, flipRamp: v }], camera: [] } as never))[0] as unknown as Record<string, unknown>).flipRamp;
    expect(regions(true)).toBe(true);
    expect(regions(null)).toBe(null);
  });

  it('still fills in a field that is simply missing', () => {
    expect(load({}).label).toBe(markerDefault.label);
    expect(load({}).size).toEqual(markerDefault.size);
  });
});
