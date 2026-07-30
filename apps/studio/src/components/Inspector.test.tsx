import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createLayer, defaultTour, emptyProject, type RegionsLayer } from '@geomotion/document';
import Inspector from './Inspector';
import { useStore } from '../store';

/**
 * Behavioural spec for the inspector.
 *
 * This is the least-protected code in the app and the most-edited: M10 rewrote 42 of
 * its controls by script when the tour became a nested object, and M13 touched ten
 * more for strict indexing. Both were verified by the type checker and by the rendered
 * canvas — neither of which can tell whether a control still writes the field it
 * claims to.
 *
 * So these tests drive real controls and assert on the document. What matters is the
 * round trip: the value shown comes from the document, and editing it writes back to
 * the same place.
 */

function withRegionsLayer(patch: Partial<RegionsLayer> = {}) {
  const layer = Object.assign(createLayer('regions', 0) as RegionsLayer, {
    name: 'States',
    values: { Alpha: 10 },
    ...patch,
  });
  useStore.setState({
    project: { ...emptyProject(), duration: 60, layers: [layer] },
    selection: { kind: 'layer', id: layer.id },
  });
  return layer;
}

/** The regions layer as it now stands in the store. */
const current = () => useStore.getState().project.layers[0] as RegionsLayer;

/**
 * Type a new value into a number field.
 *
 * `fireEvent.change` rather than `userEvent.type`: jsdom does not support text
 * selection on `<input type="number">`, so select-and-replace silently appends
 * instead. This delivers exactly the change event a replacement produces, which is
 * the contract the control is written against.
 */
async function setNumber(el: HTMLElement, value: string) {
  fireEvent.change(el, { target: { value } });
}

/**
 * The control inside a named field.
 *
 * `getByLabelText` cannot be used: `Field` wraps its label around a container that may
 * hold several focusable elements, so the implicit association is ambiguous. Finding
 * the label span and reaching into its row is unambiguous and reads the same way a
 * person would find the control.
 */
function control(label: string, within?: string): HTMLElement {
  const spans = screen.getAllByText(label, { selector: '.field-label' });
  const span = within
    ? spans.find((s) => s.closest('.section')?.textContent?.includes(within))
    : spans[0];
  if (!span) throw new Error(`no field labelled "${label}"${within ? ` in "${within}"` : ''}`);
  const el = span.parentElement?.querySelector('input, select, button');
  if (!el) throw new Error(`field "${label}" has no control`);
  return el as HTMLElement;
}

beforeEach(() => {
  useStore.setState({ project: emptyProject(), selection: null });
});

describe('Inspector — nothing selected', () => {
  it('says so, and names what can be picked', () => {
    render(<Inspector />);
    expect(screen.getByText(/nothing selected/i)).toBeInTheDocument();
    expect(screen.getByText(/layer, a camera keyframe or an audio clip/i)).toBeInTheDocument();
  });
});

describe('Inspector — the region tour', () => {
  it('shows the tour values from the document, not defaults', () => {
    withRegionsLayer({ tour: { ...defaultTour(), dwell: 3.5, intro: 7 } });
    render(<Inspector />);
    expect(control('Seconds each')).toHaveValue(3.5);
    expect(control('Intro')).toHaveValue(7);
  });

  it('writes a tour field back into the nested object', async () => {
    // The M10 regression risk: a control that still writes `layer.dwell` would type
    // fine, render fine, and be silently ignored by the evaluator.
    withRegionsLayer({ tour: { ...defaultTour(), dwell: 2 } });
    render(<Inspector />);

    const input = control('Seconds each');
    await setNumber(input, '4.5');

    expect(current().tour.dwell).toBe(4.5);
    expect(current()).not.toHaveProperty('dwell');
  });

  it('merges into the tour instead of replacing it', async () => {
    // applyTour spreads the existing tour; without that, editing one field would
    // reset every other one to undefined.
    withRegionsLayer({ tour: { ...defaultTour(), dwell: 2, intro: 9, maxZoom: 5 } });
    render(<Inspector />);

    const input = control('Seconds each');
    await setNumber(input, '3');

    const tour = current().tour;
    expect(tour.dwell).toBe(3);
    expect(tour.intro).toBe(9);
    expect(tour.maxZoom).toBe(5);
    expect(tour.order).toBe(defaultTour().order);
  });

  it('toggles the tour through tour.enabled, leaving the rest of it intact', async () => {
    // Before M10 this was a boolean on the layer; writing one now would erase the
    // whole behaviour object.
    withRegionsLayer({ tour: { ...defaultTour(), enabled: true, dwell: 6 } });
    render(<Inspector />);

    await userEvent.click(control('Enabled', 'Tour'));

    expect(current().tour.enabled).toBe(false);
    expect(current().tour.dwell).toBe(6);
  });

  it('keeps a deliberate zero rather than falling back to a default', async () => {
    // `intro: 0` is a real choice — start the tour immediately.
    withRegionsLayer({ tour: { ...defaultTour(), intro: 4 } });
    render(<Inspector />);

    const input = control('Intro');
    await setNumber(input, '0');

    expect(current().tour.intro).toBe(0);
  });
});

describe('Inspector — composition size', () => {
  it('refuses a resolution that does not parse, rather than writing NaN', async () => {
    // Found by strict indexing in M13: `v.split('x').map(Number)` went straight into
    // the document, so a malformed value put NaN in width and height.
    useStore.setState({ project: { ...emptyProject(), width: 1920, height: 1080 } });
    render(<Inspector />);

    const select = control('Size', 'Composition') as HTMLSelectElement;
    // Drive the handler with a value no option offers, which is what a hand-edited
    // or future project file could produce.
    select.value = 'nonsense';
    select.dispatchEvent(new Event('change', { bubbles: true }));

    const p = useStore.getState().project;
    expect(Number.isFinite(p.width)).toBe(true);
    expect(Number.isFinite(p.height)).toBe(true);
    expect(p.width).toBe(1920);
  });
});

describe('Inspector — number fields', () => {
  it('cannot be left empty, because the document has no such value', async () => {
    // Emptying the field restores what it had rather than writing NaN. Worth pinning:
    // it is why tests here select and replace instead of clearing.
    withRegionsLayer({ tour: { ...defaultTour(), dwell: 2 } });
    render(<Inspector />);

    const input = control('Seconds each');
    await setNumber(input, '');

    expect(current().tour.dwell).toBe(2);
    expect(input).toHaveValue(2);
  });

  it('clamps to the control\'s own minimum', async () => {
    withRegionsLayer({ tour: { ...defaultTour(), intro: 4 } });
    render(<Inspector />);

    await setNumber(control('Intro'), '-5');
    expect(current().tour.intro).toBe(0);
  });
});

describe('Inspector — an audio clip', () => {
  function withCue(patch: Record<string, unknown> = {}) {
    const cue = { id: 'cue1', t: 3, d: 6.28, text: 'music', url: 'data:audio/wav;base64,AA', ...patch };
    useStore.setState({
      project: { ...emptyProject(), duration: 60, audio: { cues: [cue] } },
      selection: { kind: 'cue', id: 'cue1' },
    });
    return cue;
  }
  const cue = () => useStore.getState().project.audio!.cues[0]!;

  it('shows the clip and its measured length', () => {
    withCue();
    render(<Inspector />);
    expect(control('Name')).toHaveValue('music');
    expect(control('Start')).toHaveValue(3);
    // Length is decoded from the file, so it is reported rather than edited.
    // Two places show it: the field, and the clip's own summary.
    expect(screen.getAllByText('6.28s').length).toBeGreaterThan(0);
  });

  it('retimes the clip', async () => {
    withCue();
    render(<Inspector />);
    await setNumber(control('Start'), '12.5');
    expect(cue().t).toBe(12.5);
  });

  it('never lets a clip start before zero', async () => {
    withCue();
    render(<Inspector />);
    await setNumber(control('Start'), '-4');
    expect(cue().t).toBe(0);
  });

  it('sets level and fades without disturbing the rest of the clip', async () => {
    withCue();
    render(<Inspector />);

    await setNumber(control('Fade in'), '1.5');
    expect(cue().fadeIn).toBe(1.5);
    expect(cue().t).toBe(3);
    expect(cue().url).toBe('data:audio/wav;base64,AA');
    expect(cue().text).toBe('music');
  });

  it('shows the clamped level, not a raw value the mixers would reject', () => {
    // envelopeOf caps gain; the inspector reads through it so what is shown is what
    // will be heard.
    withCue({ gain: 99 });
    render(<Inspector />);
    expect(Number((control('Level') as HTMLInputElement).value)).toBeLessThanOrEqual(4);
  });

  it('removes the clip and clears the selection', async () => {
    withCue();
    render(<Inspector />);
    // The audio section's own Remove, not the layer one further down.
    const remove = screen
      .getAllByRole('button', { name: /remove/i })
      .find((b) => b.closest('.section')?.textContent?.includes('Audio clip'))!;
    await userEvent.click(remove);

    expect(useStore.getState().project.audio).toBeUndefined();
    expect(useStore.getState().selection).toBeNull();
  });
});
