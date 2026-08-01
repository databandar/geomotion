import { beforeEach, describe, expect, it } from 'vitest';
import type { Project } from '@geomotion/document';
import { createLayer, emptyProject, layersOf, migrate, projectWith } from '@geomotion/document';
import type { MarkerLayer } from '@geomotion/document';
import { demoProject, globeGdpTourProject, globeTourProject, indiaTourProject, paintedWorldProject, routeStoryProject, worldTourProject } from './fixtures';
import { loadLocal, saveLocal } from './persistence';

/**
 * Serialisation round-trip and browser persistence.
 *
 * This lives in the app because it tests the two things the document package is
 * forbidden to own: the bundled example fixtures, and localStorage. The property
 * being defended is still a document-model one (§3.7) — a field that exists only
 * in memory and never survives a save is data loss from the user's point of view,
 * and only a round-trip over a realistic document catches it.
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
  ['world tour', worldTourProject],
  ['globe tour', globeTourProject],
  ['gdp globe', globeGdpTourProject],
  ['painted world', paintedWorldProject],
  ['routes story', routeStoryProject],
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

  it('an expression track survives the round trip with its inputs intact', () => {
    /*
     * `expr` is the one track kind whose payload is free text, so it is the one a
     * migration could most easily mangle — and the fixtures carry none, because none of
     * the bundled projects use one yet.
     */
    const marker = createLayer('marker', 0) as MarkerLayer;
    marker.size = { kind: 'expr', source: '8 + 2 * sin(t * 3)', inputs: { pop: 'geo:in-wb.population' } };
    const project = projectWith([marker]);

    const reopened = migrate(JSON.parse(JSON.stringify(project)));
    expect(reopened).toEqual(project);
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
    expect(layersOf(loaded)[0]!.visible).toBe(true);
  });

  it('reports a storage failure rather than throwing or staying quiet', () => {
    // Reachable in ordinary use now that audio is embedded in the document, and a
    // project that silently stopped autosaving is worse than one that says so.
    globalThis.localStorage = {
      ...stubStorage(),
      setItem: () => {
        throw new Error('nope');
      },
    } as Storage;
    const result = saveLocal(demoProject());
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toMatch(/Save/);
  });

  it('names embedded audio when the quota is what refused it', () => {
    globalThis.localStorage = {
      ...stubStorage(),
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError');
      },
    } as Storage;
    const result = saveLocal(demoProject());
    expect(!result.ok && result.reason).toMatch(/audio/);
  });

  it('reports success on a normal save', () => {
    expect(saveLocal(demoProject())).toEqual({ ok: true });
  });
});
