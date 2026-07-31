/**
 * Format 1 → 2: the first property track, and `version` becomes `format`.
 *
 * Two changes, both required by ENGINEERING_GUIDE §3.6.
 *
 * **`version` → `format`.** §3.6.1 names the field `format`. The old name is *removed*
 * here rather than left alongside, because §3.6.4 forbids two fields meaning the same
 * thing — a document carrying both would let two readers disagree about which is
 * authoritative.
 *
 * **`MarkerLayer.size` becomes a `Track<number>`.** The first property to move onto the
 * substrate ARCHITECTURE §04 requires for all of them. A plain `8` becomes
 * `{ kind: 'static', value: 8 }`: the same value, said in the form that can also hold
 * keyframes, so a marker can grow.
 *
 * Marker size first because it is a plain scalar the renderer already reads per frame,
 * it is something people obviously want to animate, and it collides with none of the
 * bespoke tween fields that a later milestone folds in — so the pattern is established
 * without also arguing about `fade` and `pop`.
 */

/** Only what this step reads; the rest of the document passes through untouched. */
interface LooseLayer {
  type?: unknown;
  size?: unknown;
  [key: string]: unknown;
}

export function migrate1to2(doc: Record<string, unknown>): Record<string, unknown> {
  const out = { ...doc };
  delete out.version;

  const layers = Array.isArray(out.layers) ? (out.layers as LooseLayer[]) : [];
  out.layers = layers.map((layer) => {
    if (!layer || typeof layer !== 'object' || layer.type !== 'marker') return layer;

    /*
     * Only a finite number is converted. That covers three cases at once, which is why
     * there is no separate guard for each:
     *
     * - a track already (an object) is left alone, so re-running the chain over its own
     *   output cannot wrap it twice;
     * - a size that is nonsense is left for the type repair that runs after the chain,
     *   because fixing it here would mean this step knowing the default — and the
     *   default belongs to the schema, not to a migration;
     * - NaN and Infinity are `typeof number` and would otherwise pass.
     */
    const size = layer.size;
    if (typeof size !== 'number' || !Number.isFinite(size)) return layer;

    return { ...layer, size: { kind: 'static', value: size } };
  });

  return out;
}
