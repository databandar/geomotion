# Property tracks

**Status:** M1 landed — the primitive and its evaluation. Adoption is staged; see below.

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

Worth being precise about what that adoption does and does not prove. `cameraAt` handles
its own out-of-range cases before delegating, so the camera exercises `evalTrack`'s
interpolation and easing but never its clamping or its multi-key scan — verified by
breaking each in turn and watching which suites went red. The camera caught the easing
break; the primitive's own tests caught all three. The substrate is guarded by its own
suite, and the adoption proves it composes, not that it is correct.

`center` and `bearing` stay hand-rolled for now — they need the longitude-wrapping and
angle interpolators, and `dip` is a per-segment modifier that is not a track at all. They
move in M2 with the interpolators.

## Not in M1

Document adoption beyond the camera, the inspector's source pip, timeline keyframe rows
for layer properties, `bound`, `expr`. Each is a later milestone with its own entry.
