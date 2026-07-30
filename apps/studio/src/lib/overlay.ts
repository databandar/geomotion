import type { LngLat, RouteIcon } from '../types';
import type { CloudsRender, ImageRender, MarkerRender, RegionsRender, RouteRender, Scene, TextRender } from './scene';
import { getImage } from './images';
import { cloudTexture, scratchCanvas } from './clouds';
import { getRamp, rampColor } from './palettes';
import { clamp01 } from '@geomotion/core';

export interface ProjectFn {
  (c: LngLat): { x: number; y: number };
}

/**
 * Sizes (text, markers, offsets) are authored in the pixels of a 1080p frame and
 * scaled from there, so switching the composition between 720p, 1080p and 4K
 * changes the resolution without changing the look.
 */
const REFERENCE_HEIGHT = 1080;

export const scaleFor = (renderedHeight: number) => renderedHeight / REFERENCE_HEIGHT;

export interface OverlayFrame {
  ctx: CanvasRenderingContext2D;
  /** logical composition size in px (already matches the target aspect) */
  width: number;
  height: number;
  /** authored 1080p px → rendered px */
  scale: number;
  project: ProjectFn;
}

/**
 * Canvas has no font fallback chain per glyph the way CSS layout does — it picks
 * the first family that has the glyph. Naming real Devanagari faces before the
 * generic fallback is what stops Hindi rendering in a default serif with broken
 * matras. The Latin faces stay first so Latin text is unaffected.
 */
const FONT_STACK =
  `'Inter', 'Helvetica Neue', system-ui, -apple-system, 'Segoe UI', Roboto, ` +
  `'Noto Sans Devanagari', 'Kohinoor Devanagari', 'Devanagari Sangam MN', 'Nirmala UI', sans-serif`;

export function drawOverlay(f: OverlayFrame, scene: Scene) {
  const { ctx } = f;
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  for (const r of scene.regions) if (r.alpha > 0) drawRegions(f, r);
  for (const r of scene.routes) if (r.alpha > 0) drawRouteHead(f, r);
  for (const m of scene.markers) if (m.alpha > 0) drawMarker(f, m);
  // Clouds sit over the map and its annotations, but under the titles.
  for (const c of scene.clouds) if (c.alpha > 0 && c.clear < 1) drawClouds(f, c);
  for (const i of scene.images) if (i.alpha > 0) drawImageLayer(f, i);
  for (const t of scene.texts) if (t.alpha > 0) drawText(f, t);

  ctx.restore();
}

/* ---------------------------------------------------------------- clouds */

function drawClouds(f: OverlayFrame, c: CloudsRender) {
  const { layer } = c;
  const tex = cloudTexture();
  const scratch = scratchCanvas(f.width, f.height);
  const sctx = scratch.getContext('2d');
  if (!sctx) return;

  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.globalCompositeOperation = 'source-over';
  sctx.clearRect(0, 0, f.width, f.height);

  const rad = (layer.direction * Math.PI) / 180;
  const dx = Math.cos(rad) * layer.speed * f.scale;
  const dy = Math.sin(rad) * layer.speed * f.scale;

  // Three passes at different scales and speeds read as depth; one flat layer
  // of noise reads as static.
  const passes = [
    { scale: 1.9, speed: 0.45, alpha: 0.55 },
    { scale: 1.0, speed: 1.0, alpha: 0.45 },
    { scale: 0.55, speed: 1.75, alpha: 0.3 },
  ];

  for (const pass of passes) {
    const pattern = sctx.createPattern(tex, 'repeat');
    if (!pattern) continue;
    const s = layer.scale * pass.scale * f.scale;
    // Wrap the offset to one tile so it never grows unbounded over a long take.
    const ox = ((dx * pass.speed * c.drift) / s) % tex.width;
    const oy = ((dy * pass.speed * c.drift) / s) % tex.height;

    sctx.save();
    sctx.globalAlpha = pass.alpha * layer.coverage;
    sctx.scale(s, s);
    sctx.translate(ox, oy);
    sctx.fillStyle = pattern;
    // The frame, in this pass's own scaled space, plus a tile of slack each way.
    sctx.fillRect(-ox - tex.width, -oy - tex.height, f.width / s + tex.width * 2, f.height / s + tex.height * 2);
    sctx.restore();
  }

  // Tint the accumulated white noise.
  sctx.globalCompositeOperation = 'source-in';
  sctx.globalAlpha = 1;
  sctx.fillStyle = layer.color;
  sctx.fillRect(0, 0, f.width, f.height);

  // Part the cloud from the centre outward.
  if (c.clear > 0) {
    const maxR = Math.hypot(f.width, f.height) * 0.62;
    const r = c.clear * maxR * 1.25;
    const hole = sctx.createRadialGradient(f.width / 2, f.height / 2, 0, f.width / 2, f.height / 2, Math.max(1, r));
    hole.addColorStop(0, 'rgba(0,0,0,1)');
    hole.addColorStop(0.65, 'rgba(0,0,0,0.92)');
    hole.addColorStop(1, 'rgba(0,0,0,0)');
    sctx.globalCompositeOperation = 'destination-out';
    sctx.fillStyle = hole;
    sctx.fillRect(0, 0, f.width, f.height);
  }

  f.ctx.save();
  f.ctx.globalAlpha = c.alpha * layer.opacity * (1 - c.clear * 0.35);
  f.ctx.drawImage(scratch, 0, 0);
  f.ctx.restore();
}

/* ---------------------------------------------------------------- images */

function drawImageLayer(f: OverlayFrame, r: ImageRender) {
  const { layer } = r;
  const entry = getImage(layer.src);
  if (!entry || !entry.ready || entry.failed) return;

  const { ctx } = f;
  const natural = entry.img.naturalWidth / Math.max(1, entry.img.naturalHeight);
  const w = layer.width * f.width * r.zoom;
  const h = w / (natural || 1);

  let x = layer.x * f.width;
  let y = layer.y * f.height + r.offsetY * f.scale;
  if (layer.anchor === 'center') {
    x -= w / 2;
    y -= h / 2;
  } else if (layer.anchor === 'topRight' || layer.anchor === 'bottomRight') x -= w;
  if (layer.anchor === 'bottomLeft' || layer.anchor === 'bottomRight') y -= h;

  const radius = layer.radius * f.scale;

  ctx.save();
  ctx.globalAlpha = r.alpha * layer.opacity;

  if (layer.shadow) {
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 26 * f.scale;
    ctx.shadowOffsetY = 6 * f.scale;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Clip to the rounded box so the ken-burns push never spills past the frame.
  ctx.save();
  roundRect(ctx, x, y, w, h, radius);
  ctx.clip();
  ctx.drawImage(entry.img, x, y, w, h);
  ctx.restore();

  if (layer.border) {
    ctx.strokeStyle = layer.borderColor;
    ctx.lineWidth = Math.max(1, 3 * f.scale);
    roundRect(ctx, x, y, w, h, radius);
    ctx.stroke();
  }

  if (layer.caption.trim()) {
    const size = 17 * f.scale;
    ctx.font = `500 ${size}px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    const cy = y + h + size * 1.35;
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.3;
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(layer.caption, x + w / 2, cy);
    ctx.fillStyle = INK_DIM;
    ctx.fillText(layer.caption, x + w / 2, cy);
  }

  ctx.restore();
}

/* --------------------------------------------------------------- regions */

const INK = '#ffffff';
const INK_DIM = 'rgba(255,255,255,0.62)';
const SURFACE = 'rgba(12,16,22,0.86)';

function formatValue(v: number, decimals: number, unit: string): string {
  const n = v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return unit ? `${n}${unit.length <= 2 ? '' : ' '}${unit}` : n;
}

function drawRegions(f: OverlayFrame, r: RegionsRender) {
  const { layer, set } = r;
  if (layer.showLegend && set.withValues > 0) drawLegend(f, r);
  if (r.phase === 'outro' && layer.labelAll) drawAllLabels(f, r);
  if (!layer.showCallout || r.calloutAlpha <= 0 || r.activeId === null) return;

  const region = set.regions.find((x) => x.id === r.activeId);
  if (!region) return;

  const { ctx } = f;
  const s = f.scale * (layer.calloutSize / 100);
  const p = f.project(region.anchor);
  if (!isFinite(p.x) || !isFinite(p.y)) return;

  const accent = region.value === null ? layer.noDataColor : region.fill;
  const nameSize = 19 * s;
  const valueSize = 62 * s;
  const metaSize = 15 * s;
  const padX = 24 * s;
  const padY = 20 * s;
  const barH = 7 * s;

  const shown = region.value === null ? '—' : formatValue(region.value * r.reveal, layer.decimals, layer.unit);
  const name = region.name.toUpperCase();
  const rankText = layer.showRank && region.rank ? `RANK #${region.rank} of ${set.withValues}` : '';
  const metricText = layer.metric || '';

  ctx.save();

  // Measure before laying out, so the card is exactly as wide as its content.
  const tracking = 2.2 * s;
  ctx.font = `700 ${nameSize}px ${FONT_STACK}`;
  const nameW = measureTracked(ctx, name, tracking);
  ctx.font = `800 ${valueSize}px ${FONT_STACK}`;
  const valueW = ctx.measureText(shown).width;
  ctx.font = `600 ${metaSize}px ${FONT_STACK}`;
  const metaW = Math.max(ctx.measureText(rankText).width, ctx.measureText(metricText).width);

  const innerW = Math.max(nameW, valueW, metaW, 150 * s);
  const boxW = innerW + padX * 2;
  const rows = (rankText ? 1 : 0) + (metricText ? 1 : 0);
  const boxH =
    padY * 2 + nameSize + valueSize * 1.02 + rows * metaSize * 1.5 + (rankText || metricText ? 6 * s : 0) + barH + 14 * s;

  // Sit above the region, then clamp so the card never leaves the frame.
  let x = p.x - boxW / 2;
  let y = p.y - boxH - 30 * s;
  if (y < 14 * f.scale) y = Math.min(p.y + 30 * s, f.height - boxH - 14 * f.scale);
  x = Math.max(14 * f.scale, Math.min(x, f.width - boxW - 14 * f.scale));
  y = Math.max(14 * f.scale, y);

  // Scale about the card centre so the pop grows outward, not off-corner.
  ctx.translate(x + boxW / 2, y + boxH / 2);
  ctx.scale(r.pop, r.pop);
  ctx.translate(-(x + boxW / 2), -(y + boxH / 2));
  ctx.globalAlpha = r.alpha * r.calloutAlpha;

  // Card body. A true frosted-glass blur would mean sampling and blurring the
  // map behind it every frame; a layered translucent fill reads close enough and
  // costs nothing.
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 30 * s;
  ctx.shadowOffsetY = 8 * s;
  ctx.fillStyle = 'rgba(10,13,19,0.82)';
  roundRect(ctx, x, y, boxW, boxH, 16 * s);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Top sheen + hairline, the cheap part of the glass look.
  const sheen = ctx.createLinearGradient(0, y, 0, y + boxH * 0.5);
  sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  roundRect(ctx, x, y, boxW, boxH, 16 * s);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = Math.max(1, s);
  roundRect(ctx, x, y, boxW, boxH, 16 * s);
  ctx.stroke();

  // Accent rule at the top, in the region's own colour — the identity channel.
  ctx.fillStyle = accent;
  roundRect(ctx, x + padX, y + padY * 0.55, Math.min(innerW, 54 * s), 3.5 * s, 2 * s);
  ctx.fill();

  let cursor = y + padY + nameSize;
  ctx.textAlign = 'left';

  ctx.font = `700 ${nameSize}px ${FONT_STACK}`;
  ctx.fillStyle = INK_DIM;
  drawTracked(ctx, name, x + padX, cursor, tracking, 'fill');

  cursor += valueSize * 0.98;
  ctx.font = `800 ${valueSize}px ${FONT_STACK}`;
  ctx.fillStyle = INK;
  ctx.fillText(shown, x + padX, cursor);

  if (rankText || metricText) {
    ctx.font = `600 ${metaSize}px ${FONT_STACK}`;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    if (rankText) {
      cursor += metaSize * 1.5;
      drawTracked(ctx, rankText, x + padX, cursor, 0.8 * s, 'fill');
    }
    if (metricText) {
      cursor += metaSize * 1.5;
      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      ctx.fillText(metricText, x + padX, cursor);
    }
  }

  // Where this value sits inside the range — the card's own mini legend.
  if (region.value !== null) {
    const barY = y + boxH - padY * 0.6 - barH;
    const frac =
      (region.value - set.domain[0]) / Math.max(1e-9, set.domain[1] - set.domain[0]);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    roundRect(ctx, x + padX, barY, innerW, barH, barH / 2);
    ctx.fill();
    ctx.fillStyle = accent;
    const w = Math.max(barH, innerW * Math.max(0, Math.min(1, frac)) * r.reveal);
    roundRect(ctx, x + padX, barY, w, barH, barH / 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * The closing beat: every region labelled at once. Labels arrive in tour order
 * rather than all together, so the eye is led round the map instead of hit with
 * thirty-odd numbers in one frame.
 */
function drawAllLabels(f: OverlayFrame, r: RegionsRender) {
  const { layer, set } = r;
  const { ctx } = f;
  const size = layer.labelSize * f.scale;

  ctx.save();
  ctx.textAlign = 'center';

  // Placed boxes, so crowded areas drop labels instead of printing mush. Tour
  // order decides who wins, which means the ranking you chose sets the priority.
  const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];

  // The closing shot labels *every* region with a value, not just the ones the
  // tour visited — but the visited ones are placed first, so they survive a
  // collision. A tour limited to the top five still ends on the full picture.
  const priority = [...set.order];
  const seen = new Set(set.order);
  set.regions.forEach((r2, i) => {
    if (!seen.has(i) && r2.value !== null) priority.push(i);
  });

  priority.forEach((ri, i) => {
    const region = set.regions[ri];
    const appear = clamp01(r.outroProgress * (priority.length + 6) - i);
    if (appear <= 0) return;

    const p = f.project(region.anchor);
    if (!isFinite(p.x) || !isFinite(p.y)) return;
    if (p.x < -80 || p.y < -40 || p.x > f.width + 80 || p.y > f.height + 40) return;

    const value = region.value === null ? '—' : formatValue(region.value, layer.decimals, layer.unit);

    ctx.font = `500 ${size * 0.78}px ${FONT_STACK}`;
    const nameW = ctx.measureText(region.name).width;
    ctx.font = `700 ${size}px ${FONT_STACK}`;
    const w = Math.max(nameW, ctx.measureText(value).width) / 2 + size * 0.25;

    // A region smaller than its own label gets the label pushed outward, with a
    // leader line back to it — otherwise Delhi's number covers three states.
    const nw = f.project([region.bounds[0], region.bounds[3]]);
    const se = f.project([region.bounds[2], region.bounds[1]]);
    const onScreen = Math.max(Math.abs(se.x - nw.x), Math.abs(se.y - nw.y));
    const offset = onScreen < w * 1.6;

    let lx = p.x;
    let ly = p.y;
    if (offset) {
      const away = Math.atan2(p.y - f.height / 2, p.x - f.width / 2);
      const push = w + size * 1.6;
      lx += Math.cos(away) * push;
      ly += Math.sin(away) * push;
      lx = Math.max(w + 8, Math.min(lx, f.width - w - 8));
      ly = Math.max(size * 1.4, Math.min(ly, f.height - size * 1.4));
    }

    const box = { x0: lx - w, y0: ly - size * 1.15, x1: lx + w, y1: ly + size * 1.05 };
    if (placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) return;
    placed.push(box);

    ctx.save();
    ctx.globalAlpha = r.alpha * appear;

    // Scale in from 80%: labels arrive rather than blink on.
    const grow = 0.8 + 0.2 * appear;
    ctx.translate(lx, ly);
    ctx.scale(grow, grow);
    ctx.translate(-lx, -ly);

    if (offset) {
      // Leader line back to the region the label belongs to.
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = Math.max(1, size * 0.08);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(lx, ly + size * 0.1);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(p.x, p.y, size * 0.14, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fill();
    }

    ctx.font = `500 ${size * 0.78}px ${FONT_STACK}`;
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.36;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(region.name, lx, ly - size * 0.28);
    ctx.fillStyle = INK_DIM;
    ctx.fillText(region.name, lx, ly - size * 0.28);

    ctx.font = `700 ${size}px ${FONT_STACK}`;
    ctx.lineWidth = size * 0.32;
    ctx.strokeText(value, lx, ly + size * 0.78);
    ctx.fillStyle = INK;
    ctx.fillText(value, lx, ly + size * 0.78);
    ctx.restore();
  });

  ctx.restore();
}

function drawLegend(f: OverlayFrame, r: RegionsRender) {
  const { layer, set } = r;
  const { ctx } = f;
  const s = f.scale;
  const barW = 260 * s;
  const barH = 12 * s;
  const pad = 16 * s;
  const titleSize = 17 * s;
  const tickSize = 14 * s;
  const hasNoData = set.regions.length > set.withValues;

  const boxW = barW + pad * 2;
  const boxH = pad * 2 + titleSize + 10 * s + barH + 6 * s + tickSize + (hasNoData ? tickSize + 8 * s : 0);
  const x = 28 * s;
  const y = f.height - boxH - 28 * s;

  ctx.save();
  ctx.globalAlpha = r.alpha;
  ctx.fillStyle = SURFACE;
  roundRect(ctx, x, y, boxW, boxH, 10 * s);
  ctx.fill();

  ctx.fillStyle = INK;
  ctx.font = `600 ${titleSize}px ${FONT_STACK}`;
  ctx.textAlign = 'left';
  ctx.fillText(layer.legendTitle || layer.metric || 'Value', x + pad, y + pad + titleSize * 0.82);

  const barY = y + pad + titleSize + 10 * s;
  const grad = ctx.createLinearGradient(x + pad, 0, x + pad + barW, 0);
  const ramp = getRamp(layer.ramp);
  const flip = r.flip;
  for (let i = 0; i <= 10; i++) grad.addColorStop(i / 10, rampColor(ramp, i / 10, flip));
  // Track first, then the gradient wiping across it during the intro.
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(ctx, x + pad, barY, barW, barH, barH / 2);
  ctx.fill();
  ctx.save();
  roundRect(ctx, x + pad, barY, Math.max(0.001, barW * r.legendFill), barH, barH / 2);
  ctx.clip();
  ctx.fillStyle = grad;
  roundRect(ctx, x + pad, barY, barW, barH, barH / 2);
  ctx.fill();
  ctx.restore();

  ctx.font = `500 ${tickSize}px ${FONT_STACK}`;
  ctx.fillStyle = INK_DIM;
  ctx.fillText(formatValue(set.domain[0], layer.decimals, layer.unit), x + pad, barY + barH + 6 * s + tickSize * 0.85);
  ctx.textAlign = 'right';
  ctx.fillText(
    formatValue(set.domain[1], layer.decimals, layer.unit),
    x + pad + barW,
    barY + barH + 6 * s + tickSize * 0.85,
  );

  // Direct label: where the region on screen right now sits on the scale.
  const active = r.activeId ? set.regions.find((v) => v.id === r.activeId) : undefined;
  if (active && active.value !== null && r.calloutAlpha > 0) {
    const t = (active.value - set.domain[0]) / Math.max(1e-9, set.domain[1] - set.domain[0]);
    const tx = x + pad + Math.max(0, Math.min(1, t)) * barW;
    ctx.globalAlpha = r.alpha * r.calloutAlpha;
    ctx.beginPath();
    ctx.moveTo(tx, barY - 5 * s);
    ctx.lineTo(tx - 5 * s, barY - 12 * s);
    ctx.lineTo(tx + 5 * s, barY - 12 * s);
    ctx.closePath();
    ctx.fillStyle = INK;
    ctx.fill();
    ctx.globalAlpha = r.alpha;
  }

  if (hasNoData) {
    const ny = barY + barH + 6 * s + tickSize + 8 * s + tickSize * 0.7;
    ctx.textAlign = 'left';
    ctx.fillStyle = layer.noDataColor;
    roundRect(ctx, x + pad, ny - tickSize * 0.72, tickSize * 0.9, tickSize * 0.9, 2 * s);
    ctx.fill();
    ctx.fillStyle = INK_DIM;
    ctx.fillText(`No data (${set.regions.length - set.withValues})`, x + pad + tickSize * 1.6, ny);
  }

  ctx.restore();
}


/* ------------------------------------------------------------ route head */

function drawRouteHead(f: OverlayFrame, r: RouteRender) {
  const { layer } = r;
  if (!layer.marker.enabled || layer.marker.icon === 'none') return;
  if (!r.head || r.drawn.length < 1) return;

  const p = f.project(r.head);
  if (!isFinite(p.x) || !isFinite(p.y)) return;

  // Screen-space heading from the last drawn segment: exact under any
  // bearing/pitch combination, unlike converting the compass bearing.
  let angle = 0;
  if (layer.marker.rotate && r.drawn.length >= 2) {
    const prev = f.project(r.drawn[Math.max(0, r.drawn.length - 2)]);
    angle = Math.atan2(p.y - prev.y, p.x - prev.x);
  }

  const size = layer.marker.size * f.scale;
  const { ctx } = f;
  ctx.save();
  ctx.globalAlpha = r.alpha;
  ctx.translate(p.x, p.y);
  ctx.rotate(angle);
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 8 * f.scale;
  drawIcon(ctx, layer.marker.icon, size, layer.marker.color, layer.color);
  ctx.restore();
}

function drawIcon(ctx: CanvasRenderingContext2D, icon: RouteIcon, s: number, color: string, accent: string) {
  ctx.fillStyle = color;
  ctx.strokeStyle = accent;
  ctx.lineWidth = Math.max(1, s * 0.18);

  switch (icon) {
    case 'dot': {
      ctx.beginPath();
      ctx.arc(0, 0, s, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      break;
    }
    case 'plane': {
      // Nose points along +x, matching the rotation applied by the caller.
      ctx.beginPath();
      ctx.moveTo(s * 1.5, 0);
      ctx.lineTo(-s * 0.2, s * 0.55);
      ctx.lineTo(-s * 0.9, s * 0.95);
      ctx.lineTo(-s * 0.55, s * 0.18);
      ctx.lineTo(-s * 1.1, 0);
      ctx.lineTo(-s * 0.55, -s * 0.18);
      ctx.lineTo(-s * 0.9, -s * 0.95);
      ctx.lineTo(-s * 0.2, -s * 0.55);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'car': {
      const w = s * 1.6;
      const h = s * 0.95;
      roundRect(ctx, -w / 2, -h / 2, w, h, h * 0.35);
      ctx.fill();
      ctx.fillStyle = accent;
      roundRect(ctx, -w * 0.1, -h * 0.34, w * 0.42, h * 0.68, h * 0.2);
      ctx.fill();
      break;
    }
    case 'pin': {
      ctx.rotate(-Math.PI / 2); // pins always stand upright
      ctx.beginPath();
      ctx.arc(0, -s * 1.1, s * 0.75, Math.PI, 0);
      ctx.quadraticCurveTo(s * 0.7, s * 0.1, 0, s * 0.9);
      ctx.quadraticCurveTo(-s * 0.7, s * 0.1, -s * 0.75, -s * 1.1);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, -s * 1.1, s * 0.3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fill();
      break;
    }
    default:
      break;
  }
}

/* ---------------------------------------------------------------- markers */

function drawMarker(f: OverlayFrame, m: MarkerRender) {
  const { layer } = m;
  const p = f.project(layer.coord);
  if (!isFinite(p.x) || !isFinite(p.y)) return;

  const { ctx } = f;
  const r = layer.size * f.scale * m.scale;

  ctx.save();
  ctx.globalAlpha = m.alpha;

  if (layer.pulse) {
    const t = m.pulse;
    ctx.globalAlpha = m.alpha * (1 - t) * 0.55;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * (1 + t * 2.6), 0, Math.PI * 2);
    ctx.strokeStyle = layer.color;
    ctx.lineWidth = 2 * f.scale;
    ctx.stroke();
    ctx.globalAlpha = m.alpha;
  }

  if (layer.halo) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 1.75, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(layer.color, 0.25);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = layer.color;
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 10 * f.scale;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(1, r * 0.28);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.stroke();

  if (layer.label.trim()) {
    const size = layer.labelSize * f.scale;
    ctx.font = `600 ${size}px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    const y = p.y - (layer.labelOffset * f.scale + r);
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.28;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.strokeText(layer.label, p.x, y);
    ctx.fillStyle = layer.labelColor;
    ctx.fillText(layer.label, p.x, y);
  }

  ctx.restore();
}

/* ------------------------------------------------------------------ text */

function drawText(f: OverlayFrame, t: TextRender) {
  const { layer } = t;
  const { ctx } = f;
  let size = layer.size * f.scale;
  const x = layer.x * f.width;
  const y = layer.y * f.height + t.offsetY * f.scale;

  // Shrink to fit rather than run off the edge. A title cropped at both ends is
  // worse than a title a few points smaller, and vertical formats are narrow.
  // Tracking has to shrink with the type or the line still overflows.
  let fit = 1;
  {
    const maxW = f.width * 0.92;
    ctx.font = `${layer.weight} ${size}px ${FONT_STACK}`;
    const widest = Math.max(
      ...layer.text.split('\n').map((l) => measureTracked(ctx, l, layer.letterSpacing * f.scale)),
      1,
    );
    if (widest > maxW) {
      fit = maxW / widest;
      size *= fit;
    }
  }

  const shown =
    layer.anim === 'typewriter' ? layer.text.slice(0, Math.ceil(layer.text.length * t.reveal)) : layer.text;
  const lines = shown.split('\n');
  const lineHeight = size * 1.22;
  const spacing = layer.letterSpacing * f.scale * fit;

  ctx.save();
  ctx.globalAlpha = t.alpha;
  ctx.font = `${layer.weight} ${size}px ${FONT_STACK}`;
  ctx.textAlign = 'left';

  const widths = lines.map((l) => measureTracked(ctx, l, spacing));
  const boxW = Math.max(...widths, 0);

  if (layer.anim === 'wipe') {
    const pad = size * 0.6;
    const left = alignLeft(x, boxW, layer.align);
    ctx.beginPath();
    ctx.rect(left - pad, y - size - pad, (boxW + pad * 2) * t.wipe, lines.length * lineHeight + pad * 2);
    ctx.clip();
  }

  if (layer.background) {
    const padX = size * 0.5;
    const padY = size * 0.32;
    const left = alignLeft(x, boxW, layer.align);
    ctx.fillStyle = layer.backgroundColor;
    roundRect(
      ctx,
      left - padX,
      y - size + padY * 0.2 - padY,
      boxW + padX * 2,
      (lines.length - 1) * lineHeight + size + padY * 2,
      size * 0.18,
    );
    ctx.fill();
  }

  lines.forEach((line, i) => {
    const left = alignLeft(x, widths[i], layer.align);
    const ly = y + i * lineHeight;
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.16;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    if (!layer.background) drawTracked(ctx, line, left, ly, spacing, 'stroke');
    ctx.fillStyle = layer.color;
    drawTracked(ctx, line, left, ly, spacing, 'fill');
  });

  ctx.restore();
}

const alignLeft = (x: number, w: number, align: 'left' | 'center' | 'right') =>
  align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;

/** Manual letter-spacing — ctx.letterSpacing isn't universally supported. */
function measureTracked(ctx: CanvasRenderingContext2D, s: string, spacing: number): number {
  if (spacing === 0) return ctx.measureText(s).width;
  let w = 0;
  for (const ch of s) w += ctx.measureText(ch).width + spacing;
  return Math.max(0, w - spacing);
}

function drawTracked(
  ctx: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  spacing: number,
  mode: 'fill' | 'stroke',
) {
  if (spacing === 0) {
    if (mode === 'fill') ctx.fillText(s, x, y);
    else ctx.strokeText(s, x, y);
    return;
  }
  let cx = x;
  for (const ch of s) {
    if (mode === 'fill') ctx.fillText(ch, cx, y);
    else ctx.strokeText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
}

/* ----------------------------------------------------------------- utils */

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Accepts #rgb / #rrggbb / #rrggbbaa and returns an rgba() with the given alpha. */
function withAlpha(color: string, alpha: number): string {
  if (!color.startsWith('#')) return color;
  let hex = color.slice(1);
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const a = hex.length >= 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
  return `rgba(${r},${g},${b},${a * alpha})`;
}
