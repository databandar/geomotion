import { beforeEach, describe, expect, it } from 'vitest';
import { emptyProject, type MarkerLayer } from '@geomotion/document';
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
const layers = () => s().project.layers;
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
    s().replaceProject({ ...emptyProject(), duration: 30, camera: [] });
    useStore.getState().scrub(8);
    useStore.getState().addKeyframe(shot);

    const k = s().project.camera.find((x) => Math.abs(x.t - 8) < 0.02);
    expect(k).toMatchObject({ zoom: 6.85, pitch: 30 });
    expect(k?.center[0]).toBeCloseTo(75.09, 5);
  });

  it('reframes the key already at the playhead instead of stacking a second', () => {
    // Double-clicking two regions in a row is ordinary; each should replace the shot, not
    // leave a pile of keys at one instant where whichever sorts first silently wins.
    s().replaceProject({ ...emptyProject(), duration: 30, camera: [] });
    useStore.getState().addKeyframe(shot);
    useStore.getState().addKeyframe({ ...shot, zoom: 4 });

    expect(s().project.camera).toHaveLength(1);
    expect(s().project.camera[0]?.zoom).toBe(4);
  });

  it('is undoable, like any other edit', () => {
    // An AI or a gesture writes ordinary document content; nothing about it is special.
    s().replaceProject({ ...emptyProject(), duration: 30, camera: [] });
    useStore.getState().addKeyframe(shot);
    expect(s().project.camera).toHaveLength(1);
    useStore.getState().undo();
    expect(s().project.camera).toHaveLength(0);
  });
});
