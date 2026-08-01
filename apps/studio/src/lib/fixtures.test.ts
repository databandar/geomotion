import { describe, expect, it } from 'vitest';
import { layersOf, type RegionsLayer } from '@geomotion/document';
import { worldTourProject } from './fixtures';

/**
 * The world tour's stops have to resolve.
 *
 * `customOrder` matches by name and *silently drops* anything it cannot find — a country
 * spelled the way an atlas spells it rather than the way Natural Earth spells it becomes a
 * missing stop, not an error. The video still renders; it is just shorter and skips a
 * continent, which is exactly the kind of thing nobody notices until it is published.
 *
 * The determinism and round-trip suites already cover this fixture as a document
 * (scene.test.ts, persistence.test.ts). What is left is whether its content agrees with its
 * data, which is what this checks.
 */

const regions = () => layersOf(worldTourProject()).find((l) => l.type === 'regions') as RegionsLayer;

describe('the world tour fixture', () => {
  it('names a country the data actually contains, for every stop', () => {
    const layer = regions();
    const names = new Set(
      (JSON.parse(layer.geojson) as { features: { properties: { name: string } }[] }).features.map(
        (f) => f.properties.name.toLowerCase(),
      ),
    );
    const missing = layer.tour.customOrder.filter((n) => !names.has(n.trim().toLowerCase()));
    expect(missing).toEqual([]);
  });

  it('has a value for every stop, so no stop shows a blank readout', () => {
    const layer = regions();
    const missing = layer.tour.customOrder.filter((n) => layer.values[n] === undefined);
    expect(missing).toEqual([]);
  });

  it('tours a handful and colours the rest', () => {
    /*
     * The difference from the India fixture, and the reason this one exists. India tours
     * every region it colours; 169 countries at 2.6 s each would be seven minutes, so this
     * colours all of them and visits nine.
     */
    const layer = regions();
    expect(layer.tour.order).toBe('custom');
    expect(layer.tour.customOrder.length).toBe(9);
    expect(Object.keys(layer.values).length).toBeGreaterThan(150);
  });

  it('is long enough to hold its own tour', () => {
    // intro + stops + outro have to fit, or the last stop is cut off mid-dwell.
    const p = worldTourProject();
    const t = regions().tour;
    expect(p.duration).toBeGreaterThan(t.intro + t.customOrder.length * t.dwell + t.outro);
  });

  it('leaves Antarctica out', () => {
    // Uninhabited, so it has no GDP per person, and it wrecks the framing of a Mercator
    // world shot by filling the bottom of it.
    const geo = JSON.parse(regions().geojson) as { features: { properties: { name: string } }[] };
    expect(geo.features.map((f) => f.properties.name)).not.toContain('Antarctica');
  });
});
