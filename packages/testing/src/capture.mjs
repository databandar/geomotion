/**
 * Captures render signatures from the real editor in a real browser.
 *
 * Frames come from the same code path the editor previews and the pipeline
 * renders — the map's WebGL canvas composited with the 2D overlay — so there is
 * no separate render backend that could drift out of agreement with what ships.
 *
 * The editor is driven through `window.geomotion`, its supported automation
 * surface. The two canvases are found by DOM query rather than by adding
 * accessors to that API: the harness is a consumer of the app, not a reason to
 * widen its public surface.
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
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

/** The long edge of the signature grid. Cells are ~60px at 1080p. */
const GRID_LONG_EDGE = 32;

/**
 * Runs inside the page: composite the frame and mean-pool it to a small grid.
 *
 * Downsampling happens in stages of one half rather than in a single draw. A
 * direct 1920 -> 32 draw samples only a few source pixels per destination pixel,
 * which is noise rather than an average; halving repeatedly approximates a box
 * filter, so each cell really is the mean of its region and the signature is
 * stable between runs.
 */
function inPageSignature(gridLongEdge, mapOnly) {
  const map = document.querySelector('.maplibregl-canvas');
  const overlay = document.querySelector('.overlay-canvas');
  if (!map) throw new Error('no map canvas found');

  const w = map.width;
  const h = map.height;

  let src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const composite = src.getContext('2d');
  composite.drawImage(map, 0, 0);
  // `mapOnly` leaves the overlay out, so a caller can tell whether it drew anything
  // at all — a comparison within one run, and so machine-independent.
  if (overlay && !mapOnly) composite.drawImage(overlay, 0, 0, w, h);

  const gw = w >= h ? gridLongEdge : Math.max(1, Math.round((gridLongEdge * w) / h));
  const gh = h > w ? gridLongEdge : Math.max(1, Math.round((gridLongEdge * h) / w));

  let cw = w;
  let ch = h;
  while (cw > gw * 2 && ch > gh * 2) {
    const nw = Math.max(gw, Math.floor(cw / 2));
    const nh = Math.max(gh, Math.floor(ch / 2));
    const next = document.createElement('canvas');
    next.width = nw;
    next.height = nh;
    const nctx = next.getContext('2d');
    nctx.imageSmoothingEnabled = true;
    nctx.imageSmoothingQuality = 'high';
    nctx.drawImage(src, 0, 0, cw, ch, 0, 0, nw, nh);
    src = next;
    cw = nw;
    ch = nh;
  }

  const grid = document.createElement('canvas');
  grid.width = gw;
  grid.height = gh;
  const gctx = grid.getContext('2d');
  gctx.imageSmoothingEnabled = true;
  gctx.imageSmoothingQuality = 'high';
  gctx.drawImage(src, 0, 0, cw, ch, 0, 0, gw, gh);

  const data = gctx.getImageData(0, 0, gw, gh).data;
  const cells = [];
  for (let i = 0; i < gw * gh; i++) {
    cells.push(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
  }
  return { w: gw, h: gh, cells };
}

/**
 * The moments worth watching.
 *
 * Chosen so each one fails for a different reason: the cold open covers clouds
 * and the opening camera, the intro covers border tracing, the tour stops cover
 * framing and the callout, and the outro covers the staggered label pass and
 * collision dropping.
 */
export const FIXTURES = [
  { name: 'demo', fixture: 'demoProject', times: [0, 2.5, 6, 11] },
  { name: 'tour', fixture: 'indiaTourProject', times: [0.5, 8, 16, 30, 60, 95] },
];

export async function capture({ url = 'http://localhost:5173/', waitTiles = true } = {}) {
  const browser = await puppeteer.launch({
    executablePath: await findChrome(),
    headless: 'new',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--hide-scrollbars'],
  });

  const errors = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    page.on('pageerror', (e) => errors.push(String(e.message)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForFunction('window.geomotion && window.geomotion.ready', { timeout: 30000 });

    const frames = {};
    const mapOnly = {};
    for (const { name, fixture, times } of FIXTURES) {
      await page.evaluate(async (fx) => {
        const mod = await import('/src/lib/fixtures.ts');
        window.geomotion.loadProject(JSON.parse(JSON.stringify(mod[fx]())));
        // Hide editor-only chrome so a selection outline cannot alter a frame.
        window.geomotion.setExporting(true);
      }, fixture);

      await page.evaluate(() => window.geomotion.renderFrameAt(0));
      await page.evaluate(() => window.geomotion.waitIdle(30000));
      await page.evaluate(() => window.geomotion.imagesReady());

      for (const t of times) {
        await page.evaluate((tt) => window.geomotion.renderFrameAt(tt), t);
        if (waitTiles) await page.evaluate(() => window.geomotion.waitIdle(15000));
        frames[`${name}@${t}`] = await page.evaluate(inPageSignature, GRID_LONG_EDGE, false);
        mapOnly[`${name}@${t}`] = await page.evaluate(inPageSignature, GRID_LONG_EDGE, true);
      }
    }

    return { frames, mapOnly, errors };
  } finally {
    await browser.close();
  }
}
