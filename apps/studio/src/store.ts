import { create } from 'zustand';
import type { CameraKeyframe, Layer, LayerType, Project } from './types';
import { clearPathCache } from './lib/scene';
import { clearRegionCache } from './lib/regions';
import { createLayer, demoProject, keyframe, loadLocal, saveLocal, uid } from './lib/project';
import { clamp } from './lib/easing';

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
  past: Project[];
  future: Project[];
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

const clone = (p: Project): Project => JSON.parse(JSON.stringify(p));

let lastHistoryKey = '';
let lastHistoryAt = 0;
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
  past: [],
  future: [],
  exportStatus: null,
  exporting: false,
  structureRev: 0,

  patch: (fn, historyKey) => {
    const state = get();
    const prev = state.project;
    const next = clone(prev);
    fn(next);

    // Coalesce rapid edits (dragging a slider) into a single undo step.
    const now = Date.now();
    const coalesce = !!historyKey && historyKey === lastHistoryKey && now - lastHistoryAt < 700;
    lastHistoryKey = historyKey ?? '';
    lastHistoryAt = now;

    set({
      project: next,
      past: coalesce ? state.past : [...state.past, prev].slice(-80),
      future: [],
      structureRev: state.structureRev + 1,
    });

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveLocal(get().project), 500) as unknown as number;
  },

  replaceProject: (p) => {
    clearPathCache();
    clearRegionCache();
    set((s) => ({
      project: p,
      // Long projects (a 36-stop region tour runs well over a minute) are
      // unusable at the default zoom, so frame the whole thing on load.
      pxPerSec: clamp(1000 / Math.max(1, p.duration), 12, 400),
      past: [...s.past, s.project].slice(-80),
      future: [],
      selection: null,
      time: 0,
      playing: false,
      structureRev: s.structureRev + 1,
    }));
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
    const copy = { ...clone({ layers: [src] } as unknown as Project).layers[0], id: uid() } as Layer;
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

  undo: () =>
    set((s) => {
      if (!s.past.length) return s;
      const prev = s.past[s.past.length - 1];
      clearPathCache();
      clearRegionCache();
      lastHistoryKey = '';
      return {
        project: prev,
        past: s.past.slice(0, -1),
        future: [s.project, ...s.future].slice(0, 80),
        structureRev: s.structureRev + 1,
      };
    }),

  redo: () =>
    set((s) => {
      if (!s.future.length) return s;
      const next = s.future[0];
      clearPathCache();
      clearRegionCache();
      lastHistoryKey = '';
      return {
        project: next,
        past: [...s.past, s.project].slice(-80),
        future: s.future.slice(1),
        structureRev: s.structureRev + 1,
      };
    }),
}));

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

// Expose store globally for headless automation (Playwright)
if (typeof window !== 'undefined') {
  (window as any).__geomotion_store = useStore;
}
