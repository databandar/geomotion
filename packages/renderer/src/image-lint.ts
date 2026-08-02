/**
 * Detects a baked-in card border on an imported image — the defect found in three
 * of five images generated for the Dandi March episode's `image` layer inserts.
 *
 * The generator had drawn its own opaque, uniform-colour rounded-rect frame
 * directly into the RGB pixels (not real alpha transparency — confirmed at the
 * time by sampling corner pixels by hand: `(255,255,255,255)`, fully opaque, not
 * `(_,_,_,0)`). GeoMotion's `image` layer already draws its own border, radius and
 * shadow around whatever bitmap it's given, so an image that brings its own card
 * frame doubles up against it — corners that don't align, a border that reads as
 * two nested rectangles instead of one. The fix at the time was a one-off
 * flood-fill script; this is that script, kept, tested, and reusable instead of
 * thrown away after the one use.
 *
 * Pure pixel-array logic, no canvas or DOM dependency in the algorithm itself
 * (only in *obtaining* the array, which is the caller's problem — see
 * `apps/studio`'s image-import path for where this actually gets called against a
 * real decoded bitmap).
 */

export interface RasterImage {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel, row-major — the same layout `ImageData.data` uses. */
  data: Uint8ClampedArray | Uint8Array;
}

export interface CardBorderOptions {
  /** How close two colour channels must be to count as "the same colour." Default 6. */
  colorTolerance?: number;
  /** Alpha at or above this counts as opaque — i.e. not already real transparency. Default 250. */
  opacityThreshold?: number;
  /** A flood-filled region larger than this fraction of the image is treated as
   * real content (e.g. a plain background), not a small corner border. Default 0.2. */
  maxCoverage?: number;
  /** Minimum Euclidean RGB distance the corner colour must have from the pixels
   * immediately outside the flood-filled region to count as a hard, imposed edge
   * rather than the illustration's own background gradually shading in. Default 45. */
  minEdgeContrast?: number;
}

export interface CardBorderFinding {
  /** Fraction of the image's total area the connected corner region covers. */
  coverage: number;
  color: readonly [number, number, number];
}

function colorsClose(data: RasterImage['data'], i: number, r: number, g: number, b: number, tol: number): boolean {
  return Math.abs(data[i]! - r) <= tol && Math.abs(data[i + 1]! - g) <= tol && Math.abs(data[i + 2]! - b) <= tol;
}

/**
 * `null` if the image looks fine — either the corners already have real
 * transparency, they aren't a consistent colour (ordinary image content, not a
 * deliberate frame), or the matching region is too large a fraction of the image
 * to plausibly be just a border.
 */
export function detectBakedInCardBorder(img: RasterImage, opts: CardBorderOptions = {}): CardBorderFinding | null {
  const { width, height, data } = img;
  if (width < 2 || height < 2) return null;
  const tol = opts.colorTolerance ?? 6;
  const opacityThreshold = opts.opacityThreshold ?? 250;
  const maxCoverage = opts.maxCoverage ?? 0.2;

  const idx = (x: number, y: number) => (y * width + x) * 4;
  const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]] as const;
  const cornerPixels = corners.map(([x, y]) => {
    const i = idx(x, y);
    return { r: data[i]!, g: data[i + 1]!, b: data[i + 2]!, a: data[i + 3]! };
  });

  // Already-transparent corners mean there's no problem to fix.
  if (cornerPixels.some((p) => p.a < opacityThreshold)) return null;
  // All four corners must agree — a shape distinct enough to be a deliberate
  // frame, not one corner coincidentally matching ordinary image content.
  const [c0, ...rest] = cornerPixels as [{ r: number; g: number; b: number; a: number }, ...{ r: number; g: number; b: number; a: number }[]];
  if (!rest.every((p) => Math.abs(p.r - c0.r) <= tol && Math.abs(p.g - c0.g) <= tol && Math.abs(p.b - c0.b) <= tol)) return null;

  // Flood-fill from one corner (they're assumed roughly symmetric, as a rounded
  // card frame is) to measure how much of the image the matching region actually
  // covers — small and corner-hugging reads as a border; most of the image reads
  // as real content that happens to be one flat colour. Rejected-but-adjacent
  // pixels are collected as the region's boundary along the way, for the edge
  // check below — walking it again afterward would mean re-deriving the same
  // adjacency the flood-fill already computed once.
  const total = width * height;
  const cap = Math.floor(total * maxCoverage);
  const visited = new Uint8Array(total);
  const boundary = new Set<number>();
  const stack: [number, number][] = [[0, 0]];
  let count = 0;
  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const p = y * width + x;
    if (visited[p]) continue;
    const i = p * 4;
    const matches = data[i + 3]! >= opacityThreshold && colorsClose(data, i, c0.r, c0.g, c0.b, tol);
    if (!matches) {
      boundary.add(p);
      continue;
    }
    visited[p] = 1;
    count++;
    if (count > cap) return null; // region too large to plausibly be just a border
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  // A uniform corner isn't inherently suspicious — a mostly-flat dark background
  // naturally reaches its own corners too (confirmed empirically: one of the five
  // Dandi March images had a dark, roughly-uniform corner that was its actual
  // intended background, not a defect). Comparing against the image's centre
  // pixel was tried first and was itself wrong the same way, for a different
  // reason: a centred bright subject against a dark background makes *any* dark
  // corner look high-contrast, defect or not. What's actually diagnostic is
  // whether there's a *hard edge* right where the uniform region stops — an
  // imposed card frame has a crisp boundary (that's what makes it read as a
  // frame); a natural background blends gradually, so pixels just past the
  // flood-fill's edge are still close to the corner's own colour.
  const minEdgeContrast = opts.minEdgeContrast ?? 45;
  let br = 0, bg = 0, bb = 0, bn = 0;
  for (const p of boundary) {
    const i = p * 4;
    br += data[i]!; bg += data[i + 1]!; bb += data[i + 2]!; bn++;
  }
  if (bn === 0) return null; // the fill reached every pixel in the image; nothing to compare against
  const edgeContrast = Math.hypot(c0.r - br / bn, c0.g - bg / bn, c0.b - bb / bn);
  if (edgeContrast < minEdgeContrast) return null;

  return { coverage: count / total, color: [c0.r, c0.g, c0.b] };
}
