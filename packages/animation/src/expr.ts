/**
 * The expression language — ARCHITECTURE §04's fourth track kind, §06's `expr` stage.
 *
 * A track can compute its value instead of storing it: `8 + 2 * sin(t * 3)` is a marker
 * that breathes, `pop * 0.4 + 6` is one sized by a fact. This is what `static`,
 * `keyframed` and `bound` cannot express — arithmetic *over* time and over data, rather
 * than values authored at instants or read straight out of a table.
 *
 * ### Why an interpreter and not `new Function`
 *
 * A project file is untrusted input. It arrives over `Open`, out of localStorage, from a
 * colleague, from the composer — and `new Function(source)` would turn any of those into
 * arbitrary code running with the editor's full privileges, which for a browser app means
 * the user's session. It would also need `unsafe-eval` in the CSP for the entire app to
 * allow one feature. So the grammar below is parsed and walked, and the worst a hostile
 * source can do is fail to parse.
 *
 * ### Pure and total
 *
 * `evalTrack` promises "no throw for any input a document can hold", and an expression is
 * the easiest way to break that promise: unbalanced parentheses, division by zero, a name
 * nobody defined, a thousand nested brackets. Every one of those is a value here — a
 * failed compile returns an object that reports the error and evaluates to the fallback,
 * and a result that is not finite is discarded rather than propagated. `1/0` in a size
 * track is not a crash; it is a marker at its default size and a message in the inspector.
 *
 * ### Deterministic
 *
 * There is no `random`, no `now`, no way to read anything but `t` and declared inputs.
 * Two renders of the same project must be identical — §12's golden harness compares
 * frames at tolerance zero, and a single non-deterministic call would make every frame a
 * false positive forever.
 */

/** What an expression is allowed to see. Nothing else is reachable from the grammar. */
export interface ExprContext {
  /** Composition time in seconds. */
  t: number;
  /** Declared inputs, already resolved to numbers by the caller. */
  inputs?: Readonly<Record<string, number>>;
}

/**
 * A parsed expression, or the reason it is not one.
 *
 * Compiling never throws, so a caller can hold the result of a half-typed source without
 * a try/catch — which matters because the inspector compiles on every keystroke.
 */
export interface CompiledExpr {
  ok: boolean;
  /** Human-readable, aimed at the person typing. Absent when `ok`. */
  error?: string;
  /** The names the source actually reads, so a caller can resolve only what is used. */
  refs: string[];
  /** Evaluates, returning `undefined` rather than a non-finite number. */
  run(ctx: ExprContext): number | undefined;
}

/* ------------------------------------------------------------------ tokens */

type Tok =
  | { k: 'num'; v: number }
  | { k: 'name'; v: string }
  | { k: 'op'; v: string }
  | { k: '('; }
  | { k: ')'; }
  | { k: ','; };

const OPS = ['+', '-', '*', '/', '%', '^'];

/** Source to tokens. Returns a message instead of throwing on an unknown character. */
function lex(src: string): { toks: Tok[] } | { error: string } {
  const toks: Tok[] = [];
  let i = 0;

  while (i < src.length) {
    const c = src[i] as string;

    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }

    if (c === '(') {
      toks.push({ k: '(' });
      i++;
      continue;
    }
    if (c === ')') {
      toks.push({ k: ')' });
      i++;
      continue;
    }
    if (c === ',') {
      toks.push({ k: ',' });
      i++;
      continue;
    }
    if (OPS.includes(c)) {
      toks.push({ k: 'op', v: c });
      i++;
      continue;
    }

    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < src.length && /[0-9]/.test(src[j] as string)) j++;
      if (src[j] === '.') {
        j++;
        while (j < src.length && /[0-9]/.test(src[j] as string)) j++;
      }
      // Exponent form is deliberately absent: `1e3` is indistinguishable from the
      // constant `e` multiplied by nothing, and a size track has no use for 1e300.
      const v = Number(src.slice(i, j));
      if (!Number.isFinite(v)) return { error: `not a number: ${src.slice(i, j)}` };
      toks.push({ k: 'num', v });
      i = j;
      continue;
    }

    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_.]/.test(src[j] as string)) j++;
      toks.push({ k: 'name', v: src.slice(i, j) });
      i = j;
      continue;
    }

    return { error: `unexpected character "${c}"` };
  }

  return { toks };
}

/* --------------------------------------------------------------------- ast */

type Node =
  | { n: 'num'; v: number }
  | { n: 'ref'; name: string }
  | { n: 'bin'; op: string; a: Node; b: Node }
  | { n: 'neg'; a: Node }
  | { n: 'call'; name: string; args: Node[] };

/** Binding power. `^` is right-associative, which is the only asymmetry here. */
const BP: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3 };

/**
 * A Pratt parser, iterative in its operator loop but recursive by grammar depth.
 *
 * `MAX_DEPTH` is not decoration: `((((((…))))))` a few thousand deep is eleven bytes per
 * level in a project file and would overflow the JavaScript stack, which is a crash this
 * module has promised not to have. Fifty nested levels is far past any expression a
 * person writes and far short of the engine's limit.
 */
const MAX_DEPTH = 50;

class Parser {
  private i = 0;
  constructor(private readonly toks: Tok[]) {}

  peek(): Tok | undefined {
    return this.toks[this.i];
  }

  next(): Tok | undefined {
    return this.toks[this.i++];
  }

  /** Throws `ParseError`, caught once at the top of `compileExpr`. */
  parse(minBp: number, depth: number): Node {
    if (depth > MAX_DEPTH) throw new ParseError('expression is nested too deeply');

    let left = this.atom(depth);

    for (;;) {
      const t = this.peek();
      if (!t || t.k !== 'op') break;
      const bp = BP[t.v];
      if (bp === undefined || bp < minBp) break;
      this.next();
      // Right-associative `^`, left-associative everything else.
      const right = this.parse(t.v === '^' ? bp : bp + 1, depth + 1);
      left = { n: 'bin', op: t.v, a: left, b: right };
    }

    return left;
  }

  private atom(depth: number): Node {
    const t = this.next();
    if (!t) throw new ParseError('expression ended early');

    if (t.k === 'num') return { n: 'num', v: t.v };

    if (t.k === 'op' && t.v === '-') return { n: 'neg', a: this.atom(depth + 1) };
    if (t.k === 'op' && t.v === '+') return this.atom(depth + 1);

    if (t.k === '(') {
      const inner = this.parse(0, depth + 1);
      const close = this.next();
      if (!close || close.k !== ')') throw new ParseError('missing ")"');
      return inner;
    }

    if (t.k === 'name') {
      if (this.peek()?.k === '(') {
        this.next();
        const args: Node[] = [];
        if (this.peek()?.k !== ')') {
          for (;;) {
            args.push(this.parse(0, depth + 1));
            const sep = this.peek();
            if (sep?.k === ',') {
              this.next();
              continue;
            }
            break;
          }
        }
        const close = this.next();
        if (!close || close.k !== ')') throw new ParseError(`missing ")" after ${t.v}(`);
        const fn = FNS[t.v];
        if (!fn) throw new ParseError(`unknown function "${t.v}"`);
        if (args.length !== fn.arity) {
          throw new ParseError(`${t.v}() takes ${fn.arity} argument${fn.arity === 1 ? '' : 's'}`);
        }
        return { n: 'call', name: t.v, args };
      }
      return { n: 'ref', name: t.v };
    }

    throw new ParseError('unexpected symbol');
  }

  get done(): boolean {
    return this.i >= this.toks.length;
  }
}

class ParseError extends Error {}

/* --------------------------------------------------------------- built-ins */

/**
 * The function table.
 *
 * Deliberately small and deliberately total. `sqrt(-1)` and `log(0)` are legal calls that
 * return non-finite numbers, which the caller discards — the alternative, rejecting them
 * at parse time, is impossible when the argument is `t`.
 */
const FNS: Record<string, { arity: number; fn: (a: number[]) => number }> = {
  abs: { arity: 1, fn: ([a]) => Math.abs(a as number) },
  sign: { arity: 1, fn: ([a]) => Math.sign(a as number) },
  floor: { arity: 1, fn: ([a]) => Math.floor(a as number) },
  ceil: { arity: 1, fn: ([a]) => Math.ceil(a as number) },
  round: { arity: 1, fn: ([a]) => Math.round(a as number) },
  sqrt: { arity: 1, fn: ([a]) => Math.sqrt(a as number) },
  sin: { arity: 1, fn: ([a]) => Math.sin(a as number) },
  cos: { arity: 1, fn: ([a]) => Math.cos(a as number) },
  tan: { arity: 1, fn: ([a]) => Math.tan(a as number) },
  log: { arity: 1, fn: ([a]) => Math.log(a as number) },
  exp: { arity: 1, fn: ([a]) => Math.exp(a as number) },
  min: { arity: 2, fn: ([a, b]) => Math.min(a as number, b as number) },
  max: { arity: 2, fn: ([a, b]) => Math.max(a as number, b as number) },
  mod: { arity: 2, fn: ([a, b]) => (b === 0 ? NaN : (a as number) % (b as number)) },
  pow: { arity: 2, fn: ([a, b]) => Math.pow(a as number, b as number) },
  clamp: {
    arity: 3,
    fn: ([v, lo, hi]) => Math.min(Math.max(v as number, lo as number), hi as number),
  },
  lerp: {
    arity: 3,
    fn: ([a, b, e]) => (a as number) + ((b as number) - (a as number)) * (e as number),
  },
};

/** Names that resolve without being declared as inputs. */
const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

/** The documented vocabulary, for the inspector's help text. */
export const EXPR_FUNCTIONS = Object.keys(FNS).sort();
export const EXPR_CONSTANTS = Object.keys(CONSTANTS).sort();

/* ----------------------------------------------------------------- compile */

/** Every name the tree reads that is not a constant — what the caller must resolve. */
function refsOf(node: Node, out: Set<string>): void {
  switch (node.n) {
    case 'ref':
      if (!(node.name in CONSTANTS) && node.name !== 't') out.add(node.name);
      return;
    case 'bin':
      refsOf(node.a, out);
      refsOf(node.b, out);
      return;
    case 'neg':
      refsOf(node.a, out);
      return;
    case 'call':
      for (const a of node.args) refsOf(a, out);
      return;
    default:
      return;
  }
}

function evaluate(node: Node, ctx: ExprContext): number {
  switch (node.n) {
    case 'num':
      return node.v;

    case 'ref': {
      if (node.name === 't') return ctx.t;
      const k = CONSTANTS[node.name];
      if (k !== undefined) return k;
      const v = ctx.inputs?.[node.name];
      // An unresolved name is NaN, not zero. Zero is a legitimate value in every channel
      // this feeds, so a typo'd name would silently render as a real result — a marker at
      // size 0 looks like data saying "none", not like a broken expression.
      return typeof v === 'number' ? v : NaN;
    }

    case 'neg':
      return -evaluate(node.a, ctx);

    case 'bin': {
      const a = evaluate(node.a, ctx);
      const b = evaluate(node.b, ctx);
      switch (node.op) {
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        /*
         * Division and modulo by zero poison the expression rather than producing
         * Infinity. This is load-bearing, not tidiness: the finite check on the way out
         * would catch a bare `1/0`, but `min(1/0, 5)` is a legal call returning 5, and a
         * formula with a zero divisor would come back as a plausible number. Whatever is
         * wrong with it has to reach the top.
         */
        case '/':
          return b === 0 ? NaN : a / b;
        case '%':
          return b === 0 ? NaN : a % b;
        case '^':
          return Math.pow(a, b);
        default:
          return NaN;
      }
    }

    case 'call': {
      const fn = FNS[node.name];
      if (!fn) return NaN;
      return fn.fn(node.args.map((a) => evaluate(a, ctx)));
    }
  }
}

/**
 * Compiled sources, keyed by text.
 *
 * The evaluator calls `evalTrack` once per property per frame, so re-parsing would mean
 * lexing the same twenty characters sixty times a second per animated property. Bounded
 * because the inspector compiles on every keystroke: without a cap, typing a long
 * expression would leave one entry per prefix, forever.
 */
const CACHE = new Map<string, CompiledExpr>();
const CACHE_MAX = 256;

const FAILED = (error: string): CompiledExpr => ({
  ok: false,
  error,
  refs: [],
  run: () => undefined,
});

/**
 * Parse `source` into something evaluable. Never throws.
 *
 * An empty source is an error rather than a silent zero: a property whose expression is
 * blank has not been written yet, and rendering it as zero would look like an authored
 * decision.
 */
export function compileExpr(source: string): CompiledExpr {
  const cached = CACHE.get(source);
  if (cached) return cached;

  const built = build(source);

  // Plain FIFO eviction. An LRU would need a touch on every read, which is the hot path;
  // the access pattern here is a handful of live expressions plus a trail of half-typed
  // prefixes, and any policy at all clears the trail.
  if (CACHE.size >= CACHE_MAX) {
    const oldest = CACHE.keys().next().value;
    if (oldest !== undefined) CACHE.delete(oldest);
  }
  CACHE.set(source, built);
  return built;
}

function build(source: string): CompiledExpr {
  if (!source.trim()) return FAILED('empty expression');

  const lexed = lex(source);
  if ('error' in lexed) return FAILED(lexed.error);

  try {
    const parser = new Parser(lexed.toks);
    const tree = parser.parse(0, 0);
    if (!parser.done) return FAILED('unexpected trailing input');

    const refs = new Set<string>();
    refsOf(tree, refs);

    return {
      ok: true,
      refs: [...refs],
      run(ctx) {
        const v = evaluate(tree, ctx);
        return Number.isFinite(v) ? v : undefined;
      },
    };
  } catch (err) {
    return FAILED(err instanceof ParseError ? err.message : 'could not parse expression');
  }
}
