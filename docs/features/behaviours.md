# The behaviour stack

**Status:** M10 landed — the runtime, and `pop` as the first behaviour.

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

This is the correction the milestone turned on, and it cost a golden failure to find.

`pulse` looks like a behaviour, and is one — a continuous oscillation with no last
keyframe to write. So it went into the marker's stack alongside `pop`. But that stack
applies to **scale**, and pulse does not modify scale: it draws a ring. The result was
that every marker in the demo began to throb, which is a different picture from the one
the project had — caught by three golden frames moving, then by asking *why* rather than
recapturing.

`pulse` stayed where it was. It needs a stack over its own channel, which is a later
step. One behaviour that is correct is worth more than two where one has been forced into
the wrong slot.

## Equivalence

`pop` reproduces the `easeOutBack` curve exactly — checked against the original formula
across the whole entrance, **worst difference 0** — and all ten golden frames are
unchanged. What it gains is that `secs` and `over` are now parameters. Before, they were
constants in the evaluator, so every marker in every project popped identically.

## Not yet

Per-property stacks, which is what `pulse`, `anim`, `fade` and the region tour all need.
The graph substrate. `expr`, the fourth track kind.
