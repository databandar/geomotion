import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createLayer, emptyProject, layersOf, projectWith, type RegionsLayer } from '@geomotion/document';
import Inspector from './Inspector';
import { useStore } from '../store';

/**
 * Pasting data into the editor is the moment a dataset meets the map, and §05 Decision 02
 * makes it the single place a mismatch can be reported to someone who can still fix it.
 * These drive the real paste box and read the message a person would.
 */

/** Two regions whose official names differ from what publishers write. */
const GEOJSON = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    ['Jammu and Kashmir', 75],
    ['Dadra and Nagar Haveli', 73],
    ['Daman and Diu', 72],
    ['Kerala', 76],
  ].map(([name, lng]) => ({
    type: 'Feature',
    properties: { name },
    geometry: {
      type: 'Polygon',
      coordinates: [[[lng as number, 20], [(lng as number) + 1, 20], [(lng as number) + 1, 21], [lng as number, 20]]],
    },
  })),
});

function withRegions() {
  const layer = Object.assign(createLayer('regions', 0) as RegionsLayer, {
    name: 'States',
    geojson: GEOJSON,
    values: {},
  });
  useStore.setState({
    project: projectWith([layer], { duration: 60 }),
    selection: { kind: 'layer', id: layer.id },
  });
  return layer;
}

const current = () => layersOf(useStore.getState().project)[0] as RegionsLayer;
const box = () => screen.getByPlaceholderText(/Kerala/);
const merge = () => screen.getByRole('button', { name: /^Merge$/ });

beforeEach(() => {
  useStore.setState({ project: emptyProject(), selection: null });
});

describe('pasting values', () => {
  it('lands a name the map already uses', async () => {
    withRegions();
    render(<Inspector />);
    fireEvent.change(box(), { target: { value: 'Kerala, 87.3' } });
    await userEvent.click(merge());
    expect(current().values.Kerala).toBe(87.3);
  });

  it('accepts a publisher spelling the map does not use', async () => {
    /*
     * The regression this milestone exists for. The paste box compared lowercased region
     * names, so this exact spelling was rejected as unknown here while importing cleanly
     * on the command line — two joins that had each learned different things.
     */
    withRegions();
    render(<Inspector />);
    fireEvent.change(box(), { target: { value: 'Jammu & Kashmir, 50' } });
    await userEvent.click(merge());

    expect(current().values['Jammu and Kashmir']).toBe(50);
    expect(screen.getByText(/Imported 1 value/)).toBeInTheDocument();
    expect(screen.queryByText(/unmatched/)).toBeNull();
  });

  it('spreads a merged territory across every region it covers', async () => {
    // The survey reports one union territory; the boundary set still carries both. One
    // of them would otherwise stay blank with nothing on screen to say why.
    withRegions();
    render(<Inspector />);
    fireEvent.change(box(), { target: { value: 'DNHDD, 78.4' } });
    await userEvent.click(merge());

    expect(current().values['Dadra and Nagar Haveli']).toBe(78.4);
    expect(current().values['Daman and Diu']).toBe(78.4);
  });

  it('names what did not land, so a typo is visible at once', async () => {
    withRegions();
    render(<Inspector />);
    fireEvent.change(box(), { target: { value: 'Kerala, 1\nAtlantis, 2' } });
    await userEvent.click(merge());

    expect(screen.getByText(/1 unmatched: Atlantis/)).toBeInTheDocument();
    expect(current().values.Atlantis).toBeUndefined();
  });

  it('counts what landed, not what was typed', async () => {
    // A merged name is one line and two regions; a typo is one line and none. Reporting
    // the line count would tell you neither.
    withRegions();
    render(<Inspector />);
    fireEvent.change(box(), { target: { value: 'DNHDD, 5\nAtlantis, 9' } });
    await userEvent.click(merge());
    expect(screen.getByText(/Imported 2 values/)).toBeInTheDocument();
  });

  it('reads JSON as readily as pasted lines', async () => {
    withRegions();
    render(<Inspector />);
    fireEvent.change(box(), { target: { value: '{"values":{"Jammu & Kashmir": 12}}' } });
    await userEvent.click(merge());
    expect(current().values['Jammu and Kashmir']).toBe(12);
  });
});
