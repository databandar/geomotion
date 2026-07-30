/**
 * `golden:capture` writes the baseline; `golden:check` compares against it.
 *
 * Both need a dev server already running (`pnpm dev`) — the harness deliberately
 * does not start one, so you can point it at a build under test.
 *
 * Baselines are machine-specific: GPU rasterisation differs between drivers, so
 * regenerate after changing machine or browser, and treat an unexplained diff on
 * a new machine as "recapture", not "regression". That is why this is a local
 * tool and not a CI gate — see the note in signature.ts.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { capture } from './capture.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.join(HERE, '..', 'goldens', 'baseline.json');

const [cmd] = process.argv.slice(2);
const url = process.env.GOLDEN_URL ?? 'http://localhost:5173/';

// The same comparison the unit suite covers — node ≥22.18 strips the types, so
// there is one implementation rather than a JS copy that could drift from it.
const { compare, describe, matches } = await import('./signature.ts');

async function main() {
  if (cmd !== 'capture' && cmd !== 'check') {
    console.error('usage: cli.mjs <capture|check>');
    process.exit(2);
  }

  console.log(`Capturing from ${url} …`);
  const { frames, errors } = await capture({ url });
  const names = Object.keys(frames);
  console.log(`  ${names.length} frames captured`);

  if (errors.length) {
    console.log('\nPage errors during capture:');
    for (const e of [...new Set(errors)].slice(0, 10)) console.log('  ' + e);
  }

  if (cmd === 'capture') {
    await fs.mkdir(path.dirname(BASELINE), { recursive: true });
    await fs.writeFile(
      BASELINE,
      JSON.stringify({ capturedOn: `${process.platform}-${process.arch}`, frames }, null, 1) + '\n',
    );
    console.log(`\nBaseline written to ${path.relative(process.cwd(), BASELINE)}`);
    console.log('Commit it, and regenerate deliberately when a render change is intended.');
    return;
  }

  const baseline = JSON.parse(await fs.readFile(BASELINE, 'utf8'));
  if (baseline.capturedOn !== `${process.platform}-${process.arch}`) {
    console.log(
      `\n! baseline was captured on ${baseline.capturedOn}, this is ${process.platform}-${process.arch}.` +
        '\n  Pixel output differs between platforms; recapture rather than trusting a diff.',
    );
  }

  let failed = 0;
  let missing = 0;
  for (const name of names) {
    const before = baseline.frames[name];
    if (!before) {
      console.log(`+ ${name}: new frame, no baseline`);
      missing++;
      continue;
    }
    const diff = compare(before, frames[name]);
    if (matches(before, frames[name])) {
      console.log(`  ok  ${describe(name, diff)}`);
    } else {
      console.log(`FAIL  ${describe(name, diff)}`);
      failed++;
    }
  }
  for (const name of Object.keys(baseline.frames)) {
    if (!frames[name]) console.log(`- ${name}: in baseline but not captured`);
  }

  console.log(`\n${names.length - failed - missing} matched, ${failed} changed, ${missing} new`);
  if (errors.length) console.log('Page errors were logged above — treat those as failures too.');
  process.exit(failed || errors.length ? 1 : 0);
}

await main();
