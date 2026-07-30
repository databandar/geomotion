import { create } from 'zustand';
import { History, createLayer, keyframe, transact } from '@geomotion/document';
import type { CameraKeyframe, Layer, LayerType, Project } from '@geomotion/document';
import { clamp, createId } from '@geomotion/core';
import { clearPathCache } from './lib/scene';
import { clearRegionCache } from './lib/regions';
import { demoProject } from './lib/fixtures';
import { loadLocal, saveLocal } from './lib/persistence';

export type Selection = { kind: 'layer'; id: string } | { kind: 'keyframe'; id: string } | null;
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

  patch: (fn: (p: Project) => void, historyKey?: string) => void;
  replaceProject: (p: Project) => void;

  setTime: (t: number) => void;
  scrub: (t: number) => void;
  setPlaying: (v: boolean) => void;
  toggleLoop: () => void;
  toggleMuted: () => void;
  select: (s: Selection) => void;
  setTool: (t: Tool) => void;
  setPxPerSec: (v: number) => void;
  setExportStatus: (s: ExportStatus | null) => void;
  setExporting: (v: boolean) => void;

  addLayer: (type: LayerType) => Layer;
  removeLayer: (id: string) => void;
  duplicateLayer: (id: string) => void;
  updateLayer: <T extends Layer>(id: string, patch: Partial<T>, historyKey?: string) => void;
  moveLayer: (id: string, dir: -1 | 1) => void;

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

export const useStore = create<State>((set, get) => ({
  project: loadLocal() ?? demoProject(),
  time: 0,
  playing: false,
  loop: true,
  muted: false,
  selection: null,
  tool: 'select',
  pxPerSec: 70,
  historyRev: 0,
  exportStatus: null,
  exporting: false,
  structureRev: 0,

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
    saveLocal(p);
  },

  setTime: (t) => set({ time: t }),
  scrub: (t) => set((s) => ({ time: clamp(t, 0, s.project.duration), playing: false })),
  setPlaying: (v) => set({ playing: v }),
  toggleLoop: () => set((s) => ({ loop: !s.loop })),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
  select: (selection) => set({ selection }),
  setTool: (tool) => set({ tool }),
  setPxPerSec: (v) => set({ pxPerSec: clamp(v, 12, 400) }),
  setExportStatus: (exportStatus) => set({ exportStatus }),
  setExporting: (exporting) => set({ exporting }),

  addLayer: (type) => {
    const { time, patch, project } = get();
    const layer = createLayer(type, Math.min(time, Math.max(0, project.duration - 1)));
    layer.out = Math.min(project.duration, layer.in + 6);
    if (layer.type === 'route') layer.drawEnd = Math.min(project.duration, layer.drawStart + 4);
    patch((p) => {
      p.layers.push(layer);
    });
    set({ selection: { kind: 'layer', id: layer.id }, tool: type === 'route' ? 'route' : type === 'marker' ? 'marker' : 'select' });
    return layer;
  },

  removeLayer: (id) => {
    clearPathCache(id);
    clearRegionCache(id);
    get().patch((p) => {
      p.layers = p.layers.filter((l) => l.id !== id);
    });
    const sel = get().selection;
    if (sel?.kind === 'layer' && sel.id === id) set({ selection: null });
  },

  duplicateLayer: (id) => {
    const src = get().project.layers.find((l) => l.id === id);
    if (!src) return;
    // A duplicate must be independent of its source, so this one copy stays deep.
    // structuredClone rather than a JSON round-trip: it is faster and does not
    // quietly drop values JSON cannot represent.
    const copy = { ...structuredClone(src), id: createId() } as Layer;
    copy.name = src.name + ' copy';
    get().patch((p) => {
      const i = p.layers.findIndex((l) => l.id === id);
      p.layers.splice(i + 1, 0, copy);
    });
    set({ selection: { kind: 'layer', id: copy.id } });
  },

  updateLayer: (id, patchObj, historyKey) => {
    get().patch((p) => {
      const i = p.layers.findIndex((l) => l.id === id);
      if (i < 0) return;
      p.layers[i] = { ...p.layers[i], ...(patchObj as object) } as Layer;
    }, historyKey ? `${id}:${historyKey}` : undefined);
  },

  moveLayer: (id, dir) => {
    get().patch((p) => {
      const i = p.layers.findIndex((l) => l.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.layers.length) return;
      [p.layers[i], p.layers[j]] = [p.layers[j], p.layers[i]];
    });
  },

  addKeyframe: (init) => {
    const { time, project } = get();
    const kf = keyframe(time, [0, 0], 2, init);
    get().patch((p) => {
      const existing = p.camera.find((k) => Math.abs(k.t - time) < 0.02);
      if (existing) Object.assign(existing, { ...kf, id: existing.id, t: existing.t });
      else p.camera.push(kf);
      p.camera.sort((a, b) => a.t - b.t);
    });
    const found = get().project.camera.find((k) => Math.abs(k.t - time) < 0.02);
    if (found) set({ selection: { kind: 'keyframe', id: found.id } });
    void project;
  },

  updateKeyframe: (id, patchObj, historyKey) => {
    get().patch((p) => {
      const i = p.camera.findIndex((k) => k.id === id);
      if (i < 0) return;
      p.camera[i] = { ...p.camera[i], ...patchObj };
      p.camera.sort((a, b) => a.t - b.t);
    }, historyKey ? `${id}:${historyKey}` : undefined);
  },

  removeKeyframe: (id) => {
    get().patch((p) => {
      p.camera = p.camera.filter((k) => k.id !== id);
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
  saveTimer = setTimeout(() => saveLocal(get().project), 500) as unknown as number;
}

// Handy for poking at state from the console (and for automated smoke tests).
if (import.meta.env.DEV) {
  (window as unknown as { __store: typeof useStore }).__store = useStore;
}

/** Selected layer, or undefined. */
export function useSelectedLayer(): Layer | undefined {
  return useStore((s) => (s.selection?.kind === 'layer' ? s.project.layers.find((l) => l.id === s.selection!.id) : undefined));
}

export function useSelectedKeyframe(): CameraKeyframe | undefined {
  return useStore((s) =>
    s.selection?.kind === 'keyframe' ? s.project.camera.find((k) => k.id === s.selection!.id) : undefined,
  );
}

/**
 * Undo availability, for enabling the toolbar buttons.
 *
 * History lives outside the zustand state, so these read through `historyRev` —
 * that is the subscription that makes the buttons re-render when the stacks move.
 */
export const useCanUndo = () => useStore((s) => s.historyRev >= 0 && history.canUndo);
export const useCanRedo = () => useStore((s) => s.historyRev >= 0 && history.canRedo);

// The headless renderer reads timeline state through this; see automation.d.ts.
if (typeof window !== 'undefined') {
  window.__geomotion_store = useStore;
}
