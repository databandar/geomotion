import { describe, expect, it } from 'vitest';
import { compileExpr } from './expr.ts';
import { evalTrack, trackKindSupported } from './track.ts';

const run = (src: string, ctx: { t?: number; inputs?: Record<string, number> } = {}) =>
  compileExpr(src).run({ t: ctx.t ?? 0, ...(ctx.inputs ? { inputs: ctx.inputs } : {}) });

describe('arithmetic', () => {
  it('respects precedence and associativity', () => {
    expect(run('2 + 3 * 4')).toBe(14);
    expect(run('(2 + 3) * 4')).toBe(20);
    expect(run('10 - 3 - 2')).toBe(5); // left-associative
    expect(run('2 ^ 3 ^ 2')).toBe(512); // right-associative: 2^(3^2), not (2^3)^2
  });

  it('handles unary minus, including doubled and applied to a call', () => {
    expect(run('-5')).toBe(-5);
    expect(run('--5')).toBe(5);
    expect(run('-abs(-3)')).toBe(-3);
    expect(run('3 * -2')).toBe(-6);
  });

  it('reads time and constants', () => {
    expect(run('t * 2', { t: 3 })).toBe(6);
    expect(run('pi')).toBeCloseTo(Math.PI, 12);
    expect(run('tau / 2')).toBeCloseTo(Math.PI, 12);
  });

  it('calls functions with the right arity', () => {
    expect(run('clamp(15, 0, 10)')).toBe(10);
    expect(run('lerp(0, 10, 0.25)')).toBe(2.5);
    expect(run('max(min(5, 3), 1)')).toBe(3);
  });
});

/**
 * The promise `evalTrack` makes — "no throw for any input a document can hold" — is
 * easiest to break here, so each way of breaking it gets a case. A project file is
 * untrusted: these are not hypothetical inputs, they are what a corrupted file, a bad
 * merge, or a half-finished edit actually contains.
 */
describe('hostile and half-typed sources', () => {
  const bad = [
    '',
    '   ',
    '2 +',
    '(1 + 2',
    '1 + 2)',
    '*/',
    'sin()',
    'sin(1, 2)',
    'nosuchfn(1)',
    '2 @ 3',
    '1 2 3',
    ',',
    '()',
  ];

  it.each(bad)('reports rather than throws: %j', (src) => {
    const c = compileExpr(src);
    expect(c.ok).toBe(false);
    expect(c.error).toBeTruthy();
    expect(c.run({ t: 0 })).toBeUndefined();
  });

  it('refuses a source nested past the depth limit instead of overflowing the stack', () => {
    const deep = '('.repeat(5000) + '1' + ')'.repeat(5000);
    const c = compileExpr(deep);
    expect(c.ok).toBe(false);
    expect(c.error).toMatch(/deep/);
  });

  /*
   * Every one of these parses. They fail at evaluation, which is the only place they
   * can: the argument may be `t`, so nothing at parse time knows `sqrt` will be handed a
   * negative. `undefined` rather than NaN is what keeps NaN out of the render.
   */
  it.each([['1 / 0'], ['0 / 0'], ['5 % 0'], ['sqrt(-1)'], ['log(0)'], ['0 ^ -1']])(
    'evaluates %s to undefined rather than a non-finite number',
    (src) => {
      expect(compileExpr(src).ok).toBe(true);
      expect(run(src)).toBeUndefined();
    },
  );

  /*
   * The explicit zero-divisor guard looks redundant — `1/0` is Infinity, which the finite
   * check on the way out already rejects. It is not: inside a call, `Infinity` is a
   * perfectly good argument, and `min(1/0, 5)` would quietly come back as 5. A formula
   * that divides by zero is wrong, and the wrongness has to survive to the top rather
   * than being absorbed by the next function up.
   *
   * Found by deleting the guard and watching all 32 tests still pass.
   */
  it('poisons the whole expression rather than being absorbed by an enclosing call', () => {
    expect(run('min(1 / 0, 5)')).toBeUndefined();
    expect(run('clamp(1 / 0, 0, 10)')).toBeUndefined();
    expect(run('abs(5 % 0)')).toBeUndefined();
    // The same shape with a legal divisor still works, so this is the divisor and not
    // the nesting.
    expect(run('min(1 / 2, 5)')).toBe(0.5);
  });

  it('treats an undeclared name as unresolved, not as zero', () => {
    // Zero is a real value in every channel this feeds, so a typo must not render as
    // a plausible result.
    expect(run('mystery + 1')).toBeUndefined();
    expect(run('mystery + 1', { inputs: { mystery: 4 } })).toBe(5);
  });
});

describe('determinism', () => {
  it('has no way to reach a clock or a random source', () => {
    for (const name of ['random', 'now', 'Date', 'Math', 'globalThis', 'window']) {
      expect(compileExpr(`${name}(1)`).ok).toBe(false);
    }
    // A bare name is not a syntax error — it is an unresolved input, which evaluates to
    // nothing. Either way it cannot reach the host.
    expect(run('random')).toBeUndefined();
  });

  it('gives the same answer for the same inputs, every time', () => {
    const src = 'sin(t * 3) * 2 + 8';
    const once = [0, 0.5, 1, 7.25].map((t) => run(src, { t }));
    const twice = [0, 0.5, 1, 7.25].map((t) => run(src, { t }));
    expect(twice).toEqual(once);
  });
});

describe('refs', () => {
  it('lists the names that need resolving, and only those', () => {
    const c = compileExpr('pop / area * 100 + t - pi');
    expect(c.refs.sort()).toEqual(['area', 'pop']);
  });
});

describe('as a track kind', () => {
  const factsOf = (table: Record<string, number>) => (ref: string, path: string) =>
    table[`${ref}.${path}`];

  it('evaluates through evalTrack, resolving inputs as facts', () => {
    const v = evalTrack(
      { kind: 'expr', source: 'pop / 1000000', inputs: { pop: 'geo:in-wb.population' } },
      0,
      { fallback: -1, facts: factsOf({ 'geo:in-wb.population': 91_000_000 }) },
    );
    expect(v).toBe(91);
  });

  it('moves with time', () => {
    const track = { kind: 'expr', source: '8 + 2 * t' } as const;
    expect(evalTrack(track, 0, { fallback: 0 })).toBe(8);
    expect(evalTrack(track, 2, { fallback: 0 })).toBe(12);
  });

  it('falls back when the source is broken, the fact is missing, or the result is not finite', () => {
    const opts = { fallback: 42, facts: factsOf({}) };
    expect(evalTrack({ kind: 'expr', source: '2 +' }, 0, opts)).toBe(42);
    expect(evalTrack({ kind: 'expr', source: 'pop', inputs: { pop: 'geo:x.y' } }, 0, opts)).toBe(42);
    expect(evalTrack({ kind: 'expr', source: '1 / 0' }, 0, opts)).toBe(42);
  });

  it('is reported as supported, along with every other kind', () => {
    expect(trackKindSupported({ kind: 'expr', source: '1' })).toBe(true);
    expect(trackKindSupported({ kind: 'static', value: 1 })).toBe(true);
  });
});
