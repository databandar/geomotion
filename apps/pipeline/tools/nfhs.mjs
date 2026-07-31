#!/usr/bin/env node
/**
 * Browse and extract NFHS indicators.
 *
 *   node pipeline/tools/nfhs.mjs list                       # every indicator
 *   node pipeline/tools/nfhs.mjs list internet              # filtered
 *   node pipeline/tools/nfhs.mjs show "Women who have ever used the internet (%)"
 *   node pipeline/tools/nfhs.mjs extract "…" --out src/data/foo.json
 *
 * The survey CSV is not in this repository — it is third-party published data with its
 * own provenance. Point at it with `--csv=<path>` or the `NFHS_CSV` environment
 * variable.
 */
import { loadNfhs, listIndicators, extract, changes, writeValuesFile, DEFAULT_CSV } from '../lib/nfhs.mjs';

const [cmd, ...rest] = process.argv.slice(2);
const args = rest.filter((a) => !a.startsWith('--'));
const opt = (n, d) => {
  const hit = rest.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};

/*
 * A failure here is almost always a misconfigured path or a mistyped indicator, and
 * both come with a message written to be read. A stack trace buries it under frames
 * from inside the loader, so the operator sees Node's plumbing rather than the sentence
 * telling them what to fix.
 */
process.on('uncaughtException', (e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});

const data = await loadNfhs(opt('csv', DEFAULT_CSV));

if (cmd === 'list') {
  const needle = (args[0] ?? '').toLowerCase();
  const all = listIndicators(data).filter((i) => i.toLowerCase().includes(needle));
  all.forEach((i) => console.log(' ', i));
  console.log(`\n${all.length} indicator(s)${needle ? ` matching "${needle}"` : ''}`);
} else if (cmd === 'show') {
  const e = extract(data, args[0], opt('round', 'total'));
  const ch = changes(e);
  console.log(`\n${e.indicator}  [${e.round}]`);
  console.log(`India: ${e.nationalPrevious} → ${e.national}`);
  if (e.missing.length) console.log(`no value: ${e.missing.join(', ')}`);
  const sorted = Object.entries(e.values).sort((a, b) => b[1] - a[1]);
  console.log('\nranked:');
  sorted.forEach(([n, v], i) => console.log(`  ${String(i + 1).padStart(2)}. ${n.padEnd(30)} ${String(v).padStart(6)}`));
  console.log('\nbiggest movers since NFHS-5:');
  [...ch.slice(0, 5), null, ...ch.slice(-5)].forEach((c) =>
    console.log(c ? `  ${c.name.padEnd(30)} ${c.then} → ${c.now}  (${c.delta > 0 ? '+' : ''}${c.delta.toFixed(1)})` : '  …'),
  );
} else if (cmd === 'extract') {
  const e = extract(data, args[0], opt('round', 'total'));
  const out = opt('out', null);
  if (!out) throw new Error('pass --out=<path>');
  const doc = await writeValuesFile(e, out);
  console.log(`wrote ${out}: ${Object.keys(doc.values).length} regions, national ${doc._national}`);
  if (doc._missing.length) console.log(`no value for: ${doc._missing.join(', ')}`);
} else {
  console.log('commands: list [filter] | show "<indicator>" | extract "<indicator>" --out=<path>');
  process.exit(1);
}
