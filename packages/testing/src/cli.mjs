/**
 * `golden:capture` writes the baseline; `golden:check` compares against it; and
 * `golden:smoke` asserts only what is true on any machine.
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
const { compare, describe, identical, matches, variance } = await import('./signature.ts');

async function main() {
  if (cmd !== 'capture' && cmd !== 'check' && cmd !== 'smoke') {
    console.error('usage: cli.mjs <capture|check|smoke>');
    process.exit(2);
  }

  console.log(`Capturing from ${url} …`);
  const { frames, mapOnly, errors } = await capture({ url });
  const names = Object.keys(frames);
  console.log(`  ${names.length} frames captured`);

  if (errors.length) {
    console.log('\nPage errors during capture:');
    for (const e of [...new Set(errors)].slice(0, 10)) console.log('  ' + e);
  }

  if (cmd === 'smoke') {
    /*
     * What can be asserted anywhere.
     *
     * A committed baseline cannot run in CI: GPU rasterisation differs between
     * drivers, and headless software rendering differs from both, so every frame
     * would mismatch for reasons that are not regressions. These properties describe
     * a single run instead of comparing two, so they hold on any machine — and they
     * still catch the failures that matter most, which are "nothing drew" and
     * "everything drew the same".
     *
     * A draft once lost the outline and the choropleth for seven seconds; the
     * distinctness check below is what would have caught it without a baseline.
     */
    const problems2 = [];
    for (const [name, sig] of Object.entries(frames)) {
      const v = variance(sig);
      if (v < 25) problems2.push(`${name}: frame is nearly blank (variance ${v.toFixed(1)})`);
    }

    /*
     * The overlay has to contribute something.
     *
     * Disabling `drawOverlay` entirely left every frame varied and distinct, because
     * the map still drew the choropleth — so blankness and distinctness alone do not
     * notice a whole surface going missing. Comparing the composite against the map
     * on its own does, and it is still one run compared with itself.
     */
    const drewOverlay = new Map();
    for (const [name, sig] of Object.entries(frames)) {
      const fixture = name.split('@')[0];
      const drew = !identical(sig, mapOnly[name]);
      drewOverlay.set(fixture, (drewOverlay.get(fixture) ?? false) || drew);
    }
    for (const [fixture, drew] of drewOverlay) {
      // Per fixture, not per frame: a composition legitimately has moments with
      // nothing on the overlay — the demo's first frame is one — but a fixture where
      // it never contributes means the surface is dead.
      if (!drew) problems2.push(`${fixture}: the overlay drew nothing in any frame`);
    }

    const seen = new Map();
    for (const [name, sig] of Object.entries(frames)) {
      for (const [otherName, other] of seen) {
        if (identical(sig, other)) problems2.push(`${name} is pixel-identical to ${otherName}`);
      }
      seen.set(name, sig);
    }

    for (const line of Object.entries(frames).map(([n, s]) => `  ${n}: variance ${variance(s).toFixed(0)}`)) {
      console.log(line);
    }
    if (errors.length) problems2.push(`${errors.length} page error(s)`);

    if (problems2.length) {
      console.log('\nFAILED:');
      for (const p of problems2) console.log('  ' + p);
      process.exit(1);
    }
    console.log(`\n${names.length} frames rendered, all distinct and none blank.`);
    return;
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
