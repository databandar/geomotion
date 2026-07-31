import { useMemo } from 'react';
import { create } from 'zustand';
import {
  History,
  addNode,
  ancestorsOf,
  childrenOf,
  createCamera,
  createGroup,
  createLayer,
  descendantsOf,
  duplicateNode,
  isGroupNode,
  layerAt,
  layersOf,
  liveCamera,
  moveNodeBy,
  nodesOf,
  removeNode,
  setNodeParent,
  hasKeyAt,
  patchShot,
  removeShot,
  rippleBlockLength,
  rippleBlockTo,
  isTrack,
  keyframe,
  shotAt,
  shotsOf,
  staticTrack,
  toKeyframed,
  transact,
  upsertShot,
  windowTrack,
  withKeyMoved,
  withValueAt,
  withoutKeyAt,
} from '@geomotion/document';
import type { EasingName, Track } from '@geomotion/document';
import type { AudioCue, CameraKeyframe, DocNode, GroupNode, Layer, LayerType, Project } from '@geomotion/document';
import { clamp, createId } from '@geomotion/core';
import { clearPathCache } from '@geomotion/evaluator';
import { clearRegionCache } from '@geomotion/entities';
import { demoProject } from './lib/fixtures';
import { loadLocal, saveLocal } from './lib/persistence';
import { applyTheme, loadTheme, type Theme } from './lib/theme';

export type Selection =
  | { kind: 'layer'; id: string }
  | { kind: 'keyframe'; id: string }
  /** An audio clip on the timeline. */
  | { kind: 'cue'; id: string }
  | null;
export type Tool = 'select' | 'route' | 'marker';

export interface ExportStatus {
  active: boolean;
  label: string;
  progress: number;
  cancel?: () => void;
}

interface State {
  project: Project;
  time: number;
  playing: boolean;
  loop: boolean;
  /** narration playback in the editor; never affects a render */
  muted: boolean;
  selection: Selection;
  /**
   * Additional selected node ids, beside the primary `selection`.
   *
   * Editor state (§4): a view of the document, not part of it. Primary-plus-rest rather
   * than one list, because the inspector edits *one* thing and a flat list would leave it
   * guessing which of five layers it is showing. The primary is the last row you clicked.
   */
  also: string[];
  /**
   * Which groups are shut in the layer panel, by id.
   *
   * Editor state (§4): how *you* are looking at the document, not part of it. Two people
   * on one project may reasonably have different rows open, and a collapsed group is not
   * something anyone wants back on an undo.
   */
  collapsed: Record<string, boolean>;
  tool: Tool;
  /** timeline zoom */
  pxPerSec: number;
  /** bumped on every history change so the UI can re-read canUndo/canRedo */
  historyRev: number;
  exportStatus: ExportStatus | null;
  /** true while frames are being captured — hides editor-only chrome */
  exporting: boolean;
  /** bumped whenever the map should re-read the whole project structure */
  structureRev: number;
  /** set when the browser refused the last autosave, so the UI can say so */
  autosaveError: string | null;

  patch: (fn: (p: Project) => void, historyKey?: string) => void;
  replaceProject: (p: Project) => void;

  setTime: (t: number) => void;
  scrub: (t: number) => void;
  setPlaying: (v: boolean) => void;
  toggleLoop: () => void;
  toggleMuted: () => void;
  select: (s: Selection) => void;
  /** Add or remove a node from the selection, keeping the primary. ⌘/Ctrl-click. */
  toggleAlso: (id: string) => void;
  /** Replace the whole selection: `ids` last-clicked-first. Shift-click ranges. */
  selectMany: (primary: string, ids: string[]) => void;
  toggleCollapsed: (id: string) => void;
  setTool: (t: Tool) => void;
  setPxPerSec: (v: number) => void;
  setExportStatus: (s: ExportStatus | null) => void;
  setExporting: (v: boolean) => void;
  /** Editor preference, not document state (§4): never undoable, never exported. */
  theme: Theme;
  setTheme: (t: Theme) => void;
  /** Which rail section is showing. Editor state: not undoable, not exported. */
  place: string;
  setPlace: (p: string) => void;
  /**
   * Record mode: while armed, settling the map writes a camera keyframe at the playhead.
   *
   * Editor state rather than document state — it is a mode you are in, not something the
   * project remembers, and it must not survive a reload. The keyframes it writes are of
   * course document state and undo normally.
   */
  recording: boolean;
  setRecording: (v: boolean) => void;

  addLayer: (type: LayerType) => Layer;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  updateLayer: <T extends Layer>(id: string, patch: Partial<T>, historyKey?: string) => void;
  /**
   * Set a tracked property at the playhead.
   *
   * Separate from `updateLayer` because the write depends on the track's kind: a static
   * property takes the value, an animated one takes a key at `time`. A caller that had
   * to work that out for itself would end up reimplementing it at every control.
   */
  setLayerTrack: (id: string, prop: string, value: number, historyKey?: string) => void;
  /** Turn animation on or off for a tracked property, keeping what is on screen. */
  toggleLayerTrack: (id: string, prop: string, valueNow: number) => void;
  /** Add or remove the key at the playhead. */
  toggleLayerKey: (id: string, prop: string, valueNow: number) => void;
  /** Retime one key of a tracked property. */
  moveLayerKey: (id: string, prop: string, keyId: string, t: number) => void;
  /**
   * Point a tracked property at an expression, or take it back to a fixed value.
   *
   * Separate from `toggleLayerTrack` rather than folded into it: that one is a two-state
   * switch a single click drives, and making it cycle three ways would mean clicking past
   * a state you did not want on the way to the one you did. Expressions are also the only
   * kind that needs something typed, so they need a control that can take text.
   */
  setLayerExpr: (id: string, prop: string, source: string) => void;
  /** Switch to an expression seeded with the value on screen, or back to that value. */
  toggleLayerExpr: (id: string, prop: string, valueNow: number) => void;
  /** Rewrite a tracked property as a plain 0..1 window between two times. */
  setLayerWindow: (id: string, prop: string, from: number, to: number, easing: EasingName) => void;
  /** Drag a story block, taking what it choreographs and re-anchoring what follows. */
  moveStoryBlock: (id: string, t: number) => void;
  /** Re-length a story block, pushing or pulling everything after it. */
  resizeStoryBlock: (id: string, d: number) => void;
  moveLayer: (id: string, dir: -1 | 1) => void;
  /** Put the selected nodes in a new group, where the topmost of them sat. ⌘G. */
  groupSelection: () => void;
  /** Put a group's children back where the group was, and remove it. ⇧⌘G. */
  ungroup: (id: string) => void;
  /** Lock or unlock a layer. Locked layers refuse every other edit — see `editable`. */
  setLayerLocked: (id: string, locked: boolean) => void;

  addAudioCue: (cue: Omit<AudioCue, 'id'>) => void;
  updateAudioCue: (id: string, patch: Partial<AudioCue>, historyKey?: string) => void;
  removeAudioCue: (id: string) => void;

  addKeyframe: (kf?: Partial<CameraKeyframe>) => void;
  updateKeyframe: (id: string, patch: Partial<CameraKeyframe>, historyKey?: string) => void;
  removeKeyframe: (id: string) => void;

  undo: () => void;
  redo: () => void;
}

/**
 * History is a log of patch pairs, not a stack of whole projects.
 *
 * It lives beside the store rather than inside it because it is not render state:
 * nothing re-renders when the undo stack grows, and putting 80 entries of it in
 * the zustand state would make every subscriber recompute on every keystroke.
 * `historyRev` is what the UI watches.
 */
const history = new History();

let saveTimer: number | undefined;

/**
 * Merge `patch` into `target` in place, and say whether anything actually moved.
 *
 * These actions used to assign a spread object — `p.layers[i] = { ...cur, ...patch }` —
 * which Immer records as a replacement whether or not a single field differs. So
 * retyping a number as the value it already held, or dragging a slider back to where it
 * started, spent an undo step that reversed nothing. `patch`'s guard against empty
 * transactions could never catch it, because the transaction was not empty.
 *
 * Assigning field by field lets Immer's own equality check do the work: an assignment
 * of an identical value marks nothing dirty, so a no-op edit produces no patches and
 * `patch` drops it.
 */
function assignChanged<T extends object>(target: T, patch: Partial<T>): void {
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const next = patch[key];
    if (next !== undefined && target[key] !== next) target[key] = next as T[keyof T];
  }
}

/**
 * Put a ripple's rewritten layers back into the store.
 *
 * `rippleBlockTo` and `rippleBlockLength` take and return plain lists — they are pure
 * functions over the layers a block owns, and knowing about the store would tie the timing
 * rules to the storage shape. Only the layers that actually moved are written, which is
 * what keeps a ripple's patch set proportional to the beats it touched rather than to the
 * size of the composition.
 */
function writeBack(p: Project, layers: readonly Layer[]): void {
  for (const layer of layers) {
    if (p.nodes[layer.id] !== layer) p.nodes[layer.id] = layer;
  }
}

/** A lock, wherever it is. Cameras have none, which is why this is a guarded read. */
const isLocked = (node: DocNode) => 'locked' in node && node.locked === true;

/**
 * The node to edit, or nothing if it — or anything above it — is locked.
 *
 * One gate rather than a check per control. A lock enforced in the UI is a lock the
 * next control forgets about — and there are already a dozen paths that reach a layer
 * (the inspector, four timeline drags, the keyframe row, the map canvas). Locking has to
 * mean the *document* refuses, so the answer is the same wherever the edit came from.
 *
 * Ancestors count: a locked group protects what is inside it, or it protects nothing —
 * "locked" that leaves every child editable is a label, not a lock.
 *
 * `setLayerLocked` deliberately does not come through here — the way out of a lock
 * cannot be locked.
 */
function editable(p: Project, id: string): DocNode | undefined {
  const node = p.nodes[id];
  if (!node || isLocked(node)) return undefined;
  return ancestorsOf(p, id).some(isLocked) ? undefined : node;
}

/** Whether an edit addressed to this node would be refused — what the UI greys out on. */
export function isEditLocked(p: Project, id: string): boolean {
  const node = p.nodes[id];
  return !!node && (isLocked(node) || ancestorsOf(p, id).some(isLocked));
}

/**
 * The camera edits go to, creating it if the document has none.
 *
 * A camera is an observer: a composition without one is valid (the evaluator renders
 * from its default view), so the store cannot assume one exists — the first keyframe
 * the user places is what brings it into being.
 */
function ensureCamera(p: Project) {
  const existing = liveCamera(p);
  if (existing) return existing;
  const cam = createCamera();
  addNode(p, cam);
  // Read back out of the store: `addNode` places a copy carrying the order key it was
  // given, and edits have to land on the node the document holds.
  return p.nodes[cam.id] as typeof cam;
}

export const useStore = create<State>((set, get) => ({
  project: loadLocal() ?? demoProject(),
  time: 0,
  playing: false,
  loop: true,
  muted: false,
  selection: null,
  also: [],
  collapsed: {},
  tool: 'select',
  pxPerSec: 70,
  historyRev: 0,
  exportStatus: null,
  exporting: false,
  theme: loadTheme(),
  place: 'layers',
  recording: false,
  structureRev: 0,
  autosaveError: null,

  patch: (fn, historyKey) => {
    const state = get();
    const tx = transact(state.project, fn);
    // A recipe that bailed out (`if (i < 0) return`) changed nothing; committing
    // it would leave an empty step that makes the first undo look broken.
    if (tx.forward.length === 0) return;

    history.push(tx, historyKey);

    set({
      project: tx.next,
      historyRev: state.historyRev + 1,
      structureRev: state.structureRev + 1,
    });

    scheduleSave(get);
  },

  replaceProject: (p) => {
    clearPathCache();
    clearRegionCache();
    const s = get();
    // Loading a document is still undoable, but it cannot be expressed cheaply:
    // the patch pair carries a whole project each way. That is the honest cost of
    // a wholesale load, and loads are rare.
    history.push(transact(s.project, () => p));
    set({
      project: p,
      // Long projects (a 36-stop region tour runs well over a minute) are
      // unusable at the default zoom, so frame the whole thing on load.
      pxPerSec: clamp(1000 / Math.max(1, p.duration), 12, 400),
      selection: null,
      time: 0,
      playing: false,
      historyRev: s.historyRev + 1,
      structureRev: s.structureRev + 1,
    });
    const saved = saveLocal(p);
    set({ autosaveError: saved.ok ? null : saved.reason });
  },

  setTime: (t) => set({ time: t }),
  scrub: (t) => set((s) => ({ time: clamp(t, 0, s.project.duration), playing: false })),
  setPlaying: (v) => set({ playing: v }),
  toggleLoop: () => set((s) => ({ loop: !s.loop })),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
  // A plain click replaces the selection. Keeping the extras would make every click after
  // a multi-select silently additive, which is not what any editor does.
  select: (selection) => set({ selection, also: [] }),

  toggleAlso: (id) => {
    const { selection, also } = get();
    if (!selection || selection.kind !== 'layer') return set({ selection: { kind: 'layer', id }, also: [] });
    if (selection.id === id) {
      // Deselecting the primary promotes the next one rather than emptying the selection.
      const [next, ...rest] = also;
      return set(next ? { selection: { kind: 'layer', id: next }, also: rest } : { selection: null, also: [] });
    }
    const without = also.filter((x) => x !== id);
    set(without.length === also.length ? { also: [...also, id] } : { also: without });
  },

  selectMany: (primary, ids) =>
    set({ selection: { kind: 'layer', id: primary }, also: ids.filter((id) => id !== primary) }),
  toggleCollapsed: (id) => set((s) => ({ collapsed: { ...s.collapsed, [id]: !s.collapsed[id] } })),

  setTool: (tool) => set({ tool }),
  setPxPerSec: (v) => set({ pxPerSec: clamp(v, 12, 400) }),
  setExportStatus: (exportStatus) => set({ exportStatus }),
  setExporting: (exporting) => set({ exporting }),

  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },

  setPlace: (place) => set({ place }),

  setRecording: (recording) => set({ recording }),

  addLayer: (type) => {
    const { time, patch, project, selection } = get();
    const layer = createLayer(type, Math.min(time, Math.max(0, project.duration - 1)));
    layer.out = Math.min(project.duration, layer.in + 6);
    // A new route reveals over four seconds, or up to the end of the composition if it
    // is shorter — the same rule as before, said in tracks.
    if (layer.type === 'route') {
      layer.progress = windowTrack(layer.in, Math.min(project.duration, layer.in + 4), 'easeInOutCubic');
    }
    /*
     * A new layer lands inside whatever container you are working in — the selected group,
     * or the group holding the selected layer. Without this a group is a one-way door: you
     * could make one and never put anything else in it.
     */
    const anchor = selection?.kind === 'layer' ? project.nodes[selection.id] : undefined;
    const parentId = anchor ? (isGroupNode(anchor) ? anchor.id : anchor.parentId) : null;

    patch((p) => {
      addNode(p, layer, { parentId });
    });
    set({ also: [], selection: { kind: 'layer', id: layer.id }, tool: type === 'route' ? 'route' : type === 'marker' ? 'marker' : 'select' });
    return layer;
  },

  removeLayer: (id) => {
    const project = get().project;
    if (isEditLocked(project, id)) return;
    // Read before the delete: afterwards the subtree is gone and there is nothing to ask.
    const removed = descendantsOf(project, id);
    for (const node of [id, ...removed]) {
      clearPathCache(node);
      clearRegionCache(node);
    }
    get().patch((p) => {
      removeNode(p, id);
    });
    // The subtree went with it, so anything under it leaves the selection too.
    const gone = new Set([id, ...removed]);
    const sel = get().selection;
    set({
      also: get().also.filter((x) => !gone.has(x)),
      ...(sel?.kind === 'layer' && gone.has(sel.id) ? { selection: null } : {}),
    });
  },

  duplicateLayer: (id) => {
    const src = get().project.nodes[id];
    if (!src) return;
    /*
     * A group duplicates with everything under it, each copy given a fresh id — two rows
     * sharing one id would be two panel entries editing one layer, and deleting either
     * would take both.
     *
     * The copy comes out unlocked, even from a locked original — a divergence from After
     * Effects and Figma, chosen because duplicating is how you get an editable version of
     * the thing you locked, and the copy is selected immediately. `duplicateNode` owns that
     * rule now, so it holds for every node type.
     */
    let copyId: string | undefined;
    get().patch((p) => {
      copyId = duplicateNode(p, id, (name) => name + ' copy');
    });
    if (copyId) set({ also: [], selection: { kind: 'layer', id: copyId } });
  },

  updateLayer: (id, patchObj, historyKey) => {
    get().patch((p) => {
      const existing = editable(p, id);
      if (!existing) return;
      assignChanged(existing, patchObj as Partial<Layer>);
    }, historyKey ? `${id}:${historyKey}` : undefined);
  },

  setLayerTrack: (id, prop, value, historyKey) => {
    const time = get().time;
    get().patch((p) => {
      const layer = editable(p, id) as Record<string, unknown> | undefined;
      const track = layer?.[prop];
      if (!isTrack(track)) return;
      layer![prop] = withValueAt(track as Track<number>, time, value, 'linear');
    }, historyKey ? `${id}:${prop}:${historyKey}` : undefined);
  },

  toggleLayerTrack: (id, prop, valueNow) => {
    const time = get().time;
    get().patch((p) => {
      const layer = editable(p, id) as Record<string, unknown> | undefined;
      const track = layer?.[prop];
      if (!isTrack(track)) return;
      const t = track as Track<number>;
      // Seeded with what is on screen, so switching modes never moves the picture.
      layer![prop] = t.kind === 'keyframed' ? staticTrack(valueNow) : toKeyframed(t, time, valueNow, 'linear');
    });
  },

  toggleLayerKey: (id, prop, valueNow) => {
    const time = get().time;
    get().patch((p) => {
      const layer = editable(p, id) as Record<string, unknown> | undefined;
      const track = layer?.[prop];
      if (!isTrack(track)) return;
      const t = track as Track<number>;
      layer![prop] = hasKeyAt(t, time)
        ? withoutKeyAt(t, time)
        : withValueAt(toKeyframed(t, time, valueNow, 'linear'), time, valueNow, 'linear');
    });
  },

  moveLayerKey: (id, prop, keyId, t) => {
    get().patch((p) => {
      const layer = editable(p, id) as Record<string, unknown> | undefined;
      const track = layer?.[prop];
      if (!isTrack(track)) return;
      layer![prop] = withKeyMoved(track as Track<number>, keyId, Math.max(0, t));
    }, `${id}:${prop}:${keyId}:move`);
  },

  setLayerExpr: (id, prop, source) => {
    get().patch((p) => {
      const layer = editable(p, id) as Record<string, unknown> | undefined;
      const track = layer?.[prop];
      if (!isTrack(track)) return;
      const prev = track as Track<number>;
      // `inputs` survives a source edit. They are a separate act to declare, and losing
      // the bindings every time the formula is retyped would make the feature unusable.
      const inputs = prev.kind === 'expr' ? prev.inputs : undefined;
      layer![prop] = { kind: 'expr', source, ...(inputs ? { inputs } : {}) };
    }, `${id}:${prop}:expr`);
  },

  toggleLayerExpr: (id, prop, valueNow) => {
    get().patch((p) => {
      const layer = editable(p, id) as Record<string, unknown> | undefined;
      const track = layer?.[prop];
      if (!isTrack(track)) return;
      const t = track as Track<number>;
      // Seeded with what is on screen in both directions, so switching kinds never moves
      // the picture — the same rule the static/keyframed toggle follows.
      layer![prop] =
        t.kind === 'expr'
          ? staticTrack(valueNow)
          : { kind: 'expr', source: String(Number(valueNow.toFixed(4))) };
    });
  },

  setLayerWindow: (id, prop, from, to, easing) => {
    get().patch((p) => {
      const layer = editable(p, id) as Record<string, unknown> | undefined;
      if (!layer || !isTrack(layer[prop])) return;
      layer[prop] = windowTrack(Math.max(0, from), Math.max(0, to), easing);
    }, `${id}:${prop}:window`);
  },

  moveStoryBlock: (id, t) => {
    get().patch((p) => {
      const out = rippleBlockTo(p.story, layersOf(p), p.audio?.cues ?? [], id, t);
      p.story = out.story;
      writeBack(p, out.layers);
      if (p.audio) p.audio.cues = out.cues;
    }, `${id}:block:move`);
  },

  resizeStoryBlock: (id, d) => {
    get().patch((p) => {
      const out = rippleBlockLength(p.story, layersOf(p), p.audio?.cues ?? [], id, d);
      p.story = out.story;
      writeBack(p, out.layers);
      if (p.audio) p.audio.cues = out.cues;
    }, `${id}:block:len`);
  },

  /**
   * Lock or unlock — the one layer edit a lock does not block, for obvious reasons.
   * `undefined` is written back rather than `false` so unlocking leaves no trace in the
   * saved file, matching a project that was never locked in the first place.
   */
  setLayerLocked: (id, locked) => {
    get().patch((p) => {
      const node = p.nodes[id];
      // A camera has no lock — it holds no user content to protect, and every edit to it
      // goes through the shot helpers rather than the layer gate.
      if (!node || node.type === 'camera') return;
      if (locked) node.locked = true;
      else delete node.locked;
    });
  },

  moveLayer: (id, dir) => {
    get().patch((p) => {
      if (!editable(p, id)) return;
      moveNodeBy(p, id, dir);
    });
  },

  /**
   * Put the selection in a new group.
   *
   * The group lands where the *topmost* selected node sat, so a beat keeps its place in the
   * draw order rather than jumping to the front. Members are reparented in the order they
   * already had, which is what makes grouping and ungrouping a round trip.
   *
   * Only nodes sharing a parent are grouped together: pulling a layer out of one group and
   * a layer out of another into a third would move things across the tree on a keystroke
   * that reads as "put these together". The common parent is the primary selection's, and
   * anything living elsewhere is left alone.
   */
  groupSelection: () => {
    const { project, selection, also } = get();
    if (selection?.kind !== 'layer') return;

    const wanted = new Set([selection.id, ...also]);
    const primary = project.nodes[selection.id];
    if (!primary) return;
    const parentId = primary.parentId ?? null;

    // Document order, so the group's contents read the same as the panel did.
    const members = nodesOf(project).filter(
      (n) => wanted.has(n.id) && (n.parentId ?? null) === parentId && !isEditLocked(project, n.id),
    );
    if (members.length === 0) return;

    const group = createGroup(members.length === 1 ? `${members[0]!.name} group` : 'Group');
    const anchor = members[members.length - 1] as (typeof members)[number];

    get().patch((p) => {
      addNode(p, group, { parentId, after: anchor.id });
      for (const member of members) setNodeParent(p, member.id, group.id);
    });
    set({ selection: { kind: 'layer', id: group.id }, also: [] });
  },

  /**
   * Dissolve a group, leaving its children where it was.
   *
   * Each child is placed after the one before it, so the subtree comes out in the order it
   * went in — reparenting them all "after the group" would hand them back reversed.
   */
  ungroup: (id) => {
    const { project } = get();
    const group = project.nodes[id];
    if (!group || !isGroupNode(group) || isEditLocked(project, id)) return;

    const children = childrenOf(project, id);
    get().patch((p) => {
      let after = id;
      for (const child of children) {
        setNodeParent(p, child.id, group.parentId ?? null, after);
        after = child.id;
      }
      removeNode(p, id);
    });
    // The group is gone, so selecting what came out of it is the only sensible landing.
    const first = children[0];
    set(
      first
        ? { selection: { kind: 'layer', id: first.id }, also: children.slice(1).map((c) => c.id) }
        : { selection: null, also: [] },
    );
  },

  /**
   * Audio lives on the project rather than as a layer.
   *
   * It has no spatial presence and nothing to draw, so a layer would carry two dozen
   * fields it never uses — exactly the "mode flags that fork a type's meaning" §3.8
   * rules out. Cues are the model the narration already used, so imported audio and
   * generated narration are the same thing to the player and the renderer.
   */
  addAudioCue: (cue) => {
    const id = createId();
    get().patch((p) => {
      const cues = p.audio?.cues ?? [];
      p.audio = { ...p.audio, cues: [...cues, { ...cue, id }] };
    });
  },

  updateAudioCue: (id, patch, historyKey) => {
    get().patch(
      (p) => {
        const i = p.audio?.cues.findIndex((c) => c.id === id) ?? -1;
        if (!p.audio || i < 0) return;
        const existing = p.audio.cues[i];
        if (!existing) return;
        assignChanged(existing, patch);
      },
      historyKey ? `${id}:${historyKey}` : undefined,
    );
  },

  removeAudioCue: (id) => {
    get().patch((p) => {
      if (!p.audio) return;
      const cues = p.audio.cues.filter((c) => c.id !== id);
      // An audio block with no cues has nothing to play; drop it so the timeline
      // stops showing an empty track.
      if (cues.length) p.audio.cues = cues;
      else delete p.audio;
    });
    const sel = get().selection;
    if (sel?.kind === 'cue' && sel.id === id) set({ selection: null });
  },

  addKeyframe: (init) => {
    const { time } = get();
    const kf = keyframe(time, [0, 0], 2, init);
    get().patch((p) => {
      upsertShot(ensureCamera(p), kf);
    });
    // The upsert may have replaced the shot already at the playhead, keeping its id —
    // so look up by time, not by the id that was just built.
    const cam = liveCamera(get().project);
    const found = cam ? shotsOf(cam).find((k) => Math.abs(k.t - time) < 0.02) : undefined;
    if (found) set({ selection: { kind: 'keyframe', id: found.id } });
  },

  updateKeyframe: (id, patchObj, historyKey) => {
    get().patch((p) => {
      patchShot(ensureCamera(p), id, patchObj);
    }, historyKey ? `${id}:${historyKey}` : undefined);
  },

  removeKeyframe: (id) => {
    get().patch((p) => {
      const cam = liveCamera(p);
      if (cam) removeShot(cam, id);
    });
    const sel = get().selection;
    if (sel?.kind === 'keyframe' && sel.id === id) set({ selection: null });
  },

  undo: () => step(set, get, 'undo'),
  redo: () => step(set, get, 'redo'),
}));

/** Undo and redo differ only in which direction they replay. */
function step(set: (p: Partial<State>) => void, get: () => State, dir: 'undo' | 'redo') {
  const s = get();
  const project = dir === 'undo' ? history.undo(s.project) : history.redo(s.project);
  if (!project) return;
  // The caches key off layer identity and derived geometry, both of which the
  // replayed patches may have changed underneath them.
  clearPathCache();
  clearRegionCache();
  set({
    project,
    // Undoing a project load can restore a shorter composition; without this the
    // playhead is left stranded past the end, reading e.g. 01:38 / 00:15.
    time: clamp(s.time, 0, project.duration),
    historyRev: s.historyRev + 1,
    structureRev: s.structureRev + 1,
  });
  scheduleSave(get);
}

/** Debounced so a drag writes to localStorage once, not per frame. */
function scheduleSave(get: () => State) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const result = saveLocal(get().project);
    const next = result.ok ? null : result.reason;
    if (useStore.getState().autosaveError !== next) useStore.setState({ autosaveError: next });
  }, 500) as unknown as number;
}

// Handy for poking at state from the console (and for automated smoke tests).
if (import.meta.env.DEV) {
  (window as unknown as { __store: typeof useStore }).__store = useStore;
}

/** Selected layer, or undefined. */
export function useSelectedLayer(): Layer | undefined {
  return useStore((s) => (s.selection?.kind === 'layer' ? layerAt(s.project, s.selection.id) : undefined));
}

/** The selected group, or undefined. Groups and layers are both "selected layer" rows. */
export function useSelectedGroup(): GroupNode | undefined {
  return useStore((s) => {
    if (s.selection?.kind !== 'layer') return undefined;
    const node = s.project.nodes[s.selection.id];
    return node && isGroupNode(node) ? node : undefined;
  });
}

/** Selected audio clip, or undefined. */
export function useSelectedCue(): AudioCue | undefined {
  return useStore((s) =>
    s.selection?.kind === 'cue' ? s.project.audio?.cues.find((c) => c.id === s.selection?.id) : undefined,
  );
}

/**
 * The selected shot row.
 *
 * Two narrow selectors and a `useMemo` rather than one selector that builds the row:
 * `shotsOf` derives its rows fresh from the camera's per-channel tracks, so returning one
 * straight out of a selector hands React a new object on every render. Measured in a real
 * browser before this: selecting a camera keyframe logged "The result of getSnapshot should
 * be cached", then "Maximum update depth exceeded", and the editor stopped repainting.
 *
 * The camera node and the selected id are both stable — the node changes identity exactly
 * when the camera is edited — so the memo is keyed on precisely what the row derives from.
 */
export function useSelectedKeyframe(): CameraKeyframe | undefined {
  const camera = useStore((s) => liveCamera(s.project));
  const id = useStore((s) => (s.selection?.kind === 'keyframe' ? s.selection.id : null));
  return useMemo(() => (camera && id ? shotAt(camera, id) : undefined), [camera, id]);
}

/**
 * Undo availability, for enabling the toolbar buttons.
 *
 * History lives outside the zustand state, so these read through `historyRev` —
 * that is the subscription that makes the buttons re-render when the stacks move.
 */
export const useCanUndo = () => useStore((s) => s.historyRev >= 0 && history.canUndo);
export const useCanRedo = () => useStore((s) => s.historyRev >= 0 && history.canRedo);
