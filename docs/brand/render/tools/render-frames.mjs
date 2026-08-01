/**
 * EP001 renderer. Drives the studio's headless API in a real browser and writes PNGs.
 *
 *   node tools/render-frames.mjs check 0.5 4.5 ...   -> spot frames into ../check
 *   node tools/render-frames.mjs all                 -> every frame at project fps into ../frames
 *
 * Needs `pnpm dev` running (localhost:5173). Resolved via packages/testing's own
 * puppeteer-core dependency rather than a pinned node_modules/.pnpm path, so this keeps
 * working across lockfile updates instead of naming one exact installed version.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../../../packages/testing/package.json', import.meta.url));
const puppeteer = (await import(require.resolve('puppeteer-core'))).default;

const S = fileURLToPath(new URL('..', import.meta.url)); // docs/brand/render/
const project = JSON.parse(readFileSync(`${S}/ep001.geomotion.json`, 'utf8'));
const mode = process.argv[2] ?? 'check';
const FPS = project.fps;
const DUR = project.duration;

const times = mode === 'all'
  ? Array.from({ length: Math.round(DUR * FPS) }, (_, i) => i / FPS)
  : process.argv.slice(3).map(Number);
const outDir = mode === 'all' ? `${S}/frames` : `${S}/check`;
mkdirSync(outDir, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox', '--hide-scrollbars'],
});
const page = await browser.newPage();
// Render at the project's own pixel size so framing matches what was authored.
await page.setViewport({ width: project.width, height: project.height, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 90000 });
await page.waitForFunction('window.geomotion?.ready === true', { timeout: 90000 });
await page.evaluate((p) => window.geomotion.loadProject(p), project);
await page.evaluate(() => window.geomotion.setExporting(true));
await new Promise((r) => setTimeout(r, 3500));

const grab = () => page.evaluate(() => {
  const map = document.querySelector('.maplibregl-canvas');
  const overlay = document.querySelector('.overlay-canvas');
  const c = document.createElement('canvas');
  c.width = map.width; c.height = map.height;
  const g = c.getContext('2d');
  // Fill first: at low zoom the map edge can sit inside the frame, and the area above it is
  // unpainted canvas — which composites as white rather than as the project background.
  g.fillStyle = '#0A0E13';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(map, 0, 0);
  if (overlay) g.drawImage(overlay, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
});

let unfinished = 0;
const t0 = Date.now();
for (let i = 0; i < times.length; i++) {
  const t = times[i];
  await page.evaluate((tt) => window.geomotion.renderFrameAt(tt), t);
  // Tiles only need waiting for when the view actually changed; a short budget keeps the
  // per-frame cost down, and `unfinished` reports how many frames drew before tiles landed.
  const ok = await page.evaluate((ms) => window.geomotion.waitIdle(ms), mode === 'all' ? 4000 : 20000);
  if (!ok) unfinished++;
  await page.evaluate((tt) => window.geomotion.renderFrameAt(tt), t);
  const buf = await grab();
  const name = mode === 'all' ? `f${String(i).padStart(5, '0')}` : `t${String(t).replace('.', '_')}`;
  writeFileSync(`${outDir}/${name}.png`, Buffer.from(buf.split(',')[1], 'base64'));
  if (mode === 'all' && i % 150 === 0) {
    const el = (Date.now() - t0) / 1000;
    console.log(`${i}/${times.length}  ${el.toFixed(0)}s elapsed  eta ${((el / (i + 1)) * (times.length - i) / 60).toFixed(1)}min`);
  }
}
console.log(`done: ${times.length} frames, ${unfinished} drew before tiles settled`);
if (errors.length) console.log('PAGE ERRORS:', [...new Set(errors)].slice(0, 6));
await browser.close();
