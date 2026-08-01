/**
 * Format 8 → 9: every declared number is a track.
 *
 * ARCHITECTURE §04 says "every property is a track" and gives the pipeline
 * `value(t) = behaviors(expr(base(t)))` as "one pipeline, whole app". The pipeline was
 * built; it was wired to three properties. Format 9 wires it to twenty-eight
 * (docs/features/every-property-a-track.md).
 *
 * A bare `3.5` becomes `{ kind: 'static', value: 3.5 }`. Nothing else moves: a static track
 * evaluates to the number it replaced, so a project renders identically before and after —
 * which is what the golden frames check.
 *
 * **The registry decides which properties convert, not a list here.** `trackPropsOf(type)`
 * reads the row kind that also draws the control, so the migration cannot convert a property
 * the inspector still shows as a plain number, nor miss one it shows as a track. A second
 * list in this file is exactly the drift the node-type registry exists to remove.
 *
 * Robustness, per §3.6: this runs against files this project did not write. Anything already
 * a track is left alone (a document written by a build mid-conversion), anything non-numeric
 * is left alone rather than wrapped into a track that would evaluate to nonsense, and an
 * unknown node type has no declared paths so nothing happens to it.
 */
import { trackPropsOf } from '../schema/index.ts';

type Loose = Record<string, unknown>;

const isTrack = (v: unknown): boolean =>
  v !== null && typeof v === 'object' && typeof (v as Loose).kind === 'string';

/**
 * Wrap the value at a dotted path, returning a copy.
 *
 * Route's `marker.size` and `follow.zoom` live one level down, so the walk has to rebuild
 * the object around them — mutating in place would edit the caller's document, and a
 * migration that is not pure cannot be re-run or tested against a frozen fixture.
 */
function wrapAtPath(node: Loose, path: string): Loose {
  const [head, ...rest] = path.split('.');
  if (!head) return node;

  if (rest.length > 0) {
    const child = node[head];
    if (child === null || typeof child !== 'object') return node;
    const next = wrapAtPath(child as Loose, rest.join('.'));
    return next === child ? node : { ...node, [head]: next };
  }

  const value = node[head];
  if (typeof value !== 'number' || !Number.isFinite(value)) return node;
  return { ...node, [head]: { kind: 'static', value } };
}

export function migrate8to9(doc: Loose): Loose {
  const nodes = doc.nodes as Record<string, Loose> | undefined;
  if (!nodes || typeof nodes !== 'object') return doc;

  const out: Record<string, Loose> = {};
  for (const [id, node] of Object.entries(nodes)) {
    if (!node || typeof node !== 'object') {
      out[id] = node;
      continue;
    }
    const type = typeof node.type === 'string' ? node.type : '';
    let next = node;
    for (const path of trackPropsOf(type)) {
      // Already a track: a file from a build part-way through this change, or one a plugin
      // wrote. Wrapping it again would bury the real track inside a static one.
      const current = path.split('.').reduce<unknown>((acc, key) => {
        return acc !== null && typeof acc === 'object' ? (acc as Loose)[key] : undefined;
      }, next);
      if (isTrack(current)) continue;
      next = wrapAtPath(next, path);
    }
    out[id] = next;
  }

  return { ...doc, nodes: out };
}
