import { describe, expect, it } from 'vitest';
import { projectWith } from './project.ts';
import { createMapContext } from './schema/index.ts';
import { cameraFromShots, keyframe } from './camera.ts';
import { contextsOf, liveContext, resolveMapContext, type MapContextNode } from './context.ts';
import { addNode, isContainerNode, isMapContextNode, layersOf } from './nodes.ts';
import { createLayer } from './project.ts';
import { transact } from './transact.ts';
import type { Project } from './types.ts';
import type { StoryBlock } from './story.ts';

/**
 * A map context answers "what does the map look like right now", which before this was
 * only a project-wide setting. The merge is where it can go wrong: a context that
 * replaced everything it did not name would blank the basemap the moment anyone used one
 * to switch the projection.
 */
/** A context node with `id` for a name, so a test reads as the thing it is checking. */
const ctx = (id: string, over: Partial<MapContextNode> = {}): MapContextNode =>
  ({ ...createMapContext(id), id, ...over }) as MapContextNode;
const block = (id: string, t: number, d: number, context?: string): StoryBlock =>
  ({ id, t, d, nodes: [], ...(context ? { context } : {}) });

// Contexts are nodes now, so they go in the store beside everything else.
const withStory = (
  story: StoryBlock[],
  contexts: MapContextNode[],
  cameras: Project['nodes'][string][] = [],
): Project => projectWith([...cameras, ...contexts], { duration: 60, basemap: 'dark', story });

describe('resolveMapContext', () => {
  it('is the project\'s own settings where no block applies', () => {
    const p = withStory([], []);
    expect(resolveMapContext(p, 3)).toMatchObject({ basemap: 'dark', terrain: false, projection: 'mercator' });
  });

  it('overrides only what the context names', () => {
    /*
     * The whole point of a partial override. A context that switched the projection and
     * replaced everything else would blank the basemap, and every context would have to
     * restate the whole map to change one thing.
     */
    const p = withStory([block('b', 0, 5, 'globe')], [ctx('globe', { projection: 'globe' })]);
    const out = resolveMapContext(p, 2);
    expect(out.projection).toBe('globe');
    expect(out.basemap).toBe('dark');
  });

  it('switches back outside the block', () => {
    const p = withStory([block('b', 5, 5, 'sat')], [ctx('sat', { basemap: 'satellite' })]);
    expect(resolveMapContext(p, 7).basemap).toBe('satellite');
    expect(resolveMapContext(p, 2).basemap).toBe('dark');
    expect(resolveMapContext(p, 12).basemap).toBe('dark');
  });

  it('falls back to the project when a block names a context that is gone', () => {
    // Deleting a context should not blank the map; carrying on with the defaults is a
    // better answer than refusing to draw.
    const p = withStory([block('b', 0, 5, 'deleted')], []);
    expect(resolveMapContext(p, 2).basemap).toBe('dark');
    expect(resolveMapContext(p, 2).id).toBeUndefined();
  });

  it('reports which context applied, so the inspector can say', () => {
    const p = withStory([block('b', 0, 5, 'sat')], [ctx('sat', { basemap: 'satellite' })]);
    expect(resolveMapContext(p, 2).id).toBe('sat');
  });

  it('always returns a hidden set, so callers need not check', () => {
    expect(resolveMapContext(withStory([], []), 0).hidden.size).toBe(0);
  });

  it('holds back the layers a context names', () => {
    // A reference map that should not appear during the close-up.
    const p = withStory([block('b', 0, 5, 'c')], [ctx('c', { hidden: ['ref'] })]);
    expect(resolveMapContext(p, 2).hidden.has('ref')).toBe(true);
    expect(resolveMapContext(p, 9).hidden.has('ref')).toBe(false);
  });
});

describe('a context\'s camera is a default, never an override', () => {
  const withCamera = (keys: number[]) =>
    withStory([block('b', 0, 5, 'c')], [ctx('c', { camera: { zoom: 9 } })], [
      cameraFromShots(keys.map((t) => keyframe(t, [0, 0], 2))),
    ]);

  it('applies where the block carries no keyframe', () => {
    expect(resolveMapContext(withCamera([]), 2).camera?.zoom).toBe(9);
    // A key outside the block does not count as authoring inside it.
    expect(resolveMapContext(withCamera([30]), 2).camera?.zoom).toBe(9);
  });

  it('stands aside where the author keyframed inside the block', () => {
    /*
     * Keyframing is deliberate. A default that beat it would make the timeline lie about
     * what it is showing — the diamond says one thing, the map another.
     */
    expect(resolveMapContext(withCamera([3]), 2).camera).toBeUndefined();
  });

  it('counts a key on the block\'s own start as inside it', () => {
    expect(resolveMapContext(withCamera([0]), 2).camera).toBeUndefined();
  });

  it('counts a key on the block\'s end as outside it', () => {
    // Half-open, the same rule blocks themselves use.
    expect(resolveMapContext(withCamera([5]), 2).camera?.zoom).toBe(9);
  });
});

describe('a context as a node', () => {
  const layer = (name: string) => createLayer('text', 0, { name, out: 30 } as never);

  it('is a container, not a layer', () => {
    const c = ctx('sat');
    const p = withStory([], [c]);
    expect(isMapContextNode(p.nodes[c.id]!)).toBe(true);
    expect(isContainerNode(p.nodes[c.id]!)).toBe(true);
    expect(layersOf(p).map((l) => l.id)).not.toContain(c.id);
  });

  it('draws its children where it sits in the order', () => {
    // §6.5 again: depth-first document order. A context holds a place like a group does.
    const c = ctx('sat');
    const inside = layer('inside');
    const after = layer('after');
    const p = transact(withStory([], [c]), (d) => {
      addNode(d, inside, { parentId: c.id });
      addNode(d, after);
    }).next;
    expect(layersOf(p).map((l) => l.name)).toEqual(['inside', 'after']);
  });

  it('is live only while a block names it', () => {
    const c = ctx('sat', { basemap: 'satellite' });
    const p = withStory([block('b', 0, 5, c.id)], [c]);
    expect(liveContext(p, 2)?.id).toBe(c.id);
    expect(liveContext(p, 9)).toBeUndefined();
  });

  it('is never live while it is switched off', () => {
    // Which is how you take a whole stretch's look, and everything belonging to it, out of
    // the composition without deleting either.
    const c = ctx('sat', { basemap: 'satellite', visible: false });
    const p = withStory([block('b', 0, 5, c.id)], [c]);
    expect(liveContext(p, 2)).toBeUndefined();
    expect(resolveMapContext(p, 2).basemap).toBe('dark');
  });

  it('is never live when no block names it', () => {
    // Honest rather than surprising: a context nobody uses shows nothing, and the panel says
    // so on the row rather than leaving you to wonder.
    const c = ctx('unused', { basemap: 'satellite' });
    const p = withStory([block('b', 0, 5)], [c]);
    expect(liveContext(p, 2)).toBeUndefined();
  });

  it('lets several blocks share one, which is the point of referencing by id', () => {
    const c = ctx('sat', { basemap: 'satellite' });
    const p = withStory([block('a', 0, 5, c.id), block('b', 10, 5, c.id)], [c]);
    expect(resolveMapContext(p, 2).basemap).toBe('satellite');
    expect(resolveMapContext(p, 12).basemap).toBe('satellite');
    expect(contextsOf(p)).toHaveLength(1);
  });
});
