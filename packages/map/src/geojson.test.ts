import { describe, expect, it } from 'vitest';
import { collectRings, outlineOf, parseGeoJSON } from './geojson.ts';

const square: GeoJSON.Polygon = {
  type: 'Polygon',
  coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
};

describe('parseGeoJSON', () => {
  it('takes a FeatureCollection as it is', () => {
    const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: square }] };
    expect(parseGeoJSON(JSON.stringify(fc)).features).toHaveLength(1);
  });

  it('wraps a bare Feature', () => {
    const f = { type: 'Feature', properties: { name: 'a' }, geometry: square };
    const out = parseGeoJSON(JSON.stringify(f));
    expect(out.type).toBe('FeatureCollection');
    expect(out.features[0]?.properties).toEqual({ name: 'a' });
  });

  it('wraps a bare geometry, which is what copying one shape out of a file gives you', () => {
    const out = parseGeoJSON(JSON.stringify(square));
    expect(out.features).toHaveLength(1);
    expect(out.features[0]?.geometry).toEqual(square);
  });

  it('draws nothing rather than throwing on every prefix of what is being typed', () => {
    // The textarea commits per keystroke, so all of these are states a user passes
    // through while pasting or editing.
    for (const partial of ['', '{', '{"type":', '{"type":"Poly', 'not json at all']) {
      expect(parseGeoJSON(partial).features).toEqual([]);
    }
  });

  it('survives a collection whose features key is missing or wrong', () => {
    // Common in hand-written JSON. Everything downstream iterates `features`, so a
    // non-array here would throw inside the render loop instead.
    expect(parseGeoJSON('{"type":"FeatureCollection"}').features).toEqual([]);
    expect(parseGeoJSON('{"type":"FeatureCollection","features":null}').features).toEqual([]);
  });

  it('treats JSON that is not an object as nothing', () => {
    for (const scalar of ['null', '42', '"a string"', 'true']) {
      expect(parseGeoJSON(scalar).features).toEqual([]);
    }
  });
});

describe('collectRings', () => {
  it('takes the ring of a polygon', () => {
    expect(collectRings(square)).toHaveLength(1);
  });

  it('includes holes, so a lake edge traces with the coast', () => {
    const withHole: GeoJSON.Polygon = {
      type: 'Polygon',
      coordinates: [square.coordinates[0]!, [[0.2, 0.2], [0.4, 0.2], [0.4, 0.4], [0.2, 0.2]]],
    };
    expect(collectRings(withHole)).toHaveLength(2);
  });

  it('flattens every ring of every polygon in a MultiPolygon', () => {
    const multi: GeoJSON.MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [square.coordinates, square.coordinates],
    };
    expect(collectRings(multi)).toHaveLength(2);
  });

  it('takes lines as they are', () => {
    expect(collectRings({ type: 'LineString', coordinates: [[0, 0], [1, 1]] })).toHaveLength(1);
    expect(
      collectRings({ type: 'MultiLineString', coordinates: [[[0, 0], [1, 1]], [[2, 2], [3, 3]]] }),
    ).toHaveLength(2);
  });

  it('recurses into a GeometryCollection, including nested ones', () => {
    // The spec permits nesting and QGIS emits it; a single-level walk would silently
    // drop the inner shapes.
    const nested: GeoJSON.GeometryCollection = {
      type: 'GeometryCollection',
      geometries: [square, { type: 'GeometryCollection', geometries: [square] }],
    };
    expect(collectRings(nested)).toHaveLength(2);
  });

  it('has no line to trace on points', () => {
    expect(collectRings({ type: 'Point', coordinates: [0, 0] })).toEqual([]);
    expect(collectRings({ type: 'MultiPoint', coordinates: [[0, 0], [1, 1]] })).toEqual([]);
  });

  it('ignores a missing geometry instead of failing', () => {
    expect(collectRings(null)).toEqual([]);
    expect(collectRings(undefined)).toEqual([]);
  });
});

describe('outlineOf', () => {
  it('collects across features, in order', () => {
    const line: GeoJSON.LineString = { type: 'LineString', coordinates: [[9, 9], [8, 8]] };
    const fc: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: {}, geometry: square },
        { type: 'Feature', properties: {}, geometry: line },
      ],
    };
    const rings = outlineOf(fc);
    expect(rings).toHaveLength(2);
    expect(rings[1]).toEqual(line.coordinates);
  });

  it('skips a feature with a null geometry, which is legal GeoJSON', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: null }],
    } as unknown as GeoJSON.FeatureCollection;
    expect(outlineOf(fc)).toEqual([]);
  });
});
