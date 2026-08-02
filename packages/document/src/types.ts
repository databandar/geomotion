import type { BehaviourStacks, Track } from './track.ts';
import type { StoryBlock } from './story.ts';
import type { MapContextNode } from './context.ts';
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

/**
 * One shot, as the editor speaks of it: all four camera channels at one instant, with
 * the easing on the move out of it and the arc across that move.
 *
 * A *view*, not storage. The document holds per-channel tracks on a `CameraNode`; this
 * row is what `shotsOf` derives from them and what `upsertShot`/`patchShot` write back
 * across the channels atomically. Keeping the name v1 used, because it is the DTO the
 * inspector, the timeline and the store already spoke — what changed is where it lives.
 */
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

/**
 * A camera — a node observing the scene, never a container of it (§04, §09).
 *
 * Each channel is a property track, so the camera animates by exactly the same rule as
 * every other animatable thing in the document: a channel can hold keys, read a fact,
 * or run an expression, on its own. The shot-centric editing UX is a derived view over
 * these tracks (`shotsOf`), which is why the two can never disagree.
 *
 * `behaviours` is the rig's home (§09): an ordered stack of camera-specialised
 * behaviours evaluated over the tracks, the same mechanism §06 gives every node. Empty
 * until that milestone lands; declared now so the shape does not change again when it
 * does.
 */
export interface CameraNode {
  id: string;
  type: 'camera';
  name: string;
  /** §04's flat store: `null` is a root of the project. See nodes.ts. */
  parentId: string | null;
  /** Fractional index among siblings — ascending. See order.ts. */
  order: string;
  tracks: {
    center: Track<LngLat>;
    zoom: Track<number>;
    bearing: Track<number>;
    pitch: Track<number>;
  };
  behaviours: BehaviourStacks;
}

/**
 * A container — the first node type that uses §04's `parentId` (docs/features/groups.md).
 *
 * A group holds other nodes and draws nothing itself. That is why it is not a `Layer`:
 * `layersOf` returns what draws, and the evaluator's loop should never have to ask whether
 * the thing it is holding is one of the drawable ones.
 *
 * What it deliberately does not carry:
 *
 * - **A time window.** A group whose `in`/`out` clipped its children would silently truncate
 *   a layer whose bar you can see, at its authored length, on the timeline — a composition
 *   disagreeing with its own timeline. Children keep their own timing. When nested scenes
 *   land (§10) *that* node type owns a window and a local clock; a group is a container, a
 *   scene is a composition, and conflating the two is what makes precomps confusing.
 * - **A transform.** §04 has nodes inherit transforms from their parents, and they will —
 *   but layers today have no shared transform to inherit (a route has `coords`, a marker a
 *   `coord`, a text `x`/`y`). Opacity is the part of inheritance expressible now, so it is
 *   the part that ships.
 */
export interface GroupNode {
  id: string;
  type: 'group';
  name: string;
  parentId: string | null;
  order: string;
  /** Hiding a group hides everything under it; the children's own `visible` is untouched. */
  visible: boolean;
  /** A locked group refuses edits to its whole subtree — see the store's `editable`. */
  locked?: boolean;
  /** Multiplies into every descendant's alpha. A track, so a beat can fade as one thing. */
  opacity: Track<number>;
  /** The rig/behaviour home §06 gives every node. Empty until that milestone reaches groups. */
  behaviours: BehaviourStacks;
}

export interface LayerBase {
  id: string;
  name: string;
  /**
   * The node this layer hangs from — `null` for a root of the project (§04's flat store).
   *
   * Nothing can be a parent yet: groups, scenes and nested map contexts are the node types
   * that will fill this in. It is written from the start because reparenting must be one
   * patch to one field, not a format change later. See nodes.ts.
   */
  parentId: string | null;
  /**
   * Fractional index among siblings, ascending — and ascending is draw order.
   *
   * A string rather than a number because between any two strings there is always another
   * string. See order.ts for why that matters more than it sounds.
   */
  order: string;
  visible: boolean;
  /** seconds — layer is on screen between in/out */
  in: number;
  out: number;
  /** cross-fade duration in seconds at each end */
  fade: number;
  /**
   * Locked layers cannot be edited — not hidden, not removed from the render.
   *
   * Absent means unlocked, which is what every project written before this field says,
   * so nothing needed migrating and saved files only carry it once someone locks
   * something. Read it as `=== true`: a garbage value from a hand-edited file leaves the
   * layer editable, which is the safer failure. A lock that engages by accident is a
   * project you cannot edit with nothing on screen explaining why.
   */
  locked?: boolean;
}

export type RouteIcon = 'dot' | 'plane' | 'car' | 'pin' | 'none';

export interface RouteLayer extends LayerBase {
  type: 'route';
  coords: LngLat[];
  /** how intermediate geometry is built between the points you clicked */
  curve: 'geodesic' | 'straight' | 'arc';
  color: string;
  width: Track<number>;
  opacity: Track<number>;
  dashed: boolean;
  glow: boolean;
  /**
   * How much of the line is drawn, 0..1.
   *
   * Was `drawStart` / `drawEnd` / `drawEasing` — a window with one curve across it, which
   * is a two-key track written out longhand. As a track it can also pause mid-draw, run
   * backwards, or ease each segment differently, none of which the window could express.
   */
  progress: Track<number>;
  /** trailing dot / vehicle riding the head of the line */
  marker: {
    enabled: boolean;
    icon: RouteIcon;
    color: string;
    size: Track<number>;
    rotate: boolean;
  };
  /** camera rides the head of the route while it draws */
  follow: {
    enabled: boolean;
    zoom: Track<number>;
    pitch: Track<number>;
    /** 0 = keep map bearing, 1 = face direction of travel */
    faceHeading: boolean;
  };
}

export interface MarkerLayer extends LayerBase {
  type: 'marker';
  coord: LngLat;
  color: string;
  /**
   * The first property on the §04 substrate: a track, not a bare number.
   *
   * `staticTrack(8)` reads exactly as `8` did; the difference is that it can also hold
   * keyframes, so a marker can grow. Everything else on this layer follows in later
   * milestones — see docs/features/property-tracks.md.
   */
  size: Track<number>;
  label: string;
  labelSize: Track<number>;
  labelColor: string;
  labelOffset: Track<number>;
  halo: boolean;
  /**
   * Rules over this marker's properties, keyed by the one each modifies (§06).
   *
   * `scale` carries the entrance pop; `ring` carries the pulse. Both were booleans with
   * their constants inlined in the evaluator, so every marker in every project behaved
   * identically and neither could be retimed. Keying by property is what lets them
   * coexist: they are rules over different values, and a single list could only ever
   * mean one of them.
   */
  behaviours: BehaviourStacks;
}

export interface TextLayer extends LayerBase {
  type: 'text';
  text: string;
  /** normalised screen position, 0..1 */
  x: Track<number>;
  y: Track<number>;
  size: Track<number>;
  color: string;
  weight: number;
  align: 'left' | 'center' | 'right';
  background: boolean;
  backgroundColor: string;
  letterSpacing: Track<number>;
  anim: 'none' | 'fade' | 'slideUp' | 'typewriter' | 'wipe' | 'pop';
  /**
   * A curated stack, not a free-typed name — an arbitrary font string would
   * silently no-op to the fallback chain on whatever machine renders it (which is
   * exactly what happened project-wide before this field existed: every episode's
   * `text` layer named 'Inter' first, and 'Inter' was never actually installed on
   * the machine that rendered any of them — every one has really been drawing in
   * 'Helvetica Neue', the second name in the old hardcoded chain, the whole time).
   * Each option keeps the same Devanagari fallback tail so non-Latin text still
   * renders correctly regardless of which Latin face leads.
   */
  fontFamily?: 'sans' | 'serif' | 'mono' | 'condensed';
}

export interface ShapeLayer extends LayerBase {
  type: 'shape';
  /** raw GeoJSON (Feature / FeatureCollection / Geometry) as text */
  geojson: string;
  fillColor: string;
  fillOpacity: Track<number>;
  lineColor: string;
  lineWidth: Track<number>;
  /** outline draws on progressively across the layer's visible window */
  traceOutline: boolean;
  extrude: boolean;
  extrudeHeight: Track<number>;
}

/**
 * The looks a readout can take.
 *
 * `card` is the full glass panel; `plain` drops the box and lets the number sit on the map,
 * which is what "just the numbers" means; `pill` is one compact line for dense maps; `none`
 * draws nothing.
 */
export type CalloutStyle = 'card' | 'plain' | 'pill' | 'none';

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
  /**
   * How numbers are grouped and punctuated — a BCP 47 tag.
   *
   * Part of the document rather than the machine: this text is baked into an exported
   * video, and taking it from the renderer's environment meant the same project read
   * `1,234.5` on one laptop and `1.234,5` on another.
   */
  numberLocale: string;

  /* choropleth */
  ramp: string;
  /** null = follow the basemap (dark basemaps flip the anchor) */
  flipRamp: boolean | null;
  autoDomain: boolean;
  min: number;
  max: number;
  fillOpacity: Track<number>;
  noDataColor: string;

  /* borders */
  borderColor: string;
  borderWidth: Track<number>;
  highlightColor: string;
  highlightWidth: Track<number>;
  traceBorder: boolean;
  /** dark casing under the base borders — the only way they read over satellite imagery */
  borderCasing: boolean;

  /** the self-touring behaviour; see RegionTour */
  tour: RegionTour;

  /* readouts */
  /**
   * How the active region's readout is drawn — §07's "region layers bind fills to facts";
   * this is the same value, read rather than shaded.
   *
   * `'none'` replaces the old `showCallout: false`. One field rather than a boolean *and* an
   * enum, because two fields meaning one thing let two readers disagree (§3.6.4).
   */
  calloutStyle: CalloutStyle;
  calloutSize: Track<number>;
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
  coverage: Track<number>;
  /** texture zoom; bigger = larger, softer formations */
  scale: Track<number>;
  /** drift in 1080p px per second */
  speed: Track<number>;
  /** drift heading, degrees */
  direction: Track<number>;
  color: string;
  opacity: Track<number>;
  /**
   * How far the cloud has cleared outward from the centre, 0..1.
   *
   * Was `dissipate` / `dissipateStart` / `dissipateEnd`: the same window-with-a-curve as
   * the route's draw, and the same two-key track underneath.
   */
  clear: Track<number>;
}

/** A picture placed in screen space — a photo, a logo, a chart you made elsewhere. */
export interface ImageLayer extends LayerBase {
  type: 'image';
  /**
   * The upload as it arrived, before its background was keyed out.
   *
   * Absent until the key is applied. Keeping it is what makes the edit non-destructive —
   * §01's first commitment is "everything stays editable", and a tolerance you cannot
   * re-tune because the pixels are gone is a bake step by another name.
   */
  srcOriginal?: string;
  /** How close to the border colour a pixel must be to be removed, 0..1. */
  bgTolerance: number;
  /** Softening at the cut edge, in pixels. */
  bgFeather: number;
  /** data: URL, http(s) URL, or a path the page can reach */
  src: string;
  /** normalised anchor position in the frame */
  x: Track<number>;
  y: Track<number>;
  /** width as a fraction of the frame width; height follows the image aspect */
  width: Track<number>;
  anchor: 'center' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
  opacity: Track<number>;
  /** corner rounding in 1080p px */
  radius: Track<number>;
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
   * What this clip is for.
   *
   * `music` clips duck out of the way whenever another clip is speaking over them.
   * Everything else is treated as foreground and never ducked. Absent means
   * foreground, so existing narration is unaffected.
   *
   * `sfx` is foreground like narration, but does not *cause* a duck. A click is two
   * hundred milliseconds long; ducking a score under it and back would be a pump, not
   * a clearing. Only speech is worth making room for. See docs/features/sound-library.md.
   */
  role?: 'music' | 'sfx' | undefined;
  /**
   * How far a music clip drops while something else plays, as a fraction of its own
   * level. 0.25 means a quarter, about -12 dB. Absent means the default.
   */
  duck?: number | undefined;
  /** Seconds to move in and out of the duck. Absent means the default. */
  duckFade?: number | undefined;
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
  /** Schema version — see ENGINEERING_GUIDE §3.6 and document/migrations. */
  format: number;
  name: string;
  duration: number;
  fps: number;
  width: number;
  height: number;
  basemap: string;
  terrain: boolean;
  terrainExaggeration: number;
  background: string;
  /**
   * Every node in the composition, keyed by id — §04's Decision 01, "logical tree, flat
   * storage".
   *
   * Layers and cameras live here side by side, because §04 is explicit that cameras are
   * *siblings* of content: observers in the same graph, not a parallel list. The ordered
   * views the rest of the app reads — `layersOf`, `camerasOf`, `childrenOf` — are derived
   * from `parentId` and `order`, never stored. See nodes.ts.
   */
  nodes: Record<string, CameraNode | GroupNode | MapContextNode | Layer>;
  /**
   * The narration-driven structure of the composition (§10).
   *
   * Empty for a project built layer by layer; populated by the composer, and editable
   * afterwards — which is the point. See story.ts.
   */
  story: StoryBlock[];
  audio?: ProjectAudio;
}

/** Everything the renderer needs for one instant in time. */
export interface CameraState {
  center: LngLat;
  zoom: number;
  bearing: number;
  pitch: number;
}
