import type { LngLat } from '@geomotion/core';
import type { BehaviourStacks } from './track.ts';
import type { Project } from './types.ts';
import { blockAt } from './story.ts';
import { camerasOf, mapContextsOf } from './nodes.ts';

/**
 * Map contexts — v2 §04's map context, as a node.
 *
 * "A map is a **context node**, not a background: it defines projection, basemap, terrain;
 * world-space descendants project through it." So a context is a container in the flat
 * store, and the layers parented to it are the ones it draws — see
 * docs/features/map-context-node.md.
 *
 * ### Story blocks stay the structure
 *
 * §04 puts the map context inside a *scene*, which owns cameras, layers and audio too. This
 * project does not have scenes and deliberately still does not: story blocks carry what
 * scenes were wanted for — narrative structure, ripple, a storyboard, a round trip — and the
 * unit a creator thinks in is the beat. **Which context is live is still decided by the block
 * under the playhead.** A block *references* a context by id, exactly as it did when contexts
 * were a side table; the reference survived the container changing underneath it, which is
 * why it was a table keyed by id rather than an inline copy in the first place.
 *
 * A future `scene` node would wrap story blocks rather than replace them: a container in this
 * same store, one optional `scene?: NodeId` on a block, and resolution walking up from the
 * block to its scene. Nothing here forecloses that and nothing requires it.
 *
 * ### Partial override
 *
 * A context names only what it changes; everything else falls through to the project. That is
 * what keeps it lightweight — a context that switches the basemap and nothing else is one
 * field — and it is the same merge a scene would use, so the rule does not have to change
 * either.
 */
export interface MapContextNode {
  id: string;
  type: 'mapContext';
  name: string;
  /** §04's flat store: `null` is a root of the project. See nodes.ts. */
  parentId: string | null;
  /** Fractional index among siblings — ascending. See order.ts. */
  order: string;
  /**
   * Whether this context can be live at all.
   *
   * Switching it off is how you take a whole stretch's look — and everything belonging to
   * it — out of the composition without deleting either.
   */
  visible: boolean;
  /** A locked context refuses edits to its whole subtree, like a group. */
  locked?: boolean;
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
   * Layers held back while this context is live, by id.
   *
   * The flat predecessor of membership, and still honoured because it says the opposite
   * thing: a child of a context is what this stretch is *made of*, while `hidden` is what a
   * stretch otherwise made of everything *leaves out* — a reference map that belongs to the
   * composition generally and should not appear during the close-up.
   */
  hidden?: string[];
  /** The behaviour home §06 gives every node. Empty until that milestone reaches contexts. */
  behaviours: BehaviourStacks;
}

/** Everything the map needs to know for one moment. */
export interface ResolvedContext {
  basemap: string;
  terrain: boolean;
  terrainExaggeration: number;
  projection: 'mercator' | 'globe';
  camera?: MapContextNode['camera'];
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

  const ctx = liveContext(project, time);
  if (!ctx) return base;
  const block = blockAt(project.story, time);

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
 * The context the block under the playhead names, if it still exists and is switched on.
 *
 * A block with no context, or naming one that has since been deleted, resolves to nothing and
 * the project's own settings apply. A dangling reference is not an error worth stopping for:
 * it means someone removed a context, and the composition carrying on with its defaults is a
 * better answer than a blank map.
 *
 * Exported because the evaluator needs the same answer for a different question — which
 * context's children are drawing — and two implementations of "which context is live" would
 * eventually disagree about a frame.
 */
export function liveContext(project: Project, time: number): MapContextNode | undefined {
  const block = blockAt(project.story, time);
  if (!block?.context) return undefined;
  const node = project.nodes[block.context];
  if (!node || node.type !== 'mapContext' || !node.visible) return undefined;
  return node;
}

/** Every map context in the document, in order. */
export function contextsOf(project: Project): MapContextNode[] {
  return mapContextsOf(project);
}

/**
 * Whether the author placed a camera keyframe inside this stretch.
 *
 * Read off the centre channel: a shot is meaningless without a place, so it is the one
 * channel every shot has a key in.
 */
function hasKeyInBlock(project: Project, t: number, d: number): boolean {
  return camerasOf(project).some((cam) => {
    const center = cam.tracks.center;
    return center.kind === 'keyframed' && center.keys.some((k) => k.t >= t && k.t < t + d);
  });
}
