import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from '../project.ts';
import { CURRENT_FORMAT, formatOf, runMigrations } from './index.ts';
import { migrate1to2 } from './1-to-2.ts';

/**
 * ENGINEERING_GUIDE §3.6.5: every format version keeps a frozen fixture forever, and
 * this suite loads all of them to current.
 *
 * The point is not that the newest migration works — that is easy to check while writing
 * it. It is that the *oldest* document still opens after the tenth migration is written,
 * when nobody remembers what format 1 looked like. A fixture is the only thing that
 * remembers.
 */

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');

const frozen = fs
  .readdirSync(FIXTURES)
  .filter((f) => f.endsWith('.geomotion.json'))
  .sort();

describe('the frozen fixtures', () => {
  it('has one for every format up to the current', () => {
    // A missing fixture means a format nobody can prove still loads.
    const covered = frozen.map((f) => Number(/format-(\d+)/.exec(f)?.[1]));
    for (let v = 1; v <= CURRENT_FORMAT; v++) expect(covered).toContain(v);
  });

  it.each(frozen)('%s loads to the current format', (file) => {
    const doc = JSON.parse(fs.readFileSync(path.join(FIXTURES, file), 'utf8'));
    const out = migrate(doc);

    expect(out.format).toBe(CURRENT_FORMAT);
    expect(out.layers.length).toBeGreaterThan(0);
    // The old name must be gone, not merely ignored — two fields meaning the same thing
    // let two readers disagree about which is authoritative (§3.6.4).
    expect(out).not.toHaveProperty('version');
  });

  it.each(frozen)('%s keeps the content it was frozen with', (file) => {
    const doc = JSON.parse(fs.readFileSync(path.join(FIXTURES, file), 'utf8'));
    const out = migrate(doc);
    const marker = out.layers.find((l) => l.type === 'marker');

    expect(marker?.name).toBe('Tokyo');
    // 14 was authored as a bare number in format 1; it must still be 14 afterwards.
    expect(marker && 'size' in marker ? marker.size : null).toEqual({ kind: 'static', value: 14 });
    expect(out.camera).toHaveLength(2);
    expect(out.camera[1]?.dip).toBe(1.5);
  });

  it('is idempotent — migrating an already-current document changes nothing', () => {
    // Projects are saved and reopened constantly; a migration that fired twice would
    // compound its change every time the file went round the loop.
    const doc = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'format-1.geomotion.json'), 'utf8'));
    const once = migrate(doc);
    expect(migrate(structuredClone(once))).toEqual(once);
  });
});

describe('formatOf', () => {
  it('treats a document with no format as the original', () => {
    // Everything written before `format` existed carries `version: 1` and nothing else.
    expect(formatOf({ version: 1 })).toBe(1);
    expect(formatOf({})).toBe(1);
  });

  it('reads a declared format', () => {
    expect(formatOf({ format: 2 })).toBe(2);
  });

  it('falls back to the original for a format that is not a number', () => {
    // Corrupt or hand-edited. Running the chain is strictly safer than skipping steps on
    // the strength of a value that means nothing.
    for (const bad of [{ format: 'two' }, { format: 0 }, { format: -3 }, { format: 1.5 }, null]) {
      expect(formatOf(bad)).toBe(1);
    }
  });
});

describe('runMigrations', () => {
  it('stamps the format it produced', () => {
    expect(runMigrations({ version: 1, layers: [] }).format).toBe(CURRENT_FORMAT);
  });

  it('leaves a document from a newer build alone rather than refusing it', () => {
    /*
     * It will be missing fields this build wants, and the default-filling downstream
     * covers that. Refusing outright turns "opened on an older laptop" into data the
     * user cannot reach at all.
     */
    const future = { format: CURRENT_FORMAT + 5, layers: [], camera: [] };
    expect(runMigrations(future).format).toBe(CURRENT_FORMAT + 5);
  });

  it('does not mutate its input', () => {
    // Migrations are pure by contract; the loader hands them a parsed file it may reuse.
    const input = { version: 1, layers: [{ type: 'marker', size: 9 }] };
    const copy = structuredClone(input);
    runMigrations(input);
    expect(input).toEqual(copy);
  });
});

describe('migrate1to2', () => {
  const marker = (size: unknown) => ({ version: 1, layers: [{ type: 'marker', size }] });

  it('wraps a bare number as a static track', () => {
    expect(migrate1to2(marker(12)).layers).toEqual([
      { type: 'marker', size: { kind: 'static', value: 12 } },
    ]);
  });

  it('leaves a track alone, so re-running cannot wrap it twice', () => {
    const track = { kind: 'keyframed', keys: [] };
    expect((migrate1to2(marker(track)).layers as { size: unknown }[])[0]?.size).toEqual(track);
  });

  it('leaves a size that is not a number to the type repair downstream', () => {
    // Doing it here would mean this step knowing the default, which belongs to the
    // schema rather than to a migration.
    expect((migrate1to2(marker('big')).layers as { size: unknown }[])[0]?.size).toBe('big');
  });

  it('touches no other layer type', () => {
    const doc = { version: 1, layers: [{ type: 'text', size: 44 }] };
    expect((migrate1to2(doc).layers as { size: unknown }[])[0]?.size).toBe(44);
  });

  it('survives a document with no layers array at all', () => {
    expect(migrate1to2({ version: 1 }).layers).toEqual([]);
  });
});
