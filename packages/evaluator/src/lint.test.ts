import { describe, expect, it } from 'vitest';
import { createLayer, projectWith } from '@geomotion/document';
import type { RouteLayer, ShapeLayer } from '@geomotion/document';
import { checkProjectGeometry } from './lint.ts';

/**
 * End-to-end through the actual layer-walking path (route.coords, shape.geojson
 * parsed ring by ring) — `@geomotion/geometry`'s own test suite already covers the
 * pure math in isolation; this covers the glue that finds the coordinates in a
 * real project in the first place.
 */
const projectWithLayers = (...layers: Parameters<typeof projectWith>[0]) =>
  projectWith(layers, { name: 'lint fixture', duration: 10, fps: 30, width: 1080, height: 1920, basemap: 'dark-clean' });

describe('checkProjectGeometry', () => {
  it('finds nothing in a clean project', () => {
    const route = createLayer('route', 0, { coords: [[0, 0], [10, 10]] }) as RouteLayer;
    expect(checkProjectGeometry(projectWithLayers(route))).toEqual([]);
  });

  it('flags a route whose coords jump the antimeridian', () => {
    const route = createLayer('route', 0, { name: 'Bad route', coords: [[170, 10], [-170, 12]] }) as RouteLayer;
    const findings = checkProjectGeometry(projectWithLayers(route));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ layerName: 'Bad route', kind: 'antimeridian' });
  });

  it('flags a marker past the Mercator latitude limit', () => {
    const marker = createLayer('marker', 0, { name: 'Too far north', coord: [0, 87] });
    const findings = checkProjectGeometry(projectWithLayers(marker));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ layerName: 'Too far north', kind: 'polar-clip' });
  });

  it('does not flag antimeridian jumps between unrelated rings in one shape', () => {
    // A MultiPolygon with two separate rings, one near lng 170 and one near lng
    // -170 — geographically unrelated, and only "adjacent" because they happen to
    // sit next to each other in the file. A flattened, order-losing coordinate
    // walk would see a jump here that was never really a ring's own path.
    const multi: ShapeLayer = createLayer('shape', 0, {
      name: 'Two islands',
      geojson: JSON.stringify({
        type: 'MultiPolygon',
        coordinates: [
          [[[170, 10], [171, 10], [171, 11], [170, 10]]],
          [[[-170, -10], [-171, -10], [-171, -11], [-170, -10]]],
        ],
      }),
    }) as ShapeLayer;
    expect(checkProjectGeometry(projectWithLayers(multi))).toEqual([]);
  });

  it('flags a jump within a single ring of a MultiPolygon', () => {
    const multi: ShapeLayer = createLayer('shape', 0, {
      name: 'Broken ring',
      geojson: JSON.stringify({
        type: 'MultiPolygon',
        coordinates: [[[[170, 10], [-170, 12], [170, 14], [170, 10]]]],
      }),
    }) as ShapeLayer;
    const findings = checkProjectGeometry(projectWithLayers(multi));
    expect(findings.some((f) => f.kind === 'antimeridian')).toBe(true);
  });

  it('ignores unparseable GeoJSON rather than throwing', () => {
    const shape: ShapeLayer = createLayer('shape', 0, { geojson: 'not json' }) as ShapeLayer;
    expect(() => checkProjectGeometry(projectWithLayers(shape))).not.toThrow();
    expect(checkProjectGeometry(projectWithLayers(shape))).toEqual([]);
  });

  it('reports the real arctic-route ice-shape bug end to end, and confirms the fix clears it', () => {
    const broken: ShapeLayer = createLayer('shape', 0, {
      name: 'Ice — open season (broken)',
      geojson: JSON.stringify({
        type: 'Polygon',
        coordinates: [[
          [20, 82], [60, 83.5], [100, 83.5], [140, 82.5], [175, 81],
          [175, 86], [140, 87], [100, 87], [60, 86.5], [20, 85], [20, 82],
        ]],
      }),
    }) as ShapeLayer;
    const brokenFindings = checkProjectGeometry(projectWithLayers(broken));
    expect(brokenFindings.some((f) => f.kind === 'polar-clip')).toBe(true);

    const fixed: ShapeLayer = createLayer('shape', 0, {
      name: 'Ice — open season (fixed)',
      geojson: JSON.stringify({
        type: 'Polygon',
        coordinates: [[
          [30, 79], [70, 81], [100, 81], [130, 80], [165, 78.5],
          [165, 84.5], [130, 84.8], [100, 84.8], [70, 84.5], [30, 82.5], [30, 79],
        ]],
      }),
    }) as ShapeLayer;
    expect(checkProjectGeometry(projectWithLayers(fixed))).toEqual([]);
  });
});
