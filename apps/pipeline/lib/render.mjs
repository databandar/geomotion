import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import puppeteer from 'puppeteer-core';

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

/** Serve the built app. No dev server, so what renders is the production build. */
export function serve(root, port = 5211) {
  const server = http.createServer(async (req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = path.join(root, url === '/' ? 'index.html' : url);
    try {
      const st = await fs.stat(file);
      if (st.isDirectory()) file = path.join(file, 'index.html');
    } catch {
      file = path.join(root, 'index.html'); // SPA fallback
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, port })));
}

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

async function findChrome() {
  for (const c of CHROME_CANDIDATES) {
    try {
      await fs.access(c);
      return c;
    } catch {
      /* keep looking */
    }
  }
  throw new Error('No Chrome found. Set CHROME_PATH to your browser binary.');
}

/**
 * Render every frame of a project to PNG.
 *
 * Frames are captured by clipping a screenshot to the stage element, which means
 * the pixels come from the same code path the editor previews — no separate
 * render backend to drift out of agreement. The window is sized so the stage is
 * never CSS-scaled, because clipping a scaled stage would resample it.
 */
/**
 * Everything both capture paths need: a served build, a browser, the project loaded,
 * and a stage measured to render 1:1.
 *
 * Extracted so the screenshot path and the in-page encoder share one copy of the
 * fiddly part — the viewport growing loop that stops frames being resampled — rather
 * than two that can drift.
 */
export async function renderInPage(project, opts = {}) {
  const {
    distDir,
    onProgress = () => {},
    onChunk = null,
    port = 5211,
    run,
  } = opts;

  const { server } = await serve(distDir, port);
  const executablePath = await findChrome();

  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--hide-scrollbars',
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--force-device-scale-factor=1',
    ],
    defaultViewport: { width: project.width + 660, height: project.height + 400, deviceScaleFactor: 1 },
    // The in-page encoder runs its whole frame loop inside one evaluate, which for a
    // long composition legitimately outlives the 180s default and fails with
    // "Promise was collected" — a message that says nothing about the cause.
    protocolTimeout: 0,
  });

  const page = await browser.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(String(e.message)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) problems.push(m.text());
  });

  const total = Math.max(1, Math.round(project.duration * project.fps));
  try {
    if (onChunk) await page.exposeFunction('__gmChunk', onChunk);
    await page.exposeFunction('__gmProgress', (done) => onProgress(done, total));

    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForFunction('window.geomotion && window.geomotion.ready', { timeout: 30000 });
    await page.evaluate((p) => {
      window.geomotion.loadProject(p);
      window.geomotion.setExporting(true);
    }, project);
    await page.evaluate(() => window.geomotion.renderFrameAt(0));
    await page.evaluate(() => window.geomotion.waitIdle(30000));
    await sleep(1500);

    const stage = await fitStage(page, project);
    const value = await run(page, { total, fps: project.fps, stage });
    return { ...value, total, problems };
  } finally {
    await browser.close();
    server.close();
  }
}

/**
 * Grow the window until the stage renders 1:1.
 *
 * The stage shrinks to fit its pane, and capturing a CSS-scaled stage would resample
 * every frame. Measuring the shortfall beats guessing at the editor's chrome.
 */
async function fitStage(page, project) {
  let vp = page.viewport();
  let stage = await page.evaluate(() => window.geomotion.stage());
  for (let attempt = 0; attempt < 4 && stage && stage.scale < 0.999; attempt++) {
    vp = {
      width: Math.ceil(vp.width + (project.width - stage.width) + 8),
      height: Math.ceil(vp.height + (project.height - stage.height) + 8),
      deviceScaleFactor: 1,
    };
    await page.setViewport(vp);
    await sleep(400);
    stage = await page.evaluate(() => window.geomotion.stage());
  }

  if (!stage) throw new Error('stage element not found');
  if (stage.scale < 0.999) {
    throw new Error(
      `stage still CSS-scaled to ${stage.scale.toFixed(3)} at ${vp.width}x${vp.height} — a ` +
        `${project.width}x${project.height} composition does not fit, so frames would be resampled`,
    );
  }
  return stage;
}

export async function renderFrames(project, outDir, opts = {}) {
  const { distDir, waitForTiles = true, onProgress = () => {}, port = 5211 } = opts;

  await fs.mkdir(outDir, { recursive: true });
  for (const f of await fs.readdir(outDir)) {
    if (f.endsWith('.png')) await fs.rm(path.join(outDir, f));
  }

  const { server } = await serve(distDir, port);
  const executablePath = await findChrome();

  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--hide-scrollbars',
      '--enable-unsafe-swiftshader',
      '--use-gl=angle',
      '--force-device-scale-factor=1',
    ],
    // First guess at the room the editor's panels need around the stage; the
    // real figure is measured below rather than hardcoded here.
    defaultViewport: { width: project.width + 660, height: project.height + 400, deviceScaleFactor: 1 },
  });

  const page = await browser.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(String(e.message)));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) problems.push(m.text());
  });

  try {
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForFunction('window.geomotion && window.geomotion.ready', { timeout: 30000 });

    await page.evaluate((p) => {
      window.geomotion.loadProject(p);
      window.geomotion.setExporting(true);
    }, project);

    // Give the style and first tiles time to arrive before frame zero.
    await page.evaluate(() => window.geomotion.renderFrameAt(0));
    await page.evaluate(() => window.geomotion.waitIdle(30000));
    await sleep(1500);

    // The stage shrinks to fit its pane, so grow the window by exactly the
    // shortfall until it renders 1:1. Measuring beats guessing at the chrome.
    let vp = page.viewport();
    let stage = await page.evaluate(() => window.geomotion.stage());
    for (let attempt = 0; attempt < 4 && stage && stage.scale < 0.999; attempt++) {
      vp = {
        width: Math.ceil(vp.width + (project.width - stage.width) + 8),
        height: Math.ceil(vp.height + (project.height - stage.height) + 8),
        deviceScaleFactor: 1,
      };
      await page.setViewport(vp);
      await sleep(400);
      stage = await page.evaluate(() => window.geomotion.stage());
    }

    if (!stage) throw new Error('stage element not found');
    if (stage.scale < 0.999) {
      throw new Error(
        `stage still CSS-scaled to ${stage.scale.toFixed(3)} at ${vp.width}x${vp.height} — a ` +
          `${project.width}x${project.height} composition does not fit, so frames would be resampled`,
      );
    }

    const clip = {
      x: Math.round(stage.x),
      y: Math.round(stage.y),
      width: project.width,
      height: project.height,
    };

    const total = Math.max(1, Math.round(project.duration * project.fps));
    const pad = String(total).length + 1;

    for (let i = 0; i < total; i++) {
      const t = i / project.fps;
      await page.evaluate((tt) => window.geomotion.renderFrameAt(tt), t);
      if (waitForTiles) await page.evaluate(() => window.geomotion.waitIdle(12000));
      // Two frames: one for MapLibre to paint, one for the compositor.
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.screenshot({
        path: path.join(outDir, `frame_${String(i).padStart(pad, '0')}.png`),
        clip,
        captureBeyondViewport: false,
        optimizeForSpeed: true,
      });
      onProgress(i + 1, total);
    }

    return { total, pad, problems };
  } finally {
    await browser.close();
    server.close();
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
