/**
 * Render one frame at time T for each variant project in ../variants/.
 * Needs `pnpm dev` on localhost:5173. Writes .../variants/frames/<id>.png
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../../../packages/testing/package.json', import.meta.url));
const puppeteer = (await import(require.resolve('puppeteer-core'))).default;

const S = fileURLToPath(new URL('..', import.meta.url));
const VAR = `${S}/variants`;
const TIME = parseFloat(process.argv[2] ?? '20.9'); // overview/tour full-map moment
mkdirSync(`${VAR}/frames`, { recursive: true });

// Try dark first, scan for light
const ids = ['dark-inferno','dark-plasma','dark-amber','dark-violet','light-forest','light-violet'];

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox', '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: 540, height: 960, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGE ERR', String(e).slice(0,120)));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle2', timeout: 90000 });
await page.waitForFunction('window.geomotion?.ready === true', { timeout: 90000 });

for (const id of ids) {
  const project = JSON.parse(readFileSync(`${VAR}/${id}.geomotion.json`, 'utf8'));
  await page.evaluate((p) => window.geomotion.loadProject(p), project);
  await page.evaluate(() => window.geomotion.setExporting(true));
  await new Promise((r) => setTimeout(r, 2500));
  await page.evaluate((tt) => window.geomotion.renderFrameAt(tt), TIME);
  await page.evaluate((ms) => window.geomotion.waitIdle(ms), 12000);
  await page.evaluate((tt) => window.geomotion.renderFrameAt(tt), TIME);
  const dataUrl = await page.evaluate(() => {
    const map = document.querySelector('.maplibregl-canvas');
    const c = document.createElement('canvas');
    c.width = map.width; c.height = map.height;
    const g = c.getContext('2d');
    g.fillStyle = '#111418'; g.fillRect(0,0,c.width,c.height);
    g.drawImage(map, 0, 0);
    return c.toDataURL('image/png');
  });
  writeFileSync(`${VAR}/frames/${id}.png`, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('rendered', id);
}
await browser.close();
console.log('done');
