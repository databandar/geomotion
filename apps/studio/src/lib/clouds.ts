/**
 * Procedural cloud cover for opening shots.
 *
 * A tileable fractal-noise texture is baked once, then drawn as a few drifting
 * tiled layers at different scales and speeds. That keeps the per-frame cost to
 * a handful of pattern fills instead of generating noise every frame, and it
 * stays deterministic — frame N looks the same however it was reached, which is
 * what the offline export depends on.
 */

const TEX = 512;

let texture: HTMLCanvasElement | null = null;

/** Deterministic hash → the clouds are identical on every run and every export. */
function rand(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695040) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Value noise on an f×f lattice, wrapped so the texture tiles seamlessly. */
function octave(u: number, v: number, f: number, seed: number): number {
  const x = u * f;
  const y = v * f;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const wrap = (n: number) => ((n % f) + f) % f;
  const x1 = wrap(x0 + 1);
  const y1 = wrap(y0 + 1);
  const a = rand(wrap(x0), wrap(y0), seed);
  const b = rand(x1, wrap(y0), seed);
  const c = rand(wrap(x0), y1, seed);
  const d = rand(x1, y1, seed);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

export function cloudTexture(): HTMLCanvasElement {
  if (texture) return texture;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEX;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(TEX, TEX);
  const data = img.data;

  const octaves: [number, number][] = [
    [3, 0.5],
    [6, 0.25],
    [12, 0.14],
    [24, 0.08],
    [48, 0.04],
  ];

  for (let y = 0; y < TEX; y++) {
    for (let x = 0; x < TEX; x++) {
      const u = x / TEX;
      const v = y / TEX;
      let n = 0;
      octaves.forEach(([scale, weight], o) => (n += octave(u, v, scale, o + 1) * weight));
      // Bias towards wispy edges rather than a flat grey field.
      const a = Math.max(0, Math.min(1, (n - 0.34) * 2.1)) ** 1.35;
      const i = (y * TEX + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(a * 255);
    }
  }

  ctx.putImageData(img, 0, 0);
  texture = canvas;
  return canvas;
}

/* --------------------------------------------------------------- scratch */

let scratch: HTMLCanvasElement | null = null;

export function scratchCanvas(w: number, h: number): HTMLCanvasElement {
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width !== w || scratch.height !== h) {
    scratch.width = w;
    scratch.height = h;
  }
  return scratch;
}
