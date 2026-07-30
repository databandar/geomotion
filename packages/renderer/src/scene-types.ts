import type { LngLat } from '@geomotion/core';
import type {
  CloudsStyle,
  ImageStyle,
  MarkerStyle,
  RegionsStyle,
  RouteStyle,
  ShapeStyle,
  TextStyle,
} from './styles.ts';
import type { RegionSet } from '@geomotion/entities';

/**
 * What a frame is, as data.
 *
 * ARCHITECTURE §14: the renderer is handed plain values and never the document. These
 * types are the contract between the evaluator, which produces them, and the two
 * drawing surfaces that consume them — the 2D overlay here and the MapLibre layers in
 * `@geomotion/map`.
 */

export interface CameraState {
  center: LngLat;
  zoom: number;
  bearing: number;
  pitch: number;
}

/*
 * Scene items carry a `style`, not a layer.
 *
 * The document layer types are structural supersets of these style interfaces, so
 * the assignments below are free — no copy, no runtime cost. What changes is what
 * the renderer can see: exactly the fields declared in `render/styles.ts`, and
 * nothing else. See that file for why.
 */

export interface RouteRender {
  style: RouteStyle;
  alpha: number;
  progress: number;
  drawn: LngLat[];
  head: LngLat | null;
  heading: number;
}

export interface MarkerRender {
  style: MarkerStyle;
  alpha: number;
  scale: number;
  /** 0..1 saw wave driving the pulse ring */
  pulse: number;
}

export interface TextRender {
  style: TextStyle;
  alpha: number;
  /** pixels of vertical offset for slideUp */
  offsetY: number;
  /** 0..1 of the string that is typed out */
  reveal: number;
  /** 0..1 horizontal wipe */
  wipe: number;
}

export interface ShapeRender {
  style: ShapeStyle;
  alpha: number;
  trace: number;
}

export type RegionPhase = 'intro' | 'tour' | 'outro';

export interface RegionsRender {
  style: RegionsStyle;
  set: RegionSet;
  alpha: number;
  phase: RegionPhase;
  /** feature id of the region currently on screen, or null outside the tour */
  activeId: number | null;
  /** index into set.order; -1 outside the tour */
  activeIndex: number;
  /** 0..1 progressive draw of the highlighted border */
  trace: number;
  /** 0..1 progressive draw of *every* border, during the intro */
  introTrace: number;
  /** 0..1 through the closing overview */
  outroProgress: number;
  /** 0..1 of the value that has counted up */
  reveal: number;
  /** 0..1 fill of the active region, ramped in *after* its border draws */
  fillIn: number;
  /** 0..1 glow pulse that peaks as the fill lands */
  glow: number;
  calloutAlpha: number;
  /** card scale, overshooting slightly on entry */
  pop: number;
  /** 0..1 wipe of the legend gradient, during the intro */
  legendFill: number;
  /** how far unvisited regions fade back right now — 0 in the overview beats */
  dim: number;
  /** true when the ramp is anchored for a dark surface */
  flip: boolean;
}

export interface CloudsRender {
  style: CloudsStyle;
  alpha: number;
  /** absolute timeline seconds, used to offset the drifting texture */
  drift: number;
  /** 0..1 of the way through parting */
  clear: number;
}

export interface ImageRender {
  style: ImageStyle;
  alpha: number;
  /** pixels of vertical offset for slideUp */
  offsetY: number;
  /** 1 → slightly more for the ken-burns push */
  zoom: number;
}

export interface Scene {
  time: number;
  camera: CameraState;
  routes: RouteRender[];
  markers: MarkerRender[];
  texts: TextRender[];
  shapes: ShapeRender[];
  regions: RegionsRender[];
  clouds: CloudsRender[];
  images: ImageRender[];
}
