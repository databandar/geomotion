import { describe, expect, it } from 'vitest';
import { FIRST_ORDER, compareOrder, orderBetween, orderKeys } from './order.ts';

/**
 * The contract, in one line: whatever you ask for, the answer sorts where you asked for it.
 * Everything below is that property under the conditions a dragging user creates —
 * repeatedly into the same gap, at both ends, and thousands of times.
 */
describe('orderBetween', () => {
  it('lands strictly between its neighbours', () => {
    const mid = orderBetween('A', 'B');
    expect(mid > 'A').toBe(true);
    expect(mid < 'B').toBe(true);
  });

  it('appends after a key when there is nothing above', () => {
    expect(orderBetween('A', null) > 'A').toBe(true);
  });

  it('prepends before a key when there is nothing below', () => {
    expect(orderBetween(null, 'A') < 'A').toBe(true);
  });

  it('has a key for the empty list', () => {
    expect(FIRST_ORDER.length).toBeGreaterThan(0);
    expect(orderBetween(null, FIRST_ORDER) < FIRST_ORDER).toBe(true);
    expect(orderBetween(FIRST_ORDER, null) > FIRST_ORDER).toBe(true);
  });

  it('never ends in the lowest digit', () => {
    // `V` and `V0` are the same fraction and different strings; a trailing zero is how an
    // ordering starts producing keys that are distinct but not comparable by value.
    const keys = [orderBetween(null, null), orderBetween(null, '1'), orderBetween('A', 'B'), ...orderKeys(200)];
    for (const key of keys) expect(key.endsWith('0')).toBe(false);
  });

  it('keeps room after a thousand insertions into the same gap', () => {
    // The failure this guards: an integer or float index runs out of room here, and the fix
    // is a renumbering pass that rewrites every sibling — the patch storm §04 Decision 01
    // exists to avoid. A drag that hovers over one boundary does exactly this.
    let lo = orderBetween(null, null);
    const hi = orderBetween(lo, null);
    for (let i = 0; i < 1000; i++) {
      const next = orderBetween(lo, hi);
      expect(next > lo).toBe(true);
      expect(next < hi).toBe(true);
      lo = next;
    }
  });

  it('stays ascending over a thousand appends and a thousand prepends', () => {
    const appended = orderKeys(1000);
    expect([...appended].sort()).toEqual(appended);

    const prepended: string[] = [];
    let first: string | null = null;
    for (let i = 0; i < 1000; i++) {
      first = orderBetween(null, first);
      prepended.unshift(first);
    }
    expect([...prepended].sort()).toEqual(prepended);
  });

  it('refuses arguments that are not in order', () => {
    expect(() => orderBetween('B', 'A')).toThrow();
    expect(() => orderBetween('A', 'A')).toThrow();
  });

  it('treats an unknown character as the lowest digit rather than sorting it below nothing', () => {
    // Reachable only from a hand-edited file. The requirement is that it still returns a
    // key rather than producing NaN arithmetic and an unsorted document.
    const mid = orderBetween('!', 'B');
    expect(mid < 'B').toBe(true);
  });
});

describe('compareOrder', () => {
  it('sorts by order', () => {
    expect(compareOrder({ order: 'A', id: 'z' }, { order: 'B', id: 'a' })).toBeLessThan(0);
  });

  it('breaks a tie by id, so draw order is the same on every machine', () => {
    expect(compareOrder({ order: 'A', id: 'a' }, { order: 'A', id: 'b' })).toBeLessThan(0);
    expect(compareOrder({ order: 'A', id: 'a' }, { order: 'A', id: 'a' })).toBe(0);
  });
});
