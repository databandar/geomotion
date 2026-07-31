# Property tracks

**Status:** M3 landed — the primitive, the interpolators, the camera, and the first tracked
property in the document with a format chain behind it.

**Governing sections:** ARCHITECTURE §04 ("every property is a track"), §06 (normative
evaluation order). ENGINEERING_GUIDE §2 (`animation` owns `evalTrack`), §3.8, §126.

## The problem

§126 of the guide says features must not invent parallel animation mechanisms — "no
`animatedX: boolean` flags, no bespoke tween fields — the v1 anti-pattern". The document
currently contains eighteen of them: `fade`, `drawStart`/`drawEnd`/`drawEasing`, `pop`,
`pulse`, `anim`, `dissipateStart`/`dissipateEnd`, `moveTime`, `overshoot`, `introTrace`,
`sequenceReveal`. Each is a one-off tween with its own field names, its own timing rules
and its own evaluation code.

The cost compounds. Every new animated behaviour adds fields rather than reusing a
mechanism; nothing can be keyframed unless someone wrote a keyframe path for it
specifically (today only the camera has one); and the four things ARCHITECTURE builds on
top of tracks — expressions, bound values from entities, behaviour stacks, the graph
substrate — have nothing to attach to.

## The shape

From §04, unchanged:

```ts
Track = { kind: 'static',    value }
      | { kind: 'keyframed', keys: Keyframe[] }
      | { kind: 'bound',     ref, path, scale }   // §05, later milestone
      | { kind: 'expr',      source, inputs }     // §06, later milestone

value(t) = behaviors( expr( base(t) ) )
```

M1 implements `base(t)` for `static` and `keyframed`. `bound` and `expr` are declared in
the type union so the exhaustiveness checks that guard them exist from the start, and
they throw a clear "not implemented in this milestone" rather than silently returning a
default.

## Decisions

**Interpolation is a parameter, not a lookup.** §06 says "per-channel bezier". Numbers
lerp; angles take the short way round; longitude wraps at the antimeridian; colours and
strings hold. Baking a type table into `evalTrack` would mean the animation package
knowing what a longitude is, which §2 forbids — it may depend on `core` and on document
*types*, not on geographic semantics. The caller passes the interpolator.

**Easing belongs to the segment leaving a keyframe.** This is the existing camera
convention and changing it would silently retime every project that has one.

**A `hold` keyframe is a flag on the key, not a fifth track kind.** §04 fixes the kinds
at four and calls a fifth an ADR-level change; §06 lists "bezier + hold + linear" as
curve choices *within* a keyframed track, which is what this is.

**Out-of-range time clamps.** Before the first key a track reads the first value, after
the last it reads the last. The alternative — extrapolation — invents values nobody
authored, and at `t = 0` on a track whose first key is at 5s that would be visible.

## Staging

M1 is the primitive plus one real consumer: the camera's `zoom` and `pitch` channels,
which are already plain scalar keyframes. Adopting them runs the evaluator against
behaviour already covered by tests and golden frames, and it produces bit-identical
output.

In M1 that adoption was shallower than it looked: `cameraAt` still handled its own
out-of-range cases before delegating, so the camera exercised interpolation and easing
but never the clamp or the multi-key scan. Breaking each in turn, only the easing break
turned the evaluator red.

## M2 — the interpolators, and the whole camera

All four channels now resolve through `evalTrack`, each with its own interpolator:
longitude wraps at the antimeridian, bearing takes the short way round the compass, zoom
and pitch are ordinary numbers. `cameraAt` no longer scans or clamps for itself, so the
same three deliberate breaks now turn it red — the adoption guards the substrate rather
than merely using it.

The interpolators live in `core`, not `animation`. `core` already owns `LngLat`,
`lerp` and `lerpAngle`, and putting coordinate semantics in the motion engine is exactly
what the decision above rules out.

**`dip` is not a track.** It pulls the camera back mid-move and settles it again, peaks
at the middle in *raw* time regardless of easing, and is authored on the keyframe the
segment leaves. That is a modifier over `base(t)` — the first genuine behaviour in §06's
sense, and the concrete second consumer the behaviour stack has been waiting for. It
stays written out in `cameraAt` until that stack exists. `trackSegment` exposes the raw
segment position it needs, so it does not re-scan the keys behind the evaluator's back.

**Equivalence.** The rewrite was checked against the previous implementation
differentially — 60 random projects × 241 times, over 14,000 pairs including
antimeridian crossings, bearings past ±360 and random dips — all exactly equal, plus ten
bit-identical golden frames. That harness is not kept: it embeds a frozen copy of the old
code and would block any intended change to camera behaviour. Property tests replace it.

Channel tracks are cached per keyframe array in a `WeakMap`, which also removes a sort
that used to run every frame. Coordinates are copied in and out, so nothing downstream
can reach through the scene into the cache — or the document — and mutate a keyframe.

## M3 — into the document

`MarkerLayer.size` is a `Track<number>`. A marker can now be keyframed and it grows —
the first property in the app other than the camera that can move at all.

**The format chain** (§3.6) did not exist and now does: `format` as one integer,
`migrateNtoN+1` steps in `document/migrations/`, run in order at load, before the
default-filling. A chain rather than one function that knows every historical shape,
because each step only has to understand two adjacent formats — small enough to get right
and to test alone. Format 1 → 2 wraps marker size and removes `version`, which §3.6.4
requires: two fields meaning the same thing let two readers disagree about which is
authoritative.

**Frozen fixtures** (§3.6.5) live in `packages/document/fixtures/`, one per format, and
the suite loads every one to current. The point is not that the newest migration works —
that is easy to check while writing it — but that format 1 still opens after the tenth
migration is written, when nobody remembers what it looked like.

**The evaluator is where tracks resolve.** §1.5 makes it the one place that turns a
document plus a time into plain data, so the renderer still receives a number and never
learns what a track is. That is also what keeps the renderer testable without a document.

### Two things this turned up

A track is a **discriminated union**, and the "defaults are the schema" type repair from
M35 cannot handle one: it merged field by field against a *static* default, so a loaded
keyframed track came back with a nonsense `value: 8` beside its `keys`. Harmless to
`evalTrack`, which switches on `kind` — but it was written back to disk, so every saved
project would have carried the junk. `coerceTrack` validates the union as a whole.

`MarkerStyle` was the only render style with no `id`, so nothing could match a rendered
marker back to its layer. Added, and the map canvas now reads the marker's resolved size
off the scene rather than resolving the track a second time.

## Not yet

The inspector's source pip and an animate control (M4) — today the slider shows the
resting value and writing replaces the track with a static one, which discards keyframes.
That is deliberate and visible rather than hidden behind a helper. Then timeline keyframe
rows, the remaining bespoke tweens, `bound`, `expr`.
