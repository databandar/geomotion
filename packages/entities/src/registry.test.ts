import { describe, expect, it } from 'vitest';
import { factOf, joinFacts, matchNames, resolve, sourcesUsed, type Registry } from './registry.ts';

/**
 * The join is the one place a dataset meets the map (§05 Decision 02), so it is also the
 * one place a mistake can still be reported to someone who can fix it. These test the
 * diagnostics as carefully as the values.
 */
const india = (): Registry => ({
  entities: [
    { id: 'geo:in-wb', name: 'West Bengal' },
    { id: 'geo:in-an', name: 'Andaman and Nicobar Islands', aliases: ['A & N Islands'] },
    { id: 'geo:in-jk', name: 'Jammu and Kashmir', aliases: ['Jammu & Kashmir'] },
    { id: 'geo:in-dn', name: 'Dadra and Nagar Haveli', aliases: ['DNHDD'] },
    { id: 'geo:in-dd', name: 'Daman and Diu', aliases: ['DNHDD'] },
  ],
});

describe('resolve', () => {
  it('finds an entity by its own name', () => {
    expect(resolve(india(), 'West Bengal').map((e) => e.id)).toEqual(['geo:in-wb']);
  });

  it('finds one by an alias the data uses', () => {
    // The spelling lives on the entity, so it is known to every later dataset too —
    // not in a per-dataset table that the next importer has to rediscover.
    expect(resolve(india(), 'A & N Islands').map((e) => e.id)).toEqual(['geo:in-an']);
  });

  it('shrugs off punctuation, case and spacing differences', () => {
    for (const spelling of ['west bengal', 'WEST  BENGAL', 'West-Bengal']) {
      expect(resolve(india(), spelling).map((e) => e.id)).toEqual(['geo:in-wb']);
    }
    expect(resolve(india(), 'Jammu and Kashmir').map((e) => e.id)).toEqual(['geo:in-jk']);
    expect(resolve(india(), 'Jammu & Kashmir').map((e) => e.id)).toEqual(['geo:in-jk']);
  });

  it('returns every entity a merged name covers', () => {
    /*
     * The survey reports one merged union territory; the official boundary set still
     * carries both constituents. Answering with one of them would leave the other blank
     * on the map with nothing to say why.
     */
    expect(resolve(india(), 'DNHDD').map((e) => e.id)).toEqual(['geo:in-dn', 'geo:in-dd']);
  });

  it('matches an ampersand against "and" with no alias written for it', () => {
    /*
     * The point of folding rather than listing. Datasets write "Dadra & Nagar Haveli",
     * "Jammu & Kashmir", "A & N Islands" — every one of them would otherwise need its own
     * alias entry, and the one nobody thought of is the one that goes blank on the map.
     */
    const reg = { entities: [{ id: 'geo:x', name: 'Dadra and Nagar Haveli' }] };
    expect(resolve(reg, 'Dadra & Nagar Haveli').map((e) => e.id)).toEqual(['geo:x']);
    expect(resolve(reg, 'DADRA  &  NAGAR   HAVELI').map((e) => e.id)).toEqual(['geo:x']);
  });

  it('finds nothing for a name it has never seen', () => {
    expect(resolve(india(), 'Atlantis')).toEqual([]);
    expect(resolve(india(), '   ')).toEqual([]);
  });
});

describe('joinFacts', () => {
  const meta = { fact: 'internet', source: 'NFHS-6 (IIPS)', asOf: 'NFHS-6' };

  it('writes a value onto the entity, with its provenance', () => {
    const out = joinFacts(india(), { 'West Bengal': 64.3 }, meta);
    expect(factOf(out.registry, 'geo:in-wb', 'internet')).toEqual({
      value: 64.3,
      source: 'NFHS-6 (IIPS)',
      asOf: 'NFHS-6',
    });
  });

  it('gives a merged name its value on every entity it covers', () => {
    const out = joinFacts(india(), { DNHDD: 78.4 }, meta);
    expect(factOf(out.registry, 'geo:in-dn', 'internet')?.value).toBe(78.4);
    expect(factOf(out.registry, 'geo:in-dd', 'internet')?.value).toBe(78.4);
    expect(out.matched.DNHDD).toEqual(['geo:in-dn', 'geo:in-dd']);
  });

  it('reports a name nothing answers to, rather than dropping it', () => {
    // A spelling this project has never seen. Someone must add an alias or fix the data,
    // and they can only do that if they are told at the point of import.
    const out = joinFacts(india(), { 'West Bengal': 1, Atlantis: 2 }, meta);
    expect(out.unmatched).toEqual(['Atlantis']);
  });

  it('reports entities the data said nothing about, separately', () => {
    /*
     * A different problem from an unmatched name, and conflating them is how a typo
     * hides among genuine gaps: `missing` is a region the dataset does not cover, which
     * the legend honestly calls "no data".
     */
    const out = joinFacts(india(), { 'West Bengal': 1 }, meta);
    expect(out.unmatched).toEqual([]);
    expect(out.missing).toContain('geo:in-jk');
    expect(out.missing).not.toContain('geo:in-wb');
  });

  it('leaves the registry it was given untouched', () => {
    // A failed import must be discardable without having half-written itself in.
    const before = india();
    const snapshot = JSON.stringify(before);
    joinFacts(before, { 'West Bengal': 1 }, meta);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('keeps facts from earlier joins beside the new one', () => {
    const first = joinFacts(india(), { 'West Bengal': 64.3 }, meta);
    const second = joinFacts(first.registry, { 'West Bengal': 1091 }, {
      fact: 'population',
      source: 'Census 2011',
    });
    expect(factOf(second.registry, 'geo:in-wb', 'internet')?.value).toBe(64.3);
    expect(factOf(second.registry, 'geo:in-wb', 'population')?.value).toBe(1091);
  });

  it('carries a null through as a known absence', () => {
    // Not the same as never having been told: a published "no data" is itself a fact.
    const out = joinFacts(india(), { 'West Bengal': null }, meta);
    expect(factOf(out.registry, 'geo:in-wb', 'internet')?.value).toBeNull();
    expect(out.missing).not.toContain('geo:in-wb');
  });
});

describe('sourcesUsed', () => {
  it('generates the credit from the facts actually used', () => {
    // §05: provenance is functional, not decorative.
    const a = joinFacts(india(), { 'West Bengal': 1 }, { fact: 'internet', source: 'NFHS-6 (IIPS)' });
    const b = joinFacts(a.registry, { 'West Bengal': 2 }, { fact: 'population', source: 'Census 2011' });
    expect(sourcesUsed(b.registry, ['internet', 'population'])).toEqual(['NFHS-6 (IIPS)', 'Census 2011']);
  });

  it('credits nothing for a fact the video did not use', () => {
    const a = joinFacts(india(), { 'West Bengal': 1 }, { fact: 'internet', source: 'NFHS-6 (IIPS)' });
    expect(sourcesUsed(a.registry, ['population'])).toEqual([]);
  });

  it('names each source once, however many entities carry it', () => {
    const a = joinFacts(india(), { 'West Bengal': 1, 'Jammu and Kashmir': 2 }, {
      fact: 'internet',
      source: 'NFHS-6 (IIPS)',
    });
    expect(sourcesUsed(a.registry, ['internet'])).toEqual(['NFHS-6 (IIPS)']);
  });
});

describe('matchNames', () => {
  const onMap = ['Jammu and Kashmir', 'Dadra and Nagar Haveli', 'Daman and Diu', 'Kerala'];

  it('matches a name the map already uses', () => {
    expect(matchNames(onMap, 'Kerala', india())).toEqual(['Kerala']);
  });

  it('bridges a publisher spelling onto the name on the map', () => {
    /*
     * The editor's paste box used a lowercase `Set` of region names, so this exact
     * spelling was rejected as unknown while importing cleanly on the command line —
     * two joins that had each learned different things.
     */
    expect(matchNames(onMap, 'Jammu & Kashmir', india())).toEqual(['Jammu and Kashmir']);
  });

  it('bridges a name that folding alone cannot reach', () => {
    // `DNHDD` shares no letters with either territory; only the registry connects them.
    // This is the case the alias table exists for, as opposed to punctuation.
    expect(matchNames(onMap, 'DNHDD')).toEqual([]);
    expect(matchNames(onMap, 'DNHDD', india())).toHaveLength(2);
  });

  it('lands a merged name on every region it covers', () => {
    expect(matchNames(onMap, 'DNHDD', india())).toEqual(['Dadra and Nagar Haveli', 'Daman and Diu']);
  });

  it('matches nothing when the region is not on this map', () => {
    // The registry knows the entity; the boundary file does not carry it. That is a
    // genuine gap, not a spelling problem.
    expect(matchNames(onMap, 'A & N Islands', india())).toEqual([]);
  });

  it('still works with no registry at all', () => {
    /*
     * Boundary sets outside the ones shipped here get plain name matching rather than
     * nothing. The fold carries more than expected on its own — an ampersand spelling
     * reaches its "and" name with no alias involved, which is why the registry is only
     * needed for names that share no letters with their target.
     */
    expect(matchNames(onMap, 'kerala')).toEqual(['Kerala']);
    expect(matchNames(onMap, 'Jammu & Kashmir')).toEqual(['Jammu and Kashmir']);
  });

  it('finds nothing for an empty name', () => {
    expect(matchNames(onMap, '   ', india())).toEqual([]);
  });
});
