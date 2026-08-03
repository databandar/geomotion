import { describe, expect, it } from 'vitest';
import { checkProjectDocument } from './document-lint.ts';
import { migrate } from '@geomotion/document';
import type { Project } from '@geomotion/document';

/**
 * Both defects here render *successfully* and wrongly. Neither throws, neither logs,
 * and both were found by a person staring at a finished file — which is the argument
 * for a check rather than a rule in a document somewhere.
 */
const project = (layers: Record<string, unknown>[], duration = 10): Project =>
  migrate({ version: 3, duration, layers, camera: [] } as never);

const layer = (over: Record<string, unknown> = {}) => ({
  type: 'text',
  name: 'Title',
  in: 0,
  out: 10,
  fade: 0.5,
  visible: true,
  text: 'hello',
  ...over,
});

describe('checkProjectDocument — unknown ramp', () => {
  it('flags a ramp id nothing registers, and says what will actually be drawn', () => {
    const f = checkProjectDocument(project([{ type: 'regions', name: 'States', in: 0, out: 20, fade: 0, ramp: 'terracotta-typo' }]));
    const hit = f.find((x) => x.kind === 'unknown-ramp');
    expect(hit).toBeTruthy();
    expect(hit!.detail).toMatch(/not registered/);
    expect(hit!.detail).toMatch(/silently use/);
  });

  it('accepts a sequential ramp', () => {
    const f = checkProjectDocument(project([{ type: 'regions', name: 'S', in: 0, out: 20, fade: 0, ramp: 'ember' }]));
    expect(f.filter((x) => x.kind === 'unknown-ramp')).toEqual([]);
  });

  it('accepts a diverging ramp — it lives in a second registry, not in RAMPS', () => {
    const f = checkProjectDocument(project([{ type: 'regions', name: 'S', in: 0, out: 20, fade: 0, ramp: 'neon-divergent' }]));
    expect(f.filter((x) => x.kind === 'unknown-ramp')).toEqual([]);
  });
});

describe('checkProjectDocument — fades at the end', () => {
  it('flags a layer whose out is exactly the duration', () => {
    // The documented footgun: `out: DUR` reads as "ends here" and renders as a dissolve.
    const f = checkProjectDocument(project([layer({ out: 10, fade: 0.5 })], 10));
    expect(f.map((x) => x.kind)).toContain('fades-at-end');
  });

  it('is silent when the layer is pushed past the visible timeline', () => {
    const f = checkProjectDocument(project([layer({ out: 11.5, fade: 0.5 })], 10));
    expect(f.filter((x) => x.kind === 'fades-at-end')).toEqual([]);
  });

  it('does not flag a layer that ends mid-piece on purpose', () => {
    // Otherwise every beat's own title is a finding and the check gets ignored.
    const f = checkProjectDocument(project([layer({ out: 4, fade: 0.5 })], 10));
    expect(f.filter((x) => x.kind === 'fades-at-end')).toEqual([]);
  });

  it('flags a layer ending just inside its own fade of the end', () => {
    const f = checkProjectDocument(project([layer({ out: 9.8, fade: 0.5 })], 10));
    expect(f.map((x) => x.kind)).toContain('fades-at-end');
  });

  it('ignores a layer with no fade — a hard cut is already a hard cut', () => {
    const f = checkProjectDocument(project([layer({ out: 10, fade: 0 })], 10));
    expect(f.filter((x) => x.kind === 'fades-at-end')).toEqual([]);
  });

  it('ignores a hidden layer', () => {
    const f = checkProjectDocument(project([layer({ out: 10, fade: 0.5, visible: false })], 10));
    expect(f.filter((x) => x.kind === 'fades-at-end')).toEqual([]);
  });
});
