# A frame never goes out before its tiles

**Design-doc section:** ARCHITECTURE §00 (the time-source scar: "one deterministic clock"),
§14 (export: "assets awaited per frame") · **Owner package(s):** `apps/studio`,
`apps/pipeline` · **Status:** shipped

## Problem

Rendered videos sometimes showed grey basemap loading blocks. Two causes, and the second is
the real defect.

**A draft never waits.** `render-project.mjs` and `video.mjs` both pass
`waitForTiles: !draft`. Skipping the wait is what makes a draft fast, and it is why a draft
shows blocks. That is a trade, not a bug — but it had no opt-out.

**A full render waited and then gave up in silence.** `waitForIdle` in
`apps/studio/src/render/host.ts`:

```ts
const timer = setTimeout(finish, timeoutMs);   // finish() RESOLVED
```

Both the `idle` event and the timeout called the same `finish`, which resolved. So a tile
that never arrived within 12 s was indistinguishable, to every caller, from one that arrived
instantly. The frame was captured with the blocks still in it, the loop moved on, and the
render reported success. **Nothing anywhere admitted that a frame had gone out unfinished.**

§14 says assets are "awaited per frame". They were awaited; the await just could not fail.

## What changed

**`waitForIdle` returns a verdict.** `true` settled, `false` gave up. It still resolves rather
than rejects — a render must not unwind on frame 41 of 700 — but the caller can now tell the
difference, which is the whole fix.

**Timing out stays legal.** A render cannot hang forever on one dead tile server. What is not
legal is pretending it did not happen.

**The frame loops count.** Both of them — the screenshot path and the in-page encoder — record
which frame indices were captured early, and report at the end:

```
! 3 of 724 frames were captured before their basemap tiles finished.
  Those frames have loading blocks in them. Re-run with --wait-tiles.
```

**Tiles are warmed before frame 0**, on a 30 s budget instead of 12. Most timeouts are the
cold start — an empty cache fetching a whole viewport at once — not the middle of a render,
where the camera has usually moved a little and most of what it needs is already there. Paying
for that once, generously, is what stops the opening seconds going out grey.

**Two flags.** `--wait-tiles` buys a draft the waiting back, for when the draft is being used
to judge the picture rather than the timing. `--strict-tiles` makes an unfinished frame a
failed render, for CI.

## Measured

Against the bundled 724-frame example, warm cache:

| | time | unfinished frames reported |
| --- | --- | --- |
| `--draft` | 19 s | 0 |
| `--draft --wait-tiles` | 74 s | 0 |

The 4× is the cost of correctness on a draft, which is why it stays opt-in and why the default
did not change.

## Tests

`apps/studio/src/render/host.test.ts` — the verdict, which is what this change is about: true
when already loaded, true when idle arrives, **false when the deadline wins**, the listener
removed either way (this runs once per frame, so a leaked listener is a leak per frame), and
one answer even if `idle` fires twice.

The plumbing from that verdict to the CLI message is straight data-passing and is exercised by
running the pipeline, which is debt D12's territory rather than the unit suite's.

## Future extensions

- **A per-frame budget derived from the camera move.** A cut to a new continent needs longer
  than a slow push; one constant serves both badly.
- **Fail the render by default** once the warning has been live long enough to know it does not
  cry wolf. `--strict-tiles` is the opt-in rehearsal for that.
