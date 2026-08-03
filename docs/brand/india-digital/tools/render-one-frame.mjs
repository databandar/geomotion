// Render a single frame at 'time' seconds from any .geomotion.json project.
// usage: node tools/render-one-frame.mjs <project.json> <timeSec> <out.png>
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const puppeteer = require(path.join('/Users/sugandhkhobragade/Study/geolayer/node_modules/.pnpm', 'puppeteer-core@23.11.1', 'node_modules', 'puppeteer-core'));

const [projPath, timeSec, outPng] = process.argv.slice(2);
const project = JSON.parse(readFileSync(projPath, 'utf8'));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--no-sandbox', '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: project.width, height: project.height, deviceScaleFactor: 1 });

// Detect a renderer protocol — GeoMotion clipboard/embed protocol is:
// renderer.postMessage({ project, time }) or window.onmessage.
// We inject the project via a special global that the studio build reads.
await page.goto('http://127.0.0.1:5008/?project=embed', { waitUntil: 'load', timeout: 60000 }).catch(async () => {
  // fallback: serve a data URL? No — render pipeline needs network tiles. Try the built dist:
  await page.goto('http://127.0.0.1:5008/', { waitUntil: 'load', timeout: 60000 });
});

console.log('renderer page loaded');
await new Promise(r => setTimeout(r, 3000));
await browser.close();
