import { conditionHolds, nodeTypeDef, patchAtPath, propsOf, valueAtPath } from '@geomotion/document';
import type { BoundFrom, DocNode, PropertyMeta, PropertyRow, Track } from '@geomotion/document';
import { BASEMAPS } from '@geomotion/map';
import { useStore } from '../store';
import { Color, Field, Num, Section, Select, Slider, Text, Toggle } from './ui';
import TrackedNumber from './TrackedNumber';
import { TrackWindowRow } from './TrackWindow';

/**
 * The inspector, generated from property metadata (ENGINEERING_GUIDE §3.4, §11).
 *
 * "Property metadata renders standard rows — number scrub, color, select, entity picker,
 * track-source pip — automatically. Custom property editors are exceptions living in `ui`,
 * never inline in feature code. *Why: 100 features × hand-built panels = drift; one
 * generator = consistency for free.*"
 *
 * This is that generator. What it draws today is the group, and any node type with no
 * hand-written panel — which is the case that matters for §15: a plugin's node type, or a
 * node from a newer build, gets a working inspector without the editor knowing anything
 * about it.
 *
 * Clouds and image are drawn from here. The remaining five layer types keep their
 * hand-written panels until their conversions land — text, shape, marker, then route and
 * regions, whose panels are half data-import flow. See docs/features/generated-panels.md.
 */
export default function SchemaRows({
  node,
  blocks,
}: {
  node: DocNode;
  /**
   * The bespoke content a section carries, by section title — §5.8's escape hatch, kept to
   * one mechanism and three positions.
   *
   * Every panel that survived conversion needed exactly these: a control in the **head**
   * that acts on the section rather than a field (marker's "Place"), an editor **before**
   * the rows that a row cannot be (image's file picker, route's point list), and a readout
   * **after** them derived from the values above (route's km/s). Without the positions the
   * conversions would have had to move things, and "no visible change" would stop being
   * true.
   */
  blocks?: Record<string, { head?: React.ReactNode; before?: React.ReactNode; after?: React.ReactNode }>;
}) {
  const notes = nodeTypeDef(node.type)?.sections ?? {};

  /*
   * Grouped by section over EVERY declared property, in declaration order, and only then
   * filtered down to the rows that draw.
   *
   * Grouping the filtered list instead would drop a section whose properties are all
   * `custom` — shape's GeoJSON is exactly that: one custom property and a bespoke editor
   * slotted in beside it. The section has to exist for the slot to have somewhere to land.
   */
  const groups: { title: string | undefined; rows: PropertyMeta[] }[] = [];
  for (const meta of propsOf(node.type)) {
    const last = groups[groups.length - 1];
    // A row whose condition fails is not drawn — the generated form of `{layer.border && …}`.
    const draws = !meta.custom && conditionHolds(node, meta.when);
    if (last && last.title === meta.section) {
      if (draws) last.rows.push(meta);
    } else {
      groups.push({ title: meta.section, rows: draws ? [meta] : [] });
    }
  }

  const sections = groups.filter(
    (g) => g.rows.length > 0 || (g.title !== undefined && blocks?.[g.title] !== undefined),
  );
  if (sections.length === 0) return null;

  return (
    <>
      {sections.map((section, i) => {
        const note = section.title === undefined ? undefined : notes[section.title];
        const block = section.title === undefined ? undefined : blocks?.[section.title];
        return (
          <Section
            key={section.title ?? `#${i}`}
            title={section.title ?? 'Properties'}
            {...(block?.head === undefined ? {} : { right: block.head })}
          >
            {note && <p className="hint">{note}</p>}
            {block?.before}
            {section.rows.map((meta) => (
              <Row key={meta.prop} node={node} meta={meta} />
            ))}
            {block?.after}
          </Section>
        );
      })}
    </>
  );
}

/**
 * The list a select offers.
 *
 * `optionsFrom` names a list this package owns and the document package cannot: basemap ids
 * live in `@geomotion/map`, and the dependency law points the other way (§2). An optional
 * property leads with "the project's own", which is what absent means — and picking it clears
 * the field rather than writing a value that pretends to be a choice.
 */
const SOURCES: Record<string, readonly { value: string; label: string }[]> = {
  basemap: BASEMAPS.map((b) => ({ value: b.id, label: b.name })),
};

function optionsOf(
  row: Extract<PropertyRow, { kind: 'select' }>,
  meta: PropertyMeta,
): readonly (string | { value: string; label: string })[] {
  const listed = row.options ?? SOURCES[row.optionsFrom ?? ''] ?? [];
  return meta.optional ? [{ value: '', label: 'Use the project’s' }, ...listed] : listed;
}

/**
 * One row.
 *
 * The switch is exhaustive over `PropertyRow['kind']`, which is the point of that union being
 * closed: a new row kind is a compile error here rather than a property that silently renders
 * nothing.
 */
function Row({ node, meta }: { node: DocNode; meta: PropertyMeta }) {
  const update = useStore((s) => s.updateLayer);
  const clearProp = useStore((s) => s.clearNodeProp);
  const duration = useStore((s) => s.project.duration);
  // A dotted prop addresses a field inside a nested object — `marker.size`, `follow.zoom`.
  const value = valueAtPath(node, meta.prop);
  /**
   * A bound the metadata could only name, resolved against the app.
   *
   * `optionsFrom` for numbers: the composition's duration is not knowable to
   * `@geomotion/document` when the declaration is evaluated at module load.
   */
  const bound = (from: BoundFrom | undefined, fallback: number | undefined) =>
    from === 'duration' ? duration : fallback;
  // Coalescing by property, so dragging one slider is one undo step and dragging two is two.
  const set = (v: unknown) => update(node.id, patchAtPath(node, meta.prop, v) as never, meta.prop);
  // An optional property is *removed* rather than blanked: absent is its meaning ("the
  // project's own"), and an empty string would be an override that happens to say nothing.
  const clear = () => clearProp(node.id, meta.prop);
  const row = meta.row;

  if (row.kind === 'track') {
    return (
      <TrackedNumber
        label={meta.label}
        layerId={node.id}
        prop={meta.prop}
        track={value as Track<number>}
        min={row.min}
        max={bound(row.maxFrom, row.max) ?? row.max}
        {...(row.step === undefined ? {} : { step: row.step })}
        {...(row.precision === undefined ? {} : { precision: row.precision })}
      />
    );
  }

  if (row.kind === 'window') {
    // `in` is where a restored window opens, so it lands over the layer's own span.
    const from = Number((node as unknown as Record<string, unknown>).in ?? 0);
    return (
      <TrackWindowRow
        label={meta.label}
        layerId={node.id}
        prop={meta.prop}
        track={value as Track<number>}
        from={from}
        max={bound(row.maxFrom, duration) ?? duration}
        {...(row.off === undefined ? {} : { off: row.off })}
        {...(row.switchable === undefined ? {} : { switchable: row.switchable })}
      />
    );
  }

  return (
    <Field label={meta.label} {...(meta.help ? { hint: meta.help } : {})}>
      {row.kind === 'number' &&
        (row.slider && row.min !== undefined && bound(row.maxFrom, row.max) !== undefined ? (
          <Slider
            value={Number(value)}
            onChange={set}
            min={row.min}
            max={bound(row.maxFrom, row.max) as number}
            {...(row.step === undefined ? {} : { step: row.step })}
            {...(row.precision === undefined ? {} : { precision: row.precision })}
          />
        ) : (
          <Num
            value={Number(value)}
            onChange={set}
            {...(row.min === undefined ? {} : { min: row.min })}
            {...(bound(row.maxFrom, row.max) === undefined ? {} : { max: bound(row.maxFrom, row.max) as number })}
            {...(row.step === undefined ? {} : { step: row.step })}
            {...(row.precision === undefined ? {} : { precision: row.precision })}
            {...(row.unit === undefined ? {} : { suffix: row.unit })}
          />
        ))}
      {row.kind === 'color' && <Color value={String(value ?? '')} onChange={set} />}
      {row.kind === 'toggle' && <Toggle value={value === true} onChange={set} />}
      {row.kind === 'select' && (
        <Select
          value={String(value ?? '')}
          // A `<select>` yields a string; some properties are stored as numbers.
          onChange={(v) => (v === '' ? clear() : set(row.numeric ? Number(v) : v))}
          options={optionsOf(row, meta)}
        />
      )}
      {row.kind === 'text' && (
        <Text
          value={String(value ?? '')}
          onChange={set}
          {...(row.multiline ? { multiline: true } : {})}
          {...(row.mono ? { mono: true } : {})}
          {...(row.placeholder === undefined ? {} : { placeholder: row.placeholder })}
        />
      )}
    </Field>
  );
}
