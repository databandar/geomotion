import { describe, expect, it } from 'vitest';
import type { Project } from './types.ts';
import { createLayer, projectWith } from './project.ts';
import { addNode, layersOf, removeNode } from './nodes.ts';
import { History } from './history.ts';
import { transact } from './transact.ts';

/**
 * Behavioural spec for undo/redo.
 *
 * ENGINEERING_GUIDE §1.4. The coalescing rules are the subtle part: a slider drag
 * must collapse to one undo step, but the *order* patches are merged in decides
 * whether undo lands on the original value or on some intermediate one — which is
 * the kind of bug that only shows up after a real drag.
 */

const doc = (): Project => projectWith([createLayer('text', 0)]);

/** A clock the test drives, so the coalescing window needs no waiting. */
function fakeClock(start = 1_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

function setDuration(p: Project, v: number) {
  return transact(p, (d) => void (d.duration = v));
}

describe('History', () => {
  it('starts empty', () => {
    const h = new History();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.undo(doc())).toBeNull();
    expect(h.redo(doc())).toBeNull();
  });

  it('undoes and redoes a single edit', () => {
    const h = new History();
    const start = doc();
    const tx = setDuration(start, 50);
    h.push(tx);

    const undone = h.undo(tx.next)!;
    expect(undone.duration).toBe(start.duration);
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(true);

    const redone = h.redo(undone)!;
    expect(redone.duration).toBe(50);
  });

  it('walks back through several edits in reverse order', () => {
    const h = new History(fakeClock().now);
    const start = doc();
    let p = start;
    for (const v of [10, 20, 30]) {
      const tx = setDuration(p, v);
      h.push(tx); // unkeyed, so each is its own step
      p = tx.next;
    }
    expect(h.depth).toBe(3);

    p = h.undo(p)!;
    expect(p.duration).toBe(20);
    p = h.undo(p)!;
    expect(p.duration).toBe(10);
    p = h.undo(p)!;
    expect(p.duration).toBe(start.duration);
    expect(h.canUndo).toBe(false);
  });

  it('ignores a no-op transaction so the first undo is not a dud', () => {
    const h = new History();
    h.push(transact(doc(), () => {}));
    expect(h.canUndo).toBe(false);
  });

  it('coalesces same-key edits inside the window into one step', () => {
    // The slider-drag case: two hundred pointermove events, one undo.
    const clock = fakeClock();
    const h = new History(clock.now);
    const start = doc();
    let p = start;
    for (const v of [10, 11, 12, 13]) {
      h.push(setDuration(p, v), 'layer1:duration');
      p = setDuration(p, v).next;
      clock.advance(50);
    }
    expect(h.depth).toBe(1);
    // One undo must return all the way to the value before the drag began.
    expect(h.undo(p)!.duration).toBe(start.duration);
  });

  it('starts a new step once the coalescing window lapses', () => {
    const clock = fakeClock();
    const h = new History(clock.now);
    let p = doc();
    h.push(setDuration(p, 10), 'k');
    p = setDuration(p, 10).next;
    clock.advance(5_000);
    h.push(setDuration(p, 20), 'k');
    expect(h.depth).toBe(2);
  });

  it('does not coalesce edits from different controls', () => {
    const h = new History(fakeClock().now);
    const p = doc();
    h.push(setDuration(p, 10), 'layer1:duration');
    h.push(setDuration(p, 20), 'layer2:opacity');
    expect(h.depth).toBe(2);
  });

  it('does not coalesce unkeyed edits', () => {
    // No key means a discrete action — adding a layer must never merge into one.
    const h = new History(fakeClock().now);
    const p = doc();
    h.push(setDuration(p, 10));
    h.push(setDuration(p, 20));
    expect(h.depth).toBe(2);
  });

  it('drops the redo branch when a new edit arrives', () => {
    const h = new History();
    const start = doc();
    const first = setDuration(start, 10);
    h.push(first);
    const undone = h.undo(first.next)!;
    expect(h.canRedo).toBe(true);

    h.push(setDuration(undone, 99));
    expect(h.canRedo).toBe(false);
  });

  it('does not merge a fresh edit into a step that was just undone', () => {
    const clock = fakeClock();
    const h = new History(clock.now);
    const start = doc();
    const a = setDuration(start, 10);
    h.push(a, 'k');
    const b = setDuration(a.next, 20);
    h.push(b, 'k'); // coalesces with a
    const undone = h.undo(b.next)!;
    expect(undone.duration).toBe(start.duration);

    h.push(setDuration(undone, 30), 'k');
    expect(h.depth).toBe(1);
    expect(h.undo(setDuration(undone, 30).next)!.duration).toBe(start.duration);
  });

  it('caps depth so a long session cannot grow without bound', () => {
    const h = new History(fakeClock().now);
    const p = doc();
    for (let i = 0; i < 200; i++) h.push(setDuration(p, i));
    expect(h.depth).toBeLessThanOrEqual(80);
  });

  it('clear forgets everything', () => {
    const h = new History();
    const tx = setDuration(doc(), 10);
    h.push(tx);
    h.clear();
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });

  it('round-trips a realistic edit sequence back to the starting document', () => {
    const h = new History(fakeClock().now);
    const start = doc();
    let p = start;

    const steps: ((d: Project) => void)[] = [
      (d) => void (d.name = 'Tour'),
      (d) => addNode(d, createLayer('regions', 0)),
      (d) => void (d.duration = 60),
      (d) => removeNode(d, layersOf(d)[0]!.id),
      (d) => void (d.fps = 60),
    ];
    for (const recipe of steps) {
      const tx = transact(p, recipe);
      h.push(tx);
      p = tx.next;
    }
    while (h.canUndo) p = h.undo(p)!;
    expect(p).toEqual(start);

    while (h.canRedo) p = h.redo(p)!;
    expect(p.fps).toBe(60);
    expect(p.name).toBe('Tour');
  });
});
