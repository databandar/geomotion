import { describe, expect, it } from 'vitest';
import { createId } from './id.ts';

/**
 * Moved here with the generator when it left v1's `project.ts`, where it was
 * called `uid`.
 *
 * The collision assertion matters more than it looks: layer ids are the join key
 * for selection, undo and the region caches, so a duplicate does not throw — it
 * silently makes two layers the same layer.
 */

describe('createId', () => {
  it('returns a short url-safe string', () => {
    expect(createId()).toMatch(/^[a-z0-9]+$/);
  });

  it('does not collide across many calls', () => {
    const ids = Array.from({ length: 5000 }, createId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
