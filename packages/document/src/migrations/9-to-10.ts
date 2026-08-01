/**
 * Format 9 → 10: the readout gets a style instead of an on/off switch.
 *
 * `showCallout: boolean` becomes `calloutStyle: 'card' | 'plain' | 'pill' | 'none'`
 * (docs/features/callout-styles.md). `false` was already "draw nothing", so it maps onto
 * `'none'` exactly and no project changes what it shows.
 *
 * The boolean is **removed**, not left beside the enum. Two fields meaning one thing let two
 * readers disagree about which is authoritative (§3.6.4) — and this pair would disagree the
 * first time someone set a style while an old `showCallout: false` sat next to it.
 *
 * Per §3.6, this runs against files this project did not write: a document that already
 * carries a `calloutStyle` keeps it, and one carrying neither falls through to the default
 * that `coerceToDefaults` fills in after the chain.
 */
type Loose = Record<string, unknown>;

const STYLES = new Set(['card', 'plain', 'pill', 'none']);

export function migrate9to10(doc: Loose): Loose {
  const nodes = doc.nodes as Record<string, Loose> | undefined;
  if (!nodes || typeof nodes !== 'object') return doc;

  const out: Record<string, Loose> = {};
  for (const [id, node] of Object.entries(nodes)) {
    if (!node || typeof node !== 'object' || node.type !== 'regions') {
      out[id] = node;
      continue;
    }

    const next: Loose = { ...node };
    // An existing style wins: a newer build, or a plugin, already said what it wanted.
    if (typeof next.calloutStyle !== 'string' || !STYLES.has(next.calloutStyle)) {
      next.calloutStyle = next.showCallout === false ? 'none' : 'card';
    }
    delete next.showCallout;
    out[id] = next;
  }

  return { ...doc, nodes: out };
}
