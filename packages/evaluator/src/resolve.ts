/**
 * One pass that turns a node's tracks into the values it has at an instant.
 *
 * ARCHITECTURE §04: "every property is a track", `value(t) = behaviors(expr(base(t)))` —
 * "one pipeline, whole app". This is the *whole app* half. Before it, the evaluator handed
 * the renderer the document node itself (`style: layer`) and spelled out the one or two
 * tracked properties by hand:
 *
 * ```ts
 * style: { ...layer, size: evalTrack(layer.size, time, { facts, fallback: 8 }) }
 * ```
 *
 * That does not scale to twenty-eight, and — the reason it is replaced rather than repeated —
 * every one of them is a chance to forget one. A property that is a track in the document and
 * reaches the renderer unresolved draws as `NaN`, at one layer, at one time, with nothing to
 * say why. Doing it generically means the failure cannot happen once rather than being caught
 * twenty-eight times.
 *
 * **Driven by the registry.** `trackPropsOf(type)` is derived from the row kind that also
 * draws the control, so the evaluator resolves exactly what the inspector offers to keyframe.
 * A node type this build has never heard of — a plugin's (§15), or one from a newer
 * document — resolves by the same rule, which extends "for free" from the inspector to
 * evaluation.
 */
import { trackFallbacksOf, trackPropsOf, type Resolved } from '@geomotion/document';
import { evalTrack, type FactLookup } from '@geomotion/animation';
import type { Track } from '@geomotion/document';

type Loose = Record<string, unknown>;

const isTrack = (v: unknown): v is Track<number> =>
  v !== null && typeof v === 'object' && typeof (v as Loose).kind === 'string';

/**
 * Write `value` at a dotted path, copying the objects along the way.
 *
 * Route's `marker.size` and `follow.zoom` live one level down. Mutating in place would edit
 * the *document* — the node passed in is the stored one, not a copy — which is the bug class
 * §00 calls the time-source bug: a render that changes what it is rendering.
 */
function setAtPath(node: Loose, path: string, value: number): Loose {
  const [head, ...rest] = path.split('.');
  if (!head) return node;
  if (rest.length === 0) return { ...node, [head]: value };
  const child = node[head];
  if (child === null || typeof child !== 'object') return node;
  return { ...node, [head]: setAtPath(child as Loose, rest.join('.'), value) };
}

function readAtPath(node: Loose, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    return acc !== null && typeof acc === 'object' ? (acc as Loose)[key] : undefined;
  }, node);
}

/**
 * A node with every declared track replaced by its value at `time`.
 *
 * The returned object is a copy; the document is never touched. A node with no declared
 * tracks is returned as-is, so this costs nothing for the types that have none.
 */
export function resolveTracks<T extends { type: string }>(
  node: T,
  time: number,
  opts: { facts?: FactLookup } = {},
): Resolved<T> {
  const paths = trackPropsOf(node.type);
  if (paths.length === 0) return node as unknown as Resolved<T>;

  const fallbacks = trackFallbacksOf(node.type);
  let out = node as unknown as Loose;

  for (const path of paths) {
    const track = readAtPath(out, path);
    // Not a track: a document that predates this property, or one a plugin wrote loosely.
    // Leaving the plain value alone is right — it is already what the renderer wants.
    if (!isTrack(track)) continue;
    const value = evalTrack(track, time, {
      ...(opts.facts ? { facts: opts.facts } : {}),
      fallback: fallbacks[path] ?? 0,
    });
    out = setAtPath(out, path, value);
  }

  return out as unknown as Resolved<T>;
}
