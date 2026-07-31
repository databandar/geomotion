import { describe, expect, it } from 'vitest';
import {
  hasKeyAt,
  keyframedTrack,
  staticTrack,
  toKeyframed,
  withValueAt,
  withoutKeyAt,
  type Keyframe,
  type Track,
} from './track.ts';

/** Editing a track is what the inspector does on every pointer move; it has to be exact. */
let n = 0;
const key = (t: number, value: number): Keyframe<number> => ({
  id: `k${n++}`, t, value, easing: 'linear',
});
const keys = (t: Track<number>) => (t.kind === 'keyframed' ? t.keys.map((k) => [k.t, k.value]) : null);

describe('withValueAt', () => {
  it('changes a static track in place rather than starting to animate it', () => {
    // A control must not silently make a property animated because the playhead moved.
    // Becoming animated is a deliberate act — see toKeyframed.
    expect(withValueAt(staticTrack(5), 3, 9, 'linear')).toEqual({ kind: 'static', value: 9 });
  });

  it('replaces the key already at that instant', () => {
    const t = withValueAt(keyframedTrack([key(0, 1), key(2, 5)]), 2, 99, 'linear');
    expect(keys(t)).toEqual([[0, 1], [2, 99]]);
  });

  it('adds a key where there is none', () => {
    const t = withValueAt(keyframedTrack([key(0, 1), key(4, 5)]), 2, 3, 'linear');
    expect(keys(t)).toEqual([[0, 1], [2, 3], [4, 5]]);
  });

  it('treats a playhead a hair off an existing key as that key', () => {
    /*
     * The tolerance exists for dragging. The playhead is a float, so without it a slider
     * at 2.0000001s would lay a new key beside the one at 2s on every pointer move —
     * hundreds a second, none removable by clicking where they appear to be.
     */
    const t = withValueAt(keyframedTrack([key(2, 5)]), 2 + 1 / 500, 7, 'linear');
    expect(keys(t)).toEqual([[2, 7]]);
  });

  it('keeps a genuinely separate key a frame away', () => {
    const t = withValueAt(keyframedTrack([key(2, 5)]), 2 + 1 / 30, 7, 'linear');
    expect(keys(t)).toHaveLength(2);
  });

  it('keeps keys in time order however they arrive', () => {
    const t = withValueAt(keyframedTrack([key(4, 1)]), 1, 2, 'linear');
    expect(keys(t)).toEqual([[1, 2], [4, 1]]);
  });

  it('does not mutate the track it was given', () => {
    // Immer drafts aside, a pure editor that mutated would corrupt the undo history.
    const before = keyframedTrack([key(0, 1)]);
    const snapshot = JSON.stringify(before);
    withValueAt(before, 5, 9, 'linear');
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('toKeyframed', () => {
  it('seeds one key with what the property already shows', () => {
    // Switching to animated must change nothing on screen; a jump reads as a bug.
    const t = toKeyframed(staticTrack(12), 3, 12, 'linear');
    expect(keys(t)).toEqual([[3, 12]]);
  });

  it('leaves an already-keyframed track alone', () => {
    const before = keyframedTrack([key(0, 1), key(2, 2)]);
    expect(toKeyframed(before, 5, 99, 'linear')).toBe(before);
  });
});

describe('withoutKeyAt', () => {
  it('removes the key at that instant', () => {
    const t = withoutKeyAt(keyframedTrack([key(0, 1), key(2, 5), key(4, 9)]), 2);
    expect(keys(t)).toEqual([[0, 1], [4, 9]]);
  });

  it('does nothing where there is no key', () => {
    const before = keyframedTrack([key(0, 1)]);
    expect(withoutKeyAt(before, 3)).toBe(before);
  });

  it('falls back to static when the last key goes, holding that value', () => {
    // An empty keyframed track evaluates to nothing. Falling back to the value the user
    // was looking at as they deleted it keeps every property readable.
    expect(withoutKeyAt(keyframedTrack([key(2, 7)]), 2)).toEqual({ kind: 'static', value: 7 });
  });
});

describe('hasKeyAt', () => {
  it('is true only on a keyframed track at a key', () => {
    const t = keyframedTrack([key(2, 5)]);
    expect(hasKeyAt(t, 2)).toBe(true);
    expect(hasKeyAt(t, 3)).toBe(false);
    expect(hasKeyAt(staticTrack(5), 2)).toBe(false);
  });
});
