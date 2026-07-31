import { describe, expect, it } from 'vitest';
import { DRAFT_LONG_EDGE, draftSize } from './draft.mjs';

/** Every composition size the inspector offers, plus the shape that broke. */
const PRESETS = [
  ['1080p landscape', 1920, 1080],
  ['4K landscape', 3840, 2160],
  ['Vertical 9:16', 1080, 1920],
  ['Square 1:1', 1080, 1080],
  ['720p landscape', 1280, 720],
];

const ratio = (w, h) => w / h;

describe('draftSize', () => {
  it('keeps the aspect ratio of every shipped preset', () => {
    /*
     * The bug. The size was picked on portrait-versus-landscape alone, which is right
     * for the two 16:9 presets and wrong for the rest — a 1080x1080 square composition
     * rendered as a 960x540 widescreen draft, putting every frame-relative element
     * somewhere it would not be in the final render. Verified end to end before the
     * fix: `ffprobe` on a square project's draft reported `960,540`.
     */
    for (const [name, w, h] of PRESETS) {
      const d = draftSize(w, h);
      expect(`${name}: ${ratio(d.width, d.height).toFixed(4)}`).toBe(`${name}: ${ratio(w, h).toFixed(4)}`);
    }
  });

  it('leaves the two 16:9 presets exactly where they were', () => {
    // The behaviour this replaces was correct for these, and drafts of them are the
    // common case; changing their size would invalidate every existing draft.
    expect(draftSize(1920, 1080)).toEqual({ width: 960, height: 540 });
    expect(draftSize(1080, 1920)).toEqual({ width: 540, height: 960 });
  });

  it('renders a square composition square', () => {
    expect(draftSize(1080, 1080)).toEqual({ width: 960, height: 960 });
  });

  it('caps the long edge whichever way round it is', () => {
    for (const [w, h] of PRESETS.map(([, w, h]) => [w, h])) {
      const d = draftSize(w, h);
      expect(Math.max(d.width, d.height)).toBeLessThanOrEqual(DRAFT_LONG_EDGE);
    }
  });

  it('never enlarges a composition that is already small', () => {
    // Nothing is gained, and the encoder pays for pixels nobody asked for.
    expect(draftSize(640, 360)).toEqual({ width: 640, height: 360 });
    expect(draftSize(320, 240)).toEqual({ width: 320, height: 240 });
  });

  it('gives even dimensions, which H.264 requires', () => {
    // 4:2:0 chroma is subsampled by two; an odd dimension will not encode.
    for (const [w, h] of [[1001, 999], [1080, 1081], [333, 777], [1920, 1080]]) {
      const d = draftSize(w, h);
      expect(d.width % 2).toBe(0);
      expect(d.height % 2).toBe(0);
    }
  });

  it('holds the ratio close on an awkward size', () => {
    const d = draftSize(1001, 999);
    expect(ratio(d.width, d.height)).toBeCloseTo(ratio(1001, 999), 2);
  });

  it('falls back to something encodable for a nonsense size', () => {
    // A hand-edited project file can carry anything; the coercion in `migrate` catches
    // most of it, but the pipeline reads project JSON straight from disk.
    for (const [w, h] of [[0, 0], [-10, 5], [NaN, 100]]) {
      const d = draftSize(w, h);
      expect(d.width).toBeGreaterThan(0);
      expect(d.height).toBeGreaterThan(0);
      expect(d.width % 2).toBe(0);
    }
  });
});
