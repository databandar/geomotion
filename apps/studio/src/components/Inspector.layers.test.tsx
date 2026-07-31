import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createLayer, emptyProject, type Layer, layersOf, type LayerType, projectWith } from '@geomotion/document';
import Inspector from './Inspector';
import { useStore } from '../store';

/**
 * Every layer inspector, one representative field each.
 *
 * The regions and audio inspectors have their own suite because they carry the nested
 * behaviour and the envelope. These are the other six, which had no coverage at all
 * while being edited twice — by the strict-indexing pass and by the package moves.
 *
 * What is checked is the round trip, because that is what silently breaks: the value
 * shown comes from the document, and editing the control writes back to the same
 * field. A control wired to the wrong field still renders perfectly.
 */

function withLayer(type: LayerType, patch: Partial<Layer> = {}) {
  const layer = Object.assign(createLayer(type, 0), patch) as Layer;
  useStore.setState({
    project: projectWith([layer], { duration: 60 }),
    selection: { kind: 'layer', id: layer.id },
  });
  return layer;
}

const current = <T extends Layer>() => layersOf(useStore.getState().project)[0] as T;

/** The control inside a named field; see the note in Inspector.test.tsx. */
function control(label: string, within?: string): HTMLElement {
  const spans = screen.getAllByText(label, { selector: '.field-label' });
  const span = within ? spans.find((s) => s.closest('.section')?.textContent?.includes(within)) : spans[0];
  if (!span) throw new Error(`no field labelled "${label}"`);
  const el = span.parentElement?.querySelector('input, select, textarea, button');
  if (!el) throw new Error(`field "${label}" has no control`);
  return el as HTMLElement;
}

beforeEach(() => {
  useStore.setState({ project: emptyProject(), selection: null });
});

describe('every layer inspector renders its own fields', () => {
  const expected: [LayerType, string][] = [
    ['route', 'Shape'],
    ['marker', 'Longitude'],
    ['text', 'Content'],
    ['shape', 'Fill'],
    ['clouds', 'Coverage'],
    ['image', 'Source'],
  ];

  for (const [type, field] of expected) {
    it(`${type} shows ${field}`, () => {
      withLayer(type);
      render(<Inspector />);
      expect(control(field)).toBeTruthy();
    });
  }
});

describe('values round-trip through the document', () => {
  it('text content', async () => {
    withLayer('text', { text: 'before' } as Partial<Layer>);
    render(<Inspector />);
    await userEvent.clear(control('Content'));
    await userEvent.type(control('Content'), 'after');
    expect((current() as Extract<Layer, { type: 'text' }>).text).toBe('after');
  });

  it('text weight, which is a number field', async () => {
    withLayer('text');
    render(<Inspector />);
    fireEvent.change(control('Weight'), { target: { value: '800' } });
    expect((current() as Extract<Layer, { type: 'text' }>).weight).toBe(800);
  });

  it('marker coordinates, both halves independently', async () => {
    withLayer('marker');
    render(<Inspector />);
    fireEvent.change(control('Longitude'), { target: { value: '12.5' } });
    fireEvent.change(control('Latitude'), { target: { value: '-7.25' } });
    const marker = current() as Extract<Layer, { type: 'marker' }>;
    expect(marker.coord).toEqual([12.5, -7.25]);
  });

  it('a marker sub-object field, without dropping its siblings', async () => {
    // labelSize lives beside labelColor and labelOffset; a set that replaced rather
    // than merged would clear them.
    withLayer('marker', { labelColor: '#abcdef' } as Partial<Layer>);
    render(<Inspector />);
    fireEvent.change(control('Size', 'Label'), { target: { value: '22' } });
    const marker = current() as Extract<Layer, { type: 'marker' }>;
    expect(marker.labelSize).toBe(22);
    expect(marker.labelColor).toBe('#abcdef');
  });

  it('a route sub-object field, without dropping its siblings', async () => {
    // The route marker is a nested object, the same shape that broke for the tour.
    withLayer('route');
    render(<Inspector />);
    const before = (current() as Extract<Layer, { type: 'route' }>).marker;
    fireEvent.change(control('Size', 'Travelling marker'), { target: { value: '14' } });
    const after = (current() as Extract<Layer, { type: 'route' }>).marker;
    expect(after.size).toBe(14);
    expect(after.icon).toBe(before.icon);
    expect(after.color).toBe(before.color);
  });

  it('shape fill opacity', async () => {
    withLayer('shape');
    render(<Inspector />);
    fireEvent.change(control('Fill opacity'), { target: { value: '0.4' } });
    expect((current() as Extract<Layer, { type: 'shape' }>).fillOpacity).toBeCloseTo(0.4, 6);
  });

  it('clouds coverage', async () => {
    withLayer('clouds');
    render(<Inspector />);
    fireEvent.change(control('Coverage'), { target: { value: '0.8' } });
    expect((current() as Extract<Layer, { type: 'clouds' }>).coverage).toBeCloseTo(0.8, 6);
  });

  it('image width', async () => {
    withLayer('image');
    render(<Inspector />);
    fireEvent.change(control('Width'), { target: { value: '0.65' } });
    expect((current() as Extract<Layer, { type: 'image' }>).width).toBeCloseTo(0.65, 6);
  });

  it('the shared timing fields, which every layer has', async () => {
    withLayer('text');
    render(<Inspector />);
    fireEvent.change(control('In'), { target: { value: '3' } });
    fireEvent.change(control('Out'), { target: { value: '9' } });
    expect(current().in).toBe(3);
    expect(current().out).toBe(9);
  });

  it('renaming a layer leaves everything else alone', async () => {
    withLayer('shape', { fillOpacity: 0.33 } as Partial<Layer>);
    render(<Inspector />);
    await userEvent.clear(control('Name', 'Timing'));
    await userEvent.type(control('Name', 'Timing'), 'Coastline');
    expect(current().name).toBe('Coastline');
    expect((current() as Extract<Layer, { type: 'shape' }>).fillOpacity).toBeCloseTo(0.33, 6);
  });
});
