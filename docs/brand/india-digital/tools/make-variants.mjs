import { readFileSync, writeFileSync } from 'node:fs';

const BASE = 'apps/pipeline/out/india-digital-women-draft/india-digital-women.geomotion.json';
const base = JSON.parse(readFileSync(BASE, 'utf8'));

// grab the regions layer so we can flip its ramp
const variants = [
  { id: 'dark-inferno',  basemap: 'dark-clean',  ramp: 'inferno' },
  { id: 'dark-plasma',   basemap: 'dark-clean',  ramp: 'plasma' },
  { id: 'dark-amber',    basemap: 'dark-clean',  ramp: 'amber' },
  { id: 'dark-violet',   basemap: 'dark-clean',  ramp: 'violet' },
  { id: 'dark-ember',    basemap: 'dark',        ramp: 'ember' },
  { id: 'light-forest',  basemap: 'positron-clean', ramp: 'forest' },
  { id: 'light-ember',   basemap: 'positron-clean', ramp: 'ember' },
  { id: 'light-violet',  basemap: 'voyager',      ramp: 'violet' },
];

for (const v of variants) {
  const p = JSON.parse(JSON.stringify(base));
  p.name = `india-digital-${v.id}`;
  p.basemap = v.basemap;
  for (const l of p.layers) {
    if (l.type === 'regions') { l.ramp = v.ramp; l.legendTitle = base.layers.find(x=>x.type==='regions').legendTitle; }
  }
  // adjust credit for basemap provider
  const light = !p.basemap.includes('dark');
  p.credit = light
    ? 'Data: NFHS-6 · Basemap © OpenStreetMap · Boundaries: Government of India'
    : 'Data: NFHS-6 · Boundaries: Government of India';
  writeFileSync(`docs/brand/india-digital/variants/${v.id}.geomotion.json`, JSON.stringify(p));
  console.log('variant:', v.id, '@', v.basemap, '/', v.ramp);
}
console.log('done', variants.length);
