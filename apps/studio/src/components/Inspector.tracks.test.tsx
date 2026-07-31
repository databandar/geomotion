import { beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createLayer, emptyProject, type MarkerLayer } from '@geomotion/document';
import { evalTrack } from '@geomotion/animation';
import Inspector from './Inspector';
import Timeline from './Timeline';
import { useStore } from '../store';

/**
 * The source pip (ARCHITECTURE §04) is where a user first meets the track substrate, so
 * these drive it the way a person does — click the dot, scrub, move the slider — and
 * assert on the document rather than on the rendering.
 */

function withMarker(): MarkerLayer {
  const layer = createLayer('marker', 0) as MarkerLayer;
  useStore.setState({
    project: { ...emptyProject(), duration: 60, layers: [layer] },
    selection: { kind: 'layer', id: layer.id },
    time: 0,
  });
  return layer;
}

const marker = () => useStore.getState().project.layers[0] as MarkerLayer;
const pip = () => screen.getByRole('button', { name: /Fixed value|Animated/ });
const diamond = () => screen.queryByRole('button', { name: /keyframe here/ });
/**
 * The tracked field's own slider.
 *
 * A marker has two fields called "Size" — its own and its label's — so the role alone is
 * ambiguous. The tracked one is the only field carrying a pip, which is exactly what
 * `.field-with-slot` marks.
 */
const slider = () => document.querySelector('.field-with-slot input') as HTMLInputElement;
/**
 * Move the playhead and let React catch up.
 *
 * Calling the store directly is how the transport does it, but outside `act` the render
 * it triggers has not happened by the next line — so an assertion would read the markup
 * from the previous time.
 */
const scrubTo = (t: number) => act(() => useStore.getState().scrub(t));

beforeEach(() => {
  useStore.setState({ project: emptyProject(), selection: null, time: 0 });
});

describe('the source pip', () => {
  it('starts grey, because a new property is a fixed value', () => {
    withMarker();
    render(<Inspector />);
    expect(marker().size.kind).toBe('static');
    expect(pip()).toHaveAccessibleName(/Fixed value/);
    expect(diamond()).toBeNull();
  });

  it('turns the property animated without moving anything on screen', async () => {
    /*
     * Seeded with the value already showing. Starting from an empty track, or a key at
     * zero, makes the picture jump the instant you click the pip — which reads as a bug
     * rather than a mode change.
     */
    withMarker();
    render(<Inspector />);
    const before = evalTrack(marker().size, 0);

    await userEvent.click(pip());

    expect(marker().size.kind).toBe('keyframed');
    expect(evalTrack(marker().size, 0)).toBe(before);
  });

  it('freezes back to a fixed value at what is currently showing', async () => {
    withMarker();
    render(<Inspector />);
    await userEvent.click(pip());
    scrubTo(4);
    fireEvent.change(slider(), { target: { value: '30' } });
    await userEvent.click(pip());

    expect(marker().size).toEqual({ kind: 'static', value: 30 });
  });
});

describe('keyframes at the playhead', () => {
  it('shows a diamond once the property is animated, filled where a key sits', async () => {
    withMarker();
    render(<Inspector />);
    await userEvent.click(pip());
    expect(diamond()).toHaveAccessibleName(/Remove the keyframe/);

    scrubTo(5);
    expect(diamond()).toHaveAccessibleName(/Add a keyframe/);
  });

  it('adds and removes the key under the playhead', async () => {
    withMarker();
    render(<Inspector />);
    await userEvent.click(pip());
    scrubTo(5);

    await userEvent.click(diamond()!);
    expect((marker().size as { keys: unknown[] }).keys).toHaveLength(2);

    await userEvent.click(diamond()!);
    expect((marker().size as { keys: unknown[] }).keys).toHaveLength(1);
  });
});

describe('the slider on a tracked property', () => {
  it('reads at the playhead, not at rest', async () => {
    // A resting value would show something quite unlike what is on screen.
    withMarker();
    render(<Inspector />);
    await userEvent.click(pip());
    fireEvent.change(slider(), { target: { value: '10' } });
    scrubTo(4);
    act(() => useStore.getState().toggleLayerKey(marker().id, 'size', 10));
    fireEvent.change(slider(), { target: { value: '30' } });

    scrubTo(2);
    expect(Number(slider().value)).toBeCloseTo(20, 1);
  });

  it('writes a key rather than replacing the track, so keyframes survive editing', async () => {
    /*
     * The rough edge M3 shipped with: the slider replaced the whole track with a static
     * one, silently discarding every key. This is the milestone that fixes it.
     */
    withMarker();
    render(<Inspector />);
    await userEvent.click(pip());
    scrubTo(6);
    fireEvent.change(slider(), { target: { value: '25' } });

    expect(marker().size.kind).toBe('keyframed');
    expect((marker().size as { keys: unknown[] }).keys).toHaveLength(2);
  });

  it('does not lay down a new key on every pointer move of a drag', async () => {
    // The tolerance in withValueAt exists for exactly this: a drag adjusts the key under
    // the playhead rather than leaving a trail of hundreds behind it.
    withMarker();
    render(<Inspector />);
    await userEvent.click(pip());
    for (let v = 10; v <= 30; v++) fireEvent.change(slider(), { target: { value: String(v) } });

    expect((marker().size as { keys: unknown[] }).keys).toHaveLength(1);
    expect(evalTrack(marker().size, 0)).toBe(30);
  });
});

describe('the pip is a sibling of the label, not inside it', () => {
  it('keeps the pip out of the label that names the slider', () => {
    /*
     * A control's accessible name is its label's whole text content, so a pip nested
     * inside would fold its own name into the slider's. Measured in Chrome: nested, the
     * slider announces as "Size Fixed value — click to animate"; as a sibling, "Size".
     * The click-forwarding one might expect from a label turns out not to happen for a
     * button, so the name — not clicks — is what this structure is for.
     *
     * Asserted structurally because jsdom computes no accessible name at all for a
     * wrapped range input, so the name itself is not observable here.
     */
    withMarker();
    render(<Inspector />);
    expect(pip().closest('label')).toBeNull();
    expect(slider().closest('label')).not.toBeNull();
  });

  it('still lets the pip carry its own name', () => {
    withMarker();
    render(<Inspector />);
    expect(pip()).toHaveAccessibleName(/Fixed value/);
  });
});

describe('the timeline shows a row per animated property', () => {
  const rows = () => document.querySelectorAll('.tl-row.track-row');
  const keysOnScreen = () => document.querySelectorAll('.tl-row .prop-kf');

  it('shows nothing for a property that does not move', () => {
    /*
     * A row of nothing for every tracked property would bury the ones that matter, and
     * after the bespoke tweens fold in there will be dozens. A property earns a row by
     * being animated.
     */
    withMarker();
    render(<Timeline />);
    expect(rows()).toHaveLength(0);
    // Asserted on the gutter too: that is where the filter's effect shows, and a label
    // with no row beneath it pushes every row below out of alignment.
    expect(document.querySelectorAll('.tl-gutter-row.track-prop')).toHaveLength(0);
  });

  it('shows a row with one diamond per key once it is animated', () => {
    const layer = withMarker();
    act(() => {
      useStore.getState().toggleLayerTrack(layer.id, 'size', 8);
      useStore.getState().scrub(4);
      useStore.getState().toggleLayerKey(layer.id, 'size', 8);
    });
    render(<Timeline />);
    expect(rows()).toHaveLength(1);
    expect(keysOnScreen()).toHaveLength(2);
  });

  it('keeps the gutter labelled in step with the rows', () => {
    // The two lists walk the same `animatedProps`; if they could drift, every row below
    // would be labelled with the wrong name.
    const layer = withMarker();
    act(() => useStore.getState().toggleLayerTrack(layer.id, 'size', 8));
    render(<Timeline />);
    expect(document.querySelectorAll('.tl-gutter-row.track-prop')).toHaveLength(rows().length);
    expect(document.querySelector('.tl-gutter-row.track-prop')?.textContent).toContain('Size');
  });

  it('retimes a key without disturbing the others', () => {
    const layer = withMarker();
    act(() => {
      useStore.getState().toggleLayerTrack(layer.id, 'size', 8);
      useStore.getState().scrub(4);
      useStore.getState().toggleLayerKey(layer.id, 'size', 8);
    });
    const track = marker().size as { keys: { id: string; t: number }[] };
    const moving = track.keys.find((k) => k.t === 4)!;
    act(() => useStore.getState().moveLayerKey(layer.id, 'size', moving.id, 7));

    const after = (marker().size as { keys: { t: number }[] }).keys.map((k) => k.t);
    expect(after.sort((a, b) => a - b)).toEqual([0, 7]);
  });

  it('never lets a key be dragged before zero', () => {
    // Negative time is off the front of the composition; nothing can play there.
    const layer = withMarker();
    act(() => {
      useStore.getState().toggleLayerTrack(layer.id, 'size', 8);
      useStore.getState().scrub(4);
      useStore.getState().toggleLayerKey(layer.id, 'size', 8);
    });
    const moving = (marker().size as { keys: { id: string; t: number }[] }).keys.find((k) => k.t === 4)!;
    act(() => useStore.getState().moveLayerKey(layer.id, 'size', moving.id, -5));

    const times = (marker().size as { keys: { t: number }[] }).keys.map((k) => k.t);
    expect(Math.min(...times)).toBe(0);
  });
});

describe('the fx toggle', () => {
  const fx = () =>
    screen.getByRole('button', { name: /Drive this with an expression|Back to a fixed value/ });
  const field = () => screen.getByRole('textbox', { name: /size expression/i });

  it('turns the property into an expression seeded with the value on screen', async () => {
    // Seeded, like the pip: switching kinds must not move the picture.
    withMarker();
    render(<Inspector />);
    const before = evalTrack(marker().size, 0);

    await userEvent.click(fx());

    expect(marker().size.kind).toBe('expr');
    expect(evalTrack(marker().size, 0, { fallback: 0 })).toBe(before);
  });

  it('shows what the formula comes to at the playhead, and why it does not', async () => {
    /*
     * The one track kind whose value cannot be read off the control, so the panel has
     * to say it — both the working case and the two ways it fails: a syntax error and
     * a name nothing has bound.
     */
    withMarker();
    render(<Inspector />);
    await userEvent.click(fx());

    fireEvent.change(field(), { target: { value: '8 + 2 * t' } });
    expect(screen.getByText('= 8')).toBeInTheDocument();

    fireEvent.change(field(), { target: { value: '8 +' } });
    expect(screen.getByText(/ended early/)).toBeInTheDocument();

    fireEvent.change(field(), { target: { value: 'pop / 1000' } });
    expect(screen.getByText(/unbound: pop/)).toBeInTheDocument();
  });

  it('goes back to a fixed value holding what the formula evaluated to', async () => {
    withMarker();
    render(<Inspector />);
    await userEvent.click(fx());
    fireEvent.change(field(), { target: { value: '42' } });

    await userEvent.click(fx());
    expect(marker().size).toEqual({ kind: 'static', value: 42 });
  });

  it('earns no keyframe row on the timeline — it has no keys', () => {
    // The row filter is `kind === 'keyframed'`; an expression animates without keys.
    const layer = withMarker();
    act(() => useStore.getState().toggleLayerExpr(layer.id, 'size', 8));
    render(<Timeline />);
    expect(document.querySelectorAll('.tl-row.track-row')).toHaveLength(0);
  });
});
