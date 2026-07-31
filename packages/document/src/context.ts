import type { LngLat } from '@geomotion/core';
import type { Project } from './types.ts';
import { blockAt } from './story.ts';

/**
 * Map contexts — a lightweight stand-in for v2 §04's scene-owned map context.
 *
 * §04 puts the map context inside a scene, which owns cameras, layers and audio too.
 * Story blocks turned out to carry most of what scenes were wanted for — narrative
 * structure, ripple, a storyboard, a round trip — so the container is postponed and only
 * the part with no other home is built: *what the map looks like during a stretch of
 * time*.
 *
 * ### The shape, and why it survives scenes arriving
 *
 * Contexts are a **top-level table keyed by id**, and a block *references* one. They are
 * not owned by blocks. Two blocks can share a context — a tour that returns to the same
 * view — and, when a scene container is eventually added, a scene references a context by
 * the same id with nothing here changing. Had a block owned its context inline, moving to
 * scenes would mean a migration that guesses which inline copies were meant to be the
 * same thing.
 *
 * ### Partial override
 *
 * A context names only what it changes; everything else falls through to the project.
 * That is what keeps it lightweight — a context that switches the basemap and nothing
 * else is three fields — and it is the same merge a scene would use, so the rule does not
 * have to change either.
 */
export interface MapContext {
  id: string;
  name: string;
  /** Basemap id, as `project.basemap`. */
  basemap?: string;
  terrain?: boolean;
  terrainExaggeration?: number;
  /**
   * `globe` for the whole-world shot, `mercator` for everything else.
   *
   * Deliberately not every projection MapLibre knows: these two are the ones that change
   * how a story reads, and an unrecognised value falls back rather than throwing.
   */
  projection?: 'mercator' | 'globe';
  /**
   * Where the camera sits during blocks using this context, when they are not keyframed.
   *
   * A *default*, never an override: an explicit keyframe inside a block always wins,
   * because keyframing is deliberate authoring and a default that beat it would make the
   * timeline lie. It applies only when no camera keyframe falls inside the block.
   */
  camera?: { center?: LngLat; zoom?: number; bearing?: number; pitch?: number };
  /**
   * Layers held back while this context is active, by id.
   *
   * Hiding rather than deleting, because the layer belongs to the composition and only
   * this stretch of it wants the layer gone — a reference map that should not appear
   * during the close-up.
   */
  hidden?: string[];
}

/** Everything the map needs to know for one moment. */
export interface ResolvedContext {
  basemap: string;
  terrain: boolean;
  terrainExaggeration: number;
  projection: 'mercator' | 'globe';
  camera?: MapContext['camera'];
  /** Layer ids to hold back. Always a set, so callers need not check for absence. */
  hidden: ReadonlySet<string>;
  /** The context that applied, for the inspector to show. */
  id?: string;
}

/**
 * The map's settings at `time` — the project's, with the active block's context over it.
 *
 * A block with no context, or naming one that has since been deleted, resolves to the
 * project's own settings. A dangling reference is not an error worth stopping for: it
 * means someone removed a context, and the composition carrying on with its defaults is
 * a better answer than a blank map.
 */
export function resolveMapContext(project: Project, time: number): ResolvedContext {
  const base: ResolvedContext = {
    basemap: project.basemap,
    terrain: project.terrain,
    terrainExaggeration: project.terrainExaggeration,
    projection: 'mercator',
    hidden: new Set(),
  };

  const block = blockAt(project.story, time);
  const ctx = block?.context ? project.contexts.find((c) => c.id === block.context) : undefined;
  if (!ctx) return base;

  return {
    basemap: ctx.basemap ?? base.basemap,
    terrain: ctx.terrain ?? base.terrain,
    terrainExaggeration: ctx.terrainExaggeration ?? base.terrainExaggeration,
    projection: ctx.projection ?? base.projection,
    // Only offered when the block it belongs to is not keyframed — see the note on
    // `camera` above. The caller decides; this reports what is available.
    ...(ctx.camera && block && !hasKeyInBlock(project, block.t, block.d) ? { camera: ctx.camera } : {}),
    hidden: new Set(ctx.hidden ?? []),
    id: ctx.id,
  };
}

/**
 * Whether the author placed a camera keyframe inside this stretch.
 *
 * Read off the centre channel: a shot is meaningless without a place, so it is the one
 * channel every shot has a key in.
 */
function hasKeyInBlock(project: Project, t: number, d: number): boolean {
  return project.cameras.some((cam) => {
    const center = cam.tracks.center;
    return center.kind === 'keyframed' && center.keys.some((k) => k.t >= t && k.t < t + d);
  });
}
