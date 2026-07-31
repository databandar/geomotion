import { createRegistry, type Command } from '@geomotion/commands';
import { camerasOf, isGroupNode, layersOf } from '@geomotion/document';
import type { LayerType } from '@geomotion/document';
import { useStore } from '../store';
import { projectExtent } from './extent';
import type { RenderHost } from '../render/host';

/**
 * Every user action the editor has, as commands (ENGINEERING_GUIDE §11).
 *
 * "Every user-visible action is a registered command with an id, title and optional shortcut;
 * toolbars, menus, shortcuts, and the ⌘K palette all bind to commands."
 *
 * This is the list; `@geomotion/commands` is the mechanism. Keeping them apart is what lets
 * the registry stay a pure, node-testable thing while the commands here close over the store
 * — and it is the same door §12's copilots and §15's plugins will register through, so
 * "what can be done to a document" has one enumerable answer rather than a hundred click
 * handlers.
 *
 * The store is read through `useStore.getState()` at call time rather than captured: a
 * command registered once at startup would otherwise hold the first project forever.
 */
export const commands = createRegistry();

const s = () => useStore.getState();

/** The selected node, whatever kind it is. */
const selected = () => {
  const state = s();
  return state.selection?.kind === 'layer' ? state.project.nodes[state.selection.id] : undefined;
};

const hasLayer = () => !!selected();
const hasGroup = () => {
  const node = selected();
  return !!node && isGroupNode(node);
};

/**
 * Registered lazily, because the map is not there when the module loads.
 *
 * `host` is the live canvas; the camera commands need the view the user is actually looking
 * at. It arrives after the first render, so registration takes it as an argument rather than
 * importing a global — the `mapref.ts` module global §15 bans is exactly this shape.
 */
export function registerEditorCommands(host: () => RenderHost | null): void {
  const layer = (type: LayerType, title: string, keywords: string[] = []): Command => ({
    id: `layer.add.${type}`,
    title,
    category: 'Add',
    keywords: ['new', 'layer', ...keywords],
    run: () => s().addLayer(type),
  });

  const view = () => {
    const map = host()?.map;
    if (!map) return undefined;
    const c = map.getCenter();
    return { center: [c.lng, c.lat] as [number, number], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
  };

  commands.register(
    /* ------------------------------------------------------------------ edit */
    {
      id: 'edit.undo',
      title: 'Undo',
      category: 'Edit',
      shortcut: 'mod+z',
      // History lives outside the zustand state, so this reads it through the store's own
      // accessor rather than a subscription — a command asks at the moment it is invoked.
      run: () => s().undo(),
    },
    { id: 'edit.redo', title: 'Redo', category: 'Edit', shortcut: 'mod+shift+z', run: () => s().redo() },

    /* ----------------------------------------------------------------- layers */
    layer('route', 'Add a route', ['line', 'path', 'flight']),
    layer('marker', 'Add a marker', ['point', 'pin', 'city']),
    layer('text', 'Add text', ['title', 'label', 'caption']),
    layer('shape', 'Add a shape', ['geojson', 'polygon']),
    layer('regions', 'Add regions', ['choropleth', 'data', 'map']),
    layer('clouds', 'Add clouds', ['weather', 'reveal']),
    layer('image', 'Add an image', ['picture', 'photo', 'logo']),
    {
      id: 'layer.duplicate',
      title: 'Duplicate layer',
      category: 'Layer',
      shortcut: 'mod+d',
      enabled: hasLayer,
      run: () => {
        const node = selected();
        if (node) s().duplicateLayer(node.id);
      },
    },
    {
      id: 'layer.delete',
      title: 'Delete layer',
      category: 'Layer',
      // Backspace and Delete both, because both keyboards exist and neither user is wrong.
      shortcut: 'backspace',
      enabled: hasLayer,
      run: () => {
        const node = selected();
        if (node) s().removeLayer(node.id);
      },
    },
    { id: 'layer.delete.alt', title: 'Delete layer', category: 'Layer', shortcut: 'del', hidden: true, enabled: hasLayer, run: () => commands.run('layer.delete') },
    {
      id: 'layer.lock',
      title: 'Lock or unlock layer',
      category: 'Layer',
      shortcut: 'mod+l',
      keywords: ['protect', 'freeze'],
      enabled: hasLayer,
      run: () => {
        const node = selected();
        if (node) s().setLayerLocked(node.id, !('locked' in node && node.locked === true));
      },
    },
    {
      id: 'layer.moveUp',
      title: 'Bring layer forward',
      category: 'Layer',
      shortcut: 'mod+up',
      enabled: hasLayer,
      run: () => {
        const node = selected();
        if (node) s().moveLayer(node.id, 1);
      },
    },
    {
      id: 'layer.moveDown',
      title: 'Send layer backward',
      category: 'Layer',
      shortcut: 'mod+down',
      enabled: hasLayer,
      run: () => {
        const node = selected();
        if (node) s().moveLayer(node.id, -1);
      },
    },
    {
      id: 'layer.group',
      title: 'Group selection',
      category: 'Layer',
      shortcut: 'mod+g',
      keywords: ['folder', 'beat'],
      enabled: hasLayer,
      run: () => s().groupSelection(),
    },
    {
      id: 'layer.ungroup',
      title: 'Ungroup',
      category: 'Layer',
      shortcut: 'mod+shift+g',
      enabled: hasGroup,
      run: () => {
        const node = selected();
        if (node) s().ungroup(node.id);
      },
    },

    /* -------------------------------------------------------------- transport */
    { id: 'play.toggle', title: 'Play or pause', category: 'Transport', shortcut: 'space', keywords: ['stop'], run: () => s().setPlaying(!s().playing) },
    { id: 'play.start', title: 'Go to start', category: 'Transport', shortcut: 'home', run: () => s().scrub(0) },
    { id: 'play.end', title: 'Go to end', category: 'Transport', shortcut: 'end', run: () => s().scrub(s().project.duration) },
    {
      id: 'play.stepBack',
      title: 'Step back one frame',
      category: 'Transport',
      shortcut: 'left',
      hidden: true,
      run: () => s().scrub(s().time - 1 / s().project.fps),
    },
    {
      id: 'play.stepForward',
      title: 'Step forward one frame',
      category: 'Transport',
      shortcut: 'right',
      hidden: true,
      run: () => s().scrub(s().time + 1 / s().project.fps),
    },
    { id: 'play.secondBack', title: 'Back one second', category: 'Transport', shortcut: 'shift+left', hidden: true, run: () => s().scrub(s().time - 1) },
    { id: 'play.secondForward', title: 'Forward one second', category: 'Transport', shortcut: 'shift+right', hidden: true, run: () => s().scrub(s().time + 1) },
    { id: 'play.loop', title: 'Toggle looping', category: 'Transport', keywords: ['repeat'], run: () => s().toggleLoop() },
    { id: 'play.mute', title: 'Mute narration in the editor', category: 'Transport', keywords: ['sound', 'audio'], run: () => s().toggleMuted() },

    /* ----------------------------------------------------------------- camera */
    {
      id: 'camera.capture',
      title: 'Add a camera keyframe here',
      category: 'Camera',
      // `K` is §02's reserved transport-adjacent key, and this is the gesture it names.
      shortcut: 'k',
      keywords: ['shot', 'framing', 'record'],
      run: () => {
        const v = view();
        s().addKeyframe(v ?? {});
      },
    },
    {
      id: 'camera.record',
      title: 'Toggle record mode',
      category: 'Camera',
      keywords: ['arm', 'follow the map'],
      run: () => s().setRecording(!s().recording),
    },
    {
      id: 'camera.fit',
      title: 'Fit everything in the frame',
      category: 'Camera',
      shortcut: 'f',
      keywords: ['zoom to fit', 'extent'],
      enabled: () => !!projectExtent(s().project),
      run: () => {
        const bounds = projectExtent(s().project);
        const map = host()?.map;
        if (bounds && map) map.fitBounds(bounds, { padding: 60, duration: 700 });
      },
    },

    /* ------------------------------------------------------------------ tools */
    { id: 'tool.select', title: 'Select tool', category: 'Tools', shortcut: 'v', run: () => s().setTool('select') },
    { id: 'tool.route', title: 'Route tool', category: 'Tools', shortcut: 'r', keywords: ['draw', 'line'], run: () => s().setTool('route') },
    { id: 'tool.marker', title: 'Marker tool', category: 'Tools', shortcut: 'm', keywords: ['point'], run: () => s().setTool('marker') },
    { id: 'tool.escape', title: 'Back to the select tool', category: 'Tools', shortcut: 'esc', hidden: true, run: () => s().setTool('select') },

    /* ------------------------------------------------------------------- view */
    { id: 'view.theme', title: 'Switch light and dark', category: 'View', keywords: ['appearance'], run: () => s().setTheme(s().theme === 'dark' ? 'light' : 'dark') },
    { id: 'view.layers', title: 'Show the layer list', category: 'View', run: () => s().setPlace('layers') },
    { id: 'view.scenes', title: 'Show the storyboard', category: 'View', keywords: ['story', 'beats'], run: () => s().setPlace('scenes') },

    /* -------------------------------------------------------------- selection */
    {
      id: 'select.next',
      title: 'Select the layer above',
      category: 'Select',
      shortcut: 'alt+up',
      hidden: true,
      run: () => step(1),
    },
    {
      id: 'select.previous',
      title: 'Select the layer below',
      category: 'Select',
      shortcut: 'alt+down',
      hidden: true,
      run: () => step(-1),
    },
    {
      id: 'select.camera',
      title: 'Select the camera',
      category: 'Select',
      run: () => {
        const cam = camerasOf(s().project)[0];
        if (cam) s().select({ kind: 'keyframe', id: cam.id });
      },
    },
  );
}

/** Move the selection up or down the draw order, which is what the arrow keys mean here. */
function step(dir: 1 | -1): void {
  const state = s();
  const layers = layersOf(state.project);
  if (layers.length === 0) return;
  const at = state.selection?.kind === 'layer' ? layers.findIndex((l) => l.id === state.selection?.id) : -1;
  // From nothing, the first press takes the top layer going up and the bottom going down —
  // rather than doing nothing, which reads as a dead key.
  const next = at < 0 ? (dir === 1 ? layers.length - 1 : 0) : Math.min(layers.length - 1, Math.max(0, at + dir));
  const target = layers[next];
  if (target) state.select({ kind: 'layer', id: target.id });
}
