import { describe, expect, it } from 'vitest';
import { migrate } from '../project.ts';
import { layersOf } from '../nodes.ts';

/**
 * Format 10 — the readout gets a style instead of an on/off switch
 * (docs/features/callout-styles.md).
 *
 * The point of the migration is that no existing project changes what it shows: `false` was
 * already "draw nothing", so it maps onto `'none'` exactly.
 */

const regions = (extra: Record<string, unknown>) =>
  migrate({
    format: 9,
    nodes: {
      r: {
        id: 'r', type: 'regions', name: 'R', parentId: null, order: 's',
        visible: true, in: 0, out: 30, fade: 0.4, ...extra,
      },
    },
    story: [],
  });

const readout = (doc: ReturnType<typeof migrate>) =>
  layersOf(doc)[0] as unknown as Record<string, unknown>;

describe('the format 10 migration', () => {
  it('turns a switched-off callout into "none"', () => {
    expect(readout(regions({ showCallout: false })).calloutStyle).toBe('none');
  });

  it('turns a switched-on callout into the card it was drawing', () => {
    expect(readout(regions({ showCallout: true })).calloutStyle).toBe('card');
  });

  it('removes the old boolean rather than leaving it beside the enum', () => {
    // Two fields meaning one thing let two readers disagree about which is authoritative
    // (§3.6.4) — and these two would, the first time someone picked a style.
    expect(readout(regions({ showCallout: false }))).not.toHaveProperty('showCallout');
  });

  it('keeps a style a newer build already wrote', () => {
    const out = readout(regions({ calloutStyle: 'pill', showCallout: false }));
    expect(out.calloutStyle).toBe('pill');
    expect(out).not.toHaveProperty('showCallout');
  });

  it('ignores a style it does not recognise and falls back to the card', () => {
    expect(readout(regions({ calloutStyle: 'hologram' })).calloutStyle).toBe('card');
  });

  it('leaves other layer types alone', () => {
    const doc = migrate({
      format: 9,
      nodes: { t: { id: 't', type: 'text', name: 'T', parentId: null, order: 's', visible: true, in: 0, out: 5, fade: 0.4 } },
      story: [],
    });
    expect(layersOf(doc)[0]).not.toHaveProperty('calloutStyle');
  });
});
