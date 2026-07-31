import { beforeEach, describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  addNode,
  createGroup,
  emptyProject,
  layersOf,
  projectWith,
  registerNodeType,
  staticTrack,
  transact,
  type DocNode,
} from '@geomotion/document';
import { useStore } from '../store';
import Inspector from './Inspector';

/**
 * The generated inspector (ENGINEERING_GUIDE §3.4, §11).
 *
 * The claim being tested is §15's: "property metadata gives plugin nodes the schema-driven
 * inspector for free". So the test registers a node type the editor has never heard of and
 * asserts that its rows appear and write back — without touching a line of the inspector.
 */

/** A node type no build ships, standing in for one a plugin would contribute. */
const beacon = {
  type: 'beacon',
  kind: 'Beacon layer',
  create: (at: number) =>
    ({
      id: 'bc_1',
      type: 'beacon',
      name: 'Beacon',
      parentId: null,
      order: 'V',
      visible: true,
      in: at,
      out: at + 5,
      fade: 0.4,
      colour: '#ff0000',
      rings: 3,
      pulsing: true,
      mode: 'sweep',
      strength: staticTrack(0.5),
    }) as unknown as DocNode,
  props: [
    { prop: 'colour', label: 'Colour', section: 'Style', row: { kind: 'color' } as const },
    { prop: 'rings', label: 'Rings', section: 'Style', row: { kind: 'number', min: 1, max: 8, step: 1, precision: 0 } as const },
    { prop: 'pulsing', label: 'Pulsing', section: 'Style', row: { kind: 'toggle' } as const },
    { prop: 'mode', label: 'Mode', section: 'Style', row: { kind: 'select', options: ['sweep', 'flash'] } as const },
    { prop: 'strength', label: 'Strength', section: 'Style', row: { kind: 'track', min: 0, max: 1, step: 0.01 } as const },
    { prop: 'name', label: 'Name', custom: true, row: { kind: 'text' } as const },
    { prop: 'id', label: 'Id', custom: true, row: { kind: 'text' } as const },
    { prop: 'type', label: 'Type', custom: true, row: { kind: 'text' } as const },
    { prop: 'parentId', label: 'Parent', custom: true, row: { kind: 'text' } as const },
    { prop: 'order', label: 'Order', custom: true, row: { kind: 'text' } as const },
    { prop: 'visible', label: 'Visible', custom: true, row: { kind: 'toggle' } as const },
    { prop: 'in', label: 'In', custom: true, row: { kind: 'number' } as const },
    { prop: 'out', label: 'Out', custom: true, row: { kind: 'number' } as const },
    { prop: 'fade', label: 'Fade', custom: true, row: { kind: 'number' } as const },
  ],
};

/** The field under a label — `Field` wraps a container, so the association is ambiguous. */
function control(label: string): HTMLElement {
  const labels = [...document.querySelectorAll('.field')].filter((f) =>
    f.querySelector('.field-label')?.textContent?.trim().startsWith(label),
  );
  const el = labels[0]?.querySelector('input, select, textarea, button');
  if (!el) throw new Error(`no control labelled ${label}`);
  return el as HTMLElement;
}

const node = () => useStore.getState().project.nodes['bc_1'] as unknown as Record<string, unknown>;

describe('a node type the editor has never heard of', () => {
  beforeEach(() => {
    registerNodeType(beacon);
    const it = beacon.create(0);
    useStore.setState({
      project: projectWith([it]),
      selection: { kind: 'layer', id: it.id },
      also: [],
      time: 0,
    });
  });

  it('gets an inspector from its metadata alone', () => {
    render(<Inspector />);
    for (const label of ['Colour', 'Rings', 'Pulsing', 'Mode', 'Strength']) {
      expect(control(label), label).toBeTruthy();
    }
  });

  it('writes a number back to the document', () => {
    render(<Inspector />);
    fireEvent.change(control('Rings'), { target: { value: '5' } });
    expect(node().rings).toBe(5);
  });

  it('writes a select back to the document', async () => {
    render(<Inspector />);
    await userEvent.selectOptions(control('Mode'), 'flash');
    expect(node().mode).toBe('flash');
  });

  it('writes a toggle back to the document', async () => {
    render(<Inspector />);
    await userEvent.click(control('Pulsing'));
    expect(node().pulsing).toBe(false);
  });

  it('shows a track with its source pip, and keyframes it', async () => {
    render(<Inspector />);
    // The grey dot is "fixed value — click to animate"; the key diamond only appears once
    // the property is keyframed.
    const pip = document.querySelector('.track-pip .pip-dot');
    expect(pip).toBeTruthy();
    await userEvent.click(pip as Element);
    expect((node().strength as { kind: string }).kind).toBe('keyframed');
  });

  it('does not draw a row for a property marked custom', () => {
    /*
     * `fade` is declared custom here because the shared timing panel already draws it. The
     * failure this guards is a *second* row for the same field — which is what `custom`
     * being decorative would look like: two controls, both live, disagreeing after an undo.
     */
    render(<Inspector />);
    const fades = [...document.querySelectorAll('.field')].filter((f) =>
      f.querySelector('.field-label')?.textContent?.trim().startsWith('Fade'),
    );
    expect(fades).toHaveLength(1);
  });
});

describe('the group', () => {
  it('draws its opacity from metadata rather than a hand-written row', async () => {
    const group = createGroup('Beat');
    const project = transact(emptyProject(), (d) => addNode(d, group)).next;
    useStore.setState({ project, selection: { kind: 'layer', id: group.id }, also: [], time: 0 });

    render(<Inspector />);
    expect(control('Opacity')).toBeTruthy();
    expect(layersOf(project)).toHaveLength(0);
  });
});
