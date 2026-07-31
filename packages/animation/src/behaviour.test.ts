import { describe, expect, it } from 'vitest';
import { applyBehaviours, BEHAVIOURS } from './behaviour.ts';
import type { Behaviour } from '@geomotion/document';

/**
 * The outer wrap of §06's pipeline. A track says what a property was authored to be; a
 * behaviour is a rule over it. Order, toggling and forward-compatibility are all part of
 * the contract, so they are tested as carefully as the curves.
 */
const b = (type: string, enabled = true, params?: Record<string, number>): Behaviour =>
  ({ id: `b-${type}`, type, enabled, ...(params ? { params } : {}) }) as Behaviour;

const ctx = (local: number) => ({ time: local, local });

describe('applyBehaviours', () => {
  it('leaves the base alone with an empty stack', () => {
    expect(applyBehaviours(5, [], ctx(1))).toBe(5);
    expect(applyBehaviours(5, undefined, ctx(1))).toBe(5);
  });

  it('feeds each behaviour the value the one before it produced', () => {
    // Order is document state for this reason. Two pops compose, and the second sees the
    // first's output rather than the base — which is what makes reordering meaningful.
    const once = applyBehaviours(1, [b('pop')], ctx(0.2));
    const twice = applyBehaviours(1, [b('pop'), b('pop')], ctx(0.2));
    expect(twice).toBeCloseTo(once * once, 10);
  });

  it('skips a disabled behaviour but keeps it in the stack', () => {
    // §06 asks for toggle: turning one off to see what it did is the point, and it has
    // to come back with its parameters intact.
    const stack = [b('pop', false)];
    expect(applyBehaviours(1, stack, ctx(0.2))).toBe(1);
    expect(stack[0]?.params).toBeUndefined();
  });

  it('skips a type it has never heard of rather than refusing to draw', () => {
    // A document from a newer build will name behaviours this one does not have.
    // Drawing the layer without one effect beats not drawing it.
    expect(applyBehaviours(7, [b('warp' as never), b('pop', false)], ctx(1))).toBe(7);
  });

  it('drops a behaviour that produced nonsense instead of propagating it', () => {
    // NaN spreads through every later behaviour and reaches the renderer as a shape that
    // silently fails to draw.
    // Mid-entrance on purpose: at ctx(1) the pop has finished and returns before it
    // touches the bad parameter, so the test would pass without the guard doing anything.
    const stack = [b('pop', true, { over: NaN })];
    expect(Number.isFinite(applyBehaviours(3, stack, ctx(0.2)))).toBe(true);
    expect(applyBehaviours(3, stack, ctx(0.2))).toBe(3);
  });
});

describe('pop', () => {
  const pop = BEHAVIOURS.pop;

  it('reproduces the curve markers have always used', () => {
    // The easeOutBack overshoot, previously inlined in the evaluator. Checked against the
    // original formula across the whole entrance: worst difference 0.
    const old = (t: number) => {
      if (t >= 1) return 1;
      const c = 1.70158 + 1;
      return 1 + c * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
    };
    for (let i = 0; i <= 200; i++) {
      const local = (i / 200) * 1.2;
      expect(pop(1, ctx(local), {})).toBeCloseTo(old(Math.min(1, Math.max(0, local / 0.55))), 12);
    }
  });

  it('overshoots and settles exactly on the target', () => {
    // A pop that did not land on 1 would leave every marker permanently the wrong size.
    expect(pop(1, ctx(0.55), {})).toBeCloseTo(1, 10);
    expect(pop(1, ctx(5), {})).toBe(1);
    expect(Math.max(...[0.3, 0.35, 0.4].map((t) => pop(1, ctx(t), {})))).toBeGreaterThan(1);
  });

  it('scales whatever it is given, rather than replacing it', () => {
    // The base is a property's own value; a behaviour modifies it.
    expect(pop(10, ctx(5), {})).toBe(10);
  });

  it('takes its timing and overshoot as parameters', () => {
    // Both were fixed numbers before, so every marker in every project popped alike.
    expect(pop(1, ctx(0.55), { secs: 2 })).not.toBeCloseTo(1, 3);
    expect(pop(1, ctx(0.2), { over: 4 })).not.toBeCloseTo(pop(1, ctx(0.2), {}), 3);
  });

  it('survives a nonsense duration', () => {
    for (const secs of [0, -1, NaN]) expect(Number.isFinite(pop(1, ctx(0.2), { secs }))).toBe(true);
  });
});


describe('pulse', () => {
  const pulse = BEHAVIOURS.pulse;

  it('reproduces the phase the ring has always ridden on', () => {
    // `(local % 1.6) / 1.6`, previously inlined in the evaluator.
    for (let i = 0; i <= 200; i++) {
      const local = (i / 200) * 5;
      expect(pulse(0, ctx(local), {})).toBeCloseTo((local % 1.6) / 1.6, 12);
    }
  });

  it('generates rather than modifies, which is allowed', () => {
    /*
     * It ignores the value handed to it. §06 says behaviours observe "the value so far";
     * nothing requires one to use it, and a ring's phase has no base to build on.
     */
    expect(pulse(99, ctx(0.8), {})).toBeCloseTo(0.5, 10);
  });

  it('never finishes, which is why it cannot be a track', () => {
    // There is no last keyframe to write.
    expect(pulse(0, ctx(1000.8), {})).toBeCloseTo(pulse(0, ctx(0.8), {}), 6);
  });

  it('takes its period as a parameter', () => {
    expect(pulse(0, ctx(1), { period: 4 })).toBeCloseTo(0.25, 10);
  });

  it('survives a nonsense period', () => {
    for (const period of [0, -2, NaN]) expect(Number.isFinite(pulse(0, ctx(1), { period }))).toBe(true);
  });
});

describe('a stack per property', () => {
  it('leaves an absent stack at its base', () => {
    // A marker with no ring stack has no ring, which is what the old boolean meant —
    // reproduced exactly rather than approximately.
    expect(applyBehaviours(0, undefined, ctx(3))).toBe(0);
  });

  it('keeps two channels from interfering', () => {
    /*
     * The failure that made this shape necessary. In format 4 there was one list per
     * layer, so adding `pulse` beside `pop` put it on scale and every marker throbbed.
     * Keyed by property, each stack sees only its own base.
     */
    const scale = applyBehaviours(1, [b('pop')], ctx(0.2));
    const ring = applyBehaviours(0, [b('pulse')], ctx(0.2));
    expect(scale).toBeGreaterThan(0.5);
    expect(ring).toBeCloseTo(0.125, 10);
    // The pop must be exactly what it is without the ring stack existing at all.
    expect(applyBehaviours(1, [b('pop')], ctx(0.2))).toBe(scale);
  });
});
