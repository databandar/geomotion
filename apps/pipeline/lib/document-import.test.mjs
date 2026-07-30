import { describe, expect, it } from 'vitest';

/**
 * The document package has to be importable from plain node.
 *
 * `apps/pipeline` is `.mjs` and `apps/render-cli` will be too, and the packages
 * ship raw `.ts` that node strips types from without transforming code. That works
 * for ordinary type annotations and not for syntax that has to be *compiled* — a
 * constructor parameter property is the trap, and it made the whole package
 * unimportable from here with an error that names neither the file nor the feature
 * clearly.
 *
 * A typecheck cannot catch this; only actually importing it can.
 */

describe('@geomotion/document from plain node', () => {
  it('imports', async () => {
    await expect(import('@geomotion/document')).resolves.toBeDefined();
  });

  it('exposes the pieces the renderer needs', async () => {
    const doc = await import('@geomotion/document');
    for (const name of ['planAudio', 'isRetimable', 'migrate', 'createLayer', 'defaultTour', 'transact']) {
      expect(typeof doc[name], name).toBe('function');
    }
  });

  it('planAudio works across the boundary', async () => {
    const { planAudio } = await import('@geomotion/document');
    const project = {
      duration: 30,
      audio: { url: '/v/t.wav', file: '/abs/t.wav', cues: [{ id: 'c1', t: 3, d: 2, text: 'hi', file: '/v/1.wav' }] },
    };
    expect(planAudio(project)).toEqual({
      kind: 'remix',
      clips: [{ source: '/v/1.wav', start: 3 }],
      duration: 30,
    });
  });

  it('constructs a History, which is where the parameter-property trap was', async () => {
    const { History } = await import('@geomotion/document');
    const h = new History(() => 1000);
    expect(h.canUndo).toBe(false);
  });
});
