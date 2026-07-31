/**
 * The entity registry — ARCHITECTURE §05, "the keystone".
 *
 * A smart object is a thing in the world with a **stable id**: `geo:in-wb` is West
 * Bengal, forever, whatever a given dataset happens to call it. Facts attach to that id
 * with their provenance, and everything downstream refers to the id rather than to a
 * spelling.
 *
 * ### Decision 02: entities are the join; layers never join data themselves
 *
 * v1 joined by name inside the regions layer, which meant re-fighting the same alias
 * battle for every dataset — and this project reproduced it: the survey reader carried
 * its own table mapping "A & N Islands" and "DNHDD" onto boundary names, invisible to
 * everything else and duplicated the moment a second dataset arrived.
 *
 * Joining once, here, has a second benefit that matters more than tidiness: there is
 * exactly one place for the diagnostics. A name that matched nothing is reported at
 * import, where someone can still fix it, instead of turning into a blank region three
 * steps later with nothing to say why.
 */
import type { LngLat } from '@geomotion/core';

/**
 * One measurement, with where it came from.
 *
 * §05: "a typed table where every fact carries `{value, source, asOf}`". Provenance is
 * functional, not decorative — a credits line can be generated from the facts a video
 * actually used, which is only possible if every value carries its own source.
 */
export interface Fact {
  value: number | string | null;
  /** Who published it. Appears in credits. */
  source: string;
  /** When it was true — ISO date or a round name like "NFHS-6". */
  asOf?: string;
}

export interface Entity {
  /** Stable forever. Namespaced so two datasets cannot collide: `geo:in-wb`. */
  id: string;
  /** The name this project prefers to display. */
  name: string;
  /**
   * Other spellings this entity answers to.
   *
   * Held on the entity rather than in a per-dataset table, so a spelling learned while
   * importing one dataset is known to every later one.
   */
  aliases?: string[];
  facts?: Record<string, Fact>;
  anchor?: LngLat;
}

export interface Registry {
  entities: Entity[];
}

/** Fold a name to something two spellings of the same place agree on. */
const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Every entity a name refers to.
 *
 * An array, not a single entity, because one name legitimately covers several: a survey
 * reports the merged union territory "DNHDD" while the official boundary set still
 * carries Dadra and Nagar Haveli and Daman and Diu separately. Returning one of them
 * would leave the other blank on the map with no indication why.
 */
export function resolve(registry: Registry, name: string): Entity[] {
  const key = fold(name);
  if (!key) return [];
  return registry.entities.filter(
    (e) => fold(e.name) === key || (e.aliases ?? []).some((a) => fold(a) === key),
  );
}

/** What a join did, and what it could not do. */
export interface JoinReport {
  registry: Registry;
  /** Source name → the entity ids it landed on. */
  matched: Record<string, string[]>;
  /** Names in the data that no entity answers to. */
  unmatched: string[];
  /** Entities the data said nothing about. */
  missing: string[];
}

/**
 * Merge a column of values into entity facts — the single join (§05 Decision 02).
 *
 * Returns a new registry; the input is untouched, so a failed import can be discarded
 * without having half-written itself into the document.
 *
 * Both halves of the diagnostic matter and are different problems. `unmatched` is a
 * spelling this project has never seen, and someone must add an alias or fix the data.
 * `missing` is a region the dataset simply does not cover — a legitimate blank, and the
 * legend says "no data" about it. Reporting only one of them is how a typo hides among
 * genuine gaps.
 */
export function joinFacts(
  registry: Registry,
  rows: Record<string, number | string | null>,
  meta: { fact: string; source: string; asOf?: string },
): JoinReport {
  const matched: Record<string, string[]> = {};
  const unmatched: string[] = [];
  const touched = new Set<string>();

  const facts = new Map<string, Fact>();
  for (const [name, value] of Object.entries(rows)) {
    const hits = resolve(registry, name);
    if (hits.length === 0) {
      unmatched.push(name);
      continue;
    }
    matched[name] = hits.map((e) => e.id);
    for (const e of hits) {
      touched.add(e.id);
      facts.set(e.id, { value, source: meta.source, ...(meta.asOf ? { asOf: meta.asOf } : {}) });
    }
  }

  return {
    registry: {
      entities: registry.entities.map((e) => {
        const fact = facts.get(e.id);
        return fact ? { ...e, facts: { ...e.facts, [meta.fact]: fact } } : e;
      }),
    },
    matched,
    unmatched,
    missing: registry.entities.filter((e) => !touched.has(e.id)).map((e) => e.id),
  };
}

/** One fact, or undefined. The read side of a `bound` track, when that lands. */
export function factOf(registry: Registry, entityId: string, fact: string): Fact | undefined {
  return registry.entities.find((e) => e.id === entityId)?.facts?.[fact];
}

/**
 * The distinct sources behind a set of facts, in first-seen order.
 *
 * §05: "the credits line can be *generated* from the facts the video actually used".
 * Order is deliberate rather than sorted — the first source cited is usually the primary
 * one, and re-ordering a credit is not this function's business.
 */
export function sourcesUsed(registry: Registry, facts: readonly string[]): string[] {
  const seen: string[] = [];
  for (const e of registry.entities) {
    for (const name of facts) {
      const src = e.facts?.[name]?.source;
      if (src && !seen.includes(src)) seen.push(src);
    }
  }
  return seen;
}

/**
 * Which of `targets` a pasted name refers to, using the registry to bridge spellings.
 *
 * The map holds whatever names its boundary file uses; a dataset writes whatever its
 * publisher uses. Comparing the two directly is the join this project kept
 * reimplementing — the survey reader had one table, the paste box had a lowercase
 * `Set`, and neither knew what the other had learned. So pasting `Jammu & Kashmir` into
 * the editor was rejected as unknown while the very same spelling imported cleanly on
 * the command line.
 *
 * Tried in order: the name as written, then the entity it resolves to. A registry that
 * knows nothing about these targets simply contributes nothing, which is what makes this
 * safe for boundary sets outside the ones shipped here.
 */
export function matchNames(targets: readonly string[], name: string, aliases?: Registry): string[] {
  const key = fold(name);
  if (!key) return [];

  const direct = targets.filter((t) => fold(t) === key);
  if (direct.length || !aliases) return direct;

  // Every canonical name the alias registry offers, mapped back onto what is on the map.
  const canonical = resolve(aliases, name).map((e) => fold(e.name));
  return canonical.length ? targets.filter((t) => canonical.includes(fold(t))) : [];
}
