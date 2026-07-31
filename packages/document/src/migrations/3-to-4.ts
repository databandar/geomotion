import { createId } from '@geomotion/core';

/**
 * Format 3 → 4: a marker's `pop` boolean becomes a behaviour stack.
 *
 * `pop` was a rule rather than an authored value — `overshoot(local / 0.55)` with its
 * constants written into the evaluator, so every marker in every project popped
 * identically and it could be neither retimed nor combined. §06 makes it an entry in an
 * ordered list you can toggle.
 *
 * `pulse` stays where it was. A stack belongs to a property, and pulse does not modify
 * scale — it draws a ring. Moving it here made the marker itself throb, which is a
 * different picture from the one the project had, and a migration that changes the
 * picture is a migration doing the wrong thing.
 *
 * The entry is written even when `pop` was off, so the stack shows what is available
 * rather than only what happened to be on: a switch nobody can see is a feature nobody
 * finds.
 */

interface LooseLayer {
  type?: unknown;
  [key: string]: unknown;
}

export function migrate3to4(doc: Record<string, unknown>): Record<string, unknown> {
  const out = { ...doc };
  const layers = Array.isArray(out.layers) ? (out.layers as LooseLayer[]) : [];

  out.layers = layers.map((layer) => {
    if (!layer || typeof layer !== 'object' || layer.type !== 'marker') return layer;
    if ('behaviours' in layer) return layer;

    const next: LooseLayer = {
      ...layer,
      behaviours: [{ id: createId(), type: 'pop', enabled: layer.pop !== false }],
    };
    delete next.pop;
    return next;
  });

  return out;
}
