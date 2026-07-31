/**
 * Story blocks — ARCHITECTURE §10, and the v2 design's §01 first commitment.
 *
 * A block is a stretch of time that owns a narration line and knows which layers it
 * choreographs. It is v1's "beat", kept alive in the document instead of compiled away.
 *
 * ### Why this exists
 *
 * The composer already thinks in beats — clouds, outline, overview, tour, labels — and
 * then flattens them into a bare list of layers. The structure that produced the video
 * does not survive into the file, so a beat cannot be retimed, and re-running the
 * composer discards every hand edit made since. That is exactly the "generated then
 * flattened" the design document rules out in its first commitment, and the same shape
 * as v1's frozen voice bed one level up.
 *
 * Keeping blocks in the document is what makes the round trip possible: compose once,
 * edit by hand, and re-render without losing either.
 *
 * ### A new top-level section
 *
 * ENGINEERING_GUIDE §3.8 calls a new top-level document section an ADR-level decision,
 * so: story structure is not a property of any layer, and it is not derived — it records
 * an authoring intent that nothing else in the document holds. It cannot live on a layer
 * because a block choreographs several, and it cannot be recomputed because "these three
 * layers belong to this sentence" is a judgement, not a calculation. Entities and assets
 * are the only other examples, and this is the same kind of thing: a table the rest of
 * the document refers into.
 *
 * Additive, so no format bump: §3.6.3 — a new optional field whose absence means the
 * default. A project with no story is a project with no blocks, which is what every
 * existing project already is.
 */

export interface StoryBlock {
  id: string;
  /** start on the timeline, seconds */
  t: number;
  /** length, seconds */
  d: number;
  /**
   * The spoken line, if this block narrates.
   *
   * The text, not the audio. Audio lives in `project.audio.cues`, which carry the
   * *measured* duration — the two are kept apart on purpose, because the line is what a
   * person writes and the measurement is what the voice engine returns. Conflating them
   * is how v1 ended up unable to re-record without re-timing everything.
   */
  say?: string;
  /** Heading shown on screen for this stretch, if any. */
  onScreen?: string;
  /**
   * Layers this block choreographs, by id.
   *
   * Ids rather than an index or a nesting, so a block survives layers being reordered,
   * and so one layer can belong to two blocks — a title that spans a beat boundary is
   * ordinary, not an error.
   */
  nodes: string[];
  /**
   * The map context this block plays under, by id.
   *
   * A reference rather than an inline copy, so two blocks can share one — a tour
   * returning to the same view — and so a scene container can reference the same context
   * later without any of this moving.
   */
  context?: string;
  /**
   * Which composer beat produced this block, when one did.
   *
   * Kept so a re-compose can recognise its own work and update it in place rather than
   * appending a second copy. Absent on a block a person made by hand, which is the
   * signal that the composer must not touch it.
   */
  kind?: string;
}

/** Blocks in playing order. The document does not promise they arrive sorted. */
export function storyInOrder(story: readonly StoryBlock[]): StoryBlock[] {
  return [...story].sort((a, b) => a.t - b.t);
}

/**
 * The block covering a moment, or undefined.
 *
 * A block's span is `[t, t + d)` — half-open, so two adjacent blocks do not both claim
 * the instant they share, and scrubbing across a boundary lands in exactly one.
 */
export function blockAt(story: readonly StoryBlock[], time: number): StoryBlock | undefined {
  return storyInOrder(story).find((b) => time >= b.t && time < b.t + b.d);
}

/** Every block that touches a layer. */
export function blocksFor(story: readonly StoryBlock[], nodeId: string): StoryBlock[] {
  return storyInOrder(story).filter((b) => b.nodes.includes(nodeId));
}

/**
 * Where the story ends — the furthest any block reaches.
 *
 * Not the same as the project's duration: a composition can run on after the last line,
 * and it is the composer's business whether it should.
 */
export function storyEnd(story: readonly StoryBlock[]): number {
  return story.reduce((end, b) => Math.max(end, b.t + b.d), 0);
}
