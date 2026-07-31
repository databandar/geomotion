# Changelog

Notable changes to GeoMotion. Newest first.

This project is working towards the v2 design in `docs/geomotion-v2-design.html`; entries
name the section each change answers to.

## Unreleased

### Storytelling (v2 §10)

- **Re-composing keeps your work.** `video.mjs` overwrote the project file outright while
  printing "open this in the editor to tweak by hand" about it — so changing one line of
  the script destroyed every hand edit. It now merges: the composer owns what it made,
  and anything you added is yours. `--fresh` starts over deliberately.

- **Ripple.** Dragging a story block moves the layers it choreographs and the narration
  it owns, and re-anchors every block after it. Re-lengthening a block pushes or pulls
  what follows. §00's frozen voice bed is now impossible in both directions: the picture
  follows the voice, and the voice follows the picture.
  - Moving a layer carries its keyframes. Track times are absolute, so shifting only
    `in`/`out` would leave a route's reveal behind.
  - Cue ownership is compared with a tolerance. The composer writes cue times rounded and
    block times not, so three of six lines in a real project were orphaned by four
    ten-thousandths of a second.
- **Story blocks live in the document.** The composer wrote its beats to a subtitle file
  and a console listing, then flattened them away — so a beat could not be retimed and
  re-composing discarded every hand edit. They are now a top-level document section,
  shown as a lane on the timeline. Purely additive: no format bump.

### Motion engine (v2 §04, §06)

- **Behaviour stacks**, keyed by the property each modifies. `pop` and `pulse` were
  booleans with their constants inlined in the evaluator; both are now toggleable,
  parameterised entries. Curves preserved exactly.
- **Property tracks** — `static`, `keyframed` and `bound` evaluate through one pipeline.
  Any tracked property can be animated from the inspector's source pip and retimed on a
  keyframe row.
- **`drawStart`/`drawEnd` and `dissipate*` deleted**, collapsed onto tracks. A route can
  now pause mid-draw or run backwards, which the old window could not express.
- **The camera is four property tracks**, each with its own interpolator.

### Smart objects (v2 §05)

- **Entity registry** with stable ids, aliases and facts carrying `{value, source,
  asOf}`; `sourcesUsed` generates a credit line from the facts a video actually used.
- **One join.** Three private joins — the survey reader's alias table, the editor's paste
  box, the layer's name map — became one. Pasting `Jammu & Kashmir` into the editor used
  to be rejected while the same spelling imported cleanly on the command line.
- **`bound` tracks**: a property reads a fact by reference, so a marker can be sized by a
  region's value.

### Document

- **Format chain** (`document/migrations/`) with a frozen fixture per version, all loaded
  to current by the test suite.
- Wrongly typed fields are repaired at load rather than crashing the render loop.

### Fixes

- Audio cues had no positioning rule and stacked in normal flow; a project with six
  narration lines spilled its script over three layer rows.
- The Dashed toggle threw on every use — `line-dasharray` is a paint property and was
  being set through the layout API.
- A glow switched on after its layer existed drew *over* its own line.
- Rendered numbers depended on the exporting machine's locale.
- A script with invalid beats rendered an empty map and reported success at every step.
- A draft of a square composition came out widescreen.
