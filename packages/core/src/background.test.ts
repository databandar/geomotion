import { describe, expect, it } from 'vitest';
import { removeBackground, type Pixels } from './background.ts';

/**
 * The colour key (docs/features/image-background.md).
 *
 * The behaviour worth pinning is not "it removes pixels" — it is *which* pixels: only
 * background connected to the border, never a hole the subject encloses. That distinction is
 * the whole reason this floods rather than thresholds.
 */

/** A bitmap from a picture drawn in characters, so a test reads as what it is testing. */
function art(rows: string[], palette: Record<string, [number, number, number]>): Pixels {
  const h = rows.length;
  const w = (rows[0] as string).length;
  const data = new Uint8ClampedArray(w * h * 4);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const [r, g, b] = palette[ch] as [number, number, number];
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    }),
  );
  return { data, width: w, height: h };
}

const alphaAt = (p: Pixels, x: number, y: number) => p.data[(y * p.width + x) * 4 + 3];

const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];

describe('removeBackground', () => {
  it('removes a flat background and keeps the subject', () => {
    const img = art(
      [
        '.....',
        '.###.',
        '.###.',
        '.....',
      ],
      { '.': WHITE, '#': BLACK },
    );
    const out = removeBackground(img, { tolerance: 0.05, feather: 0 });

    expect(alphaAt(out, 0, 0)).toBe(0); // corner: gone
    expect(alphaAt(out, 2, 2)).toBe(255); // subject: kept
    // 5×4 = 20 pixels, a 3×2 subject: 14 are background.
    expect(out.removed).toBeCloseTo(14 / 20, 2);
  });

  it('keeps a hole the subject encloses — the reason this floods rather than thresholds', () => {
    /*
     * The counter of an O. A global "remove every white pixel" would punch it out, and the
     * logo would render with a see-through middle over the map.
     */
    const img = art(
      [
        '.....',
        '.###.',
        '.#.#.',
        '.###.',
        '.....',
      ],
      { '.': WHITE, '#': BLACK },
    );
    const out = removeBackground(img, { tolerance: 0.05, feather: 0 });

    expect(alphaAt(out, 0, 0)).toBe(0); // outside
    expect(alphaAt(out, 2, 2)).toBe(255); // the enclosed white: kept
  });

  it('reaches background that is connected round a corner', () => {
    // A concave subject: the notch is still outside, and must go.
    const img = art(
      [
        '.....',
        '.##..',
        '.#...',
        '.....',
      ],
      { '.': WHITE, '#': BLACK },
    );
    const out = removeBackground(img, { tolerance: 0.05, feather: 0 });
    expect(alphaAt(out, 3, 2)).toBe(0);
    expect(alphaAt(out, 1, 1)).toBe(255);
  });

  it('tolerance decides how much noise counts as the same colour', () => {
    const noisy: [number, number, number] = [246, 246, 246];
    const img = art(['..*.', '.##.', '....'], { '.': WHITE, '*': noisy, '#': BLACK });

    // Tight: the off-white pixel is its own colour and survives.
    expect(alphaAt(removeBackground(img, { tolerance: 0, feather: 0 }), 2, 0)).toBe(255);
    // Loose: it reads as background, which is what a JPEG needs.
    expect(alphaAt(removeBackground(img, { tolerance: 0.1, feather: 0 }), 2, 0)).toBe(0);
  });

  it('warns when it removed almost nothing, instead of returning a silent no-op', () => {
    // A photograph: no flat border colour, so the flood stops immediately.
    const img = art(['.#.#', '#.#.', '.#.#'], { '.': WHITE, '#': BLACK });
    const out = removeBackground(img, { tolerance: 0, feather: 0 });
    expect(out.warning).toMatch(/almost nothing/);
  });

  it('warns when it ate the subject too', () => {
    const img = art(['....', '....'], { '.': WHITE });
    const out = removeBackground(img, { tolerance: 0.05, feather: 0 });
    expect(out.removed).toBe(1);
    expect(out.warning).toMatch(/almost everything/);
  });

  it('never touches the input', () => {
    const img = art(['..', '.#'], { '.': WHITE, '#': BLACK });
    const before = [...img.data];
    removeBackground(img, { tolerance: 0.05, feather: 1 });
    expect([...img.data]).toEqual(before);
  });

  it('is deterministic', () => {
    const img = art(['.....', '.###.', '.....'], { '.': WHITE, '#': BLACK });
    const a = removeBackground(img, { tolerance: 0.08, feather: 1 });
    const b = removeBackground(img, { tolerance: 0.08, feather: 1 });
    expect([...a.data]).toEqual([...b.data]);
  });

  it('feathering softens the cut without reopening the background', () => {
    const img = art(
      [
        '.....',
        '.###.',
        '.###.',
        '.###.',
        '.....',
      ],
      { '.': WHITE, '#': BLACK },
    );
    const soft = removeBackground(img, { tolerance: 0.05, feather: 1 });

    // A subject pixel on the boundary is partly transparent now …
    expect(alphaAt(soft, 1, 1)).toBeGreaterThan(0);
    expect(alphaAt(soft, 1, 1)).toBeLessThan(255);
    // … the middle is untouched, and the background stays fully gone.
    expect(alphaAt(soft, 2, 2)).toBe(255);
    expect(alphaAt(soft, 0, 0)).toBe(0);
  });

  it('survives an empty image rather than dividing by zero', () => {
    const out = removeBackground({ data: new Uint8ClampedArray(0), width: 0, height: 0 });
    expect(out.removed).toBe(0);
    expect(out.warning).toBeTruthy();
  });
});
