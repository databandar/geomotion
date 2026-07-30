// The canonical declaration lives in @geomotion/core (ENGINEERING_GUIDE §2 puts
// vector-like primitives there). Imported for use below and re-exported under the
// name v1 already uses, so the document types read the same.
import type { LngLat } from '@geomotion/core';
export type { LngLat };

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
  /** dark casing under the base borders — the only way they read over satellite imagery */
  borderCasing: boolean;

  /** the self-touring behaviour; see RegionTour */
  tour: RegionTour;

  /* readouts */
  showCallout: boolean;
  calloutSize: number;
  showRank: boolean;
  showLegend: boolean;
  legendTitle: string;
}

/**
 * The tour: a choropleth that visits its own regions one at a time.
 *
 * This used to be twenty-one flat fields on `RegionsLayer` alongside a
 * `tour: boolean`, which ENGINEERING_GUIDE §3.8 rules out directly — "never add
 * mode flags that fork a type's meaning". It forked the type in the plainest way:
 * a static choropleth and a self-touring one are different objects, and two thirds
 * of the layer's fields meant nothing unless the flag was set. The layer went from
 * 46 fields to 26.
 *
 * §3.8 also says what this should eventually be: "a new behavior/graph node ...
 * preferred for visual effects". This is the shape of that behaviour, held on the
 * layer until the behaviour stack exists to hold it — at which point moving it is
 * a lift, not a redesign.
 */
export interface RegionTour {
  enabled: boolean;

  /* which regions, in what order */
  order: RegionOrder;
  customOrder: string[];

  /* pacing */
  /** seconds each region holds the screen */
  dwell: number;
  /**
   * Per-stop hold times, in tour order. Empty means every stop uses `dwell`;
   * set it to give each region exactly as long as its narration needs.
   */
  stopDurations: number[];
  /** seconds of camera travel at the start of each region's slot */
  moveTime: number;

  /* camera */
  driveCamera: boolean;
  /** framing padding as a fraction of the frame, 0..0.45 */
  padding: number;
  /** stops tiny regions (a single city, an island chain) filling the frame with context-free ocean */
  maxZoom: number;
  pitch: number;
  /** camera overshoots and settles into each stop */
  overshoot: boolean;
  /** sideways bow on the path between stops, 0..1 */
  bow: number;

  /* how a stop reveals */
  /** stagger the reveal: border, then fill, then glow, then the number */
  sequenceReveal: boolean;
  countUp: boolean;
  /** how far non-active regions fade back, 0..1 */
  dimOthers: number;

  /* the opening and closing beats, which exist only because of the tour */
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
 * Narration attached to a composition. The overlay never draws it and the frame
 * renderer ignores it; it exists so the editor can play the voice against the
 * picture, and so the renderer knows what to mux.
 */
export interface ProjectAudio {
  /**
   * A URL the editor can play the bed from — a dev-server route or a data URL.
   *
   * Optional: the CLI renderer has no server to serve one, and a `file://` URL is
   * blocked in a page, so it writes the path in `file` and leaves this unset.
   */
  url?: string;
  /** absolute path to the bed on disk, for the renderer to mux */
  file?: string;
  cues: AudioCue[];
}

/**
 * One spoken line, positioned on the timeline.
 *
 * `file` is what makes narration retimable, and its absence was a real bug: the
 * bed was mixed once at compose time and the per-line audio thrown away, so moving
 * anything in the editor left the picture and the voice permanently out of step
 * with no way back short of regenerating the whole video. Keep the line's own audio
 * and a render can re-mix from wherever the cues now sit.
 */
export interface AudioCue {
  /**
   * Stable identity, so a cue can be dragged and deleted like any other object.
   * Filled by `migrate` for documents written before cues were editable.
   */
  id: string;
  /** start on the timeline, seconds */
  t: number;
  /** measured duration, seconds */
  d: number;
  /**
   * What this is: the spoken line for narration, or the file name for audio
   * imported in the editor. Shown on the timeline chip, and used for subtitles.
   */
  text: string;
  /**
   * Absolute path to this line's own audio. Optional because documents written
   * before this existed have only the bed; those still render, they just cannot
   * be retimed.
   */
  file?: string;
  /**
   * Playback level, where 1 is the clip as recorded.
   *
   * The reason this exists: importing music and narration without it sums them at
   * full level, so the music fights the voice. Absent means 1.
   */
  gain?: number | undefined;
  /** Seconds of fade at the start and end of the clip. Absent means none. */
  fadeIn?: number | undefined;
  fadeOut?: number | undefined;
  /**
   * A URL the editor can fetch this line from.
   *
   * Separate from `file` because they serve different consumers and neither works
   * for the other: the renderer muxes from disk, and a page cannot read a
   * filesystem path. With these present the editor can play the lines where the
   * cues actually sit, instead of a bed mixed before they moved.
   */
  url?: string;
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
