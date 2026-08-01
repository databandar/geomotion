/**
 * Keying a flat background out of an uploaded image.
 *
 * Pure and DOM-free: it takes pixels and returns pixels, so it is unit-testable and could
 * run in a worker. Decoding and re-encoding belong to whoever owns a canvas.
 *
 * **What this is and is not.** This is a colour key flooded in from the border — the
 * technique that works on logos, flags, charts, screenshots and diagrams, which is most of
 * what goes into a map video. It is *not* a matte: it cannot separate a person from a park,
 * and it will not pretend to. `removed` comes back with the result so the caller can say so
 * out loud rather than presenting a bad cut-out as a good one.
 *
 * **Flooded from the border, not keyed globally.** A global "remove every white pixel" also
 * removes the white *inside* a logo — the counter of an O, the highlight on a chart. Only
 * background connected to the edge is background; everything the shape encloses is the
 * shape's own.
 */

/** A bitmap, in the shape `ImageData` already has, without depending on the DOM type. */
export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface RemoveBackgroundOptions {
  /**
   * How close to the border colour a pixel must be to count as background, 0..1.
   *
   * 0 removes only exact matches — right for a flat export, useless for anything with
   * compression noise. Around 0.12 handles a JPEG of a flat background. Past ~0.4 it starts
   * eating the subject, which is what `removed` is for.
   */
  tolerance?: number;
  /** Softening at the cut edge, in pixels. 0 leaves the hard jaggies of a per-pixel test. */
  feather?: number;
}

export interface RemoveBackgroundResult extends Pixels {
  /** Fraction of pixels made transparent, 0..1. */
  removed: number;
  /**
   * Why the caller should be suspicious of this result, or `null` when it looks sane.
   *
   * Returned rather than thrown: a poor key is still a result the user may want to look at
   * and re-tune. It is a judgement about the *image*, not an error in the operation.
   */
  warning: string | null;
}

/** Squared RGB distance, normalised to 0..1 so `tolerance` reads the same on any image. */
function near(
  data: Uint8ClampedArray,
  a: number,
  seed: readonly [number, number, number],
  threshold: number,
): boolean {
  const dr = (data[a] as number) - seed[0];
  const dg = (data[a + 1] as number) - seed[1];
  const db = (data[a + 2] as number) - seed[2];
  // 3 * 255² is the largest possible squared distance; comparing squares avoids a sqrt per
  // pixel, and the threshold is squared to match.
  return (dr * dr + dg * dg + db * db) / 195_075 <= threshold * threshold;
}

/**
 * Make the connected border-coloured region transparent.
 *
 * Returns a new bitmap; the input is not touched. Deterministic — the same pixels and
 * options always give the same result, which is what lets a render re-derive it.
 */
export function removeBackground(img: Pixels, opts: RemoveBackgroundOptions = {}): RemoveBackgroundResult {
  const tolerance = Math.max(0, Math.min(1, opts.tolerance ?? 0.12));
  const feather = Math.max(0, Math.round(opts.feather ?? 1));
  const { width: w, height: h } = img;
  const out = new Uint8ClampedArray(img.data);
  const total = w * h;
  if (total === 0) return { data: out, width: w, height: h, removed: 0, warning: 'the image is empty' };

  /*
   * The seed is the median of the four corners, not one corner.
   *
   * One corner is a single pixel and a single pixel can be a compression artefact or a stray
   * mark; four disagree honestly when the background is not flat, and the median of them is
   * stable against one outlier.
   */
  const corners: [number, number, number][] = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ].map(([x, y]) => {
    const i = ((y as number) * w + (x as number)) * 4;
    return [img.data[i] as number, img.data[i + 1] as number, img.data[i + 2] as number];
  });
  const median = (k: 0 | 1 | 2) => {
    const v = corners.map((c) => c[k]).sort((a, b) => a - b);
    return ((v[1] as number) + (v[2] as number)) / 2;
  };
  const seed: readonly [number, number, number] = [median(0), median(1), median(2)];

  /*
   * Flood fill inward from every border pixel.
   *
   * An explicit stack, not recursion: a 4000×3000 background is twelve million pixels deep in
   * the worst case and would blow the call stack long before it finished.
   */
  const bg = new Uint8Array(total);
  const stack: number[] = [];
  const push = (px: number) => {
    if (bg[px] === 0 && near(img.data, px * 4, seed, tolerance)) {
      bg[px] = 1;
      stack.push(px);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length > 0) {
    const px = stack.pop() as number;
    const x = px % w;
    const y = (px - x) / w;
    if (x > 0) push(px - 1);
    if (x < w - 1) push(px + 1);
    if (y > 0) push(px - w);
    if (y < h - 1) push(px + w);
  }

  let removed = 0;
  for (let px = 0; px < total; px++) {
    if (bg[px] === 1) {
      out[px * 4 + 3] = 0;
      removed++;
    }
  }

  if (feather > 0 && removed > 0) softenEdge(out, bg, w, h, feather);

  const fraction = removed / total;
  return {
    data: out,
    width: w,
    height: h,
    removed: fraction,
    warning:
      fraction < 0.01
        ? 'almost nothing was removed — the background may not be a flat colour'
        : fraction > 0.95
          ? 'almost everything was removed — the subject is probably close to the background colour'
          : null,
  };
}

/**
 * Fade the alpha across `radius` pixels either side of the cut.
 *
 * Only pixels that border the removed region are touched. Blurring the whole alpha channel
 * would eat into a subject that legitimately reaches the frame edge, and cost a full-image
 * pass to do it.
 */
function softenEdge(out: Uint8ClampedArray, bg: Uint8Array, w: number, h: number, radius: number): void {
  const alpha = new Uint8ClampedArray(w * h);
  for (let px = 0; px < w * h; px++) alpha[px] = bg[px] === 1 ? 0 : 255;

  const edge: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = y * w + x;
      if (bg[px] === 1) continue;
      const touchesBg =
        (x > 0 && bg[px - 1] === 1) ||
        (x < w - 1 && bg[px + 1] === 1) ||
        (y > 0 && bg[px - w] === 1) ||
        (y < h - 1 && bg[px + w] === 1);
      if (touchesBg) edge.push(px);
    }
  }

  // A box average over the neighbourhood of each edge pixel, applied to the copy so one
  // pixel's new value never feeds the next one's.
  const next = new Uint8ClampedArray(alpha);
  for (const px of edge) {
    const x = px % w;
    const y = (px - x) / w;
    let sum = 0;
    let n = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        sum += alpha[ny * w + nx] as number;
        n++;
      }
    }
    next[px] = n > 0 ? sum / n : (alpha[px] as number);
  }

  for (const px of edge) out[px * 4 + 3] = next[px] as number;
}
