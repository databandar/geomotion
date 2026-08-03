import fs from 'node:fs/promises';
import path from 'node:path';
import { renderInPage } from './render.mjs';

/**
 * Renders N timestamps of a project into one grid image instead of N separate
 * PNGs — a "contact sheet." Built to fix a real, recurring cost across every
 * episode this pipeline has produced: reviewing a spot-check pass meant one
 * screenshot-tool call per timestamp, often 7-10 per episode, each a separate
 * round trip. One grid image collapses that to a single look.
 *
 * Compositing happens inside the browser page itself, via `ctx.drawImage` onto
 * one big canvas — the same approach the draft in-page encoder already uses to
 * avoid a Node-side image library. There's no `sharp` or equivalent anywhere in
 * this repo, and a contact sheet doesn't need one either.
 */
/** Square-ish grid by default — one axis never dwarfs the other for typical
 * spot-check counts (7-15 frames), which is what makes it scannable at a glance. */
export function gridDims(count, cols = null) {
  const gridCols = cols ?? Math.ceil(Math.sqrt(count));
  const gridRows = Math.ceil(count / gridCols);
  return { gridCols, gridRows };
}

export async function contactSheet(project, times, opts = {}) {
  const { distDir, port = 5213, cols = null, cellWidth = 320, labels = true } = opts;
  if (times.length === 0) throw new Error('contactSheet: no times given');

  const { gridCols, gridRows } = gridDims(times.length, cols);

  const { dataUrl } = await renderInPage(project, {
    distDir,
    port,
    run: async (page) => {
      const dataUrl = await page.evaluate(
        async (ts, gc, gr, cellW, showLabels) => {
          const mapEl = document.querySelector('.maplibregl-canvas');
          const overlayEl = document.querySelector('.overlay-canvas');
          if (!mapEl) throw new Error('no map canvas found');
          const srcW = mapEl.width;
          const srcH = mapEl.height;
          const cellH = Math.round(srcH * (cellW / srcW));
          const labelH = showLabels ? 22 : 0;

          const sheet = document.createElement('canvas');
          sheet.width = gc * cellW;
          sheet.height = gr * (cellH + labelH);
          const sctx = sheet.getContext('2d');
          sctx.fillStyle = '#0a0e13';
          sctx.fillRect(0, 0, sheet.width, sheet.height);

          for (let i = 0; i < ts.length; i++) {
            const t = ts[i];
            window.geomotion.renderFrameAt(t);
            await window.geomotion.waitIdle(12000);
            // Two rAFs: one for MapLibre to paint, one for the compositor —
            // the same wait `renderFrames` uses before its own screenshot.
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

            const col = i % gc;
            const row = Math.floor(i / gc);
            const x = col * cellW;
            const y = row * (cellH + labelH);
            sctx.drawImage(mapEl, 0, 0, srcW, srcH, x, y + labelH, cellW, cellH);
            if (overlayEl) sctx.drawImage(overlayEl, 0, 0, srcW, srcH, x, y + labelH, cellW, cellH);
            if (showLabels) {
              sctx.fillStyle = '#e8ecf0';
              sctx.font = '13px monospace';
              sctx.fillText(`t=${t}`, x + 4, y + 15);
            }
            sctx.strokeStyle = '#3a4350';
            sctx.strokeRect(x + 0.5, y + 0.5, cellW - 1, cellH + labelH - 1);
          }
          return sheet.toDataURL('image/png');
        },
        times, gridCols, gridRows, cellWidth, labels,
      );
      return { dataUrl };
    },
  });

  return dataUrl;
}

export async function writeContactSheet(project, times, outFile, opts = {}) {
  const dataUrl = await contactSheet(project, times, opts);
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, buf);
  return outFile;
}
