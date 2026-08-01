import { beforeEach, describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { conditionHolds, createLayer, projectWith, propsOf, restValue, staticTrack, windowOf, type Layer } from '@geomotion/document';
import { useStore } from '../store';
import Inspector from './Inspector';

/**
 * Clouds and image, generated (docs/features/generated-panels.md).
 *
 * The conversion's claim is *like-for-like*: the same sections, labels, controls and ranges
 * the hand-written panels drew. So these tests are written against what those panels showed
 * — they would have passed before the change, and they pass after it. That is the only kind
 * of test that can prove a conversion did nothing visible.
 *
 * The ranges asserted below are the shipped ones, which for four of them is *not* what the
 * metadata used to declare. Locking them here is what stops the two descriptions drifting
 * apart again now that there is only one of them.
 */

function fieldsIn(section: string): HTMLElement[] {
  const heads = [...document.querySelectorAll('.section')];
  const target = heads.find((s) => s.querySelector('.section-head')?.textContent?.trim().startsWith(section));
  if (!target) throw new Error(`no section called ${section}`);
  return [...target.querySelectorAll('.field')] as HTMLElement[];
}

const labelsIn = (section: string) =>
  fieldsIn(section).map((f) => f.querySelector('.field-label')?.textContent?.trim().replace(/\s+/g, ' ') ?? '');

function control(label: string): HTMLElement {
  const field = [...document.querySelectorAll('.field')].find((f) =>
    f.querySelector('.field-label')?.textContent?.trim().startsWith(label),
  );
  const el = field?.querySelector('input, select, textarea, button');
  if (!el) throw new Error(`no control labelled ${label}`);
  return el as HTMLElement;
}

const has = (label: string) =>
  [...document.querySelectorAll('.field')].some((f) =>
    f.querySelector('.field-label')?.textContent?.trim().startsWith(label),
  );

function select(layer: Layer, duration = 20) {
  useStore.setState({
    project: { ...projectWith([layer]), duration },
    selection: { kind: 'layer', id: layer.id },
    also: [],
    time: 0,
  });
}

const node = (id: string) => useStore.getState().project.nodes[id] as unknown as Record<string, unknown>;

describe('the clouds panel, generated', () => {
  let layer: Layer;
  beforeEach(() => {
    layer = createLayer('clouds', 0);
    select(layer);
  });

  it('draws the same sections, in the same order, as the panel it replaced', () => {
    render(<Inspector />);
    expect(labelsIn('Clouds')).toEqual(['Coverage', 'Formation size', 'Colour', 'Opacity']);
    expect(labelsIn('Drift')).toEqual(['Speed', 'Direction']);
  });

  it('keeps the section notes the hand-written panel opened with', () => {
    render(<Inspector />);
    const notes = [...document.querySelectorAll('.hint')].map((n) => n.textContent ?? '');
    expect(notes.some((n) => n.startsWith('Drifting cover for an opening shot'))).toBe(true);
    expect(notes.some((n) => n.startsWith('The cloud parts from the centre outward'))).toBe(true);
  });

  it('scrubs coverage over the range that shipped, not the one the metadata used to claim', () => {
    // The panel allowed 1.4; the metadata said 1. Over-cover is a real look, so the panel won.
    render(<Inspector />);
    expect(control('Coverage').getAttribute('max')).toBe('1.4');
    expect(control('Formation size').getAttribute('min')).toBe('0.3');
    expect(control('Formation size').getAttribute('max')).toBe('3');
    expect(control('Speed').getAttribute('max')).toBe('120');
  });

  it('writes a value back to the document', () => {
    render(<Inspector />);
    fireEvent.change(control('Coverage'), { target: { value: '1.25' } });
    // A track since format 9; the round trip under test is unchanged.
    expect(restValue(node(layer.id).coverage as never)).toBe(1.25);
  });

  it('bounds the clearing window by the composition, not by a constant', () => {
    /*
     * `maxFrom: 'duration'` — the metadata names the source, the app resolves it.
     *
     * Asserted through the clamp rather than a `max` attribute: `Num` bounds on commit and
     * never writes one to the DOM, so an attribute check would pass vacuously against any
     * bound at all, including none.
     */
    const cloud = createLayer('clouds', 0);
    select(cloud, 42);
    render(<Inspector />);

    fireEvent.change(control('End'), { target: { value: '999' } });

    expect(windowOf(node(cloud.id).clear as never)!.to).toBe(42);
  });
});

describe('the clearing window', () => {
  it('is enabled for a fresh cloud, which parts by default', () => {
    const layer = createLayer('clouds', 0);
    select(layer);
    render(<Inspector />);
    expect(has('Start')).toBe(true);
    expect(has('End')).toBe(true);
    expect(has('Easing')).toBe(true);
  });

  it('collapses to a flat track when switched off, and the window fields go with it', async () => {
    const layer = createLayer('clouds', 0);
    select(layer);
    render(<Inspector />);

    await userEvent.click(control('Enabled'));

    expect((node(layer.id).clear as { kind: string }).kind).toBe('static');
    expect(has('Start'), 'the window fields should not outlive the window').toBe(false);
  });

  it('restores a window over the layer s own span when switched back on', async () => {
    // The toggle is derived, never stored: off is a flat track, on is a window.
    const layer = { ...createLayer('clouds', 0), in: 6, clear: staticTrack(0) } as Layer;
    select(layer);
    render(<Inspector />);

    await userEvent.click(control('Enabled'));

    const w = windowOf(node(layer.id).clear as never);
    expect(w, 'switching on should produce a real window').toBeTruthy();
    expect(w!.from).toBeGreaterThanOrEqual(6);
  });
});

describe('the image panel, generated', () => {
  let layer: Layer;
  beforeEach(() => {
    layer = createLayer('image', 0);
    select(layer);
  });

  it('keeps the file picker inside the Image section rather than growing a second heading', () => {
    render(<Inspector />);
    const headings = [...document.querySelectorAll('.section-head')]
      .map((h) => h.textContent?.trim() ?? '')
      .filter((t) => t.startsWith('Image'));
    expect(headings).toHaveLength(1);
    expect(labelsIn('Image')).toEqual(['Source', 'Caption', 'Animation']);
  });

  it('draws placement and style as the panel it replaced did', () => {
    render(<Inspector />);
    expect(labelsIn('Placement')).toEqual(['X', 'Y', 'Width', 'Anchor']);
    // Border colour is present because a fresh image ships with its border on.
    expect(labelsIn('Style')).toEqual(['Opacity', 'Corner radius', 'Border', 'Border colour', 'Shadow']);
  });

  it('uses the ranges and step the panel shipped', () => {
    render(<Inspector />);
    expect(control('Width').getAttribute('min')).toBe('0.05');
    expect(control('X').getAttribute('step')).toBe('0.005');
  });

  it('offers the animation names the panel showed, not the internal ones', () => {
    // The metadata said "Ken Burns"; users were reading "Slow push in".
    render(<Inspector />);
    const options = [...(control('Animation') as HTMLSelectElement).options].map((o) => o.textContent);
    expect(options).toEqual(['Slow push in', 'Fade', 'Slide up', 'None']);
  });

  it('hides the border colour when the border is switched off', async () => {
    render(<Inspector />);
    expect(has('Border colour')).toBe(true);

    await userEvent.click(control('Border'));

    expect(node(layer.id).border).toBe(false);
    expect(has('Border colour'), 'a border colour with no border is a control for nothing').toBe(false);
  });

  it('still writes the source through its bespoke editor', () => {
    render(<Inspector />);
    fireEvent.change(control('Source'), { target: { value: 'https://example.org/a.png' } });
    expect(node(layer.id).src).toBe('https://example.org/a.png');
  });
});

describe('the text panel, generated', () => {
  let layer: Layer;
  beforeEach(() => {
    layer = createLayer('text', 0);
    select(layer);
  });

  it('draws the same sections, in the same order, as the panel it replaced', () => {
    render(<Inspector />);
    expect(labelsIn('Text')).toEqual(['Content', 'Animation']);
    expect(labelsIn('Style')).toEqual(['Size', 'Weight', 'Colour', 'Tracking', 'Align', 'Backing']);
    expect(labelsIn('Position')).toEqual(['X', 'Y']);
  });

  it('writes weight back as a number, not as the string the select yields', async () => {
    /*
     * The failure this exists for is silent: `<select>` gives '600', the renderer wants 600,
     * and a document carrying the string is valid JSON that draws the wrong weight. The
     * hand-written panel called parseInt; `numeric: true` is how the declaration says so.
     */
    render(<Inspector />);
    await userEvent.selectOptions(control('Weight'), '600');
    expect(node(layer.id).weight).toBe(600);
    expect(typeof node(layer.id).weight).toBe('number');
  });

  it('scrubs position in the fine step the panel shipped', () => {
    render(<Inspector />);
    expect(control('X').getAttribute('step')).toBe('0.001');
  });

  it('shows the backing colour only once there is a backing', async () => {
    render(<Inspector />);
    expect(has('Backing colour'), 'a fresh title has no backing').toBe(false);

    await userEvent.click(control('Backing'));

    expect(node(layer.id).background).toBe(true);
    expect(has('Backing colour')).toBe(true);
  });
});

describe('the shape panel, generated', () => {
  let layer: Layer;
  beforeEach(() => {
    layer = createLayer('shape', 0);
    select(layer);
  });

  it('keeps the GeoJSON editor and its loader in one section', () => {
    render(<Inspector />);
    const heads = [...document.querySelectorAll('.section-head')].map((h) => h.textContent?.trim() ?? '');
    expect(heads.filter((t) => t.startsWith('GeoJSON'))).toHaveLength(1);
    // Drawn without a field label — the value is a document, not a setting.
    expect(document.querySelector('textarea')).toBeTruthy();
    expect([...document.querySelectorAll('button')].some((b) => b.textContent?.includes('Load file'))).toBe(true);
  });

  it('draws style in the panel s order, with trace and extrude under it', () => {
    render(<Inspector />);
    expect(labelsIn('Style')).toEqual([
      'Fill',
      'Fill opacity',
      'Outline',
      'Outline width',
      'Trace outline',
      'Extrude 3D',
    ]);
  });

  it('allows the 16px outline the panel shipped, not the 12 this table declared', () => {
    render(<Inspector />);
    expect(control('Outline width').getAttribute('max')).toBe('16');
  });

  it('hides the extrusion height until the shape is extruded', async () => {
    render(<Inspector />);
    expect(has('Height')).toBe(false);

    await userEvent.click(control('Extrude 3D'));

    expect(node(layer.id).extrude).toBe(true);
    expect(has('Height')).toBe(true);
  });
});

describe('the marker panel, generated', () => {
  let layer: Layer;
  beforeEach(() => {
    layer = createLayer('marker', 0);
    select(layer);
  });

  it('draws the same four sections, in the panel s order', () => {
    render(<Inspector />);
    // The title lives on the collapse toggle; a header action sits beside it in the head.
    const titles = [...document.querySelectorAll('.section-toggle')].map((t) => t.textContent?.trim() ?? '');
    expect(titles.filter((t) => ['Marker', 'Style', 'Behaviours', 'Label'].includes(t))).toEqual([
      'Marker',
      'Style',
      'Behaviours',
      'Label',
    ]);
  });

  it('keeps Place in the section heading rather than moving it into a row', () => {
    // A section-level action: it puts the editor into map-click mode, not one field.
    render(<Inspector />);
    const head = [...document.querySelectorAll('.section-head')].find((h) =>
      h.textContent?.trim().startsWith('Marker'),
    );
    // The first button in a head is the collapse toggle, which carries the title.
    expect(head?.querySelector('button:not(.section-toggle)')?.textContent).toBe('Place');
  });

  it('edits the coordinate as a pair, with the map actions beside it', () => {
    render(<Inspector />);
    expect(has('Longitude')).toBe(true);
    expect(has('Latitude')).toBe(true);
    const labels = [...document.querySelectorAll('button')].map((b) => b.textContent);
    expect(labels).toContain('Use map centre');
    expect(labels).toContain('Go to');
  });

  it('lists every behaviour in the stack, enabled or not', () => {
    // "A switch you cannot see is a feature nobody finds" — pop is on, pulse is off.
    render(<Inspector />);
    expect(has('Pop in')).toBe(true);
    expect(has('Pulse')).toBe(true);
  });

  it('still allows a label above the dot, which a floor of 0 would have removed', () => {
    // The metadata declared min 0; the panel shipped -80. This is the functional drift.
    render(<Inspector />);
    expect(control('Offset').getAttribute('min')).toBe('-80');
    expect(control('Size').getAttribute('max')).toBe('40'); // marker size, first in Style
  });

  it('sizes a label to the 120 the panel shipped, not the 48 this table declared', () => {
    render(<Inspector />);
    const labelSize = fieldsIn('Label')[1]?.querySelector('input');
    expect(labelSize?.getAttribute('max')).toBe('120');
  });
});

describe('the route panel, generated', () => {
  let layer: Layer;
  beforeEach(() => {
    layer = createLayer('route', 0);
    select(layer);
  });

  it('draws the panel s five sections in order', () => {
    render(<Inspector />);
    const titles = [...document.querySelectorAll('.section-toggle')].map((t) => t.textContent?.trim() ?? '');
    const ours = ['Route', 'Line style', 'Reveal', 'Travelling marker', 'Camera follow'];
    expect(titles.filter((t) => ours.includes(t))).toEqual(ours);
  });

  it('puts Shape, Glow and Dashed in one Line style section, as the panel did', () => {
    // This table declared separate "Shape" and "Style" headings that never existed.
    render(<Inspector />);
    expect(labelsIn('Line style')).toEqual(['Shape', 'Colour', 'Width', 'Opacity', 'Glow', 'Dashed']);
    expect(control('Width').getAttribute('step')).toBe('0.1');
  });

  it('writes a grouped sub-object field without flattening the object', async () => {
    /*
     * The failure this exists for: writing `{ size }` instead of
     * `{ marker: { …marker, size } }` puts a stray top-level field on the layer, leaves the
     * marker untouched, and draws exactly the same as before.
     */
    render(<Inspector />);
    const size = fieldsIn('Travelling marker').find((f) =>
      f.querySelector('.field-label')?.textContent?.trim().startsWith('Size'),
    );
    fireEvent.change(size!.querySelector('input')!, { target: { value: '12' } });

    const marker = node(layer.id).marker as Record<string, unknown>;
    expect(restValue(marker.size as never)).toBe(12);
    // Every sibling survives, and nothing leaked to the top level.
    expect(marker.icon).toBe('dot');
    expect(marker.color).toBe('#ffffff');
    expect(marker.rotate).toBe(true);
    expect(node(layer.id)).not.toHaveProperty('size');
  });

  it('gates the follow settings on follow.enabled, through a dotted condition', async () => {
    render(<Inspector />);
    expect(has('Zoom'), 'follow is off on a fresh route').toBe(false);

    await userEvent.click(control('Enabled'));

    expect((node(layer.id).follow as Record<string, unknown>).enabled).toBe(true);
    expect(has('Zoom')).toBe(true);
    expect(has('Pitch')).toBe(true);
    expect(has('Face heading')).toBe(true);
  });

  it('keeps the icon bespoke, because picking none also disables the marker', async () => {
    // One control writing two fields — a row cannot express that, so it stays hand-written.
    render(<Inspector />);
    await userEvent.selectOptions(control('Icon'), 'none');

    const marker = node(layer.id).marker as Record<string, unknown>;
    expect(marker.icon).toBe('none');
    expect(marker.enabled).toBe(false);
  });

  it('draws the reveal as a window, with the derived speed readout beneath it', () => {
    // `progress` was declared a plain track while the panel drew a window; and the km/s hint
    // reads the window above it, so it has to render after the rows, not before.
    select({ ...createLayer('route', 0), coords: [[0, 0], [10, 0]] } as Layer);
    render(<Inspector />);

    const reveal = [...document.querySelectorAll('.section')].find((s) =>
      s.querySelector('.section-toggle')?.textContent?.trim() === 'Reveal',
    )!;
    expect(reveal.textContent).toContain('Start');
    const hint = reveal.querySelector('.hint');
    expect(hint?.textContent).toMatch(/km\/s of travel/);
  });
});

describe('the declaration and the panel cannot drift apart', () => {
  /*
   * The check M2.7 wanted and could not write: while a panel typed its own ranges there was
   * nothing to compare the declaration against. Now that six types are generated, every
   * non-custom row they declare must actually appear — so a property added to the model, or
   * renamed, or given a condition that never holds, fails here instead of silently vanishing.
   *
   * Regions is absent on purpose: it still draws its own panel. Add it to this list on the
   * day it is converted, and the guard covers all seven.
   */
  const GENERATED = ['clouds', 'image', 'text', 'shape', 'marker', 'route'] as const;

  it.each(GENERATED)('%s draws every row it declares', (type) => {
    const layer = createLayer(type, 0);
    select(layer);
    render(<Inspector />);

    const shown = new Set(
      [...document.querySelectorAll('.field-label')].map((l) => l.textContent?.trim().replace(/\s+/g, ' ') ?? ''),
    );
    const missing = propsOf(type)
      .filter((m) => !m.custom && conditionHolds(layer, m.when))
      // Timing has its own shared panel below the type's own rows.
      .filter((m) => m.section !== 'Timing')
      /*
       * A `window` row draws Start / End / Easing; its own label names the property only in
       * the "keyframed beyond a simple window" fallback. Checked below by its fields instead
       * — the hand-written panels behaved the same way, so this is the contract, not a gap.
       */
      .filter((m) => m.row.kind !== 'window')
      .map((m) => m.label)
      .filter((label) => ![...shown].some((s) => s.startsWith(label)));

    expect(missing, `${type} declares rows it does not draw`).toEqual([]);

    // …and every window it declares put its fields on screen.
    const windows = propsOf(type).filter((m) => m.row.kind === 'window' && conditionHolds(layer, m.when));
    if (windows.length > 0) expect(shown.has('Start'), `${type} declares a window it does not draw`).toBe(true);
  });
});

describe('a generated slider', () => {
  it('coalesces a drag into one undo step, as the hand-written row did', () => {
    const layer = createLayer('clouds', 0);
    select(layer);
    render(<Inspector />);

    const before = restValue(
      (useStore.getState().project.nodes[layer.id] as unknown as Record<string, unknown>).coverage as never,
    );
    expect(before).not.toBe(0.4);

    // Three writes to the same property, the way a drag arrives.
    for (const v of ['0.2', '0.3', '0.4']) {
      fireEvent.change(control('Coverage'), { target: { value: v } });
    }
    expect(restValue(node(layer.id).coverage as never)).toBe(0.4);

    useStore.getState().undo();
    expect(restValue(node(layer.id).coverage as never), 'one drag should be one step').toBe(before);
  });
});
