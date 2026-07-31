import { beforeEach, describe, expect, it } from 'vitest';
import { camerasOf, emptyProject, layersOf, liveCamera, shotsOf, type MarkerLayer } from '@geomotion/document';
import { useStore } from './store';

/**
 * The store's wiring.
 *
 * `History` and `transact` are covered in the document package; what is not covered is
 * how the store composes them — which edits coalesce into one undo step, what happens
 * to the selection and the playhead when history moves under them, and whether an edit
 * that changes nothing still costs a step. Those are the joins, and they are where a
 * document editor's undo goes subtly wrong: not by losing data, but by needing three
 * undos to reverse one drag.
 *
 * `.tsx` on purpose — the node project has no `window`, and the store reaches
 * localStorage for autosave.
 */

const s = () => useStore.getState();
const layers = () => layersOf(s().project);
const first = () => layers()[0] as MarkerLayer;

beforeEach(() => {
  useStore.setState({ historyRev: 0, structureRev: 0 });
  s().replaceProject(emptyProject());
});

describe('patch', () => {
  it('does not spend an undo step on a recipe that changed nothing', () => {
    // A recipe that bails (`if (i < 0) return`) would otherwise leave an empty step,
    // and the first undo would appear to do nothing at all.
    s().addLayer('marker');
    const before = s().historyRev;
    s().updateLayer('no-such-layer', { name: 'x' } as never);
    expect(s().historyRev).toBe(before);
  });

  it('does not spend a step on writing a field its current value', () => {
    s().addLayer('marker');
    const id = first().id;
    const before = s().historyRev;
    s().updateLayer(id, { name: first().name } as never);
    expect(s().historyRev).toBe(before);
  });
});

describe('undo and redo', () => {
  it('reverses an edit and puts it back', () => {
    s().addLayer('marker');
    const id = first().id;
    s().updateLayer(id, { name: 'Tokyo' } as never);
    expect(first().name).toBe('Tokyo');

    s().undo();
    expect(first().name).not.toBe('Tokyo');
    s().redo();
    expect(first().name).toBe('Tokyo');
  });

  it('stops at the ends of the stack instead of throwing', () => {
    // Loading a document is itself an undoable step, so this walks off both ends
    // rather than assuming an empty stack.
    for (let i = 0; i < 10; i++) s().undo();
    const bottom = s().project;
    s().undo();
    expect(s().project).toEqual(bottom);

    for (let i = 0; i < 20; i++) s().redo();
    const top = s().project;
    s().redo();
    expect(s().project).toEqual(top);
  });

  it('drops the redo stack once a new edit is made', () => {
    // The standard rule. Keeping it would let redo graft an old change onto a document
    // that has since diverged.
    s().addLayer('marker');
    const id = first().id;
    s().updateLayer(id, { name: 'A' } as never);
    s().undo();
    s().updateLayer(first().id, { name: 'B' } as never);
    s().redo();
    expect(first().name).toBe('B');
  });
});

describe('coalescing', () => {
  it('folds a drag into one undo step', () => {
    /*
     * The point of `historyKey`. A slider fires on every pointer move, so without this
     * a one-second drag costs sixty undos and reversing it means holding the shortcut
     * down. The key is scoped per layer, so the same control on two layers stays two
     * steps.
     */
    s().addLayer('marker');
    const id = first().id;
    s().updateLayer(id, { size: 10 } as never);
    const after = s().historyRev;

    for (let v = 11; v <= 40; v++) s().updateLayer(id, { size: v } as never, 'size');
    expect(first().size).toBe(40);

    s().undo();
    expect(first().size).toBe(10);
    // One step back from where the drag started.
    expect(s().historyRev).toBeGreaterThan(after);
  });

  it('keeps the same control on two layers as two steps', () => {
    s().addLayer('marker');
    s().addLayer('marker');
    const [a, b] = layers().map((l) => l.id);
    s().updateLayer(a!, { size: 20 } as never, 'size');
    s().updateLayer(b!, { size: 30 } as never, 'size');

    s().undo();
    expect((layers().find((l) => l.id === b) as MarkerLayer).size).not.toBe(30);
    expect((layers().find((l) => l.id === a) as MarkerLayer).size).toBe(20);
  });

  it('separates two different controls on one layer', () => {
    s().addLayer('marker');
    const id = first().id;
    s().updateLayer(id, { size: 25 } as never, 'size');
    s().updateLayer(id, { halo: false } as never, 'halo');
    s().undo();
    // Back to the default, which is on — the size edit is a separate step and stands.
    expect(first().halo).toBe(true);
    expect(first().size).toBe(25);
  });
});

describe('what history does to the rest of the editor', () => {
  it('leaves the playhead inside the composition', () => {
    // Undoing a load can restore a shorter project; without the clamp the transport
    // reads something like 01:38 / 00:15.
    const long = { ...emptyProject(), duration: 120 };
    s().replaceProject(long);
    s().scrub(100);
    s().undo();
    expect(s().time).toBeLessThanOrEqual(s().project.duration);
  });

  it('clears the selection when the selected layer is deleted', () => {
    s().addLayer('marker');
    const id = first().id;
    s().select({ kind: 'layer', id });
    s().removeLayer(id);
    expect(s().selection).toBeNull();
  });

  it('keeps the selection when undo removes the layer, so redo restores both', () => {
    /*
     * Deliberately *not* symmetric with deletion. A dangling selection is harmless —
     * the inspector reads "Nothing selected", and an edit addressed to a missing layer
     * is a no-op that costs no history — while clearing it would mean redoing an add
     * left you with the layer back and nothing selected. Verified rather than assumed:
     * the inspector was rendered in this state and did not throw.
     */
    s().addLayer('marker');
    const id = first().id;
    s().select({ kind: 'layer', id });
    s().undo();
    expect(layers()).toHaveLength(0);
    expect(s().selection).toEqual({ kind: 'layer', id });

    s().redo();
    expect(layers()).toHaveLength(1);
    expect(s().selection).toEqual({ kind: 'layer', id });
  });

  it('an edit addressed to a layer undo removed changes nothing', () => {
    s().addLayer('marker');
    const id = first().id;
    s().undo();
    const before = s().historyRev;
    s().updateLayer(id, { name: 'ghost' } as never);
    expect(s().historyRev).toBe(before);
    s().redo();
    expect(first().name).not.toBe('ghost');
  });
});

describe('expression tracks', () => {
  it('switches to an expression seeded with the value on screen, and back', () => {
    // The same rule the static/keyframed toggle follows: changing kinds never moves
    // the picture, so toggling is safe to try.
    s().addLayer('marker');
    const id = first().id;
    s().setLayerTrack(id, 'size', 12);
    s().toggleLayerExpr(id, 'size', 12);
    expect(first().size).toEqual({ kind: 'expr', source: '12' });

    s().toggleLayerExpr(id, 'size', 12);
    expect(first().size).toEqual({ kind: 'static', value: 12 });
  });

  it('folds a typing session into one undo step', () => {
    // The field commits on every keystroke; without the coalescing key, fixing a typo
    // would cost one undo per character.
    s().addLayer('marker');
    const id = first().id;
    s().toggleLayerExpr(id, 'size', 8);
    for (const src of ['8 +', '8 + 2', '8 + 2 *', '8 + 2 * t']) s().setLayerExpr(id, 'size', src);
    expect(first().size).toEqual({ kind: 'expr', source: '8 + 2 * t' });

    s().undo();
    expect(first().size).toEqual({ kind: 'expr', source: '8' });
    s().undo();
    expect(first().size).not.toMatchObject({ kind: 'expr' });
  });

  it('keeps the inputs when the formula is retyped', () => {
    // Declaring an input is a separate act from writing the formula; losing the wiring
    // on every edit would make the feature unusable.
    s().addLayer('marker');
    const id = first().id;
    s().patch((p) => {
      (layersOf(p)[0] as MarkerLayer).size = {
        kind: 'expr',
        source: 'pop / 1000000',
        inputs: { pop: 'geo:in-wb.population' },
      };
    });
    s().setLayerExpr(id, 'size', 'pop / 2000000');
    expect(first().size).toEqual({
      kind: 'expr',
      source: 'pop / 2000000',
      inputs: { pop: 'geo:in-wb.population' },
    });
  });
});

describe('replaceProject', () => {
  it('is undoable, so opening the wrong file is recoverable', () => {
    s().addLayer('marker');
    const before = layers().length;
    s().replaceProject({ ...emptyProject(), name: 'other' });
    expect(layers()).toHaveLength(0);
    s().undo();
    expect(layers()).toHaveLength(before);
  });

  it('frames a long composition rather than opening it at the default zoom', () => {
    // A 36-stop region tour runs well over a minute and is unreadable at the default.
    s().replaceProject({ ...emptyProject(), duration: 120 });
    const wide = s().pxPerSec;
    s().replaceProject({ ...emptyProject(), duration: 10 });
    expect(s().pxPerSec).toBeGreaterThan(wide);
  });

  it('starts the new document from the beginning, stopped and unselected', () => {
    s().addLayer('marker');
    s().select({ kind: 'layer', id: first().id });
    s().scrub(5);
    s().setPlaying(true);
    s().replaceProject(emptyProject());
    expect(s().time).toBe(0);
    expect(s().playing).toBe(false);
    expect(s().selection).toBeNull();
  });
});

describe('framing a region into the camera', () => {
  /*
   * The §02 signature gesture writes a camera keyframe at the playhead rather than only
   * moving the view, which is what makes it an authoring act: the camera animates into
   * the region from wherever the previous key left it. The gesture itself is browser-only
   * (it needs a rendered map to hit-test); these pin the contract it relies on.
   */
  const shot = { center: [75.09, 33.71] as [number, number], zoom: 6.85, bearing: 0, pitch: 30 };

  it('writes the framing it was handed', () => {
    // No camera at all: the first keyframe is what calls one into being.
    s().replaceProject({ ...emptyProject(), duration: 30, nodes: {} });
    useStore.getState().scrub(8);
    useStore.getState().addKeyframe(shot);

    const cam = liveCamera(s().project)!;
    const k = shotsOf(cam).find((x) => Math.abs(x.t - 8) < 0.02);
    expect(k).toMatchObject({ zoom: 6.85, pitch: 30 });
    expect(k?.center[0]).toBeCloseTo(75.09, 5);
  });

  it('reframes the key already at the playhead instead of stacking a second', () => {
    // Double-clicking two regions in a row is ordinary; each should replace the shot, not
    // leave a pile of keys at one instant where whichever sorts first silently wins.
    // No camera at all: the first keyframe is what calls one into being.
    s().replaceProject({ ...emptyProject(), duration: 30, nodes: {} });
    useStore.getState().addKeyframe(shot);
    useStore.getState().addKeyframe({ ...shot, zoom: 4 });

    expect(shotsOf(liveCamera(s().project)!)).toHaveLength(1);
    expect(shotsOf(liveCamera(s().project)!)[0]?.zoom).toBe(4);
  });

  it('is undoable, like any other edit', () => {
    // An AI or a gesture writes ordinary document content; nothing about it is special.
    // Undoing takes the whole camera node away again — the keyframe called it into being.
    // No camera at all: the first keyframe is what calls one into being.
    s().replaceProject({ ...emptyProject(), duration: 30, nodes: {} });
    useStore.getState().addKeyframe(shot);
    expect(shotsOf(liveCamera(s().project)!)).toHaveLength(1);
    useStore.getState().undo();
    expect(camerasOf(s().project)).toHaveLength(0);
  });
});

/**
 * Locking.
 *
 * The point of these is that the *store* refuses, not the UI. A lock enforced in the
 * components is one every future control has to remember about, and there are already a
 * dozen paths that reach a layer. Each case below drives the same action the editor
 * drives and asserts the document did not move.
 */
describe('locked layers', () => {
  // The shared `beforeEach` loads an empty project, so each case needs its own layer.
  beforeEach(() => {
    s().addLayer('marker');
  });

  const lockFirst = () => {
    const l = first();
    s().setLayerLocked(l.id, true);
    return l.id;
  };

  it('refuses a property edit', () => {
    const id = lockFirst();
    const before = first().name;
    s().updateLayer(id, { name: 'renamed' });
    expect(first().name).toBe(before);
  });

  it('refuses a retime', () => {
    const id = lockFirst();
    const before = first().in;
    s().updateLayer(id, { in: before + 3 });
    expect(first().in).toBe(before);
  });

  it('refuses a tracked-property write', () => {
    const id = lockFirst();
    const before = JSON.stringify(first().size);
    s().setLayerTrack(id, 'size', 99);
    s().toggleLayerTrack(id, 'size', 99);
    s().toggleLayerKey(id, 'size', 99);
    s().setLayerExpr(id, 'size', '99');
    s().toggleLayerExpr(id, 'size', 99);
    expect(JSON.stringify(first().size)).toBe(before);
  });

  it('refuses deletion', () => {
    const id = lockFirst();
    const n = layers().length;
    s().removeLayer(id);
    expect(layers()).toHaveLength(n);
  });

  /*
   * Reordering needs a second layer to be possible at all. Written with one, the move
   * was refused by `moveLayer`'s own bounds check rather than by the lock, and the
   * assertion held with the lock removed entirely.
   */
  it('refuses reordering', () => {
    s().addLayer('text');
    const id = layers()[0]!.id;
    s().setLayerLocked(id, true);
    s().moveLayer(id, 1);
    expect(layers()[0]?.id).toBe(id);
  });

  /*
   * The lock has to be escapable, and duplicating reads rather than writes — so both are
   * deliberately outside the gate. Without this test the safest-looking implementation
   * (route everything through `editable`) traps the layer forever.
   */
  it('still unlocks, and still duplicates', () => {
    const id = lockFirst();
    const n = layers().length;
    s().duplicateLayer(id);
    expect(layers()).toHaveLength(n + 1);
    expect(layers().find((l) => l.id !== id)?.locked).toBeUndefined();

    s().setLayerLocked(id, false);
    s().updateLayer(id, { name: 'now editable' });
    expect(layers().find((l) => l.id === id)?.name).toBe('now editable');
  });

  /* Unlocking leaves no trace, so a project that was never locked and one that was
     locked and unlocked serialise identically. */
  it('leaves no field behind when unlocked', () => {
    const id = lockFirst();
    expect(first().locked).toBe(true);
    s().setLayerLocked(id, false);
    expect('locked' in first()).toBe(false);
  });
});
