import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { changes, extract, listIndicators, loadNfhs } from './nfhs.mjs';

/**
 * The NFHS reader had no tests, and it is the one place in the pipeline where a silent
 * mistake becomes a *wrong number on a map* rather than a crash. The survey CSV is not
 * in this repository — it is third-party published data with its own provenance — so
 * everything here runs against fixtures written to a temp directory, which also keeps
 * the edge cases explicit instead of hoping the real file happens to contain them.
 */

let dir;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'nfhs-'));
});

afterAll(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});

/** Write a CSV and read it back through the real loader. */
async function load(text, name = `${Math.random().toString(36).slice(2)}.csv`) {
  const file = path.join(dir, name);
  await fs.writeFile(file, text);
  return loadNfhs(file);
}

const HEADER = 'State,Rate (Total),Rate (Urban),Rate (Rural),Rate (NFHS-5),Other (Total)';

describe('the CSV parser', () => {
  it('keeps a comma inside a quoted field', () => {
    return load(`${HEADER}\n"Delhi, NCT",5,6,4,3,1\n`).then((d) => {
      expect(d.body[0][0]).toBe('Delhi, NCT');
      expect(d.body[0][1]).toBe('5');
    });
  });

  it('unescapes a doubled quote', async () => {
    const d = await load(`${HEADER}\n"He said ""hi""",5,6,4,3,1\n`);
    expect(d.body[0][0]).toBe('He said "hi"');
  });

  it('keeps a newline inside a quoted field', async () => {
    const d = await load(`${HEADER}\n"Two\nLines",5,6,4,3,1\n`);
    expect(d.body[0][0]).toBe('Two\nLines');
    expect(d.body).toHaveLength(1);
  });

  it('treats a quote in the middle of a field as an ordinary character', async () => {
    /*
     * The bug this guards. A quote only opens a quoted field at the *start* of one —
     * RFC4180, and what a spreadsheet does. Treating any quote as an opener meant a
     * stray inch mark or apostrophe swallowed every comma and newline after it,
     * collapsing the remainder of the file into a single field: `12" pipe,5` parsed as
     * one field reading `12 pipe,5\\n`, so the value column vanished and every row
     * after it shifted. The published export contains no quotes at all, so it never
     * fired; the parser reads a file this project does not control.
     */
    const d = await load(`${HEADER}\n12" pipe,5,6,4,3,1\n`);
    expect(d.body[0]).toEqual(['12" pipe', '5', '6', '4', '3', '1']);
  });

  it('handles CRLF line endings', async () => {
    const d = await load(`${HEADER}\r\nDelhi,5,6,4,3,1\r\n`);
    expect(d.body[0]).toEqual(['Delhi', '5', '6', '4', '3', '1']);
  });

  it('reads a final row with no trailing newline', async () => {
    const d = await load(`${HEADER}\nDelhi,5,6,4,3,1`);
    expect(d.body).toHaveLength(1);
  });

  it('ignores a blank trailing line rather than emitting an empty state', async () => {
    const d = await load(`${HEADER}\nDelhi,5,6,4,3,1\n\n`);
    expect(d.body).toHaveLength(1);
  });
});

describe('listIndicators', () => {
  it('lists each indicator once, by its Total column', async () => {
    // Urban, Rural and NFHS-5 are the same indicator seen four ways; listing all four
    // would offer the same map under four names.
    expect(listIndicators(await load(`${HEADER}\nDelhi,5,6,4,3,1\n`))).toEqual(['Rate', 'Other']);
  });

  it('ignores a column that is not one of the four rounds', async () => {
    const d = await load(`State,Rate (Total),Notes\nDelhi,5,x\n`);
    expect(listIndicators(d)).toEqual(['Rate']);
  });
});

describe('extract', () => {
  const csv = () =>
    `${HEADER}\n` +
    'India,8,9,7,6,2\n' +
    'Kerala,5,6,4,3,1\n' +
    'Bihar,12,13,11,15,4\n' +
    'Goa,,,,,\n' +
    'Nowhere,n/a,1,1,1,1\n' +
    'DNHDD,7.5,8,7,7,2\n';

  it('reads the requested round, not whichever column came first', async () => {
    const e = extract(await load(csv()), 'Rate', 'urban');
    expect(e.values.Kerala).toBe(6);
    expect(extract(await load(csv()), 'Rate', 'rural').values.Kerala).toBe(4);
  });

  it('holds India aside as the national figure rather than mapping it', async () => {
    // A country-shaped region in a state choropleth would dominate the colour scale.
    const e = extract(await load(csv()), 'Rate');
    expect(e.national).toBe(8);
    expect(e.values.India).toBeUndefined();
  });

  it('carries the previous round for the same indicator', async () => {
    const e = extract(await load(csv()), 'Rate');
    expect(e.previous.Kerala).toBe(3);
    expect(e.nationalPrevious).toBe(6);
  });

  it('gives a merged territory its value under every boundary name', async () => {
    /*
     * The survey reports the merged union territory while the official boundary set
     * still carries its two constituents. Mapping one and not the other leaves a hole
     * that reads as missing data.
     */
    const e = extract(await load(csv()), 'Rate');
    expect(e.values['Dadra and Nagar Haveli']).toBe(7.5);
    expect(e.values['Daman and Diu']).toBe(7.5);
    expect(e.values.DNHDD).toBeUndefined();
  });

  it('reports a blank and an unparseable value as missing rather than as zero', async () => {
    // `Number('')` is 0, which would paint an empty cell as the bottom of the scale —
    // indistinguishable from a real zero.
    const e = extract(await load(csv()), 'Rate');
    expect(e.missing).toEqual(['Goa', 'Nowhere']);
    expect(e.values.Goa).toBeUndefined();
    expect(e.values.Nowhere).toBeUndefined();
  });

  it('names the column it could not find', async () => {
    await expect(async () => extract(await load(csv()), 'Nonsense')).rejects.toThrow(/Nonsense \(Total\)/);
  });

  it('rejects a round it does not have', async () => {
    await expect(async () => extract(await load(csv()), 'Rate', 'sideways')).rejects.toThrow(/round must be one of/);
  });
});

describe('changes', () => {
  it('ranks by movement, largest rise first', async () => {
    const d = await load(
      `${HEADER}\nKerala,5,6,4,3,1\nBihar,12,13,11,15,4\nGoa,9,9,9,4,1\n`,
    );
    const rows = changes(extract(d, 'Rate'));
    expect(rows.map((r) => r.name)).toEqual(['Goa', 'Kerala', 'Bihar']);
    expect(rows[0]).toMatchObject({ now: 9, then: 4, delta: 5 });
    // Bihar fell, so it sorts last with a negative delta.
    expect(rows[2].delta).toBeLessThan(0);
  });

  it('leaves out a state with no previous figure, rather than treating it as zero', async () => {
    // Otherwise a state new to the survey shows the largest rise in the country.
    const d = await load(`${HEADER}\nKerala,5,6,4,3,1\nNewly,9,9,9,,1\n`);
    expect(changes(extract(d, 'Rate')).map((r) => r.name)).toEqual(['Kerala']);
  });
});

describe('loadNfhs — when the file is not there', () => {
  it('says what to set instead of failing on an empty path', async () => {
    // The default used to be an absolute path into one developer's home directory,
    // which resolved on exactly one machine and gave everyone else a bare ENOENT.
    await expect(loadNfhs('')).rejects.toThrow(/--csv|NFHS_CSV/);
  });

  it('names the path it could not read', async () => {
    await expect(loadNfhs('/no/such/file.csv')).rejects.toThrow(/\/no\/such\/file\.csv/);
  });
});
