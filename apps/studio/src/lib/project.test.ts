import { beforeEach, describe, expect, it } from 'vitest';
import type { Layer, Project } from '../types';
import {
  createLayer,
  demoProject,
  emptyProject,
  indiaTourProject,
  keyframe,
  loadLocal,
  migrate,
  saveLocal,
} from './project';

/**
 * Behavioural spec for the document model and its persistence.
 *
 * ENGINEERING_GUIDE §3.7 makes save/load round-tripping a mandatory test for
 * every document change: a project written by one build must open unchanged in
 * the next, and `migrate` must fill gaps rather than reject the file. A field
 * that only exists in memory — never serialised — is a data-loss bug, and the
 * round-trip assertions below are what catch it.
 *
 * Bound for `packages/document` (ARCHITECTURE §04).
 */

/** Minimal in-memory localStorage so persistence is testable under node. */
function stubStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

const FIXTURES: [string, () => Project][] = [
  ['empty', emptyProject],
  ['demo', demoProject],
  ['india tour', indiaTourProject],
];

describe('save/load round trip', () => {
  for (const [name, make] of FIXTURES) {
    it(`${name} survives serialise -> parse -> migrate unchanged`, () => {
      const original = make();
      const reopened = migrate(JSON.parse(JSON.stringify(original)));
      // Any difference here means a field is either not serialisable or silently
      // rewritten on open — both are data loss from the user's point of view.
      expect(reopened).toEqual(original);
    });

    it(`${name} contains no undefined values, which vanish through JSON`, () => {
      const seen: string[] = [];
      (function walk(value: unknown, path: string) {
        if (value === undefined) seen.push(path);
        else if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`));
        else if (value && typeof value === 'object') {
          for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
        }
      })(make(), name);
      expect(seen).toEqual([]);
    });

    it(`${name} is stable across a second round trip`, () => {
      const once = migrate(JSON.parse(JSON.stringify(make())));
      const twice = migrate(JSON.parse(JSON.stringify(once)));
      expect(twice).toEqual(once);
    });
  }
});

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

describe('localStorage persistence', () => {
  beforeEach(() => {
    globalThis.localStorage = stubStorage();
  });

  it('round trips a project through storage', () => {
    const project = demoProject();
    saveLocal(project);
    expect(loadLocal()).toEqual(project);
  });

  it('returns null when nothing is stored', () => {
    expect(loadLocal()).toBeNull();
  });

  it('returns null rather than throwing on corrupt stored data', () => {
    localStorage.setItem('geomotion:project', '{not json');
    expect(loadLocal()).toBeNull();
  });

  it('migrates stored documents on the way out', () => {
    localStorage.setItem('geomotion:project', JSON.stringify({ layers: [{ type: 'text', id: 'x' }] }));
    const loaded = loadLocal()!;
    expect(loaded.fps).toBeGreaterThan(0);
    expect(loaded.layers[0].visible).toBe(true);
  });

  it('survives a storage quota failure without throwing', () => {
    globalThis.localStorage = {
      ...stubStorage(),
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    } as Storage;
    expect(() => saveLocal(demoProject())).not.toThrow();
  });
});
