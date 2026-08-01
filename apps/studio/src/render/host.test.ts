import { describe, expect, it, vi } from 'vitest';
import { waitForIdle } from './host';

/**
 * The tile wait, and the difference between finishing and giving up.
 *
 * This used to resolve either way. A tile that never arrived produced a frame with grey
 * loading blocks in it, and the render reported success — a bad frame nothing admitted to.
 * These tests are about the verdict, not the waiting.
 */

/** The two methods and two events of MapLibre's map that this function actually uses. */
function fakeMap(opts: { loaded: boolean; tiles: boolean }) {
  const handlers = new Map<string, Set<() => void>>();
  return {
    loaded: () => opts.loaded,
    areTilesLoaded: () => opts.tiles,
    on: (ev: string, fn: () => void) => {
      if (!handlers.has(ev)) handlers.set(ev, new Set());
      handlers.get(ev)!.add(fn);
    },
    off: (ev: string, fn: () => void) => handlers.get(ev)?.delete(fn),
    /** Fire `idle`, the way MapLibre does once the last tile lands. */
    goIdle: () => [...(handlers.get('idle') ?? [])].forEach((fn) => fn()),
    listeners: (ev: string) => handlers.get(ev)?.size ?? 0,
  };
}

describe('waitForIdle', () => {
  it('says true immediately when the tiles are already there', async () => {
    const map = fakeMap({ loaded: true, tiles: true });
    await expect(waitForIdle(map as never, 50)).resolves.toBe(true);
  });

  it('says true when the map goes idle before the deadline', async () => {
    const map = fakeMap({ loaded: false, tiles: false });
    const done = waitForIdle(map as never, 1000);
    map.goIdle();
    await expect(done).resolves.toBe(true);
  });

  it('says FALSE when it gives up — the frame is unfinished and the caller must know', async () => {
    vi.useFakeTimers();
    try {
      const map = fakeMap({ loaded: false, tiles: false });
      const done = waitForIdle(map as never, 12_000);
      vi.advanceTimersByTime(12_000);
      await expect(done).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops listening once it has answered, either way', async () => {
    // A render calls this once per frame; a listener left behind is a leak per frame.
    const map = fakeMap({ loaded: false, tiles: false });
    const done = waitForIdle(map as never, 1000);
    expect(map.listeners('idle')).toBe(1);
    map.goIdle();
    await done;
    expect(map.listeners('idle')).toBe(0);
  });

  it('answers once even if idle fires again afterwards', async () => {
    const map = fakeMap({ loaded: false, tiles: false });
    const done = waitForIdle(map as never, 1000);
    map.goIdle();
    map.goIdle();
    await expect(done).resolves.toBe(true);
  });
});
