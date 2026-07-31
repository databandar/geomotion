import fs from 'node:fs/promises';
import path from 'node:path';
import { INDIA_STATES, resolve } from '@geomotion/entities';

/**
 * Reads indicators out of the NFHS pivoted CSV.
 *
 * The survey publishes each indicator four times — Urban, Rural, Total, and the
 * previous round's figure — which is what makes a change-over-time story
 * possible without joining two files.
 */

/**
 * Where the pivoted NFHS CSV lives.
 *
 * The survey data is not in this repository — it is ~100 KB of third-party published
 * figures with its own provenance, and vendoring it would make this repo the apparent
 * source of numbers it did not produce. So the path is configuration.
 *
 * This used to be an absolute path into one developer's home directory, which resolved
 * on exactly one machine and gave everyone else `ENOENT` from inside a render.
 */
export const DEFAULT_CSV = process.env.NFHS_CSV ?? '';

/** Read the CSV, failing with something a reader can act on. */
async function readCsv(csvPath) {
  if (!csvPath) {
    throw new Error(
      'No NFHS CSV configured. Pass --csv <path>, or set NFHS_CSV to the pivoted factsheet export.',
    );
  }
  try {
    return await fs.readFile(csvPath, 'utf8');
  } catch (e) {
    throw new Error(`Could not read the NFHS CSV at ${csvPath}: ${e.code ?? e.message}`);
  }
}

/**
 * Minimal RFC4180 CSV parse.
 *
 * A quote only opens a quoted field at the *start* of a field; anywhere else it is a
 * literal character, which is what RFC4180 says and what a spreadsheet does. Treating
 * any quote as an opener meant a stray one — an inch mark, an unbalanced apostrophe —
 * swallowed every comma and newline after it, collapsing the rest of the file into a
 * single field. The published NFHS export happens to contain no quotes at all, so this
 * has never fired; it is guarded because the parser's job is to read a file this
 * project does not control and the survey republishes.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    // Only at the start of a field, which is the sole place RFC4180 gives it meaning.
    if (c === '"' && field === '') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const ROUNDS = { total: 'Total', urban: 'Urban', rural: 'Rural', previous: 'NFHS-5' };

export async function loadNfhs(csvPath = DEFAULT_CSV) {
  const rows = parseCsv(await readCsv(csvPath));
  const header = rows[0];
  const body = rows.slice(1).filter((r) => r[0]?.trim());
  return { header, body, csvPath };
}

/** Every indicator that has a Total column, i.e. everything we can map. */
export function listIndicators({ header }) {
  const out = [];
  for (const col of header.slice(1)) {
    const m = col.match(/^(.*) \((Urban|Rural|Total|NFHS-5)\)$/);
    if (m && m[2] === 'Total') out.push(m[1]);
  }
  return out;
}

/**
 * Pull one indicator as `{ regionName: value }`, plus the national figure and
 * the previous round for the same indicator.
 */
export function extract({ header, body }, indicator, round = 'total') {
  const suffix = ROUNDS[round];
  if (!suffix) throw new Error(`round must be one of ${Object.keys(ROUNDS).join(', ')}`);

  const idx = header.indexOf(`${indicator} (${suffix})`);
  if (idx < 0) {
    throw new Error(`no column "${indicator} (${suffix})" — check the exact indicator text`);
  }
  const prevIdx = header.indexOf(`${indicator} (NFHS-5)`);

  const values = {};
  const previous = {};
  let national = null;
  let nationalPrevious = null;
  const missing = [];
  const unmatched = [];

  for (const row of body) {
    const state = row[0].trim();
    const raw = (row[idx] ?? '').trim();
    const prev = prevIdx >= 0 ? (row[prevIdx] ?? '').trim() : '';
    const num = raw === '' ? null : Number(raw);
    const prevNum = prev === '' ? null : Number(prev);

    if (state === 'India') {
      national = Number.isFinite(num) ? num : null;
      nationalPrevious = Number.isFinite(prevNum) ? prevNum : null;
      continue;
    }
    if (!Number.isFinite(num)) {
      missing.push(state);
      continue;
    }
    /*
     * Names resolve through the entity registry rather than a table kept here.
     *
     * That table used to hold "A & N Islands", the ampersands and the merged union
     * territory, where no other importer could see them — §05 Decision 02 calls that
     * out as the v1 mistake, because the next dataset re-fights the same battle. The
     * spellings now live on the entities, so anything joining later already knows them.
     *
     * A name nothing answers to is *recorded*, not silently passed through: an unknown
     * spelling and a genuinely absent region are different problems, and only one of
     * them is somebody's mistake.
     */
    const hits = resolve(INDIA_STATES, state);
    if (hits.length === 0) {
      unmatched.push(state);
      continue;
    }
    for (const entity of hits) {
      values[entity.name] = num;
      if (Number.isFinite(prevNum)) previous[entity.name] = prevNum;
    }
  }

  return { indicator, round, values, previous, national, nationalPrevious, missing, unmatched };
}

/** Sorted change table, for picking which states are worth a tour stop. */
export function changes(extracted) {
  return Object.entries(extracted.values)
    .filter(([name]) => name in extracted.previous)
    .map(([name, now]) => ({ name, now, then: extracted.previous[name], delta: now - extracted.previous[name] }))
    .sort((a, b) => b.delta - a.delta);
}

export async function writeValuesFile(extracted, outPath, meta = {}) {
  const doc = {
    _source: meta.source ?? 'NFHS-6 factsheets (International Institute for Population Sciences)',
    _indicator: extracted.indicator,
    _round: extracted.round,
    _national: extracted.national,
    _nationalPrevious: extracted.nationalPrevious,
    _note: meta.note ?? 'Extracted from the NFHS pivoted CSV. Values are as published; verify against the factsheet before publishing.',
    _missing: extracted.missing,
    _unmatched: extracted.unmatched,
    values: Object.fromEntries(Object.entries(extracted.values).sort(([a], [b]) => a.localeCompare(b))),
    previous: Object.fromEntries(Object.entries(extracted.previous).sort(([a], [b]) => a.localeCompare(b))),
  };
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(doc, null, 2) + '\n');
  return doc;
}
