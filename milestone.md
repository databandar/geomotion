# GeoMotion — milestone roadmap

The next ten architectural milestones, derived from `docs/geomotion-v2-design.html`,
`VISION.md`, `ARCHITECTURE.md` and `ENGINEERING_GUIDE.md`, ranked against the state of the
repository rather than against the design doc alone.

Ranked by: **dependency ordering** first (a milestone that unblocks others outranks one that
does not), then **architectural importance**, **future extensibility**, **user value**, and
**implementation risk** as the tie-breaker.

No new features are invented here. Every milestone is something the design already describes
and the code does not yet do.

---

## Where the code actually is

Built and shipped: the flat node store (§04 Decision 01), transactions with patch-based undo,
the versioned format chain with a v1 importer, the entity registry with facts, provenance and
one join (§05 Decision 02), all four track kinds, behaviour stacks (§06), the camera node and
framing solver (§09), story blocks with ripple (§10), map contexts as nodes, the node-type
registry (§3.4), generated inspector panels, and in-page WebCodecs draft export (§14).

Not built, or partial: everything below.

---

## The ten

### 1. Every property is a track ✅ *shipped — format 9*

**Plain words:** any number on a layer can be animated, not just three of them.

§04 says "every property is a track" and gives one pipeline for the whole app. The machinery
was finished and connected to 3 of 89 properties. Twenty-eight now convert, resolved by one
registry-driven pass.

Blocks: 2, 4, 5, and parts of 7, 8 and 10. See
[`docs/features/every-property-a-track.md`](docs/features/every-property-a-track.md).

### 2. Transform inheritance and `space` on the node

**Plain words:** move a group and everything inside it moves. Each layer says whether it lives
on the map or on the screen.

§04's node shape is `{ …, space: 'world' | 'screen', … }` and "every node inherits transforms
from its parent". Groups exist and inherit visibility, lock and opacity — but not transform,
because until milestone 1 no node had one. `docs/features/groups.md` named this as the
blocked follow-on.

**Why here:** it completes §04. Parenting, constraints, nested scenes and the world-vs-screen
split in §13 all sit on it. Now unblocked and nothing else is ahead of it.

**Risk:** medium. Touches evaluation order (§06 normative: parent transform inheritance runs
after constraints and before the camera transform).

### 3. The regions panel is generated

**Plain words:** the last hand-written inspector panel goes away.

Six of seven converted in M2.7. Regions is 401 lines over seven sections and is mostly *not*
rows — a boundary loader, a paste importer with its own parser, a live per-region value table,
a ramp preview, a tri-state anchor over `boolean | null`, a custom stop order and a derived
stop list that seeks the playhead.

**Why here:** small, self-contained, and it is what makes §15's "a plugin's node type gets an
inspector for free" true without an asterisk. Also removes the last place a control's range is
typed by hand.

**Risk:** low-medium. High test coverage already; six of ten golden frames exercise regions.

### 4. Curve editor

**Plain words:** drag the *shape* of a movement, not just where it starts and ends.

§06: "per-channel bezier + hold + linear; graph editor as a timeline drawer; preset curves
incl. `easeOutBack`; roving keys". The timeline draws keyframe rows already.

**Why here:** it is the payoff of milestone 1. Thirty-one tracks now exist with no way to
shape them beyond four named easings.

**Risk:** low architecturally, medium in UI surface.

### 5. Camera rigs

**Plain words:** follow a path, look at a place, orbit, shake — as a stack you can reorder.

§09. `CameraNode.behaviours` exists and is empty, with a comment saying it stays empty until
this milestone. Behaviours apply over tracks, which is why this waited on milestone 1.

**Risk:** medium. The framing solver must stay the only path from "frame this" to camera
values.

### 6. GPU compositor v1

**Plain words:** draw on the graphics card instead of a 2D canvas, so big projects stay smooth.

§14 Decision 06 (WebGL2 now, WebGPU behind an abstraction) and §07 Decision 04 (MapLibre
renders the ground; GeoMotion renders everything that moves). The renderer is a 2D canvas
overlay today.

**Why not higher:** it is the largest and riskiest item on the list, and nothing above it is
blocked by it. It caps performance, not capability.

**Risk:** high. A rewrite of the drawing layer with golden frames as the only safety net.

### 7. Scene node type and nested scenes

**Plain words:** a project becomes a sequence of scenes, and a scene can be reused like a
template.

§10. M2.6 deliberately declined to introduce `Scene`, recording that story blocks already
carry what scenes were wanted for. That decision holds until nesting is needed — a
parameterised scene *is* §10's template.

**Why here:** needs milestone 2 (a scene owns a window and a local clock, which needs
transform and space).

### 8. Plugin worker boundary

**Plain words:** other people can add new layer types without touching the core.

§15. The node-type registry is its foundation and is built; what is missing is the sandboxed
worker, the manifest, and proposed transactions applied through `transact()`.

**Why here:** it needs `RenderScene` to be stable, which milestone 6 will disturb.

### 9. Label engine

**Plain words:** labels place themselves and stop overlapping.

§07: "an engine, not hand placement: deterministic collision solver, leader lines for small
regions, persistent per-label overrides."

**Why here:** genuinely self-contained and high user value, but nothing depends on it.

### 10. Entity geometry versions and the credits generator

**Plain words:** historical borders that change with the date, and a credits line generated
from the data actually used.

§05's keystone is two-thirds built: stable ids, facts with provenance, one join. Missing:
geometry *in versions* (official / Natural Earth / historical / user-edited), a project-level
boundary policy, and the credits generator that §05 calls "functional, not decorative".

---

## Deliberately not on this list

**The geometry editor (§08).** XL, and the design itself stages it behind the motion work.

**Multiplayer (§16).** The flat store and patch log make it incremental later; nothing is
gained by starting now.

**AI copilots (§12).** Decision 05 says they ride the plugin API — so milestone 8 comes first.
