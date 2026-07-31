# The behaviour stack

**Status:** M11 landed — the runtime, stacks keyed by property, `pop` and `pulse`.

**Governing sections:** ARCHITECTURE §06 and its Decision 03.

## What a behaviour is, and is not

§06 fixes the pipeline as `value(t) = behaviors( expr( base(t) ) )`. A **track** says what
a property was *authored* to be. A **behaviour** is a rule that modifies it.

The distinction is not academic — M6 established it by reading how each of the eighteen
bespoke tween fields was actually evaluated. `drawStart`/`drawEnd` was a value ramping
between two times, so it became a track. `pop` is `overshoot(local / 0.55)`: nobody
authored those numbers at any instant. Forcing it into keyframes would have swapped one
wrong shape for another.

## Decisions

**Linear, and never the front door** (§06 Decision 03). An ordered list you can reorder
and toggle. The graph substrate underneath is a later concern and nothing here forecloses
it, because a graph evaluates to the same `(value, context) => value` shape.

**Order is document state.** Each behaviour is fed what the one before produced, so
reordering means something and a stack that sorted itself would make the result
unpredictable.

**Disabled, not deleted.** §06 asks for *toggle*: switching one off to see what it was
doing is the point, and it has to come back with its parameters intact.

**An unknown type is skipped, not fatal.** A document from a newer build will name
behaviours this one has never heard of. Drawing the layer without one effect beats not
drawing it.

**A behaviour producing nonsense is dropped.** `NaN` spreads through every later
behaviour and reaches the renderer as a shape that silently fails to draw.

## A stack belongs to a property, not to a layer

M10 stored one list on the layer and applied it to scale. That held while there was a
single behaviour in existence. The moment `pulse` was added it had nowhere correct to go
— it draws a ring, it does not change a size — and every marker in the demo began to
throb. Three golden frames caught it, and the answer was to ask *why* rather than to
recapture.

M11 keys stacks by the property each modifies: `scale` carries the pop, `ring` carries
the pulse. `pulse` is back as a real behaviour, and the two coexist without either
needing to know about the other.

**A generator is a legitimate behaviour.** `pulse` ignores the value handed to it. §06
says behaviours observe "the value so far"; nothing requires one to *use* it, and a
ring's phase has no base to build on. Its base is 0 — which is exactly what "no ring"
meant as a boolean, so a disabled stack reproduces the old picture rather than
approximating it.

Crossing the two channels deliberately moves the same three golden frames that found the
original error, which is the check that this shape is what is holding them apart.

## Equivalence

`pop` reproduces the `easeOutBack` curve exactly — checked against the original formula
across the whole entrance, **worst difference 0** — and all ten golden frames are
unchanged. What it gains is that `secs` and `over` are now parameters. Before, they were
constants in the evaluator, so every marker in every project popped identically.

## Not yet

Per-property stacks, which is what `pulse`, `anim`, `fade` and the region tour all need.
The graph substrate. `expr`, the fourth track kind.
