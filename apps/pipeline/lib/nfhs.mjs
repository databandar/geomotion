import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Reads indicators out of the NFHS pivoted CSV.
 *
 * The survey publishes each indicator four times — Urban, Rural, Total, and the
 * previous round's figure — which is what makes a change-over-time story
 * possible without joining two files.
 */

export const DEFAULT_CSV = '/Users/sugandhkhobragade/Study/pystuff/nfhsdata/NFHS6/nfhs6_pivoted.csv';

/** NFHS spellings → the names used by the bundled boundary sets. */
const ALIASES = {
  'A & N Islands': ['Andaman and Nicobar Islands'],
  'Jammu & Kashmir': ['Jammu and Kashmir'],
  // The survey reports the merged union territory; the official boundary set
  // still carries the two constituent territories separately.
  DNHDD: ['Dadra and Nagar Haveli', 'Daman and Diu'],
};

/** Minimal RFC4180 CSV parse — the factsheet text contains commas and quotes. */
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
    if (c === '"') quoted = true;
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
  const rows = parseCsv(await fs.readFile(csvPath, 'utf8'));
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
    for (const name of ALIASES[state] ?? [state]) {
      values[name] = num;
      if (Number.isFinite(prevNum)) previous[name] = prevNum;
    }
  }

  return { indicator, round, values, previous, national, nationalPrevious, missing };
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
    values: Object.fromEntries(Object.entries(extracted.values).sort(([a], [b]) => a.localeCompare(b))),
    previous: Object.fromEntries(Object.entries(extracted.previous).sort(([a], [b]) => a.localeCompare(b))),
  };
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(doc, null, 2) + '\n');
  return doc;
}
