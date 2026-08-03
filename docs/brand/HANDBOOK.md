# GROUNDTRUTH — Production Handbook

**Internal. v1.0.**

> **ground truth** *(n., remote sensing)* — information confirmed by direct observation at the
> location, as opposed to inference from a distance.

Every story has a location. We go there.

---

# PART 1 — CREATIVE STRATEGY

## 1.1 The one-sentence brand

**GROUNDTRUTH explains the world by showing you where it happens.**

Not "geography facts." Not "10 things you didn't know." We take a thing you have heard about
and show you the *place* that causes it — because for a large class of stories, the map is not
an illustration of the explanation, the map **is** the explanation.

That is the editorial filter for every idea: **if the map is decoration, we don't make it.**

## 1.2 Target audience

| | |
|---|---|
| **Core** | 22–38, globally distributed, English-fluent, reads headlines but not the article |
| **Psychographic** | Wants to feel *informed*, not entertained. Screenshots things. Argues in comments with sources. |
| **The actual job** | "Give me a durable mental model I can redeploy in a conversation this week." |
| **Secondary** | 16–22 students — geography, IR, econ. High save + share rate, low comment quality. |
| **Not our audience** | People who want opinions. We supply the map; they supply the argument. |

**The retention promise:** every video leaves the viewer with **one transferable spatial idea**
— a shape, a chokepoint, a distance, an overlay — that they will recognise in the news later.
That recognition is what makes them subscribe.

## 1.3 Storytelling philosophy

Five rules. They are not stylistic preferences; they are the format.

**1. The map is the argument.**
Open on a place, not on a person or a claim. If the first frame isn't a location, rewrite.

**2. One idea per video. One.**
45–90 seconds holds exactly one causal chain. A second idea does not enrich it, it replaces it.

**3. Specificity is the authority.**
Never "very narrow." Say **700 metres**. Never "a long way round." Say **6,000 extra kilometres
and nine days**. Numbers with units are the entire credibility strategy — we have no host, no
face, no institution. The precision *is* the byline.

**4. Withhold, then land.**
Structure is a **curiosity gap held open**, not a list. State a fact that shouldn't be true, keep
it unresolved through the body, resolve it in one line at ~70%. The resolution should feel
inevitable in hindsight and invisible in advance.

**5. Never explain the map.**
Do not say "as you can see here." The visual carries the location; the narration carries the
consequence. If the narration describes what is on screen, one of them is redundant — and it is
always the narration.

### The forbidden list

- Rhetorical questions after the hook ("But why?")
- "Imagine if…", "Let that sink in", "Nobody talks about this"
- Countdown structures ("Number 3 will shock you")
- Stock footage of people walking through cities
- Any claim we cannot source to a named dataset
- Calls to action before the 6-month mark (they cost 4–8% average view duration on Shorts)

## 1.4 Content pillars

Five. Ratio per 10 uploads: **4 / 2 / 2 / 1 / 1**.

| # | Pillar | What it is | Why it's here |
|---|---|---|---|
| **1** | **CHOKEPOINTS** | Narrow places that control wide systems — straits, passes, canals, cables, corridors | Our highest-performing shape. Small place, global consequence. Perfect map payload. |
| **2** | **BORDERS** | Lines that don't make sense, and the decision that drew them | Highest comment volume. Handle with the most editorial care. |
| **3** | **FLOWS** | Movement — goods, water, people, energy, money | Best use of animation over time. Routes are the most natural motion on a map. |
| **4** | **BUILT** | Infrastructure that reshapes geography — dams, ports, rail, grids | Strong for "megaproject" search demand, and visually enormous. |
| **5** | **CHANGE** | A place that is not what it was — shrinking seas, moving coastlines, new ice routes | Emotional pillar. Slowest pacing, longest runtime, highest save rate. |

## 1.5 Pacing — the 90-second clock

Vertical short-form does not have acts. It has a **decay curve** and we fight it at four points.

| Beat | Time | Job | Failure mode if missed |
|---|---|---|---|
| **COLD** | 0.0–1.5s | A place on screen, no logo, no intro | 30% gone by 2s |
| **CLAIM** | 1.5–4.0s | The fact that shouldn't be true | Scroll |
| **TURN** | 4.0–8.0s | Name the gap you are about to hold open | Viewer doesn't know what they're waiting for |
| **BODY** | 8–55s | 3–5 evidence beats, each a new location or new scale | Flatline |
| **REVERSAL** | ~65–72% | The cause. Must relocate the camera somewhere unexpected | No payoff, no share |
| **LAND** | Final 6s | One sentence. Stop. | Talking past the ending kills replay |

**The 2-second rule.** No shot holds longer than 2.0s without the camera moving, a label
arriving, a number changing, or a scale change. Not "a cut" — a *change of information*. Cutting
between two static maps is worse than one moving map.

**The information budget.** 45–90s carries **9–14 information beats**. Fewer is thin. More is
noise, and it is the single most common failure of this format — over-stuffing reads as
low-quality, not high-value.

## 1.6 Visual language

### The core idea: **the lit map in a dark room**

Everything is a luminous data surface floating in near-black. There is no "background image,"
no gradient wallpaper, no drop shadow that isn't functional. The frame is an instrument, not a
poster.

This separates us cleanly from the reference set:

| Channel | Their look | Why we're not that |
|---|---|---|
| Vox | Bright, flat, playful, illustration-forward | We are cold and evidentiary |
| Johnny Harris | Warm, grain, handheld, personal | We have no narrator persona |
| Bloomberg | Corporate teal, glossy 3D | We are matte and restrained |
| Economist | Red/white, print-derived, static | We move continuously |
| NYT Visual Investigations | Clinical white, evidence overlays | We are dark, and we explain rather than prove |
| RealLifeLore | Stock + Google Earth | Every frame is authored |

### The signature device: **THE REGISTRATION**

Our one ownable move. Whenever a location becomes the subject, a **hairline reticle** snaps onto
it — two brackets closing, a 1px crosshair, a coordinate readout ticking to its final value —
accompanied by the `click` sound.

It reads as *verification*. It ties directly to the brand name. After ~15 videos it is
recognisable in 4 frames with the sound off.

**Rules:** one registration on screen at a time; only for a location the narration is naming
*right now*; never decorative.

### The instrument frame (persistent HUD)

A hairline chrome that persists across every video at 22% opacity:

- **Top-left:** live coordinate readout, mono, tabular figures, updates with the camera
- **Bottom-left:** scale bar that morphs as zoom changes — **this is an educational element**,
  it is how the viewer feels a 700 m strait versus a 6,000 km detour
- **Bottom-right:** source slug (`NATURAL EARTH · UNCTAD 2024`), 11px, always present

The HUD is never animated for style. It only moves because the camera moved.

### Safe areas (9:16, 1080×1920)

| Zone | px | Rule |
|---|---|---|
| Top | 0–260 | UI overlap. **No content.** |
| Title band | 260–520 | Big type lives here, never lower |
| Optical centre | 520–1400 | The map subject. Camera targets this, not frame centre. |
| Data band | 1400–1700 | Numbers, readouts, comparison bars |
| Bottom | 1700–1920 | Caption + UI. **No content.** |

**The vertical map correction:** a 9:16 frame is 2.37× taller than wide. Framing a country by
its bounding box puts it in a letterbox of empty ocean. Always frame to the **optical centre
band** and let the map bleed off top and bottom.

## 1.7 Colour

**Six values. That's the entire system.**

| Token | Hex | Use | Rule |
|---|---|---|---|
| `VOID` | `#0A0E13` | Background, ocean, negative space | ~70% of every frame |
| `LAND` | `#1B232D` | Neutral landmass | Never the subject |
| `PAPER` | `#F2F4F5` | Type, borders, reticle | Never pure white |
| `SIGNAL` | `#FF4A26` | **The subject of the sentence** | Max one region at a time |
| `COLD` | `#3D9BFF` | The counterparty — water, the other side, "them" | Only in opposition to SIGNAL |
| `AMBER` | `#FFC24D` | Warning, loss, historical | Sparingly, ~3 shots max |

**The one-signal rule.** At any instant, exactly one thing on screen is `SIGNAL`. When the
subject changes, the previous one demotes to `LAND` over 240ms. This is the discipline that
makes the frame read instantly. Break it and the video looks like every other map channel.

**Ramps** (choropleths only): `inferno` flipped on dark ground — bright = high. Never a rainbow.
Always monotonic in lightness so rank survives greyscale.

## 1.8 Typography

| Role | Primary | Free fallback | Rules |
|---|---|---|---|
| **Display** | Söhne Breit | **Archivo Expanded** | 96–140px, all-caps, tracking −1% |
| **Body / labels** | Söhne | **Inter Tight** | 34–44px, sentence case |
| **Map labels** | Söhne Mono | **JetBrains Mono** | 24–28px, ALL CAPS, tracking +8% |
| **Data / numerals** | Söhne Mono | **JetBrains Mono** | **Tabular figures mandatory** |

**Tabular figures are not a preference.** A counter running `1,000 → 9,999` in proportional
figures shifts width every frame and reads as amateur. This is the single most common typography
failure in data motion graphics.

### Text rules

- **Max 5 words on screen.** Ever.
- **The narration and the on-screen text are never the same words.** Text carries the *number*;
  voice carries the *meaning*. Duplicating them wastes both.
- Numbers get the display size. Words don't.
- Text enters by **mask reveal** (wipe from the left, 180ms) — never fade, never scale, never
  slide up. Fades read as templates.
- Units always set 40% smaller than the figure, in `PAPER` at 60% opacity: **700**<sub>m</sub>

## 1.9 Transitions

Four. Named. Nothing else is approved.

| Name | What | When | Duration |
|---|---|---|---|
| **THE MATCH** | Cut between two places at identical zoom + bearing | Comparison beats | 0 (hard cut) |
| **THE PUSH** | Continuous camera move; no cut at all | Within a region | 600–1200ms |
| **THE STRIP** | Basemap fades to `VOID`, data stays, new basemap fades in | Changing map type | 400ms |
| **THE CLEAR** | Cloud layer parts to reveal | Openings, and once at the reversal | 900ms |

**Banned:** whip pans, glitch, light leaks, zoom-blur, page curl, anything with a lens flare, any
transition that would work equally well in a wedding video.

**The principle:** a transition either preserves spatial continuity (PUSH) or deliberately breaks
it for comparison (MATCH). There is no third reason to change shot.

## 1.10 Music

**Brief:** sub-bass pulse, granular texture, one metallic motif. No melody, no drums with a
backbeat, no "epic" strings, no piano.

- **Reference:** Ben Salisbury & Geoff Barrow (*Annihilation*), Mica Levi (*Under the Skin*), The
  Haxan Cloak, Colin Stetson
- **Tempo:** 88–96 BPM, locked. Cuts land on the pulse.
- **Structure:** one drone bed the entire runtime + a **single filter-open at the reversal**.
  That filter sweep is the only "moment" the music is allowed.
- **Level:** −24 LUFS under narration, −18 in the two gaps
- **Sourcing:** Musicbed / Artlist, tags `tension`, `minimal`, `pulse`, `documentary`. Reject
  anything with a discernible chord progression.

**The two silences.** Music drops out completely for ~700ms twice: once at the CLAIM, once at the
REVERSAL. Silence is the most expensive tool we have and the cheapest to deploy.

## 1.11 Narration

We use synthetic voice. **That is a writing constraint, not just a production choice.**

### Write for a voice that cannot act

AI voices fail at emphasis, irony, and building a sentence. So:

- **Short declaratives.** Average 9 words. Never exceed 18.
- **Front-load the noun.** "The Bosphorus is 700 metres wide" — not "At its narrowest point, the
  strait known as the Bosphorus measures…"
- **No subordinate clauses stacked before the verb.**
- **Put the emphasis in the *word choice*, not the delivery.** If the line needs a vocal punch to
  land, the line is wrong.
- **Present tense** for geography, past for events. Never conditional.
- **One sentence per shot.** If a shot needs two sentences, it needs two shots.

### Voice spec

| | |
|---|---|
| **Engine** | Voicebox — cloned profile, `chatterbox` engine |
| **Character** | Mid-30s, neutral transatlantic, calm, slightly cold. Not warm. Not "trailer." |
| **Pace** | 2.5–2.8 words/sec (≈165 wpm) — slower than conversational, faster than documentary |
| **Consistency** | **One cloned profile, locked, for the life of the channel.** The voice is brand equity; regenerating it mid-season resets recognition. |
| **Processing** | De-ess, high-pass 80Hz, gentle 3:1 comp, −16 LUFS |

**Word count maths:** target seconds × 2.65 = words. A 75s video is **~190 words**. Write to that
number before writing to the story.

## 1.12 Editing style

- **Cut on the beat, not on the sentence.** Narration crosses cuts; that's what makes it feel
  continuous rather than slide-based.
- **L-cuts on every scene change.** Audio of the next beat starts 6–10 frames early.
- **Never cut on a camera move's midpoint** — cut at rest or at full speed, never at 40%.
- **Subtitles are burned in, always.** 85% of Shorts are watched muted at least partly. Subtitle
  = 44px Inter Tight Medium, `PAPER`, 2-line max, bottom of the data band, `VOID` at 70% behind.
- **Frame rate 30fps** for delivery; author at 60 in GeoMotion for smooth camera, conform down.
- **No speed ramps.** Ever. They are the tell of a template edit.

---

# PART 2 — STORY FRAMEWORKS

35 reusable structures. Each is a *shape of argument*, not a title pattern — the title is
downstream.

**Format key:** `Spine` = the GeoMotion shot grammar sequence (defined in Part 3.1).

## Family A — CAUSE (geography explains the thing)

### A1 · THE CHOKEPOINT
> *A narrow place controls a wide system.*
**Structure:** Show the system at scale → find the pinch → measure it → show what fails if it
closes.
**Spine:** `DROP → SPINE → PINCH → COUNT → TETHER`
**Best for:** straits, canals, passes, cables, single bridges
**Titles:** "700 Metres Decide This" · "The Whole System Runs Through Here"

### A2 · THE LINE THAT SHOULDN'T BE THERE
> *An anomalous border, and the decision behind it.*
**Structure:** Trace the strange line → show it can't be terrain → reveal the human decision.
**Spine:** `TRACE → SWEEP → LIFT → STRIP`
**Best for:** enclaves, straight-line borders, panhandles, exclaves
**Care:** highest comment-risk family. Sources on screen.

### A3 · THE WRONG CAPITAL
> *Why the capital is not the biggest city.*
**Structure:** Show the obvious candidate → show the actual capital → the spatial logic (defence,
neutrality, centrality, port access).
**Spine:** `SNAP → HOP → SNAP → BLEED → DIM`

### A4 · THE INVISIBLE WALL
> *A line nobody drew that everybody lives along.*
Rainfall isohyets, tsetse belts, permafrost lines, the 100th meridian, aridity boundaries.
**Structure:** Population dots → the mystery edge → overlay the physical variable → they match.
**Spine:** `BLEED → STACK → STRIP → DIM`
**This is our most "premium-feeling" framework.** The overlay reveal is the payoff.

### A5 · THE ONE RESOURCE
> *A single deposit shapes an entire state.*
**Spine:** `DROP → SNAP → BLEED → TETHER → COUNT`

### A6 · THE SHAPE PROBLEM
> *A country's outline is its constraint.* (Chile, Gambia, DRC, Norway)
**Structure:** Trace the shape → measure the awkward dimension → show the cost in time/distance.
**Spine:** `TRACE → SWEEP → COUNT → STACK`

### A7 · THE ALTITUDE STORY
> *Elevation explains the economy.*
**Spine:** `LIFT → PIVOT → BLEED → SNAP`
Terrain exaggeration is the whole shot. Best for the Andes, Ethiopia, Nepal, Switzerland.

### A8 · THE RAIN SHADOW
> *One ridge makes a desert.*
**Spine:** `LIFT → SWEEP → STACK → BLEED`

## Family B — MOVEMENT

### B1 · THE DETOUR
> *A route closed. Here's the cost.*
**Structure:** Normal route → the block → the alternative → distance/days/dollars.
**Spine:** `SPINE → PINCH → SPINE(alt) → COUNT`
**Our most reliable performer.** Two routes on one map is instantly legible.

### B2 · THE FLOW
> *Something moves, continuously, and it explains a headline.*
**Spine:** `STRIP → SPINE(×n) → BLEED → DIM`

### B3 · THE JOURNEY OF ONE THING
> *Follow a single object across the supply chain.*
**Spine:** `SNAP → SPINE → HOP → SPINE → HOP → COUNT`
Highest Hyperframe content of any framework (the object itself, cutaways).

### B4 · THE CORRIDOR
> *A narrow strip that funnels everything through it.*
Darién Gap, Suwałki, Wakhan, Zangezur.
**Spine:** `DROP → PINCH → SPINE → LIFT`

### B5 · THE SEASONAL SURGE
> *The same place, twice a year, unrecognisable.*
**Spine:** `MATCH cut pairs → BLEED → COUNT`

### B6 · THE INVISIBLE INFRASTRUCTURE
> *Cables, pipelines, flight corridors — the map nobody sees.*
**Spine:** `STRIP → SPINE(×n) → PINCH → TETHER`

### B7 · THE WATER TOWER
> *One highland feeds many countries.*
**Spine:** `LIFT → SPINE(downstream) → BLEED → DIM`

## Family C — BORDERS & SOVEREIGNTY

### C1 · THE ENCLAVE
**Spine:** `DROP → TRACE → PINCH → SPINE(access route)`

### C2 · THE DISPUTED PIXEL
> *A tiny area, disproportionate stakes.*
**Spine:** `PINCH → SNAP → STACK → TETHER`

### C3 · THE STRAIGHT LINE
> *Colonial cartography and its downstream effects.*
**Spine:** `SWEEP → STRIP → BLEED → DIM`

### C4 · THE SHRINKING MAP
> *Territory lost across time.*
**Spine:** `TRACE(×n over time) → COUNT → STACK`

### C5 · THE COUNTRY THAT ISN'T
> *De facto states, unrecognised borders.*
**Spine:** `TRACE → BLEED(recognition) → SNAP`
**Care:** name the recognising bodies precisely. Never editorialise.

### C6 · THE ACCESS PROBLEM
> *Landlocked, and what it costs.*
**Spine:** `TRACE → SPINE(to nearest port) → COUNT → STACK`

### C7 · THE SPLIT CITY
**Spine:** `PINCH → SWEEP → STACK → DIM`

## Family D — BUILT

### D1 · THE BOTTLENECK
> *One piece of infrastructure everything depends on.*
**Spine:** `DROP → PINCH → COUNT → TETHER`

### D2 · THE MEGAPROJECT
> *What it changes, spatially, when finished.*
**Spine:** `SPINE(planned) → STACK(before/after) → BLEED → COUNT`

### D3 · THE PORT WAR
> *Two hubs competing for the same flow.*
**Spine:** `MATCH pairs → SPINE(×2) → BLEED → COUNT`

### D4 · THE DEAD INFRASTRUCTURE
> *Built, then abandoned. The geography that killed it.*
**Spine:** `DROP → TRACE → STRIP → LIFT`

### D5 · THE GRID
> *Energy and water networks as geography.*
**Spine:** `STRIP → SPINE(×n) → PINCH → BLEED`

### D6 · THE NEW ROUTE
> *A corridor that didn't exist ten years ago.*
**Spine:** `SPINE(old) → SPINE(new) → COUNT → TETHER`

## Family E — CHANGE

### E1 · THE VANISHING
> *A lake, glacier, island, coastline — disappearing.*
**Spine:** `TRACE(t1) → TRACE(t2) → TRACE(t3) → STACK → COUNT`
Slowest pacing in the system. 2.5s holds allowed. Highest save rate.

### E2 · THE TIMELAPSE
**Spine:** `BLEED(animated over years) → SNAP → COUNT`

### E3 · THE REVERSAL
> *A trend that flipped, and where.*
**Spine:** `BLEED(t1) → BLEED(t2) → DIM → SNAP`

### E4 · THE DATE THAT REDREW
> *One day, one map change.*
**Spine:** `TRACE(before) → CLEAR → TRACE(after) → COUNT`

### E5 · THE OPENING
> *Ice retreat, new passages, new access.*
**Spine:** `BLEED(seasonal) → SPINE(new route) → COUNT → TETHER`

## Family F — COMPARISON & SCALE

### F1 · THE TRUE SIZE
> *Projection deception, corrected.*
**Spine:** `STACK → PIVOT → COUNT`
Requires the equal-area reprojection shot. Highest "I didn't know that" rate.

### F2 · THE OVERLAY
> *Put one place on top of another at true scale.*
**Spine:** `TRACE → STACK → DIM`

### F3 · THE DENSITY SHOCK
> *Where everyone actually lives.*
**Spine:** `BLEED → STRIP → PINCH → COUNT`

### F4 · THE RANKING RUN
> *A tour of extremes, ordered.*
**Spine:** `BLEED → region tour (valueDesc) → COUNT`
The only framework that uses the full automatic region tour.

### F5 · THE EQUIVALENT
> *"This area equals that country."*
**Spine:** `TRACE → STACK → COUNT`

## Family G — INVESTIGATION

### G1 · THE GEOLOCATION
> *Verify a claim from what's visible in the frame.*
**Spine:** `SNAP → PINCH → STACK(imagery) → COUNT`
Closest to NYT VI. Use sparingly — 1 in 20 — it is expensive and slow.

### G2 · THE PATTERN
> *A cluster on a map reveals a cause.*
**Spine:** `BLEED → DIM → STACK → SNAP`

### G3 · THE MISSING DATA
> *Where the numbers don't exist, and why that's the story.*
**Spine:** `BLEED(with holes) → DIM → SNAP → STRIP`
Our most distinctive editorial position. Nobody else makes this.

---

# PART 3 — GEOMOTION USAGE

## 3.1 The shot grammar

Sixteen named moves. Every storyboard is written in these. Each maps to concrete GeoMotion
features, so a shot name is a build instruction, not a mood.

| Move | What the viewer sees | GeoMotion build |
|---|---|---|
| **DROP** | Descend from orbit to a place | Camera keyframes: `pitch 55→0`, `zoom 2.4→5.5`, `easeInOutCubic`, 1400ms |
| **TRACE** | A border draws itself on | `shape` layer, `traceOutline: true`, `lineWidth` track 0→3 |
| **SNAP** | Reticle registers a point | `marker` layer + `pulse` ring behaviour + label; `click` SFX on the frame it lands |
| **SPINE** | Camera travels along a route as it draws | `route` layer, `curve: 'arc'`, `progress: windowTrack(a,b,'easeInOutCubic')`, camera keyframed along the same path |
| **PINCH** | Zoom until the scale bar reads metres | Camera `zoom → 11–13`, hold 600ms at rest |
| **PIVOT** | Rotate around a fixed point | `bearing` keyframes ±35°, centre locked |
| **BLEED** | Choropleth fills in | `regions` layer, `ramp: 'inferno'`, `flipRamp: true`, `sequenceReveal: true` |
| **STACK** | Two geographies overlaid at true scale | Second `shape` layer, `fillOpacity` 0→0.45, matched projection |
| **SWEEP** | Pan along a line | Camera centre keyframes tracking a border/coast, constant zoom |
| **DIM** | Everything but the subject drops back | `tour.dimOthers: 0.45` (or per-layer opacity) |
| **LIFT** | Relief rises out of the flat map | `terrain: true`, `terrainExaggeration` 1→2.4, `pitch → 62` |
| **CLEAR** | Clouds part to reveal | `clouds` layer, `clear: windowTrack(a,b)` |
| **HOP** | Hard cut to a distant place at matched zoom | Two camera keyframe sets, identical zoom/bearing, cut in Resolve |
| **TETHER** | An arc links two distant points | `route` layer, `curve: 'arc'`, high `bow`, no marker |
| **COUNT** | A number counts up while the camera holds | `regions` `countUp: true`, or a text layer driven by a track |
| **STRIP** | Basemap falls away, data remains | `basemap: 'blank'` swap, or basemap opacity to 0 over 400ms |

## 3.2 Per-framework GeoMotion specification

Read as: **camera / map animation / borders / labels / routes / choropleth / comparison /
transition out**.

| Framework | Camera | Map animation | Borders | Labels | Routes | Choropleth | Comparison | Transition |
|---|---|---|---|---|---|---|---|---|
| **A1 Chokepoint** | DROP then PINCH to z12 | System-wide → single point | Neighbours at 30% only | Two: the strait, the sea it links | The full transit route, arc, 1.6s draw | — | Width bar vs a known object | PUSH into the pinch |
| **A2 Wrong line** | SWEEP along the line at z6 | TRACE 2.2s, then LIFT | **Subject border 3px SIGNAL**, all others 0.8px | Endpoints only | — | — | Terrain under the line (proves it isn't physical) | STRIP to blank |
| **A3 Wrong capital** | SNAP → HOP → SNAP | Two registrations, matched z7 | National only | Both cities, mono caps | — | Population, muted | Side-by-side dot size | MATCH |
| **A4 Invisible wall** | Static wide z4, slow 8% push | BLEED population, then STACK the physical layer | Off entirely | 3 max | — | **Two, sequenced** — the reveal is the alignment | The overlay itself | STRIP |
| **A5 One resource** | DROP → SNAP → TETHER out | Deposit pulses, then export arcs | Country only | Deposit + destinations | 3–5 export arcs, staggered 200ms | Production share | — | PUSH |
| **A6 Shape problem** | SWEEP the long axis | TRACE, then camera runs its length | SIGNAL, 3px | Two endpoints | — | — | STACK over a familiar country | MATCH |
| **A7 Altitude** | LIFT + PIVOT 35° | Terrain exaggeration 1→2.4 | Faint | Peaks + settlements | — | Population by elevation band | — | PUSH down to flat |
| **A8 Rain shadow** | SWEEP perpendicular to the ridge | LIFT then STACK rainfall | Off | Ridge name only | — | Precipitation | Windward vs leeward split | STRIP |
| **B1 Detour** | Wide z3, follow route 1, then route 2 | Two SPINEs, second in AMBER | 20% | Origin, destination, block point | **Both routes, drawn sequentially** | — | Distance bars in data band | PUSH |
| **B2 Flow** | Slow orbital PIVOT | Multiple SPINEs staggered | Off | Sources + sinks | 5–9 arcs, weighted by width | Volume by origin | — | STRIP |
| **B3 One thing** | HOP chain, matched z8 | SNAP at each node | Off | Node names | Between-node arcs | — | Cumulative distance COUNT | MATCH ×4 |
| **B4 Corridor** | DROP → PINCH → SPINE | Corridor traced, then camera through it | **Both flanking borders SIGNAL** | Corridor width in metres | The through-route | — | Width vs a city block | PUSH |
| **B5 Seasonal** | Locked camera, no move | Two BLEEDs at same frame | Off | Month labels | — | Same metric, two dates | **MATCH cut is the whole beat** | MATCH |
| **B6 Invisible infra** | STRIP first, then SPINE | Basemap gone, only the network | Off | Landing points | Full network, 8–20 lines | — | PINCH to one cable | PUSH |
| **B7 Water tower** | LIFT at source → SPINE downstream | Terrain, then flow follows gravity | Downstream countries at 40% | River + countries | The river as route | Dependency % | — | PUSH |
| **C1 Enclave** | DROP → TRACE → PINCH | Enclave isolates as surroundings dim | Enclave SIGNAL, host COLD | Both names | Access corridor if it exists | — | Area vs a city | MATCH |
| **C2 Disputed pixel** | PINCH to z13 | Two TRACEs, both claims | **Two colours, both labelled as claims** | Claimant names | — | — | STACK the two claims | STRIP |
| **C3 Straight line** | SWEEP at z5 | TRACE, then BLEED ethnolinguistic | Colonial line 3px | Minimal | — | Group distribution | The mismatch | STRIP |
| **C4 Shrinking map** | Locked wide | 3–4 TRACEs stacked over time | Each era a different opacity | Year stamps | — | — | STACK of all eras | PUSH |
| **C5 Not a country** | TRACE → BLEED | Border draws dashed | **Dashed, always** | Name + "de facto" | — | Recognition count | — | STRIP |
| **C6 Landlocked** | TRACE → SPINE to port | Route to nearest sea | Country SIGNAL, transit COLD | Port names | The transit corridor | — | Distance + days COUNT | PUSH |
| **C7 Split city** | PINCH → SWEEP the line | Line traced through the urban grid | The dividing line only | District names | — | — | STACK the two halves | MATCH |
| **D1 Bottleneck** | DROP → PINCH | Zoom to the single object | Off | The structure | Traffic through it | — | Throughput COUNT | PUSH |
| **D2 Megaproject** | SPINE the alignment | Planned route draws | Affected regions 40% | Endpoints | The project as route | Population served | STACK before/after | MATCH |
| **D3 Port war** | MATCH pairs, identical z9 | Two SNAPs | Off | Both ports | Two competing arcs | Throughput | Side-by-side bars | MATCH |
| **D4 Dead infra** | DROP → TRACE → LIFT | Route traced, then terrain reveals why | Off | Endpoint names | The abandoned line | — | — | STRIP |
| **D5 Grid** | STRIP → SPINE network | Basemap gone, only the grid | Off | Nodes | The network | Capacity | PINCH to one link | PUSH |
| **D6 New route** | SPINE old → SPINE new | Two routes, 1.4s each | 20% | Endpoints | Both, sequential | — | Days saved COUNT | MATCH |
| **E1 Vanishing** | Locked, slight push | TRACE per era, previous stays at 25% | Each outline a year | Year stamps | — | — | STACK of all outlines | PUSH |
| **E2 Timelapse** | Locked wide | BLEED animating across years | Off | Year counter | — | The whole shot | — | STRIP |
| **E3 Reversal** | Locked | Two BLEEDs, MATCH between | Off | Two years | — | Same metric, two dates | The flip | MATCH |
| **E4 Date redrew** | TRACE → CLEAR → TRACE | Clouds cover the change | Before AMBER, after SIGNAL | The date, large | — | — | STACK | CLEAR |
| **E5 Opening** | BLEED seasonal → SPINE | Ice retreats, route appears | Off | Passage name | The new route | Ice extent by month | Old vs new distance | PUSH |
| **F1 True size** | PIVOT during reprojection | Projection morph | Both outlines | Country names | — | — | **The morph is the beat** | STRIP |
| **F2 Overlay** | Locked | TRACE, then STACK slides in | Both SIGNAL/COLD | Both names | — | — | The overlay | MATCH |
| **F3 Density** | Wide → PINCH to the cluster | BLEED then STRIP | Off | The cluster only | — | Population density | % in x% of area | PUSH |
| **F4 Ranking run** | Automatic region tour | Full tour, `dwell 2.4`, `maxZoom 5.5` | `borderCasing: true` | `labelAll: false` | — | The metric | Rank readout per stop | PUSH between stops |
| **F5 Equivalent** | Locked | TRACE → STACK | Both | Both | — | — | Area COUNT | MATCH |
| **G1 Geolocation** | PINCH to z16 | Satellite basemap | Off | Coordinate readout | — | — | STACK image vs map | STRIP |
| **G2 Pattern** | Wide → DIM → SNAP | BLEED, then non-cluster dims | Off | The cluster | — | Incidence | Overlay the cause | PUSH |
| **G3 Missing data** | Wide locked | BLEED **with visible holes** | Off | "No data (n)" legend | — | The metric, gaps deliberate | — | STRIP |

## 3.3 Standing GeoMotion rules

1. **Never `labelAll: true` above 20 regions.** At world scale it is a grey haze. Label the stop.
2. **`maxZoom` for country stops: 5.5.** The default 8 frames from so far out that a country
   arrives with two continents around it.
3. **Cap the colour domain when the metric is skewed.** Log-distributed data on a linear ramp
   makes half the world one indistinguishable black. Cap at p90 and **say so on screen**.
4. **`padding` 0.14 for vertical.** The default leaves the subject small in a 9:16 frame.
5. **Check the bounding box before picking a stop.** A country with a distant territory (Norway
   + Svalbard, France + Guiana) frames to the territory, not the country.
6. **Titles get `background: true` over choropleths.** Over a bright ramp, white type is
   unreadable. Over dark satellite it isn't needed.
7. **The overview beat will show a world-copy sliver at 9:16.** 360° cannot fill a 9:16 frame.
   Frame regionally instead of globally wherever the story allows.
8. **Author at 60fps, deliver 30.** Camera moves conform cleanly; the reverse does not.

---

# PART 4 — HYPERFRAME USAGE

## 4.1 The division of labour — one rule

> **If it has a coordinate, GeoMotion draws it. If it doesn't, Hyperframe draws it.**

That single test resolves ~95% of decisions.

| | GeoMotion | Hyperframe |
|---|---|---|
| Anything on the Earth's surface | ✅ | ❌ |
| Borders, routes, coastlines, terrain | ✅ | ❌ |
| Data bound to places | ✅ | ❌ |
| Cross-sections, cutaways, mechanisms | ❌ | ✅ |
| Abstract concepts (treaty, debt, risk) | ❌ | ✅ |
| Icons, diagrams, schematics | ❌ | ✅ |
| Motion typography, counters, title cards | ❌ | ✅ |
| Historical texture (documents, period illustration) | ❌ | ✅ |
| Objects (a ship, a turbine, a container) | ❌ | ✅ |

**One qualification.** "Icons" and "Objects" above mean an object depicted for its own sake —
a cutaway, a hero shot, something the frame is *about*. A flat glyph *pinned to a coordinate* —
a ship marking a port, an anchor marking a harbour, a factory marking an industrial region —
has a coordinate, so line 4.1's own rule puts it in GeoMotion: `MarkerLayer.icon` and a route's
`marker.icon` draw a small vocabulary of these (`ship`, `port`, `factory`, `flag`, `oil`,
`mountain`, plus the original `dot`/`plane`/`car`/`pin`) as flat vector paths in the marker's
own colour — no raster asset, no fixed palette to clash with SIGNAL/COLD. The moment an object
needs enough detail to explain a mechanism or fill a frame on its own, it has left this system
and become Hyperframe's job again.

## 4.2 Where Hyperframe earns its place

**1. The cross-section.** The single best use. A strait from above is GeoMotion; a strait *in
profile* — depth, draft, keel clearance — is Hyperframe, and it explains something the top-down
view physically cannot.

**2. The mechanism.** How a lock works, how a cable is laid, how an icebreaker's hull rides up
onto ice. Motion diagrams, flat, `SIGNAL` on `VOID`.

**3. The abstraction.** A treaty. A tariff. A quota. These have no location and must not be
faked with a map.

**4. Motion typography.** Title cards, the number reveals, the closing line. Kinetic type is
Hyperframe's native strength and GeoMotion has no business doing it.

**5. Scale objects.** "700 metres" means nothing until it's next to something known. A stadium, a
bridge span, an aircraft carrier — rendered flat and schematic, not photoreal.

**6. Historical texture.** A 1936 document, a period map as *object* (not as a live map), an
archival illustration. Always desaturated to `AMBER`, always visibly stylised — **never
photoreal, so it can't be mistaken for archive footage.**

**7. Transitional matter.** The 400ms of graphic material that carries a STRIP, so the basemap
swap isn't a dissolve.

## 4.3 Where Hyperframe must NOT be used

| Never | Why |
|---|---|
| Generating a map, coastline, or border | It will be *wrong*, and wrong geography destroys the brand's only asset |
| Country shapes | Same. Trace from Natural Earth via GeoMotion. |
| Anything implying real photography of a real place | Presents synthetic imagery as evidence |
| Faces, crowds, identifiable people | Ethical, and off-brand — we have no people |
| Photoreal anything | Our register is schematic. Photoreal AI reads as cheap in 2 seconds. |
| A chart that is really a map | Use the map |
| "Establishing shots" of cities | Filler. Every second must carry information. |

## 4.4 The Hyperframe house style

All prompts inherit this block:

```
STYLE LOCK — GROUNDTRUTH
Flat vector-schematic, technical-drawing register. Matte, no gloss, no bevel,
no drop shadow, no lens flare, no depth of field.
Background #0A0E13 solid. Line work #F2F4F5 at 1.5px. Single accent #FF4A26.
Secondary accent #3D9BFF used only in opposition.
Orthographic or true elevation. No perspective vanishing points.
No text unless specified. No people. No logos. No photorealism.
9:16, 1080x1920. 60fps. Loopable where specified.
```

Every generated shot must survive the **schematic test**: could this have been drawn by an
engineer in 1975 with three pens? If not, it's over-rendered.

---

# PART 5 — SAMPLE VIDEO

→ **[EP001 — "The Four Doors" (full production bible)](EP001-four-doors.md)**

Chosen because it cannot be told any other way: four separate theatres, four measured
chokepoints, a 5,000 km camera move for the reversal, and a payoff that is *literally* a spatial
relationship. A talking head cannot deliver it; a chart cannot either.

---

# PART 6 — PRODUCTION PIPELINE

## 6.1 The ten stages

| # | Stage | Owner | Time | Output |
|---|---|---|---|---|
| 1 | **Research** | Journalist | **3.0 h** | Fact sheet, every claim with source + URL |
| 2 | **Script** | Showrunner | **1.5 h** | ≤190 words, read aloud against a stopwatch |
| 3 | **Fact check** | Second pair of eyes | **1.5 h** | Signed-off sheet; every number verified independently |
| 4 | **Storyboard** | Creative Director | **1.0 h** | Scene table in shot grammar |
| 5 | **GeoMotion** | Motion designer | **4.0 h** | Frame sequences / ProRes per scene |
| 6 | **Hyperframe** | Motion designer | **2.5 h** | Generated shots, house style locked |
| 7 | **Voice** | Producer | **0.5 h** | Voicebox clone, one profile, WAV |
| 8 | **Resolve edit** | Editor | **3.0 h** | Cut, sound design, subtitles, grade |
| 9 | **Thumbnail + copy** | Creative Director | **0.5 h** | Cover frame, title, description, sources |
| 10 | **QC + upload** | Producer | **0.5 h** | Checklist passed, scheduled |
| | | **TOTAL** | **≈18 h** | **per 75-second video** |

**Steady state:** one video per 2.5 working days per pod. A 3-person pod ships **4/week**.
Weeks 1–6 will run 1.6× these estimates while the asset library is thin.

## 6.2 Stage detail

### 1 · Research (3.0h)
Start from the **shape**, not the topic: pick a framework from Part 2, then find a story that
fits it. This is backwards from how most channels work and it's why they run out of ideas.

Deliverable is a fact sheet where every row is `claim | figure | unit | source | date | URL |
confidence`. **Anything at `confidence: low` is cut, not hedged.**

### 2 · Script (1.5h)
Write to the word count *first*: seconds × 2.65. Then read aloud against a stopwatch — synthetic
voice timing is close enough to human that this predicts within 5%.

Structure check: can you point at the CLAIM, the TURN, the REVERSAL and the LAND? If any is
missing the script is a list, not a story.

### 3 · Fact check (1.5h)
Different person. Non-negotiable. They verify **against the primary source, not the fact sheet**
— re-checking someone's transcription only catches typos, not the wrong table.

Output: the on-screen source slugs and the description's source list.

### 4 · Storyboard (1.0h)
One row per scene: `duration | narration | on-screen text | GeoMotion (shot grammar) | Hyperframe
| camera | transition`. If a scene can't be written in the shot grammar, it isn't designed yet.

### 5 · GeoMotion (4.0h)
Build order that avoids rework:
1. Project (1080×1920, 60fps), basemap, colour tokens
2. Geometry layers, bottom-up
3. Camera keyframes — **all of them, before any styling**
4. Data layers and domain caps
5. Labels and readouts last

**Always render a test frame at each stop before building the next.** Framing errors compound;
finding them at the end costs the whole camera pass.

### 6 · Hyperframe (2.5h)
Generate in one batch with the style lock prepended to every prompt. Expect ~40% rejection.
Reject on: perspective, gloss, photorealism, wrong accent colour. Keep the rejects — they seed
the next prompt.

### 7 · Voice (0.5h)
One locked cloned profile. Generate the whole script as **one take**, not per line — line-by-line
generation drifts in tone and the joins are audible. Cut it up in Resolve.

### 8 · Resolve (3.0h)
See EP001 for the timeline template. Budget half of this for sound design; it is the difference
between "a map video" and "a piece of film," and it is what viewers cannot name but do feel.

### 9 · Thumbnail + copy (0.5h)
Cover frame from the video itself (never a separate render — it must pay off). Title ≤ 48 chars.
Description carries the full source list; this is our credibility and it is machine-read.

### 10 · QC + upload (0.5h)

**Ship checklist:**
- [ ] Every number matches the signed fact sheet
- [ ] Source slug visible in every scene
- [ ] Subtitles burned, no overlap with UI safe areas
- [ ] Audio −16 LUFS integrated, true peak ≤ −1.5 dBTP
- [ ] No shot holds >2.0s without an information change
- [ ] One `SIGNAL` region at a time, throughout
- [ ] Muted-watch pass: does it still make sense?
- [ ] First frame has a place in it, not a title card

## 6.3 The asset library (the real compounding advantage)

Every episode contributes to a shared, versioned library. **By episode 20, build time halves.**

```
/library
  /geometry      Natural Earth 10m/50m/110m, pre-cleaned, name-normalised
  /projects      GeoMotion templates per framework, cameras pre-keyed
  /hyperframe    Approved generated shots, tagged, reusable
  /audio         Music beds, the SFX pack, the locked voice profile
  /data          Cleaned datasets with provenance notes
  /brand         Fonts, colour tokens, HUD, lower-thirds, reticle
```

**The name-normalisation file is the highest-value asset in the repository.** Natural Earth
spells countries its own way, and a mismatch between a dataset's names and the geometry's names
silently drops regions from a map. It looks like a rendering bug and it is a data bug.

## 6.4 Publishing cadence

| | |
|---|---|
| **Volume** | 4/week, Tue/Wed/Fri/Sun, 18:00 UTC |
| **Pillar rotation** | Never two of the same pillar consecutively |
| **Series** | Every 5th video belongs to a named run (e.g. *Chokepoints*, 8 parts) — series drive the subscribe, one-offs drive reach |
| **Review** | Weekly: retention curve at 3s / 15s / 50%. A drop at 15s is a TURN failure; at 50% it's a REVERSAL failure. |

## 6.5 Editorial standards

1. **Every figure on screen has a source on screen.**
2. **Contested things are labelled contested**, with the claimants named — never adjudicated.
3. **We never animate a projection of the future** as though it were observed.
4. **Corrections are pinned, and the video is re-uploaded** if a number is wrong. The archive
   stays accurate or the brand is worthless.
5. **Synthetic imagery is always visibly synthetic.** We use AI to draw diagrams, never to
   fabricate evidence.

---

*GROUNDTRUTH — Every story has a location.*
