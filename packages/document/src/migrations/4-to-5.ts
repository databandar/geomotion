import { createId } from '@geomotion/core';

/**
 * Format 4 → 5: behaviour stacks are keyed by the property they modify.
 *
 * Format 4 put one list on the layer and applied it to scale. That held only while there
 * was a single behaviour in existence; the moment `pulse` was added it had nowhere
 * correct to go, because it draws a ring rather than changing a size. §06's pipeline is
 * per property, and this is that shape.
 *
 * `pulse` comes back as a behaviour here rather than staying a boolean. It always was
 * one — a continuous oscillation with no last keyframe to write — it simply needed its
 * own channel.
 */

interface LooseLayer {
  type?: unknown;
  [key: string]: unknown;
}

export function migrate4to5(doc: Record<string, unknown>): Record<string, unknown> {
  const out = { ...doc };
  const layers = Array.isArray(out.layers) ? (out.layers as LooseLayer[]) : [];

  out.layers = layers.map((layer) => {
    if (!layer || typeof layer !== 'object' || layer.type !== 'marker') return layer;
    // Already keyed: an object rather than the format-4 array.
    if (layer.behaviours && !Array.isArray(layer.behaviours)) return layer;

    const scale = Array.isArray(layer.behaviours)
      ? layer.behaviours
      : [{ id: createId(), type: 'pop', enabled: true }];

    const next: LooseLayer = {
      ...layer,
      behaviours: {
        scale,
        ring: [{ id: createId(), type: 'pulse', enabled: layer.pulse === true }],
      },
    };
    delete next.pulse;
    return next;
  });

  return out;
}
