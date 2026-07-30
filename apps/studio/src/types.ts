export type LngLat = [number, number];

export type EasingName =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'easeInOutCubic'
  | 'easeInOutExpo'
  | 'easeOutBack'
  | 'hold';

export interface CameraKeyframe {
  id: string;
  /** seconds on the timeline */
  t: number;
  center: LngLat;
  zoom: number;
  bearing: number;
  pitch: number;
  /** easing applied on the segment leading *out* of this keyframe */
  easing: EasingName;
  /** extra zoom levels to pull back mid-segment — the cinematic "arc" move */
  dip: number;
}

export interface LayerBase {
  id: string;
  name: string;
  visible: boolean;
  /** seconds — layer is on screen between in/out */
  in: number;
  out: number;
  /** cross-fade duration in seconds at each end */
  fade: number;
}

export type RouteIcon = 'dot' | 'plane' | 'car' | 'pin' | 'none';

export interface RouteLayer extends LayerBase {
  type: 'route';
  coords: LngLat[];
  /** how intermediate geometry is built between the points you clicked */
  curve: 'geodesic' | 'straight' | 'arc';
  color: string;
  width: number;
  opacity: number;
  dashed: boolean;
  glow: boolean;
  /** progressive draw window, seconds (absolute timeline time) */
  drawStart: number;
  drawEnd: number;
  drawEasing: EasingName;
  /** trailing dot / vehicle riding the head of the line */
  marker: {
    enabled: boolean;
    icon: RouteIcon;
    color: string;
    size: number;
    rotate: boolean;
  };
  /** camera rides the head of the route while it draws */
  follow: {
    enabled: boolean;
    zoom: number;
    pitch: number;
    /** 0 = keep map bearing, 1 = face direction of travel */
    faceHeading: boolean;
  };
}

export interface MarkerLayer extends LayerBase {
  type: 'marker';
  coord: LngLat;
  color: string;
  size: number;
  label: string;
  labelSize: number;
  labelColor: string;
  labelOffset: number;
  halo: boolean;
  pulse: boolean;
  /** scale-in pop when the layer enters */
  pop: boolean;
}

export interface TextLayer extends LayerBase {
  type: 'text';
  text: string;
  /** normalised screen position, 0..1 */
  x: number;
  y: number;
  size: number;
  color: string;
  weight: number;
  align: 'left' | 'center' | 'right';
  background: boolean;
  backgroundColor: string;
  letterSpacing: number;
  anim: 'none' | 'fade' | 'slideUp' | 'typewriter' | 'wipe';
}

export interface ShapeLayer extends LayerBase {
  type: 'shape';
  /** raw GeoJSON (Feature / FeatureCollection / Geometry) as text */
  geojson: string;
  fillColor: string;
  fillOpacity: number;
  lineColor: string;
  lineWidth: number;
  /** outline draws on progressively across the layer's visible window */
  traceOutline: boolean;
  extrude: boolean;
  extrudeHeight: number;
}

export type RegionOrder = 'geojson' | 'valueDesc' | 'valueAsc' | 'alpha' | 'custom';

/**
 * A choropleth that tours itself: it colours every region by value, then visits
 * them one at a time — flying the camera in, tracing the border, and counting
 * the value up.
 */
export interface RegionsLayer extends LayerBase {
  type: 'regions';
  /** FeatureCollection of polygons */
  geojson: string;
  /** feature property holding the region name */
  nameKey: string;
  /** name → value; the single source of truth for the choropleth */
  values: Record<string, number>;

  /* how the numbers read */
  metric: string;
  unit: string;
  decimals: number;

  /* choropleth */
  ramp: string;
  /** null = follow the basemap (dark basemaps flip the anchor) */
  flipRamp: boolean | null;
  autoDomain: boolean;
  min: number;
  max: number;
  fillOpacity: number;
  noDataColor: string;

  /* borders */
  borderColor: string;
  borderWidth: number;
  highlightColor: string;
  highlightWidth: number;
  traceBorder: boolean;
  /** stagger the reveal: border, then fill, then glow, then the number */
  sequenceReveal: boolean;
  /** camera overshoots and settles into each stop */
  cameraOvershoot: boolean;
  /** sideways bow on the path between stops, 0..1 */
  cameraBow: number;
  /** dark casing under the base borders — the only way they read over satellite imagery */
  borderCasing: boolean;
  /** how far non-active regions fade back, 0..1 */
  dimOthers: number;

  /* opening and closing beats */
  /** seconds of overview before the tour starts */
  intro: number;
  /** draw every border on during the intro */
  introTrace: boolean;
  /** seconds of overview after the tour ends */
  outro: number;
  /** label every region with its value during the outro */
  labelAll: boolean;
  labelSize: number;
  /** absolute second the all-region labels start arriving; -1 = start of outro */
  labelAt: number;

  /* the tour */
  tour: boolean;
  order: RegionOrder;
  customOrder: string[];
  /** seconds each region holds the screen */
  dwell: number;
  /**
   * Per-stop hold times, in tour order. Empty means every stop uses `dwell`;
   * set it to give each region exactly as long as its narration needs.
   */
  stopDurations: number[];
  /** seconds of camera travel at the start of each region's slot */
  moveTime: number;
  driveCamera: boolean;
  /** framing padding as a fraction of the frame, 0..0.45 */
  padding: number;
  /** stops tiny regions (a single city, an island chain) filling the frame with context-free ocean */
  maxZoom: number;
  tourPitch: number;
  countUp: boolean;

  /* readouts */
  showCallout: boolean;
  calloutSize: number;
  showRank: boolean;
  showLegend: boolean;
  legendTitle: string;
}

/** Drifting cloud cover — an opening beat that parts to reveal the map. */
export interface CloudsLayer extends LayerBase {
  type: 'clouds';
  /** 0..1 density */
  coverage: number;
  /** texture zoom; bigger = larger, softer formations */
  scale: number;
  /** drift in 1080p px per second */
  speed: number;
  /** drift heading, degrees */
  direction: number;
  color: string;
  opacity: number;
  /** clouds clear outward from the centre between these times */
  dissipate: boolean;
  dissipateStart: number;
  dissipateEnd: number;
}

/** A picture placed in screen space — a photo, a logo, a chart you made elsewhere. */
export interface ImageLayer extends LayerBase {
  type: 'image';
  /** data: URL, http(s) URL, or a path the page can reach */
  src: string;
  /** normalised anchor position in the frame */
  x: number;
  y: number;
  /** width as a fraction of the frame width; height follows the image aspect */
  width: number;
  anchor: 'center' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
  opacity: number;
  /** corner rounding in 1080p px */
  radius: number;
  border: boolean;
  borderColor: string;
  shadow: boolean;
  /** kenBurns is a slow push-in, the standard way to stop a still feeling dead */
  anim: 'none' | 'fade' | 'slideUp' | 'kenBurns';
  caption: string;
}

export type Layer =
  | RouteLayer
  | MarkerLayer
  | TextLayer
  | ShapeLayer
  | RegionsLayer
  | CloudsLayer
  | ImageLayer;
export type LayerType = Layer['type'];

/**
 * Narration attached to a composition. Purely for authoring — the overlay never
 * draws it and the frame renderer ignores it; it exists so the editor can play
 * the voice against the picture and show where each line falls.
 */
export interface ProjectAudio {
  /** URL the editor can play (dev-server route, or a data URL) */
  url: string;
  /** absolute path on disk, for the renderer to mux */
  file?: string;
  cues: { t: number; d: number; text: string }[];
}

export interface Project {
  version: 1;
  name: string;
  duration: number;
  fps: number;
  width: number;
  height: number;
  basemap: string;
  terrain: boolean;
  terrainExaggeration: number;
  background: string;
  camera: CameraKeyframe[];
  layers: Layer[];
  audio?: ProjectAudio;
}

/** Everything the renderer needs for one instant in time. */
export interface CameraState {
  center: LngLat;
  zoom: number;
  bearing: number;
  pitch: number;
}
