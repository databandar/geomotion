import { propsOf } from '@geomotion/document';
import type { DocNode, PropertyMeta, PropertyRow, Track } from '@geomotion/document';
import { BASEMAPS } from '@geomotion/map';
import { useStore } from '../store';
import { Color, Field, Num, Section, Select, Slider, Text, Toggle } from './ui';
import TrackedNumber from './TrackedNumber';

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
 * The seven layer types keep their hand-written panels for now. Their metadata is written
 * and tested (it is the same declaration their defaults come from), but each panel also
 * carries behaviour the row language cannot yet express — a bound that depends on the
 * composition's duration, a colour field that only appears when a backing is switched on, a
 * "use map centre" button beside a coordinate. Converting them is a milestone of its own, and
 * doing it in the same change as the registry would make a regression in either impossible to
 * attribute. See docs/features/schema-registry.md.
 */
export default function SchemaRows({ node }: { node: DocNode }) {
  const rows = propsOf(node.type).filter((meta) => !meta.custom);
  if (rows.length === 0) return null;

  // Grouped by section, in declaration order, so the metadata's order is the panel's order.
  const sections: { title: string | undefined; rows: PropertyMeta[] }[] = [];
  for (const meta of rows) {
    const last = sections[sections.length - 1];
    if (last && last.title === meta.section) last.rows.push(meta);
    else sections.push({ title: meta.section, rows: [meta] });
  }

  return (
    <>
      {sections.map((section, i) => (
        <Section key={section.title ?? `#${i}`} title={section.title ?? 'Properties'}>
          {section.rows.map((meta) => (
            <Row key={meta.prop} node={node} meta={meta} />
          ))}
        </Section>
      ))}
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
  const value = (node as unknown as Record<string, unknown>)[meta.prop];
  // Coalescing by property, so dragging one slider is one undo step and dragging two is two.
  const set = (v: unknown) => update(node.id, { [meta.prop]: v } as never, meta.prop);
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
        max={row.max}
        {...(row.step === undefined ? {} : { step: row.step })}
        {...(row.precision === undefined ? {} : { precision: row.precision })}
      />
    );
  }

  return (
    <Field label={meta.label} {...(meta.help ? { hint: meta.help } : {})}>
      {row.kind === 'number' &&
        (row.slider && row.min !== undefined && row.max !== undefined ? (
          <Slider
            value={Number(value)}
            onChange={set}
            min={row.min}
            max={row.max}
            {...(row.step === undefined ? {} : { step: row.step })}
            {...(row.precision === undefined ? {} : { precision: row.precision })}
          />
        ) : (
          <Num
            value={Number(value)}
            onChange={set}
            {...(row.min === undefined ? {} : { min: row.min })}
            {...(row.max === undefined ? {} : { max: row.max })}
            {...(row.step === undefined ? {} : { step: row.step })}
            {...(row.precision === undefined ? {} : { precision: row.precision })}
            {...(row.unit === undefined ? {} : { suffix: row.unit })}
          />
        ))}
      {row.kind === 'color' && <Color value={String(value ?? '')} onChange={set} />}
      {row.kind === 'toggle' && <Toggle value={value === true} onChange={set} />}
      {row.kind === 'select' && (
        <Select value={String(value ?? '')} onChange={(v) => (v === '' ? clear() : set(v))} options={optionsOf(row, meta)} />
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
