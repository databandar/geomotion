import { describe, expect, it } from 'vitest';
import { conditionHolds, propsOf, valueAtPath } from './index.ts';
import { createLayer } from '../project.ts';

/**
 * The row language's conditional (docs/features/generated-panels.md).
 *
 * A hand-written panel said `{layer.border && <Field …>}` and that was the whole of it. The
 * generated equivalent has to be **data**, because §15 sends a plugin's node-type
 * contribution across a worker boundary and a function does not survive structured cloning.
 * These tests pin what the data means, so the inspector and a future plugin host cannot
 * disagree about it.
 */

describe('valueAtPath', () => {
  it('reads a leaf', () => {
    expect(valueAtPath({ border: true }, 'border')).toBe(true);
  });

  it('reads through a dotted path, which is how a row depends on a track s kind', () => {
    expect(valueAtPath({ clear: { kind: 'keyframed' } }, 'clear.kind')).toBe('keyframed');
  });

  it('is undefined for a path that runs off the end rather than throwing', () => {
    // A row whose condition names a property that was renamed must hide, not crash the panel.
    expect(valueAtPath({ clear: 3 }, 'clear.kind.deeper')).toBeUndefined();
    expect(valueAtPath({}, 'nothing.here')).toBeUndefined();
    expect(valueAtPath(null, 'anything')).toBeUndefined();
  });
});

describe('conditionHolds', () => {
  it('draws the row when there is no condition at all', () => {
    expect(conditionHolds({}, undefined)).toBe(true);
  });

  it('defaults to "is true", which is what a toggle gating a row means', () => {
    expect(conditionHolds({ border: true }, { prop: 'border' })).toBe(true);
    expect(conditionHolds({ border: false }, { prop: 'border' })).toBe(false);
  });

  it('compares with equals', () => {
    expect(conditionHolds({ anchor: 'center' }, { prop: 'anchor', equals: 'center' })).toBe(true);
    expect(conditionHolds({ anchor: 'topLeft' }, { prop: 'anchor', equals: 'center' })).toBe(false);
  });

  it('compares with not, so a row can depend on a track being animated at all', () => {
    expect(conditionHolds({ clear: { kind: 'keyframed' } }, { prop: 'clear.kind', not: 'static' })).toBe(true);
    expect(conditionHolds({ clear: { kind: 'static' } }, { prop: 'clear.kind', not: 'static' })).toBe(false);
  });

  it('treats equals: false as a real comparison, not as absent', () => {
    // The bug this guards: `when.equals ?? true` would turn an explicit `false` into `true`.
    expect(conditionHolds({ shadow: false }, { prop: 'shadow', equals: false })).toBe(true);
    expect(conditionHolds({ shadow: true }, { prop: 'shadow', equals: false })).toBe(false);
  });

  it('hides a row whose condition names a property the node does not have', () => {
    expect(conditionHolds({}, { prop: 'gone' })).toBe(false);
  });
});

describe('the conditions the shipped layers declare', () => {
  it('image shows its border colour only while the border is on', () => {
    const meta = propsOf('image').find((m) => m.prop === 'borderColor');
    expect(meta?.when, 'borderColor should be conditional').toBeDefined();

    // A fresh image ships with the border on, so the colour is there to be edited.
    const fresh = createLayer('image', 0);
    expect(fresh).toHaveProperty('border', true);
    expect(conditionHolds(fresh, meta!.when)).toBe(true);
    expect(conditionHolds({ ...fresh, border: false }, meta!.when)).toBe(false);
  });
});
