# GeoMotion

A map animation editor that runs entirely in the browser. Keyframe a camera across the
globe, draw animated routes, drop labelled markers and titles, then export the result as
video or a frame-accurate PNG sequence.

No account, no API key, no server — the whole thing is a static site talking to free tile
providers.

```bash
corepack enable pnpm   # once per machine; the version comes from package.json
pnpm install
pnpm dev               # http://localhost:5173
```

`pnpm build` produces a static `apps/studio/dist/` you can drop on any host.

```bash
pnpm test      # the engine suite
pnpm verify    # typecheck + test + build, the same gate CI runs
```

Each suite sits next to the code it describes — in [`packages/`](packages/) for what has
already been extracted, in [`apps/studio/src/lib/`](apps/studio/src/lib/) for what hasn't.
Together they are the behavioural contract for the pure engine: geo math, easing, colour
scales, the region join and framing solver, scene evaluation, and document serialisation.
They are deliberately implementation-free, because these algorithms are moving into
standalone packages one at a time and the assertions are what each move has to preserve —
they travel with the code and are the reason the move is checkable. Run them before you
send anything.

There is also a **video pipeline** — a command-line tool that turns a written script
plus a synthesised voiceover into a finished, uploadable MP4. See
[`apps/pipeline/README.md`](apps/pipeline/README.md).

```bash
pnpm video -- scripts/anemia-india.json --draft
```

## Layout

A pnpm workspace driven by Turborepo, per
[`ENGINEERING_GUIDE.md`](ENGINEERING_GUIDE.md) §2:

| Path | What it is |
| --- | --- |
| [`apps/studio/`](apps/studio/) | The editor. Today this is the v1 codebase, being converted in place rather than rewritten alongside. |
| [`apps/pipeline/`](apps/pipeline/) | Script → voiceover → MP4, plus the dev-server middleware Studio's API calls hit. Splits into `apps/server` + `apps/render-cli` when the render farm lands. |
| [`packages/core/`](packages/core/) | Ids, coordinates, numeric interpolation. Zero dependencies by contract. |
| [`packages/geometry/`](packages/geometry/) | Great-circle math, path densification and measurement. Depends on `core` only. |
| [`packages/document/`](packages/document/) | The document: schema types, construction, migrations, transactions and undo. Depends on `core` only — browser persistence stays in the app. |
| [`packages/animation/`](packages/animation/) | Easing curves — named, so feature code never hardcodes one. |
| [`packages/evaluator/`](packages/evaluator/) | `evaluate(document, t) → Scene`. The pure function at the centre: same document and time, same scene, every time. |
| [`packages/entities/`](packages/entities/) | The data join: regions matched to values, ranked and coloured, plus the framing solver. |
| [`packages/renderer/`](packages/renderer/) | What a frame is, and how the 2D overlay is drawn. Never sees the document, never sees MapLibre. |
| [`packages/map/`](packages/map/) | MapLibre integration. Everything that knows MapLibre exists lives here. |
| [`packages/testing/`](packages/testing/) | The render-signature harness. Dev-only; shipped code may not import it. |

The remaining packages in the guide's §2 table are extracted one at a time, each with its
contract fixed before code moves into it.

Every task runs through `turbo`, so a new package with `typecheck`/`test`/`build` scripts
is picked up by both `pnpm verify` and CI with no configuration change.

### Checking that a change did not alter the picture

`pnpm verify` proves the app runs; it says nothing about what it draws. With a dev
server up:

```bash
pnpm --filter @geomotion/testing golden:check     # compare against the baseline
pnpm --filter @geomotion/testing golden:capture   # re-record it, deliberately
```

Ten fixture frames are reduced to a 32×18 grid of mean RGB values and compared
exactly. Capture is deterministic — three consecutive runs came back bit-identical —
so any delta is a real change in what the renderer drew, and the report names the grid
cell that moved. A 4px change to the legend bar fails 5 frames and points at row 16.

Baselines are **machine-specific**: GPU rasterisation differs between drivers. A diff
on a new machine or after a browser update shifts every frame at once and means
recapture; a regression looks like a few frames moving. That is why exact comparison is
a local tool.

CI runs `golden:smoke` instead, which asserts only what is true on any machine: every
frame renders, none is blank, no two are identical, the overlay contributes something,
and the page logs no errors. It will not catch a layer that goes missing for part of the
timeline — that needs a baseline — but it does catch a renderer that has stopped
drawing, which is the failure worth blocking a merge for.

The §2 **dependency law** — arrows point downward only, `core` depends on nothing — is
enforced by ESLint rather than trusted: `pnpm lint` fails the build on a violation.
Adding a package means deciding, in [`eslint.config.js`](eslint.config.js), exactly what
it may import.

---

## The model

A **project** is a composition: a duration, a frame rate, an output resolution, a basemap,
and two kinds of animated content.

### Camera keyframes

The camera track holds keyframes of `{ time, center, zoom, bearing, pitch }`. Between two
keyframes everything is interpolated — longitude the short way around the globe, bearing
the short way around the compass — with a per-keyframe easing curve applied to the move
*out* of that keyframe.

Each keyframe also has an **Arc** amount, which pulls the zoom back mid-move and pushes it
in again. That's the difference between a flat pan and the shot that feels like it was
flown.

The workflow is: move the map to where you want it, put the playhead where you want it,
press <kbd>K</kbd>. Repeat. Adjust by dragging the diamonds on the timeline.

### Layers

| Layer | What it does |
| --- | --- |
| **Route** | A polyline through points you click on the map. Draws on progressively over a window you control, with an optional icon (dot / plane / car / pin) riding the leading edge. Geometry can be a great circle, a bezier flight arc, or straight segments. |
| **Marker** | A dot with an optional label, halo, pulse ring and pop-in. |
| **Text** | Screen-space titles with fade / slide-up / typewriter / wipe animations. Drag them directly on the canvas. |
| **Shape** | Any GeoJSON you paste in — filled, outlined, optionally 3D-extruded, with an outline that can trace itself on. |
| **Regions** | A choropleth that tours itself — see below. |
| **Clouds** | Drifting procedural cloud cover that parts from the centre to reveal the map. Sits over the map and its annotations, under your titles. |

Every layer has an in/out window on the timeline plus a fade ramp at each end. Drag the
bar to move it, drag its edges to retime it.

### Audio

**+ Audio** imports one or more files and drops them on the timeline at the playhead —
music, narration, a voice memo. Each becomes a clip you can **drag to retime** and
**double-click to remove**, and those edits undo like everything else.

The clip's length comes from actually decoding the file rather than from its metadata: a
VBR mp3 will misreport itself, and a clip whose length disagrees with its audio makes
every timing downstream wrong.

Click a clip to select it and the inspector gives you **level** and **fade in / fade
out**. Mark one as a **music bed** and it ducks automatically: it drops out of the way
whenever another clip plays over it and comes back after, with the depth and the ramp
under your control. Measured through the renderer, a bed at the default setting sits
12 dB down while a line speaks and returns to exactly its own level. Fades are
clamped so they cannot cross on a short clip, because two ramps meeting in the middle
ducks it to nothing and reads as a dropout.

Audio is **embedded in the project** as a data URL, so a saved `.json` carries its sound
and opens with it anywhere. The cost is size — past roughly 4 MB the browser refuses to
autosave, and the toolbar says **not autosaving** rather than letting you keep working
against a save that is no longer happening. **Save** still writes a file.

Video export includes the audio (WebM with Opus). The PNG sequence cannot — it is a
frame format — so mux it yourself with the ffmpeg line the export dialog gives you.

### Camera follow

A route can take over the camera. While it's drawing, the camera rides the leading point
at a fixed zoom and pitch, optionally rotating to face the direction of travel. Keyframes
are ignored for that stretch and resume afterwards.

---

## Region tours

The **Regions** layer takes a GeoJSON of areas plus one number per area, colours
them all as a choropleth, then visits them one at a time. For each stop it flies
the camera to frame that region, traces its border on, and counts the value up in
a callout card. **Demo → Region tour** loads a worked example (Indian states).

Give it data two ways:

- **Geometry** — *Load GeoJSON…*, or **Use India states** for the bundled set. Tell
  it which feature property holds the region name (`name` by default).
- **Values** — paste `Name, value` lines or a JSON object, or type them into the
  table. The importer reports how many names didn't match a region, so typos
  surface immediately instead of silently rendering as no-data.

### The three beats

A tour runs as **intro → visits → outro**:

1. **Intro** — holds on the whole area. With *Draw borders* on, every border draws
   itself in over the opening seconds, so the map assembles rather than appearing.
2. **Visits** — one region at a time: camera flies in, border traces on, value
   counts up in the callout.
3. **Outro** — camera eases back out to the overview and, with *Label everything*
   on, every region's value appears at once, staggered in tour order so the eye is
   led round the map instead of hit with thirty numbers in one frame. Labels that
   would collide are dropped rather than printed on top of each other, and your
   chosen ordering decides which one wins.

The tour is `dwell` seconds per region, of which the first `moveTime` is the
camera flying in. Order them by value (either direction), alphabetically, by file
order, or with an explicit list. **Fit timeline to tour** stretches the layer and
the composition to exactly fit. The stop list doubles as navigation — click any
region to jump the playhead to its moment.

**Framing note:** the overview fits the whole area, so a tall country in a 16:9
frame leaves space at the sides — that's fitBounds doing its job, not a bug. Lower
the framing pad, or use a vertical composition, if you want it tighter.

**Max zoom** matters more than it sounds: a region like Chandigarh or Lakshadweep
would otherwise be framed so tightly that the shot is context-free. Capping the
zoom keeps surrounding geography in frame.

### About the colours

The ramps are sequential and single-hue, running light→dark with strictly
monotonic lightness — that monotonicity is what lets a viewer rank two regions by
colour alone. On a dark basemap the anchor flips automatically so high values read
bright and low values recede into the surface; **Anchor** overrides that if you
want it fixed.

The legend always shows the scale with its real endpoints, and marks where the
current region sits on it. Regions with no value get their own colour and are
counted in the legend rather than quietly blending into the low end.

One thing to watch in your own data: a single outlier stretches the auto range and
squashes everything else into one end of the ramp. Turn off **Auto range** and set
the min/max by hand when that happens.

### Bundled data — read this before publishing

Two boundary sets ship, and the *Region data* panel has a button for each:

- **India (official)** — 37 states and union territories following India's own
  official depiction, derived from
  [datta07/INDIAN-SHAPEFILES](https://github.com/datta07/INDIAN-SHAPEFILES) and
  simplified to ~1 km:
  [`india-states-official.json`](src/data/india-states-official.json). The matching
  national outline, [`india-outline-official.json`](src/data/india-outline-official.json),
  was produced by dissolving those states — edges shared by two states are interior
  borders and drop out, leaving the coastline and international boundary. **This is
  the default**, and what an India-facing video should use.
- **India (Natural Earth)** — the 1:10m global public-domain set
  ([`india-states.json`](src/data/india-states.json)). Convenient, but its depiction
  of disputed boundaries follows Natural Earth's editorial choices, not any
  government's.

Note that the official depiction gives Ladakh and Jammu & Kashmir their full
claimed extent, so a tour stop on either frames a much larger area than the
Natural Earth version would.
- **The anaemia numbers are sample values, not a citable source.** They are
  approximate, in the neighbourhood of India's NFHS-5 round, and exist so the demo
  means something. The demo ships with a visible "Sample values — replace with your
  own source" caption for exactly this reason. Replace them with your own data —
  and keep a real source credit in the frame — before publishing anything.

---

## Rendering

Two surfaces are composited:

- **The map** (`lib/mapsync.ts`) — route lines and shapes become real MapLibre GL layers so
  they drape correctly under any pitch, bearing or terrain.
- **The overlay** (`lib/overlay.ts`) — markers, labels, travelling icons and text are drawn
  on a 2D canvas above the map, projected through `map.project()`.

Everything sized in the overlay is authored in **1080p pixels** and scaled from there, so
switching the composition between 720p, 1080p and 4K changes the resolution without
changing the look.

**The preview canvas is always the exact output size**, shrunk to fit your window with a
CSS transform. That is not an optimisation detail — at a given zoom a wider canvas shows
*more of the world*, so a physically smaller preview would frame every shot differently
from the export. Rendering at output resolution is the only way the preview can be
trusted. The cost is that a 4K composition drives a 4K WebGL canvas while you edit; if
that gets sluggish, author at 1080p and switch to 4K just before exporting — nothing
about the composition changes when you do.

---

## Export

Open **Export** in the toolbar. Because the stage already renders at output resolution,
exporting captures exactly what you were just looking at — there is no re-render at a
different size, and nothing is upscaled.

**Video (WebM)** — records in real time. Fastest route to a shareable file, and the timing
is always right because it's driven by the wall clock. Heavy scenes or slow tiles can drop
frames.

**PNG sequence** — renders each frame at its exact timeline position and waits for every
tile to finish loading before capturing. Nothing is ever half-drawn. Frames stream into a
folder you pick, or come back as a `.zip` if your browser has no folder access. Then:

```bash
ffmpeg -framerate 30 -i frame_%04d.png -c:v libx264 -pix_fmt yuv420p -crf 18 out.mp4
```

The exact command, with the right frame padding for your project, is shown in the dialog.

Keep the tab visible while exporting — browsers stop rendering frames in background tabs.

---

## Keyboard

| | |
| --- | --- |
| <kbd>Space</kbd> | Play / pause |
| <kbd>←</kbd> <kbd>→</kbd> | Step one frame (hold <kbd>Shift</kbd> for one second) |
| <kbd>Home</kbd> / <kbd>End</kbd> | Jump to start / end |
| <kbd>K</kbd> | Add a camera keyframe here, from the current view |
| <kbd>⌘Z</kbd> / <kbd>⇧⌘Z</kbd> | Undo / redo |
| <kbd>Delete</kbd> | Delete the selected layer or keyframe |
| <kbd>Esc</kbd> | Back to the select tool |

---

## Basemaps and attribution

**Satellite imagery has no borders or labels in it** — it is just pixels of ground.
That's why there are two satellite entries: **Satellite + borders** paints a
transparent Esri reference layer with boundaries and place names on top of the
imagery, and **Satellite (imagery only)** leaves it bare. For a region tour over
imagery, also keep the regions layer's **Dark casing** on: a plain white hairline
disappears against bright terrain, and the casing is what makes it read.

The bundled basemaps (CARTO, OpenFreeMap, Esri imagery, AWS terrain DEM) are all keyless.
They come with attribution requirements, which is why **Burn in map attribution** is on by
default in the export dialog — leave it on unless you're placing the credit yourself.

To use a provider you have a key for, add an entry to `BASEMAPS` in
[`src/lib/basemaps.ts`](src/lib/basemaps.ts); a style URL with your key in the query string
is all it takes.

Place search uses Nominatim, which is rate-limited and intended for light interactive use.

## Saving

Projects autosave to `localStorage` as you work. **Save** writes a `.geomotion.json` file
you can version, share or re-open with **Open**. The format is versioned and migrated on
load, so old files keep working.

## Layout

```
src/
  lib/
    scene.ts      evaluate(project, t) → everything needed to draw one instant
    geo.ts        great circles, flight arcs, path measuring and slicing
    regions.ts    choropleth parsing, ranking, and pure fitBounds maths
    palettes.ts   sequential colour ramps
    clouds.ts     tileable fractal-noise cloud texture
    mapsync.ts    scene → MapLibre GL sources and layers
    overlay.ts    scene → 2D canvas (markers, labels, titles, callouts, legend)
    export.ts     the two export pipelines
    zip.ts        dependency-free store-only ZIP writer
  components/     editor UI
  data/           bundled India boundaries, outline + sample values
  store.ts        project state, selection, history
```

`evaluate()` is a pure function of `(project, time)`. Nothing about the render depends on
playback history, which is what makes the offline frame export reproducible.
