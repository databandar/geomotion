import type { StyleSpecification } from 'maplibre-gl';

export interface Basemap {
  id: string;
  name: string;
  /** vector style URL, or an inline style for raster sources */
  style: string | StyleSpecification;
  dark: boolean;
}

function rasterStyle(tiles: string[], attribution: string, maxzoom = 19): StyleSpecification {
  return {
    version: 8,
    sources: {
      base: { type: 'raster', tiles, tileSize: 256, maxzoom, attribution },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#0b0f14' } },
      { id: 'base', type: 'raster', source: 'base' },
    ],
  } as StyleSpecification;
}

/**
 * Satellite imagery carries no borders or place names — it is just pixels of
 * ground. A transparent reference tile set painted on top puts the boundaries
 * and labels back.
 */
function hybridStyle(imagery: string, reference: string, attribution: string, maxzoom = 19): StyleSpecification {
  return {
    version: 8,
    sources: {
      base: { type: 'raster', tiles: [imagery], tileSize: 256, maxzoom, attribution },
      reference: { type: 'raster', tiles: [reference], tileSize: 256, maxzoom },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#0b0f14' } },
      { id: 'base', type: 'raster', source: 'base' },
      { id: 'reference', type: 'raster', source: 'reference', paint: { 'raster-opacity': 0.9 } },
    ],
  } as StyleSpecification;
}

/**
 * All of these are keyless. If you have a Mapbox/MapTiler key you can drop the
 * style URL straight into the Basemap list and it will work the same way.
 */
export const BASEMAPS: [Basemap, ...Basemap[]] = [
  {
    id: 'dark',
    name: 'Dark Matter',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    dark: true,
  },
  {
    id: 'positron',
    name: 'Positron (light)',
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    dark: false,
  },
  {
    id: 'voyager',
    name: 'Voyager',
    style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
    dark: false,
  },
  {
    id: 'liberty',
    name: 'OpenFreeMap Liberty',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    dark: false,
  },
  {
    id: 'bright',
    name: 'OpenFreeMap Bright',
    style: 'https://tiles.openfreemap.org/styles/bright',
    dark: false,
  },
  {
    id: 'satellite-labels',
    name: 'Satellite + borders',
    style: hybridStyle(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      'Esri, Maxar, Earthstar Geographics',
    ),
    // Not "dark" for ramp purposes: imagery is bright, so high values need the
    // saturated end of the ramp, not the near-white end.
    dark: false,
  },
  {
    id: 'satellite',
    name: 'Satellite (imagery only)',
    style: rasterStyle(
      ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      'Esri, Maxar, Earthstar Geographics',
    ),
    dark: false,
  },
  {
    id: 'terrain-raster',
    name: 'Topo',
    style: rasterStyle(
      ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'],
      'Esri and the GIS community',
    ),
    dark: false,
  },
  {
    id: 'blank',
    name: 'Blank (layers only)',
    style: {
      version: 8,
      sources: {},
      layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0d1117' } }],
    } as StyleSpecification,
    dark: true,
  },
];

export function getBasemap(id: string): Basemap {
  return BASEMAPS.find((b) => b.id === id) ?? BASEMAPS[0];
}

/** Free global DEM (Terrarium encoding) used for 3D terrain. */
export const TERRAIN_SOURCE = {
  type: 'raster-dem' as const,
  tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
  encoding: 'terrarium' as const,
  tileSize: 256,
  maxzoom: 13,
  attribution: 'Terrain: Mapzen / AWS Open Data',
};
