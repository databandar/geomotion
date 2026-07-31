# Expressions

**Status:** landed — the fourth track kind evaluates, and the inspector can write one.

**Governing sections:** ARCHITECTURE §04 (the `Track` union, fixed at four kinds), §06
(the deterministic expression DSL; the pipeline `value(t) = behaviors( expr( base(t) ) )`).
ENGINEERING_GUIDE §1.5 (deterministic rendering), §7 (expressions: "the deterministic DSL
only — no user JS").

## The problem

Three of §04's four track kinds evaluated. `static` and `keyframed` cover values authored
at instants; `bound` reads a fact straight out of an entity. What neither can say is
arithmetic *over* time and *over* data: `8 + 2 * sin(t * 3)` is a marker that breathes,
`pop / 1000000` is a readout sized by a fact, `min(rank, 10)` is a cap. Every downstream
feature assumes this middle of the pipeline exists — camera rig stages, count-ups, the
timing fitter — and until now the kind was declared in the union and returned nothing.

## Decisions

**An interpreter, never `new Function`.** A project file is untrusted input: it arrives
over Open, out of localStorage, from a colleague, from the composer. Executing source
would run it with the editor's full privileges and require `unsafe-eval` in the CSP for
the whole app to allow one feature. So the grammar — numbers, `t`, the constants
`pi`/`e`/`tau`, six operators, and seventeen functions — is parsed (Pratt) and walked.
The worst a hostile source can do is fail to parse. `packages/animation/src/expr.ts`.

**Total: compiling and evaluating never throw.** `evalTrack` promises "no throw for any
input a document can hold", and an expression is the easiest way to break that promise —
a formula is invalid at almost every keystroke on the way to being right. Every failure
is a value: a failed compile reports the error and evaluates to the fallback; a nesting
attack is refused at depth 50 rather than overflowing the stack; a non-finite result is
discarded rather than propagated.

**Division by zero poisons, explicitly.** `1/0` is `NaN`, not `Infinity`. The finite
check on the way out would catch a bare `1/0`, but `Infinity` is a perfectly good
argument to `min`, and `min(1/0, 5)` would come back as a plausible 5. Whatever is wrong
with a formula has to reach the top. (Found by deleting the guard and watching the whole
suite stay green — it now has its own tests.)

**An unresolved name is NaN, not zero.** Zero is a legitimate value in every channel
this feeds, so a typo'd input rendering as zero would look like data, not like a broken
expression. This is the same rule `bound` follows for a missing fact, for the same
reason.

**Inputs are facts, never tracks.** A track declares `inputs: { name: "entityId.factPath" }`
and the names are resolved through the same lookup `bound` uses. Letting a name refer to
another *track* would be more powerful and would introduce cycles — `a = b + 1`,
`b = a + 1` — which would need detection at every evaluation, sixty times a second.
Leaf-only reads make cycles impossible by construction rather than by a visited set in
the render loop.

**Deterministic by grammar, not by discipline.** There is no `random`, no `now`, and no
name that reaches the host — `Date`, `Math`, `window` are syntax errors or unresolved
inputs, and either way they evaluate to nothing. The golden harness compares frames at
tolerance zero; one non-deterministic call would make every frame a false positive
forever.

**Compiled sources are cached, bounded.** `evalTrack` runs per property per frame, so
re-lexing would cost the parse sixty times a second; the inspector compiles on every
keystroke, so an unbounded cache would hold one entry per half-typed prefix forever.
256 entries, FIFO — a live set of expressions plus a short trail.

## The inspector

A separate `fx` button beside the pip, not a four-state cycle on one button: cycling
would mean clicking past states you did not want on the way to the one you did, and an
expression is the only kind that needs something typed. The toggle is seeded with the
value on screen in both directions — switching kinds never moves the picture, the same
rule the static/keyframed toggle follows.

The field commits on every keystroke, coalesced so a typing session is one undo step,
and the readout underneath says what the formula comes to at the playhead — or why it
does not: the parse error, or the names nothing has bound. The readout is the point of
the control: an expression is the one track kind whose value you cannot see by looking
at it. The pip is amber, §04's colour for expressions.

## Fallbacks became an ordinary state

Before expressions, `evalTrack` returned its fallback only for corrupt-file cases. A
formula is *usually* invalid while it is being typed, so every call site now names a
fallback deliberately: the camera falls back to `DEFAULT_CAMERA`; a route's draw
progress falls back to 0 — "not drawn yet" reads as a mid-edit state, where falling back
to fully drawn would look like a finished result and hide the broken formula.

## Equivalence

A project with no expression tracks is byte-identical to before: the kind did not exist
in any fixture, and all ten golden frames are unchanged. Well-formed projects are
untouched; this adds a capability rather than changing a behaviour.

## Tests

`expr.test.ts` — 32 cases: precedence and associativity, every hostile and half-typed
source reporting rather than throwing, the depth limit, non-finite results discarded,
zero-divisor poisoning surviving enclosing calls, determinism, refs extraction, and the
kind evaluating through `evalTrack` with fact inputs.

The checklist gaps have their own: store tests pin the seeded toggle in both directions,
typing as one undo step, inputs surviving a retype, and locked layers refusing expression
edits; a persistence test round-trips an expression track with its inputs; inspector
tests drive the `fx` button and the readout.

## Not yet

Track-to-track references (refused by design above — revisiting is an ADR). Binding an
input through the inspector (the `inputs` map is document state with store coverage, but
no UI declares one yet; unbound names are reported, which is what makes that gap
visible). Expression camera channels (`cameraAt` does not resolve facts; a `t`-only
formula works, a fact input falls back). The seeded-noise functions §06's DSL also
lists — they land with the camera rig `shake` stage that needs them.
