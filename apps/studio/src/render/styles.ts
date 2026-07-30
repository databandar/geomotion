/**
 * What the renderer is allowed to know about a layer.
 *
 * ARCHITECTURE §14 and ENGINEERING_GUIDE §2 require the renderer to depend on
 * `core` alone — never on the document. Before this file, each scene item carried
 * a live `layer` reference, so the renderer could read *any* document field,
 * including timing and identity fields the evaluator had already consumed. That
 * is the coupling: not a mutation risk (documents are frozen since M6), but a
 * renderer that can silently start depending on document state the evaluator did
 * not intend to expose.
 *
 * These interfaces declare exactly the fields the renderer reads. Document layer
 * types are structural supersets of them, so the evaluator assigns a layer
 * directly with no copy and no runtime cost — the narrowing is entirely in the
 * type system. Verified as a no-op by the render-signature harness: every fixture
 * frame is bit-identical across this change.
 *
 * Adding a field here is a deliberate widening of the render contract. If a new
 * property is needed, add it here first and notice that you are doing it.
 */

/** Icon riding the head of a drawing route. Mirrors the document's union. */
export type RouteIconStyle = 'dot' | 'plane' | 'car' | 'pin' | 'none';

export interface RouteStyle {
  id: string;
  color: string;
  width: number;
  opacity: number;
  dashed: boolean;
  glow: boolean;
  marker: {
    enabled: boolean;
    icon: RouteIconStyle;
    color: string;
    size: number;
    rotate: boolean;
  };
}

export interface MarkerStyle {
  coord: [number, number];
  color: string;
  size: number;
  label: string;
  labelSize: number;
  labelColor: string;
  labelOffset: number;
  halo: boolean;
  pulse: boolean;
}

export interface TextStyle {
  /** The editor correlates a drawn label back to its layer when dragging it. */
  id: string;
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

export interface ShapeStyle {
  id: string;
  geojson: string;
  fillColor: string;
  fillOpacity: number;
  lineColor: string;
  lineWidth: number;
  traceOutline: boolean;
  extrude: boolean;
  extrudeHeight: number;
}

export interface RegionsStyle {
  id: string;
  geojson: string;
  metric: string;
  unit: string;
  decimals: number;
  ramp: string;
  fillOpacity: number;
  noDataColor: string;
  borderColor: string;
  borderWidth: number;
  highlightColor: string;
  highlightWidth: number;
  borderCasing: boolean;
  introTrace: boolean;
  labelAll: boolean;
  labelSize: number;
  showCallout: boolean;
  calloutSize: number;
  showRank: boolean;
  showLegend: boolean;
  legendTitle: string;
}

export interface CloudsStyle {
  coverage: number;
  scale: number;
  speed: number;
  direction: number;
  color: string;
  opacity: number;
}

export interface ImageStyle {
  src: string;
  x: number;
  y: number;
  width: number;
  anchor: 'center' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
  opacity: number;
  radius: number;
  border: boolean;
  borderColor: string;
  shadow: boolean;
  caption: string;
}
