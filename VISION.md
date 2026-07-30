# GeoMotion — Vision

> Canonical source: [`docs/geomotion-v2-design.html`](docs/geomotion-v2-design.html) §01–§03.
> This file is the markdown rendering of that vision. If the two disagree, the design doc wins.

## What GeoMotion is

**GeoMotion is the editor where the world is the scene graph and every place is an object that
knows itself.**

In After Effects a map is pixels. In GeoLayers it is a plugin inside a host built for something
else. In Flourish it is a template with a ceiling. In GeoMotion, West Bengal is a first-class
object — with geometry you can edit, facts it carries (population, capital, election result,
flag), animations you can drop onto it, and a camera that can be told to look at it. Labels,
callouts, charts, narration, and thumbnails all bind to that one object. Change the object and
everything downstream follows.

## The problem

The people best at explaining the world spend most of their week on tooling: QGIS →
Illustrator → After Effects + GeoLayers → Premiere, re-importing at every seam, joining data by
hand, timing narration by eye. One border revision means redoing four stages.

GeoMotion is one document where geometry, data, animation, cameras, and voice stay live
together.

## Four commitments

1. **Everything stays editable.** No bake step, no "generated then flattened." An AI-drafted
   camera move is keyframes you drag. A one-click preset is a behavior stack you can open.
2. **Places are objects, not pixels.** Smart objects (§05) are the single source of truth that
   every layer binds to.
3. **The voice drives the clock.** Narration is measured and the picture is cut to it — an
   engine primitive, not editor craft.
4. **Progressive depth.** Drag-drop preset → editable stack → full node graph. Beginners never
   see the graph; experts never hit a ceiling.

## Who it is for (§03)

| Persona | Core need |
| --- | --- |
| **Geography / history YouTuber** *(primary)* | Narration-first scenes, historical boundaries, an animation library, fast drafts, 16:9 + 9:16 from one project |
| **Data journalist / graphics desk** | CSV → entities with loud join diagnostics, org style libraries, MP4 + alpha overlay + embed from one project, approvals |
| **Election war room** | Live data with validation rails, multiplayer, browser program-out for OBS/vMix, locked approved scenes |
| **Educator / NGO / researcher / gov comms** | Template-first start, CVD-safe scale validation, provenance and auto-credits, SVG/still export |

## Why someone chooses it (§01)

| Instead of | Our answer |
| --- | --- |
| After Effects | Geo-native objects, data-aware everything, narration timing, geometry editing — none of which AE can retrofit |
| GeoLayers | The map depth without the host, plus data, voice, and geometry editing it cannot have inside AE |
| DaVinci Resolve | We copy its edit grammar and add the map engine; export to Resolve for the final cut |
| Blender | An election map in an hour; our node graph is opt-in, not the front door |
| Flourish | The same 60-second first minute, then the ceiling opens into a real editor |
| QGIS | The 20% of GIS editing this audience needs, inside the motion tool |

## Editing philosophy (§02) — normative

Every feature is reviewed against these. A feature that violates one needs a written excuse.

- **One click:** double-click a region → the camera frames it (the signature gesture). Drop a
  preset → it animates. Drop a column on a property → it binds.
- **Never a dialog:** colour, scale, and easing edit in on-canvas popovers that live-preview.
  Dialogs are reserved for destructive or file-system acts.
- **Always draggable:** every number scrubs; keyframes, handles, camera paths, layer bars,
  scene thumbnails all drag.
- **Always on the keyboard:** `V` select · `H` pan world · `P` pen · `C` camera · `Space`/`JKL`
  transport · `U` reveal animated · `⌘K` palette.
- **Latency budgets are features:** drag < 16 ms, click < 100 ms, seek < 250 ms at proxy. A
  budget miss is a bug.

## Business shape

Open source (MIT core): the editor and engine are free forever. Revenue from cloud sync,
collaboration, the render farm, and the marketplace — the Figma/GitLab shape, aligned with
creators rather than extracting from them.
