/**
 * A MapLibre stand-in that records what was asked of it.
 *
 * `syncScene` is the one place in the app that mutates GL state, and it is the hardest
 * to see: its output is not a value but a sequence of calls into a live map. The golden
 * harness proves the pixels come out right, but only on this machine, and it cannot say
 * *why* — a sync that re-uploads every source on every frame renders identically to one
 * that does not.
 *
 * So this records the calls instead. It implements only what `syncScene` touches, and
 * deliberately keeps its own source/layer registry so the "does this already exist"
 * branches are exercised for real rather than stubbed to a constant.
 */

export interface FakeSource {
  id: string;
  data: unknown;
  /** Every payload handed to `setData`, so a redundant re-upload is visible. */
  writes: unknown[];
}

export interface Call {
  op: 'addSource' | 'removeSource' | 'addLayer' | 'removeLayer' | 'setPaint' | 'setLayout' | 'setData';
  id: string;
  prop?: string;
  value?: unknown;
}

/** Properties this app sets that MapLibre classifies as paint, not layout. */
const PAINT_PROPS = new Set([
  'line-dasharray',
  'line-color',
  'line-width',
  'line-opacity',
  'line-blur',
  'fill-color',
  'fill-opacity',
  'fill-outline-color',
  'fill-extrusion-color',
  'fill-extrusion-height',
  'fill-extrusion-opacity',
]);

export class FakeMap {
  readonly calls: Call[] = [];
  private readonly sources = new Map<string, FakeSource>();
  private readonly layers = new Map<string, unknown>();
  private styleLoaded = true;

  /** Forget the call log but keep the map's state — one frame's worth of calls. */
  flush(): Call[] {
    const out = [...this.calls];
    this.calls.length = 0;
    return out;
  }

  /** Calls of one kind, in order. */
  ops(op: Call['op']): Call[] {
    return this.calls.filter((c) => c.op === op);
  }

  setStyleLoaded(v: boolean) {
    this.styleLoaded = v;
  }

  isStyleLoaded() {
    return this.styleLoaded;
  }

  getStyle() {
    return { sources: Object.fromEntries([...this.sources].map(([id, s]) => [id, s])) };
  }

  getSource(id: string) {
    const s = this.sources.get(id);
    if (!s) return undefined;
    return {
      setData: (data: unknown) => {
        s.data = data;
        s.writes.push(data);
        this.calls.push({ op: 'setData', id });
      },
    };
  }

  addSource(id: string, spec: { data?: unknown }) {
    this.sources.set(id, { id, data: spec.data, writes: [] });
    this.calls.push({ op: 'addSource', id });
  }

  removeSource(id: string) {
    // Real MapLibre throws if a layer still points at the source, and `syncScene`
    // catches that deliberately — so the fake has to throw too, or the catch is dead
    // code in every test.
    for (const spec of this.layers.values()) {
      if ((spec as { source?: string }).source === id) {
        throw new Error(`source "${id}" is still in use`);
      }
    }
    this.sources.delete(id);
    this.calls.push({ op: 'removeSource', id });
  }

  getLayer(id: string) {
    return this.layers.get(id);
  }

  /**
   * `beforeId` inserts *beneath* that layer, as MapLibre does, and throws on an
   * unknown one — the fake has to keep both halves of that contract or a test cannot
   * tell correct stacking from accidental stacking.
   */
  addLayer(spec: { id: string; source?: string }, beforeId?: string) {
    if (beforeId !== undefined && !this.layers.has(beforeId)) {
      throw new Error(`The layer "${beforeId}" does not exist in the map's style.`);
    }
    if (beforeId === undefined) {
      this.layers.set(spec.id, spec);
    } else {
      // Rebuild in order: a Map preserves insertion order and has no way to splice.
      const rebuilt = new Map<string, unknown>();
      for (const [id, v] of this.layers) {
        if (id === beforeId) rebuilt.set(spec.id, spec);
        rebuilt.set(id, v);
      }
      this.layers.clear();
      for (const [id, v] of rebuilt) this.layers.set(id, v);
    }
    this.calls.push({ op: 'addLayer', id: spec.id });
  }

  removeLayer(id: string) {
    this.layers.delete(id);
    this.calls.push({ op: 'removeLayer', id });
  }

  setPaintProperty(id: string, prop: string, value: unknown) {
    this.calls.push({ op: 'setPaint', id, prop, value });
  }

  setLayoutProperty(id: string, prop: string, value: unknown) {
    // MapLibre rejects a paint property sent to the layout setter, and this fake used
    // to accept it — which is how `line-dasharray` reached the layout API for as long
    // as it did. Only the properties this app sets are listed; the point is to fail the
    // same way the real map does, not to reimplement the style spec.
    if (PAINT_PROPS.has(prop)) {
      throw new Error(`${prop} is a PAINT property not a LAYOUT property. Use get/setPaintProperty instead?`);
    }
    this.calls.push({ op: 'setLayout', id, prop, value });
  }

  /** Ids of everything currently on the map, for asserting on teardown. */
  state() {
    return { sources: [...this.sources.keys()].sort(), layers: [...this.layers.keys()].sort() };
  }

  /** Layers bottom to top, which is the order they draw in. */
  order(): string[] {
    return [...this.layers.keys()];
  }
}
