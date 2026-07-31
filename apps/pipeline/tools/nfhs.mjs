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

/*
 * Accept `--out path` as well as `--out=path`.
 *
 * The usage above has always shown the space form, and only the equals form worked —
 * so following this tool's own documentation printed "pass --out=<path>" and did
 * nothing. Worse than the error is what the space form did to the positional
 * arguments: the value was not recognised as belonging to a flag, so it stayed in the
 * list and could be read as the indicator name.
 *
 * A one-pass scan, so a flag's value is consumed rather than left behind. `--flag`
 * with nothing after it, or followed by another flag, stays a boolean.
 */
const flags = new Map();
const args = [];
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (!a.startsWith('--')) {
    args.push(a);
    continue;
  }
  const eq = a.indexOf('=');
  if (eq > -1) {
    flags.set(a.slice(2, eq), a.slice(eq + 1));
  } else if (rest[i + 1] !== undefined && !rest[i + 1].startsWith('--')) {
    flags.set(a.slice(2), rest[i + 1]);
    i++;
  } else {
    flags.set(a.slice(2), true);
  }
}
const opt = (n, d) => (flags.has(n) ? flags.get(n) : d);

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
  if (!out || out === true) throw new Error('pass --out <path>');
  const doc = await writeValuesFile(e, out);
  console.log(`wrote ${out}: ${Object.keys(doc.values).length} regions, national ${doc._national}`);
  if (doc._missing.length) console.log(`no value for: ${doc._missing.join(', ')}`);
} else {
  console.log('commands: list [filter] | show "<indicator>" | extract "<indicator>" --out=<path>');
  process.exit(1);
}
