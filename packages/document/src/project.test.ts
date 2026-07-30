import { describe, expect, it } from 'vitest';
import type { Layer } from './types.ts';
import { createLayer, keyframe, migrate } from './project.ts';

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
    expect(p.layers).toHaveLength(1);
    const layer = p.layers[0];
    expect(layer.type).toBe('text');
    expect(layer.id).toBe('x');
    expect(typeof layer.in).toBe('number');
    expect(typeof layer.visible).toBe('boolean');
  });

  it('never throws on junk input, returning a usable project', () => {
    for (const junk of [null, undefined, 0, 'nonsense', [], {}, { layers: null }, { camera: null }]) {
      const p = migrate(junk);
      expect(Array.isArray(p.layers)).toBe(true);
      expect(Array.isArray(p.camera)).toBe(true);
      expect(p.fps).toBeGreaterThan(0);
    }
  });

  it('preserves values the document already sets', () => {
    const p = migrate({ name: 'Mine', fps: 24, duration: 99, layers: [], camera: [] });
    expect(p.name).toBe('Mine');
    expect(p.fps).toBe(24);
    expect(p.duration).toBe(99);
  });

  it('drops a malformed audio block instead of shipping a broken track', () => {
    expect(migrate({ audio: { cues: [] } }).audio).toBeUndefined();
    expect(migrate({ audio: { url: 'a.mp3' } }).audio).toBeUndefined();
    expect(migrate({ audio: { url: 'a.mp3', cues: [] } }).audio).toEqual({ url: 'a.mp3', cues: [] });
  });

  it('fills camera keyframe defaults without discarding the authored values', () => {
    const p = migrate({ camera: [{ t: 3, center: [10, 20], zoom: 7 }] });
    expect(p.camera[0].t).toBe(3);
    expect(p.camera[0].center).toEqual([10, 20]);
    expect(p.camera[0].zoom).toBe(7);
    expect(typeof p.camera[0].easing).toBe('string');
    expect(typeof p.camera[0].bearing).toBe('number');
  });

  it('fills the nested route marker and follow blocks', () => {
    // Nested objects are the easy place to lose defaults, since a shallow spread
    // over the layer would leave them undefined.
    const p = migrate({ layers: [{ type: 'route', id: 'r', points: [] }] });
    const route = p.layers[0] as Extract<Layer, { type: 'route' }>;
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
