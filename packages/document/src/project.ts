import { createId } from '@geomotion/core';
import { createCamera } from './camera.ts';
import { FIRST_ORDER, orderBetween } from './order.ts';
import { addNode, type DocNode } from './nodes.ts';
import { CURRENT_FORMAT, runMigrations } from './migrations/index.ts';
import { coerceTrack, isTrack, keyframedTrack, staticTrack } from './track.ts';

/**
 * A 0..1 ramp between two times — the shape every "window with a curve" collapses to.
 *
 * The easing sits on the opening key because that is the segment it governs, which is
 * the convention the camera has always used.
 */
export const windowTrack = (from: number, to: number, easing: EasingName) =>
  keyframedTrack<number>([
    { id: createId(), t: from, value: 0, easing },
    { id: createId(), t: Math.max(from, to), value: 1, easing },
  ]);
import type { Track } from './track.ts';
import type {
  CameraNode,
  EasingName,
  GroupNode,
  Layer,
  LayerType,
  Project,
  RegionOrder,
  RegionTour,
} from './types.ts';

/**
 * Construction and migration for document nodes.
 *
 * ENGINEERING_GUIDE §3.7: opening a document written by an older build must fill
 * gaps rather than reject the file, and every document change ships with a
 * round-trip test.
 *
 * Browser persistence (localStorage, file download) is deliberately NOT here —
 * §2 forbids this package from touching the DOM, so the app owns that. What lives
 * here is the pure part: what a new layer looks like, and what an old one is
 * missing.
 */

const PALETTE = [
  '#ff5f56',
  '#ffbd2e',
  '#27c93f',
  '#4cc2ff',
  '#a78bfa',
  '#f472b6',
  '#fb923c',
  '#22d3ee',
];

let colorCursor = 0;
const nextColor = () => PALETTE[colorCursor++ % PALETTE.length];

/**
 * Tour defaults, in one place so `createLayer` and `migrate` agree.
 *
 * These are the values the demo was tuned with, not neutral ones: a 2.2s dwell and
 * a 0.9s move are what make a stop feel visited rather than flicked past.
 */
export function defaultTour(): RegionTour {
  return {
    enabled: true,
    order: 'valueDesc',
    customOrder: [],
    dwell: 2.2,
    stopDurations: [],
    moveTime: 0.9,
    driveCamera: true,
    padding: 0.22,
    maxZoom: 8,
    pitch: 0,
    overshoot: true,
    bow: 0.35,
    sequenceReveal: true,
    countUp: true,
    dimOthers: 0.45,
    intro: 4,
    introTrace: true,
    outro: 5,
    labelAll: true,
    labelSize: 15,
    labelAt: -1,
  };
}

export function createLayer(type: LayerType, at: number, opts: Partial<Layer> = {}): Layer {
  const base = {
    id: createId(),
    // A root, and last in its list until `addNode` places it among its siblings — a
    // constructor cannot know its siblings, so it must not guess an order key (nodes.ts).
    parentId: null,
    order: FIRST_ORDER,
    visible: true,
    in: Math.max(0, at),
    out: Math.max(0, at) + 6,
    fade: 0.4,
  };

  switch (type) {
    case 'route':
      return {
        ...base,
        type: 'route',
        name: 'Route',
        coords: [],
        curve: 'geodesic',
        color: nextColor(),
        width: 3.5,
        opacity: 1,
        dashed: false,
        glow: true,
        progress: windowTrack(base.in, base.in + 4, 'easeInOutCubic'),
        marker: { enabled: true, icon: 'dot', color: '#ffffff', size: 6, rotate: true },
        follow: { enabled: false, zoom: 9, pitch: 55, faceHeading: true },
        ...(opts as object),
      } as Layer;
    case 'marker':
      return {
        ...base,
        type: 'marker',
        name: 'Marker',
        coord: [0, 0],
        color: nextColor(),
        size: staticTrack(8),
        label: 'Label',
        labelSize: 14,
        labelColor: '#ffffff',
        labelOffset: 16,
        halo: true,
        behaviours: {
          scale: [{ id: createId(), type: 'pop', enabled: true }],
          ring: [{ id: createId(), type: 'pulse', enabled: false }],
        },
        ...(opts as object),
      } as Layer;
    case 'text':
      return {
        ...base,
        type: 'text',
        name: 'Text',
        text: 'Your title here',
        x: 0.5,
        y: 0.16,
        size: 44,
        color: '#ffffff',
        weight: 700,
        align: 'center',
        background: false,
        backgroundColor: '#000000aa',
        letterSpacing: 0,
        anim: 'slideUp',
        fade: 0.5,
        ...(opts as object),
      } as Layer;
    case 'shape':
      return {
        ...base,
        type: 'shape',
        name: 'Shape',
        geojson: '',
        fillColor: nextColor(),
        fillOpacity: 0.25,
        lineColor: '#ffffff',
        lineWidth: 2,
        traceOutline: false,
        extrude: false,
        extrudeHeight: 20000,
        ...(opts as object),
      } as Layer;
    case 'regions':
      return {
        ...base,
        type: 'regions',
        name: 'Regions',
        out: base.in + 30,
        geojson: '',
        nameKey: 'name',
        values: {},
        metric: 'Value',
        unit: '',
        decimals: 1,
        // A fixed default, so a project renders the same everywhere it is opened.
        // Anyone wanting lakh/crore grouping or a comma decimal picks their own.
        numberLocale: 'en-US',
        ramp: 'blue',
        flipRamp: null,
        autoDomain: true,
        min: 0,
        max: 100,
        fillOpacity: 0.82,
        noDataColor: '#4b5563',
        borderColor: '#ffffff',
        borderWidth: 0.6,
        highlightColor: '#ffffff',
        highlightWidth: 3.5,
        traceBorder: true,
        borderCasing: true,
        tour: defaultTour(),
        showCallout: true,
        calloutSize: 100,
        showRank: true,
        showLegend: true,
        legendTitle: '',
        ...(opts as object),
      } as Layer;
    case 'clouds':
      return {
        ...base,
        type: 'clouds',
        name: 'Clouds',
        coverage: 0.85,
        scale: 1.15,
        speed: 14,
        direction: 75,
        color: '#eef3f8',
        opacity: 1,
        clear: windowTrack(base.in + 1.6, base.in + 4.6, 'easeInOutCubic'),
        ...(opts as object),
      } as Layer;
    case 'image':
      return {
        ...base,
        type: 'image',
        name: 'Image',
        src: '',
        x: 0.82,
        y: 0.22,
        width: 0.28,
        anchor: 'center',
        opacity: 1,
        radius: 14,
        border: true,
        borderColor: '#ffffff',
        shadow: true,
        anim: 'kenBurns',
        caption: '',
        ...(opts as object),
      } as Layer;
  }
}

/**
 * A container for other nodes (docs/features/groups.md).
 *
 * Opacity is a track from the start rather than a number, so a beat can fade as one thing
 * and the fade is keyframable — §04's "every property is a track", applied to the first
 * property a group has.
 */
export function createGroup(name = 'Group'): GroupNode {
  return {
    id: createId(),
    type: 'group',
    name,
    // Placed by `addNode`, like every other node — a constructor cannot know its siblings.
    parentId: null,
    order: FIRST_ORDER,
    visible: true,
    opacity: staticTrack(1),
    behaviours: {},
  };
}

export function emptyProject(): Project {
  const camera = createCamera();
  return {
    format: CURRENT_FORMAT,
    name: 'Untitled animation',
    duration: 12,
    fps: 30,
    width: 1920,
    height: 1080,
    basemap: 'dark',
    terrain: false,
    terrainExaggeration: 1.4,
    background: '#0d1117',
    nodes: { [camera.id]: camera },
    contexts: [],
    story: [],
  };
}

/**
 * A project holding `nodes`, in the order given.
 *
 * Building a store by hand means knowing how order keys are handed out, and that knowledge
 * belongs in one place (nodes.ts). Every construction path — the bundled example projects,
 * an importer, a test — wants the same thing: "these nodes, in this order, in a project".
 *
 * The camera `emptyProject` starts with stands unless `nodes` brings one of its own. A
 * composition with no camera renders from the evaluator's default view, so silently
 * dropping the default would change what an existing caller sees; supplying a camera is
 * how you say you meant to.
 */
export function projectWith(nodes: DocNode[], init: Omit<Partial<Project>, 'nodes'> = {}): Project {
  const base = emptyProject();
  const keep = nodes.some((n) => n.type === 'camera') ? {} : base.nodes;
  const project: Project = { ...base, ...init, nodes: { ...keep } };
  for (const node of nodes) addNode(project, node);
  return project;
}

/**
 * The flat tour fields a pre-M9 document carries, where `tour` was a boolean.
 *
 * Named rather than inlined so the old schema is legible: this is the contract the
 * importer honours, and deleting a line here silently drops a user's setting.
 */
interface LegacyRegions {
  tour?: boolean | RegionTour;
  order?: RegionOrder;
  /**
   * Where the flat `order` goes when the node store claims that name (migration 6→7).
   *
   * Both are read, newest first: a document that came through the 6→7 step has
   * `tourOrder`, and one hand-written against the older schema has `order`.
   */
  tourOrder?: RegionOrder;
  customOrder?: string[];
  dwell?: number;
  stopDurations?: number[];
  moveTime?: number;
  driveCamera?: boolean;
  padding?: number;
  maxZoom?: number;
  tourPitch?: number;
  countUp?: boolean;
  sequenceReveal?: boolean;
  cameraOvershoot?: boolean;
  cameraBow?: number;
  dimOthers?: number;
  intro?: number;
  introTrace?: boolean;
  outro?: number;
  labelAll?: boolean;
  labelSize?: number;
  labelAt?: number;
}

/**
 * Lift a pre-M9 region layer's flat tour settings into the nested behaviour.
 *
 * A document written before the split has `tour: true` and twenty-one siblings;
 * one written after has `tour: { … }`. Both must open with every value the user
 * set intact — a migration that quietly resets someone's pacing to the defaults is
 * data loss that looks like a preference change.
 */
/** The region orderings this format knows. A value that is not one of them means nothing. */
const REGION_ORDERS: RegionOrder[] = ['geojson', 'valueDesc', 'valueAsc', 'alpha', 'custom'];

const regionOrder = (value: unknown): RegionOrder | undefined =>
  REGION_ORDERS.includes(value as RegionOrder) ? (value as RegionOrder) : undefined;

function migrateTour(legacy: LegacyRegions, current: RegionTour): RegionTour {
  // Already nested: fill any field a newer build added and leave the rest alone.
  if (legacy.tour && typeof legacy.tour === 'object') return { ...defaultTour(), ...legacy.tour };

  const pick = <T,>(value: T | undefined, fallback: T): T => (value === undefined ? fallback : value);
  // `current` came from spreading the legacy layer over a fresh one, so for a
  // pre-M9 document it is the old boolean, not a tour. `??` would keep it — it
  // guards null, not the wrong type — and every default would read as undefined.
  const d = current && typeof current === 'object' ? current : defaultTour();
  return {
    // `tour` was the on/off flag; absent means an even older document, and those
    // all toured — that was the only thing the layer did.
    enabled: legacy.tour === undefined ? d.enabled : legacy.tour === true,
    // Validated rather than taken on trust, because `order` is now also the node store's
    // field name: a document that never set a region ordering arrives here with a
    // fractional index in that slot, and writing `V` into the tour would leave the layer
    // sorting by a rule that does not exist.
    order: pick(regionOrder(legacy.tourOrder) ?? regionOrder(legacy.order), d.order),
    customOrder: pick(legacy.customOrder, d.customOrder),
    dwell: pick(legacy.dwell, d.dwell),
    stopDurations: pick(legacy.stopDurations, d.stopDurations),
    moveTime: pick(legacy.moveTime, d.moveTime),
    driveCamera: pick(legacy.driveCamera, d.driveCamera),
    padding: pick(legacy.padding, d.padding),
    maxZoom: pick(legacy.maxZoom, d.maxZoom),
    // Renamed on the way in: the `tour`/`camera` prefixes were only there to
    // disambiguate names that are no longer siblings of anything.
    pitch: pick(legacy.tourPitch, d.pitch),
    overshoot: pick(legacy.cameraOvershoot, d.overshoot),
    bow: pick(legacy.cameraBow, d.bow),
    sequenceReveal: pick(legacy.sequenceReveal, d.sequenceReveal),
    countUp: pick(legacy.countUp, d.countUp),
    dimOthers: pick(legacy.dimOthers, d.dimOthers),
    intro: pick(legacy.intro, d.intro),
    introTrace: pick(legacy.introTrace, d.introTrace),
    outro: pick(legacy.outro, d.outro),
    labelAll: pick(legacy.labelAll, d.labelAll),
    labelSize: pick(legacy.labelSize, d.labelSize),
    labelAt: pick(legacy.labelAt, d.labelAt),
  };
}

export function migrate(input: unknown): Project {
  // The format chain first: it brings the document to the shape the defaults below
  // describe. Filling defaults into an old shape would mean the defaults having to know
  // every historical form, which is exactly what the chain exists to avoid.
  const upgraded = runMigrations(input);
  const p = { ...emptyProject(), ...(upgraded as unknown as Project) };
  // Audio survives if there is anything to play or mux. Requiring `url` used to
  // drop the whole block, so a project rendered by the CLI — which has no server
  // to serve a URL from — lost its narration the moment it was opened.
  if (p.audio) {
    const cues = Array.isArray(p.audio.cues) ? p.audio.cues : null;
    const usable = !!cues && (!!p.audio.url || !!p.audio.file || cues.some((c) => c.file));
    if (!usable) delete p.audio;
    else {
      // Cues predate having identity; without an id they cannot be dragged or
      // deleted, and React would key them by array position.
      p.audio.cues = cues.map((c) => (c.id ? c : { ...c, id: createId() }));
    }
  }
  p.nodes = fillNodes(p.nodes);
  return p;
}

/**
 * Repair the node store: every entry filled against its type's defaults, and every entry
 * carrying the two fields the store itself needs.
 *
 * The record's **key** is taken as the node's identity, not the `id` field inside it. They
 * can only disagree in a hand-edited file, and if they do, the key is what every lookup in
 * the app will use — a node whose `id` says otherwise is a node that cannot be selected,
 * deleted or referenced by a story block.
 *
 * A node missing an order key is placed after everything that has one, in the order the
 * record enumerates. That is arbitrary, and it is the honest answer: the file did not say.
 */
function fillNodes(loaded: unknown): Project['nodes'] {
  if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) return {};
  const out: Project['nodes'] = {};
  let last: string | null = null;

  // Existing keys first, so the ones the file *did* state keep their relative positions and
  // anything unordered lands after them rather than in the middle.
  for (const node of Object.values(loaded as Record<string, { order?: unknown }>)) {
    const order = typeof node?.order === 'string' ? node.order : null;
    if (order !== null && (last === null || order > last)) last = order;
  }

  for (const [key, value] of Object.entries(loaded as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const raw = value as Record<string, unknown> & { type?: unknown };

    const filled = raw.type === 'camera' ? fillCamera(raw) : raw.type === 'group' ? fillGroup(raw) : fillLayer(raw);
    filled.id = key;
    filled.parentId = typeof raw.parentId === 'string' ? raw.parentId : null;
    if (typeof raw.order === 'string' && raw.order.length > 0) {
      filled.order = raw.order;
    } else {
      last = orderBetween(last, null);
      filled.order = last;
    }
    out[key] = filled;
  }
  return out;
}

/**
 * Repair a loaded group.
 *
 * Same shape of reasoning as `fillCamera`: the opacity track validates as a whole (a
 * discriminated union cannot be field-merged), everything else falls back field by field, so
 * a hand-edited file degrades to a usable group rather than to a crash.
 */
function fillGroup(raw: Record<string, unknown>): GroupNode {
  const defaults = createGroup();
  return {
    id: typeof raw.id === 'string' ? raw.id : defaults.id,
    type: 'group',
    name: typeof raw.name === 'string' ? raw.name : defaults.name,
    parentId: typeof raw.parentId === 'string' ? raw.parentId : null,
    order: typeof raw.order === 'string' ? raw.order : defaults.order,
    visible: typeof raw.visible === 'boolean' ? raw.visible : true,
    ...(raw.locked === true ? { locked: true as const } : {}),
    opacity: coerceTrack(raw.opacity, defaults.opacity),
    behaviours:
      raw.behaviours && typeof raw.behaviours === 'object' && !Array.isArray(raw.behaviours)
        ? (raw.behaviours as GroupNode['behaviours'])
        : {},
  };
}

/** Fill one layer against its type's defaults, including the pre-M9 flat tour fields. */
function fillLayer(raw: Record<string, unknown>): Layer {
  const type = (raw.type ?? 'text') as LayerType;
  const at = typeof raw.in === 'number' ? raw.in : 0;
  // An unknown `type` has no defaults to fill from, so it becomes a text layer rather than
  // an object every consumer's switch falls through. Reachable only from a file this
  // project did not write.
  const defaults = createLayer(TYPES.includes(type) ? type : 'text', at);
  const filled = coerceToDefaults({ ...defaults, ...raw }, defaults) as Layer;
  if (filled.type === 'route') {
    filled.marker = { ...(createLayer('route', 0) as Extract<Layer, { type: 'route' }>).marker, ...filled.marker };
    filled.follow = { ...(createLayer('route', 0) as Extract<Layer, { type: 'route' }>).follow, ...filled.follow };
  }
  if (filled.type === 'regions') filled.tour = migrateTour(raw as unknown as LegacyRegions, filled.tour);
  return filled;
}

const TYPES: LayerType[] = ['route', 'marker', 'text', 'shape', 'regions', 'clouds', 'image'];

/**
 * Repair a loaded camera node against the defaults.
 *
 * Tracks validate as wholes — a discriminated union cannot be field-merged without
 * grafting one kind's payload onto another, which is the bug `coerceTrack` exists to
 * prevent. Everything else falls back field by field, so a hand-edited file degrades
 * to a camera rather than to a crash.
 */
function fillCamera(loaded: unknown): CameraNode {
  const defaults = createCamera();
  if (!loaded || typeof loaded !== 'object') return defaults;
  const c = loaded as Partial<CameraNode>;
  const tracks = (c.tracks ?? {}) as Partial<CameraNode['tracks']>;
  return {
    id: typeof c.id === 'string' ? c.id : defaults.id,
    type: 'camera',
    name: typeof c.name === 'string' ? c.name : defaults.name,
    // Both are re-derived by `fillNodes`, which owns the store's shape; the defaults here
    // only keep this function total for a caller that has no store to place it in.
    parentId: typeof c.parentId === 'string' ? c.parentId : null,
    order: typeof c.order === 'string' ? c.order : FIRST_ORDER,
    tracks: {
      center: coerceTrack(tracks.center, defaults.tracks.center),
      zoom: coerceTrack(tracks.zoom, defaults.tracks.zoom),
      bearing: coerceTrack(tracks.bearing, defaults.tracks.bearing),
      pitch: coerceTrack(tracks.pitch, defaults.tracks.pitch),
    },
    behaviours:
      c.behaviours && typeof c.behaviours === 'object' && !Array.isArray(c.behaviours) ? c.behaviours : {},
  };
}

/**
 * Replace any field whose type disagrees with its default.
 *
 * `migrate` fills in fields a file is *missing*; this handles fields it has *wrong*.
 * The two are different failures with very different consequences. A missing field
 * throws nothing and the spread covers it. A field of the wrong type sails through
 * every check the type system can make — the value is typed by declaration, not by
 * what was in the JSON — and lands in the renderer, which is not a place with any
 * recovery: `label` arriving as an object rather than a string threw
 * `style.label.trim is not a function` on every frame from then on, well after the
 * `try/catch` around Open had returned successfully.
 *
 * The defaults are the schema. Nothing has to be written down twice, and a new field
 * is covered the moment it has a default.
 *
 * Two things are deliberately left alone. A `null` default carries no type to check
 * against — `flipRamp` is `boolean | null` and means "follow the basemap" — so the
 * loaded value stands. And an array's *elements* are not inspected: `coords` and
 * `values` hold user data whose own validation belongs where it is read, not here.
 */
function coerceToDefaults<T>(loaded: T, defaults: T): T {
  if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) return defaults;
  const out = { ...loaded } as Record<string, unknown>;
  const base = defaults as Record<string, unknown>;

  for (const key of Object.keys(base)) {
    const want = base[key];
    const got = out[key];
    if (want === null || want === undefined) continue;

    // A track is a discriminated union, so the field-by-field merge below would graft
    // a static track's `value` onto a keyframed one. It validates as a whole instead.
    if (isTrack(want)) {
      out[key] = coerceTrack(got, want as Track<unknown>);
    } else if (Array.isArray(want)) {
      if (!Array.isArray(got)) out[key] = want;
    } else if (typeof want === 'object') {
      out[key] = coerceToDefaults(got, want);
    } else if (typeof got !== typeof want) {
      out[key] = want;
    } else if (typeof want === 'number' && !Number.isFinite(got as number)) {
      // NaN and Infinity are `typeof number` and survive every other check here, then
      // propagate silently through the geometry into coordinates that never draw.
      out[key] = want;
    }
  }
  return out as T;
}
