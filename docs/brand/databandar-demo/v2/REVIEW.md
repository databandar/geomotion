# Creative review — "Half of Humanity" v1 → v2

v1: [`../half-of-humanity.mp4`](../half-of-humanity.mp4). This review is grounded in actual
frames pulled from that file at 18 timestamps across its full 40s, not from memory of building
it — screenshots referenced below are what the critique is based on.

## The critique

**Hook — fails.** The first 3+ seconds are a static, small, dark globe sitting in a mostly-empty
vertical frame while the title fades in on top of it. No motion, no number, no reason a
scrolling thumb stops. This is exactly "slowly establish context," which the brief bans by name.

**Pacing — repetitive.** Seven scene-beats share almost the same shape: idle globe → push in →
stat card holds 4–6.5s → pull back to roughly the same idle framing → repeat. Four of those
seven beats are visually interchangeable if you mute the narration.

**Information density — front-loaded on narration, thin on screen.** The script is tight and
each line earns its place. But four of seven beats add nothing to the *screen* beyond a stat
card's numbers changing — the visual reveal *is* the narration restated as text, not a distinct
insight of its own.

**Visual hierarchy — broken by basemap clutter.** This is the single largest problem in the
piece. Every zoomed-in shot is covered in the basemap's own default labels — country names,
city names, even sub-national region names (Normandy, Bavaria, Saxony-Anhalt) at the Netherlands
stop. At the closing statistic — the entire payoff of the video — the words "50% POPULATION /
13% OF THE LAND" sit directly on top of a wall of ~30 default country labels (Greenland,
Kazakhstan, Mongolia, Turkmenistan, Sri Lanka, Papua New Guinea...). The most important two
seconds of the film are the most visually cluttered.

**Narration — holds up.** Clear, correctly paced, every fact checked against a source before
recording (see `../README.md`'s account of the Valeriepieris circle being dropped). Not what
needs fixing.

**GeoMotion usage — correct choice, wrong basemap.** The choropleth, tour, and camera are all
doing real explanatory work. The basemap underneath them is doing decorative — actually
anti-decorative — work: showing information nobody asked it to show.

**Hyperframe usage — absent.** The film's actual thesis — that 50% of people occupy 13% of
land — is stated only as narration plus a number. That ratio is exactly the kind of abstract,
non-geographic idea Hyperframe should own, and it's the one moment in the film with no
dedicated visual built for the idea itself.

**Camera movement — competent moves, repetitive structure.** Individual pushes and pinches are
smooth. The *pattern* — reset to idle, push, hold, reset to idle — is the "world / zoom / stat /
world / zoom / stat" rhythm the brief calls out by name, and it repeats four times.

**Typography — sound, undermined by its environment.** Tabular figures, restrained sizing,
correct hierarchy. It's fighting the basemap for attention on every frame that has one.

**Transitions — none are semantic.** Every cut is a push or a hard cut on a new location. No
moment where a shape becomes a map, or an abstraction becomes a place.

**Ending — passive.** A 3-second static hold on the closing text over a label-cluttered globe,
then it just ends. No final surprise, no button, no implication beyond the number already shown.

**Emotional progression — flat.** Curiosity should build from the open; the open isn't curious
enough to start it. The middle is tonally uniform. The ending doesn't twist or land harder than
the middle did.

**Audience retention — two real risk points.** A static, tiny, label-free-nothing opening loses
scroll-swipers before 2 seconds. The third near-identical stat-card beat (~20s in) is where a
viewer who's still there has seen the format enough times to predict the rest.

**Screenshot test — fails on more than half the sampled frames.** Of 18 frames pulled at ~2s
intervals, roughly 10 would not read as an intentional, striking thumbnail on their own — mostly
the label-cluttered wide shots and the static mid-hold stat cards.

## The panel

Six independent passes over the same evidence and the same redesign plan (below), each from a
different professional stake in the outcome. Convened once, on paper, before any v2 frame was
rendered — catching a structural problem in an edit is a script change; catching it in a
finished render is a re-render.

**Executive Producer** — *Does this represent the brand and justify the runtime?* v1's problem
isn't length, it's density-per-second: 40s that plays four near-identical beats doesn't feel
long, it feels *repetitive*. Approves the plan to compress narration (7 lines instead of 7 lines
plus a separate claim line — the claim moves into the Hyperframe visual) and to spend the saved
time on one genuinely new idea (the density diagram) rather than more runtime. Flags the ending:
a real button, not a fade, or this note stands until it's fixed.

**Motion Design Director** — *Does every motion have a reason?* The repeated idle-globe reset is
the flag: a camera returning to the same pose four times isn't a design choice, it's a default.
Requires the v2 camera to be one continuous path with exactly one wide reset — reserved for the
final button, not spent four times on the way there. Also flags the built-in stat card: keep it
(it's well-designed on its own), but it needs room to be the only UI element in frame, which
means the basemap fix isn't optional, it's a prerequisite for this note to close.

**Investigative Journalist** — *Is every claim still defensible after the edit?* Compressing
narration must not compress out a caveat. Checks: the country-level-granularity caveat on the
density data stays in the written record even if it's not spoken (it's in the data file's
`_note` and this repo's README, which is enough — it was never meant to be narrated). Checks the
new closing line ("half of us, one-eighth of the Earth") restates only numbers already shown on
screen, introducing no new unverified claim. Approves.

**Senior Video Editor** — *Does the cut breathe, and does the rhythm vary?* The fix for "world /
zoom / stat" repeated four times is not to remove the repetition, it's to break the *pattern*:
same shot grammar every time reads as a template. Requires at least one beat (Netherlands) to
use a different device than "arrive, card, leave" — a comparison arc back to Bangladesh, so the
viewer is shown the comparison instead of told it. Requires the Hyperframe-to-globe cut to be a
match cut, not an arbitrary one — the diagram's cluster and the globe's landmass should occupy
roughly the same part of the frame across the cut, or it reads as two different videos stitched
together.

**Art Director** — *Is every frame composed, not just correct?* Same finding as the screenshot
test, independently: the label clutter is a composition failure before it's a legibility one —
every zoomed shot has 15+ competing text weights fighting the one number that matters. Requires
the label-free basemap as non-negotiable. Also flags the opening's text-over-globe overlap in
v1 (the title sits directly on the globe's rim, illegible against both dark and light patches
under it) — the diagram replaces this shot entirely, so the note closes by removal rather than
by fixing the composition in place.

**Audience Retention Specialist** — *Where does a swiping thumb actually leave?* Two windows:
0–2s (the static open) and ~18–22s (the third repeat of the same card format). The redesign
addresses the first directly (cold open on the diagram, already mid-motion, first spoken word
inside the first second) and the second structurally (no two consecutive beats now share a
camera pattern — Bangladesh arrives by push, Netherlands by comparison arc, India by a bigger
push with a counter, China by the crossing-point reveal). Requires the final cut be tested by
extracting frames at ~2s intervals and screenshot-testing each one, same method as this review,
so the fix is verified against the actual render and not just against the plan.

**Convened outcome:** six notes, four already satisfied by the plan below (compression, camera
continuity, match cut, screenshot test as a build step), two treated as hard requirements before
v2 ships (label-free basemap; a real ending button, not a fade). Both are load-bearing in the
plan in the next document, not left as follow-ups.
