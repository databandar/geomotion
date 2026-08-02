import { describe, expect, it } from 'vitest';
import { detectBakedInCardBorder, type RasterImage } from './image-lint.ts';

/** A synthetic WxH RGBA image: `bg` everywhere, then `corner` painted into a
 * `cornerSize`-px square at each of the four corners (opaque unless `cornerAlpha`
 * says otherwise) — a stand-in for a generator's baked-in rounded-card frame,
 * without needing a real PNG. */
function synthImage(
  width: number, height: number,
  bg: readonly [number, number, number, number],
  corner?: readonly [number, number, number, number], cornerSize = 0,
): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const inCorner =
        corner &&
        ((x < cornerSize && y < cornerSize) ||
          (x >= width - cornerSize && y < cornerSize) ||
          (x < cornerSize && y >= height - cornerSize) ||
          (x >= width - cornerSize && y >= height - cornerSize));
      const [r, g, b, a] = inCorner ? corner! : bg;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
    }
  }
  return { width, height, data };
}

describe('detectBakedInCardBorder', () => {
  it('finds nothing in a plain image with no corner artifact', () => {
    const img = synthImage(40, 40, [20, 30, 40, 255]);
    expect(detectBakedInCardBorder(img)).toBeNull();
  });

  it('finds nothing when the corners already have real transparency', () => {
    // The already-fixed state: alpha 0 at the corners, not a solid opaque colour.
    const img = synthImage(40, 40, [20, 30, 40, 255], [255, 255, 255, 0], 6);
    expect(detectBakedInCardBorder(img)).toBeNull();
  });

  /**
   * Regression case: one of the five real Dandi March images (s04-cupped-hands.png)
   * has a dark, roughly uniform corner too — but it's the illustration's own
   * near-black background naturally reaching its corners, not an imposed frame.
   * An earlier version of this check (uniform-corner-plus-small-region only, no
   * contrast test) flagged it — a false positive found only by running the check
   * against the real image, not by reasoning about the algorithm.
   */
  it('does not flag a dark corner that matches the image\'s own dark background', () => {
    // Real measured values: corner rgb(18,29,43), center of the same image is a
    // similarly dark tone — low contrast, unlike an imposed white border.
    const img = synthImage(60, 60, [16, 27, 41, 255], [18, 29, 43, 255], 4);
    expect(detectBakedInCardBorder(img)).toBeNull();
  });

  it('detects an opaque, uniform-colour corner border, matching the actual Dandi March defect', () => {
    // The real measured corner pixel was (255,255,255,255) — fully opaque white,
    // not transparency — with the border occupying a small fraction of the image.
    const img = synthImage(576, 1024, [10, 15, 25, 255], [255, 255, 255, 255], 34);
    const finding = detectBakedInCardBorder(img);
    expect(finding).not.toBeNull();
    expect(finding!.color).toEqual([255, 255, 255]);
    expect(finding!.coverage).toBeLessThan(0.2);
  });

  it('does not flag a mostly-solid-colour image as a corner border', () => {
    // A genuinely solid (or near-solid) background is real content, not a small
    // border artifact — the region covers far more than a plausible frame would.
    const img = synthImage(40, 40, [255, 255, 255, 255]);
    expect(detectBakedInCardBorder(img)).toBeNull();
  });

  it('does not flag corners that merely happen to differ from each other', () => {
    // Ordinary image content: each corner a different colour, not a deliberate
    // uniform frame.
    const data = new Uint8ClampedArray(4 * 4 * 4);
    const set = (x: number, y: number, c: [number, number, number, number]) => {
      const i = (y * 4 + x) * 4;
      [data[i], data[i + 1], data[i + 2], data[i + 3]] = c;
    };
    set(0, 0, [255, 0, 0, 255]);
    set(3, 0, [0, 255, 0, 255]);
    set(0, 3, [0, 0, 255, 255]);
    set(3, 3, [255, 255, 0, 255]);
    expect(detectBakedInCardBorder({ width: 4, height: 4, data })).toBeNull();
  });

  it('respects a tighter colorTolerance', () => {
    const img = synthImage(40, 40, [10, 10, 10, 255], [250, 250, 250, 255], 6);
    expect(detectBakedInCardBorder(img, { colorTolerance: 2 })).not.toBeNull();
  });

  it('is symmetric with the fix already applied — a re-check after flood-fill-to-transparent finds nothing', () => {
    const img = synthImage(60, 60, [10, 15, 25, 255], [255, 255, 255, 255], 8);
    expect(detectBakedInCardBorder(img)).not.toBeNull();

    // Simulate the actual fix: flood-fill the corner region to alpha 0.
    const { width, height, data } = img;
    const stack: [number, number][] = [[0, 0]];
    const visited = new Uint8Array(width * height);
    while (stack.length) {
      const [x, y] = stack.pop()!;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const p = y * width + x;
      if (visited[p]) continue;
      const i = p * 4;
      if (!(data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255 && data[i + 3] === 255)) continue;
      visited[p] = 1;
      data[i + 3] = 0;
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
    expect(detectBakedInCardBorder(img)).toBeNull();
  });
});
