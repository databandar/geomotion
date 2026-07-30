import { applyPatches, isNoop, type Patch, type Transaction } from './transact.ts';
import type { Project } from './types.ts';

/**
 * Undo/redo as a log of patch pairs.
 *
 * ENGINEERING_GUIDE §1.4: everything is undoable, and history is a first-class
 * part of the document rather than something each store reinvents. v1 kept this as
 * two arrays of whole projects plus a pair of module-level mutable globals for
 * coalescing; both are gone.
 */

interface Step {
  forward: Patch[];
  backward: Patch[];
  /**
   * Set when this step may absorb the next edit from the same control.
   *
   * `string | undefined` rather than `key?: string`: the property is always
   * present, and clearing it to `undefined` is a deliberate act — it is how
   * coalescing is broken after an undo. Under `exactOptionalPropertyTypes` those
   * are different statements, and this is the one that is true.
   */
  key: string | undefined;
  at: number;
}

/** How long a control keeps absorbing edits into one undo step. */
const COALESCE_MS = 700;

const DEPTH = 80;

export class History {
  private past: Step[] = [];
  private future: Step[] = [];

  /**
   * Injectable so the coalescing window is testable without waiting.
   *
   * Declared as a plain field rather than a constructor parameter property:
   * node strips types without transforming code, so a parameter property makes the
   * whole package unimportable from plain `.mjs` — which `apps/render-cli` and the
   * video pipeline are.
   */
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  get depth() {
    return this.past.length;
  }

  /**
   * Record a committed transaction.
   *
   * Passing the same `key` as the previous edit within the coalescing window
   * merges them, so dragging a slider is one undo step and not two hundred. The
   * merged step redoes forward in order and undoes backward in reverse — get that
   * ordering wrong and undo restores an intermediate value rather than the
   * original.
   */
  push(tx: Transaction, key?: string): void {
    if (isNoop(tx)) return;

    const at = this.now();
    const last = this.past[this.past.length - 1];
    const canMerge = key !== undefined && last?.key === key && at - last.at < COALESCE_MS;

    if (canMerge && last) {
      last.forward = [...last.forward, ...tx.forward];
      last.backward = [...tx.backward, ...last.backward];
      last.at = at;
    } else {
      this.past.push({ forward: tx.forward, backward: tx.backward, key, at });
      if (this.past.length > DEPTH) this.past.shift();
    }

    // Any new edit invalidates the redo branch.
    this.future = [];
  }

  undo(doc: Project): Project | null {
    const step = this.past.pop();
    if (!step) return null;
    this.future.unshift(step);
    if (this.future.length > DEPTH) this.future.pop();
    // Break coalescing: the next edit must not merge into a step we just undid.
    const prev = this.past[this.past.length - 1];
    if (prev) prev.key = undefined;
    return applyPatches(doc, step.backward);
  }

  redo(doc: Project): Project | null {
    const step = this.future.shift();
    if (!step) return null;
    step.key = undefined;
    this.past.push(step);
    return applyPatches(doc, step.forward);
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
