import { describe, expect, it } from 'vitest';
import { emptyProject, keyframe } from './project.ts';
import { resolveMapContext, type MapContext } from './context.ts';
import type { Project } from './types.ts';
import type { StoryBlock } from './story.ts';

/**
 * A map context answers "what does the map look like right now", which before this was
 * only a project-wide setting. The merge is where it can go wrong: a context that
 * replaced everything it did not name would blank the basemap the moment anyone used one
 * to switch the projection.
 */
const ctx = (id: string, over: Partial<MapContext> = {}): MapContext => ({ id, name: id, ...over });
const block = (id: string, t: number, d: number, context?: string): StoryBlock =>
  ({ id, t, d, nodes: [], ...(context ? { context } : {}) });

const withStory = (story: StoryBlock[], contexts: MapContext[], over: Partial<Project> = {}): Project => ({
  ...emptyProject(),
  duration: 60,
  basemap: 'dark',
  story,
  contexts,
  ...over,
});

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
    withStory([block('b', 0, 5, 'c')], [ctx('c', { camera: { zoom: 9 } })], {
      camera: keys.map((t) => keyframe(t, [0, 0], 2)),
    });

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
