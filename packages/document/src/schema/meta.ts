/**
 * The node-type registry — ENGINEERING_GUIDE §3.4.
 *
 * "Each node type registers: a zod schema for its props, **property metadata** (label, unit,
 * min/max/step, inspector row kind), and **defaults**. One module per node type in the
 * owning package. The schema-driven inspector reads this metadata; a property without
 * metadata does not appear in the UI — that is intentional pressure to document properties."
 *
 * Two things were previously written down twice, in two places that could disagree:
 *
 * - **Defaults** lived in one big `switch` in project.ts, and the load repair read them back
 *   out of a freshly constructed layer. That worked, but a new node type meant editing a
 *   switch in a file that already knew about seven others.
 * - **How a property is edited** lived in the inspector — 1,600 lines of hand-written rows,
 *   where a control's range, step, unit and label are typed out beside each field. Nothing
 *   related the two, so a property could be added to the model and never appear in the UI,
 *   or appear with a range nothing enforced.
 *
 * Registering both together is what lets a plugin (§15) or an AI proposal (§12) contribute a
 * node type that the editor can already show, without either of them touching the inspector.
 *
 * **Not zod, yet.** §3.4 names zod for boundary validation; this package already validates at
 * the load boundary by checking each field against the *type of its default*
 * (`coerceToDefaults`, "the defaults are the schema"), which is tested and covers the shapes
 * a file can arrive in. Adding a second description of the same fields — one to validate and
 * one to repair — is how they drift. Zod arrives with the plugin boundary, where input is
 * genuinely untrusted and the failure has to be an error rather than a repair, and it comes
 * with the ADR §13 requires for a new dependency.
 */
import type { DocNode } from '../nodes.ts';

/**
 * How a property is edited.
 *
 * A closed union rather than a free string: the inspector switches on it exhaustively, so
 * adding a row kind is a compile error at the one place that draws them rather than a
 * property that silently renders nothing.
 */
/**
 * A bound the registry cannot know when the metadata is declared.
 *
 * The same idiom as `optionsFrom` below, for the same reason: metadata is a static
 * declaration evaluated once at module load, and the composition's duration is neither
 * static nor knowable to this package at that moment. The metadata names the source; the app
 * resolves it. Naming it rather than passing a function is also what lets a plugin's
 * contribution survive being structured-cloned across the worker boundary (§15).
 */
export type BoundFrom = 'duration';

export type PropertyRow =
  | {
      kind: 'number';
      min?: number;
      max?: number;
      /** Overrides `max` when the app can resolve it. */
      maxFrom?: BoundFrom;
      step?: number;
      precision?: number;
      /** Shown after the field — `s`, `px`, `°`. Display only; the value is unitless. */
      unit?: string;
      /** Draw a slider beside the number. For bounded values people scrub rather than type. */
      slider?: boolean;
    }
  /** A `Track<number>`: the same control, plus the source pip that switches its kind (§04). */
  | {
      kind: 'track';
      min: number;
      max: number;
      maxFrom?: BoundFrom;
      step?: number;
      precision?: number;
      unit?: string;
    }
  /**
   * A `Track<number>` edited as a **window** — start, end, easing — with a derived enable
   * toggle above it.
   *
   * `switchable` adds the enable toggle above it. "Enabled" is not stored: a property that
   * never moves is a flat static track, so the toggle reads the track's kind and writing it
   * either restores a window over the layer's span or collapses the track to a constant.
   *
   * Not every window can be switched off, which is why it is opt-in. A cloud that never
   * parts is a legitimate cloud; a route that never reveals is just an invisible route, so
   * its panel offered the window and no toggle. Defaulting the toggle on would have added a
   * control to route's Reveal section that was never there.
   */
  | { kind: 'window'; maxFrom?: BoundFrom; off?: number; switchable?: boolean }
  | { kind: 'color' }
  | { kind: 'toggle' }
  /**
   * A choice from a fixed list, or from one the app supplies.
   *
   * `optionsFrom` exists because some lists do not belong to this package: basemap ids live
   * in `@geomotion/map` and colour ramps in `core`, and the dependency law (§2) points the
   * other way. The metadata names the source; the app resolves it. That keeps the
   * description here complete without dragging the registry up the graph.
   */
  /**
   * `numeric` is why a select needs to say more than its options.
   *
   * A `<select>` yields a string, and text's `weight` is stored as a number — the
   * hand-written panel wrote `parseInt(w, 10)` on the way out. A generated row that skipped
   * that would put `'700'` where the renderer expects `700`: valid JSON, wrong type, and
   * nothing between here and the canvas would say so.
   */
  | {
      kind: 'select';
      options: readonly (string | { value: string; label: string })[];
      optionsFrom?: undefined;
      numeric?: boolean;
    }
  | { kind: 'select'; optionsFrom: string; options?: undefined; numeric?: boolean }
  | { kind: 'text'; multiline?: boolean; mono?: boolean; placeholder?: string };

/**
 * Draw a row only when a sibling property says so.
 *
 * Declarative rather than a predicate function, for the reason `BoundFrom` is a name: §15
 * sends a plugin's node-type contribution across a worker boundary, and a function does not
 * survive being structured-cloned. Everything the shipped panels expressed with
 * `{layer.border && …}` fits in a path and a comparison.
 *
 * `prop` accepts a dotted path so a row can depend on the *kind* of a track
 * (`clear.kind`), not only on a leaf value.
 */
export interface RowCondition {
  /** `'border'`, or a dotted path like `'clear.kind'`. */
  prop: string;
  /** Draw when the value equals this. Defaults to `true` when neither is given. */
  equals?: unknown;
  /** Draw when the value does NOT equal this. */
  not?: unknown;
}

/**
 * Resolve a dotted path against a node. Exported so the inspector and its tests agree on
 * what a condition means, rather than each implementing the lookup.
 */
export function valueAtPath(node: unknown, path: string): unknown {
  let cursor: unknown = node;
  for (const key of path.split('.')) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

/**
 * A patch that sets `path`, keeping every sibling along the way.
 *
 * Route's `marker` and `follow` are objects the evaluator reads whole, so a row on
 * `marker.size` has to write `{ marker: { …marker, size } }`. Writing `{ size }` would put a
 * stray top-level field on the layer and leave the marker unchanged — valid JSON, no error,
 * nothing drawn differently.
 */
export function patchAtPath(node: unknown, path: string, value: unknown): Record<string, unknown> {
  const [head, ...rest] = path.split('.');
  if (!head) return {};
  if (rest.length === 0) return { [head]: value };
  const child = (node as Record<string, unknown> | null)?.[head];
  const base = child !== null && typeof child === 'object' ? child : {};
  return { [head]: { ...base, ...patchAtPath(base, rest.join('.'), value) } };
}

/** Whether a conditional row should be drawn for this node. No condition means always. */
export function conditionHolds(node: unknown, when: RowCondition | undefined): boolean {
  if (!when) return true;
  const value = valueAtPath(node, when.prop);
  if (when.not !== undefined) return value !== when.not;
  return value === (when.equals === undefined ? true : when.equals);
}

export interface PropertyMeta {
  /** The key on the node. */
  prop: string;
  label: string;
  row: PropertyRow;
  /**
   * Draw this row only when the condition holds.
   *
   * The generated equivalent of a panel's `{layer.border && <Field …>}` — a border colour
   * with no border is a control for nothing.
   */
  when?: RowCondition;
  /** Which inspector section it belongs under. Rows with no section come first. */
  section?: string;
  /** Hover help. Where a property has a reason to exist, this is where it is written down. */
  help?: string;
  /**
   * Absent is a meaning, not a gap.
   *
   * A map context's `basemap` left unset means "the project's own", which is why a fresh one
   * carries none of its settings. Saying so here is what lets the coverage test keep its
   * grip — a described property that is missing from a fresh node is otherwise
   * indistinguishable from one that was renamed — and what lets the generated inspector offer
   * "use the project's" rather than an empty control.
   */
  optional?: boolean;
  /**
   * This property has a bespoke editor and the generated inspector must skip it.
   *
   * Declared rather than omitted, so "no row" is a decision on the record instead of an
   * oversight. The coverage test reads it: every field of every node type is either
   * described here or explicitly marked custom.
   */
  custom?: boolean;
}

export interface NodeTypeDef {
  /** The `type` discriminator stored in the document. */
  type: string;
  /** What this kind of node is called in the UI — "Choropleth layer", "Group". */
  kind: string;
  /** A fresh node of this type, placed at `at` seconds. Its fields *are* the defaults. */
  create: (at: number) => DocNode;
  props: PropertyMeta[];
  /**
   * The explanatory note a section carries above its rows, keyed by section title.
   *
   * Several hand-written panels opened a section with a sentence saying what the thing is
   * for — "Drifting cover for an opening shot" — and the generator had nowhere to read one
   * from, so converting a panel would have silently dropped it.
   */
  sections?: Record<string, string>;
}

const registry = new Map<string, NodeTypeDef>();

/**
 * Register a node type.
 *
 * Idempotent by design: re-registering the same type replaces it, because a module re-entered
 * by a dev-server reload must not double-register or throw. A *different* definition claiming
 * a type someone already registered is a programming error and throws — that is a plugin
 * shadowing a core node type, which §15 forbids.
 */
export function registerNodeType(def: NodeTypeDef): void {
  const existing = registry.get(def.type);
  if (existing && existing !== def && existing.kind !== def.kind) {
    throw new Error(`node type "${def.type}" is already registered as "${existing.kind}"`);
  }
  registry.set(def.type, def);
}

export function nodeTypeDef(type: string): NodeTypeDef | undefined {
  return registry.get(type);
}

/** Every registered type, in registration order. */
export function nodeTypes(): NodeTypeDef[] {
  return [...registry.values()];
}

/**
 * The property metadata for a type, or an empty list for one nobody registered.
 *
 * Empty rather than a throw: an unknown type reaching the inspector means a document from a
 * newer build, and showing a node with no rows is better than a panel that crashes.
 */
export function propsOf(type: string): PropertyMeta[] {
  return registry.get(type)?.props ?? [];
}

/** A fresh node of `type`, or nothing if that type is not registered. */
export function createNode(type: string, at = 0): DocNode | undefined {
  return registry.get(type)?.create(at);
}

/**
 * The paths this type stores as a `Track` — §04's "every property is a track", as a list.
 *
 * The registry already says which properties are animatable, in the row kind that draws
 * them. Deriving the list here rather than keeping a second one is the rule the registry
 * exists for: the evaluator resolves exactly what the inspector offers to keyframe, and a
 * property added to one cannot go missing from the other.
 *
 * `window` counts — it is a `Track<number>` with a different skin, not different storage.
 */
export function trackPropsOf(type: string): string[] {
  return propsOf(type)
    .filter((m) => m.row.kind === 'track' || m.row.kind === 'window')
    .map((m) => m.prop);
}

/**
 * What each of a type's tracked properties resolves to when its track cannot produce a
 * value — an empty key list, a `bound` whose fact is missing, an expression that failed.
 *
 * The type's own defaults, not zero. Zero is a real and wrong value for `scale`, `opacity`
 * and `size` alike: a region with no figure would render as the bottom of the scale,
 * indistinguishable from a genuine low, which is the failure the "no data" colour exists to
 * prevent.
 *
 * Memoised because `create` mints an id and advances the layer-colour cursor; this asks each
 * type for one node, once, and keeps it.
 */
const fallbacks = new Map<string, Record<string, number>>();

export function trackFallbacksOf(type: string): Record<string, number> {
  const cached = fallbacks.get(type);
  if (cached) return cached;

  const fresh = registry.get(type)?.create(0);
  const out: Record<string, number> = {};
  for (const path of trackPropsOf(type)) {
    const track = valueAtPath(fresh, path) as { kind?: string; value?: unknown } | undefined;
    // A fresh node's track is `static` by construction, so its value is the default.
    out[path] = typeof track?.value === 'number' ? track.value : 0;
  }
  fallbacks.set(type, out);
  return out;
}
