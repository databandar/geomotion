/**
 * Image loading for the picture layer.
 *
 * Decoding is asynchronous, which matters for offline export: a frame captured
 * before the bitmap is ready would silently render without it. So every source
 * is tracked, and `imagesReady()` lets the render pipeline wait once up front
 * instead of hoping two animation frames were enough.
 */

interface Entry {
  img: HTMLImageElement;
  ready: boolean;
  failed: boolean;
  promise: Promise<void>;
}

const cache = new Map<string, Entry>();

export function getImage(src: string): Entry | null {
  if (!src) return null;
  const hit = cache.get(src);
  if (hit) return hit;

  const img = new Image();
  img.crossOrigin = 'anonymous';
  const entry: Entry = {
    img,
    ready: false,
    failed: false,
    promise: new Promise<void>((resolve) => {
      img.onload = () => {
        entry.ready = true;
        resolve();
      };
      img.onerror = () => {
        entry.failed = true;
        resolve();
      };
    }),
  };
  cache.set(src, entry);
  img.src = src;
  return entry;
}

/** Resolves when every image requested so far has loaded or failed. */
export async function imagesReady(): Promise<{ total: number; failed: string[] }> {
  const entries = [...cache.entries()];
  await Promise.all(entries.map(([, e]) => e.promise));
  return { total: entries.length, failed: entries.filter(([, e]) => e.failed).map(([src]) => src) };
}
