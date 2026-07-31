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
export type PropertyRow =
  | {
      kind: 'number';
      min?: number;
      max?: number;
      step?: number;
      precision?: number;
      /** Shown after the field — `s`, `px`, `°`. Display only; the value is unitless. */
      unit?: string;
      /** Draw a slider beside the number. For bounded values people scrub rather than type. */
      slider?: boolean;
    }
  /** A `Track<number>`: the same control, plus the source pip that switches its kind (§04). */
  | { kind: 'track'; min: number; max: number; step?: number; precision?: number; unit?: string }
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
  | { kind: 'select'; options: readonly (string | { value: string; label: string })[]; optionsFrom?: undefined }
  | { kind: 'select'; optionsFrom: string; options?: undefined }
  | { kind: 'text'; multiline?: boolean; mono?: boolean; placeholder?: string };

export interface PropertyMeta {
  /** The key on the node. */
  prop: string;
  label: string;
  row: PropertyRow;
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
