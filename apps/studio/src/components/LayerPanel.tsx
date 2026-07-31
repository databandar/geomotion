import { useStore } from '../store';
import { useRenderHost } from '../render/host';
import { childrenOf, isContainerNode, isMapContextNode, liveCamera, shotsOf } from '@geomotion/document';
import type { DocNode, LayerType, Project } from '@geomotion/document';
import Icon, { type IconName } from './Icon';
import { Menu } from './ui';

const ADD: { type: LayerType; label: string; icon: IconName }[] = [
  { type: 'route', label: 'Route', icon: 'route' },
  { type: 'marker', label: 'Marker', icon: 'marker' },
  { type: 'text', label: 'Text', icon: 'text' },
  { type: 'shape', label: 'Shape', icon: 'shape' },
  { type: 'regions', label: 'Regions', icon: 'regions' },
  { type: 'clouds', label: 'Clouds', icon: 'clouds' },
  { type: 'image', label: 'Image', icon: 'image' },
];

/** One rendered row: the node, how deep it sits, and whether it is inside a shut group. */
interface Row {
  node: DocNode;
  depth: number;
}

/**
 * The panel's rows, top of the picture first.
 *
 * The document is bottom-to-top (ascending `order` is draw order); a layer panel reads
 * top-down, as the picture stacks. So each level is reversed, and a group's children are
 * reversed within it — reversing the flattened list instead would put every group's rows
 * *above* their group rather than under it.
 *
 * A collapsed group contributes its own row and none of its children's.
 */
function rowsOf(project: Project, collapsed: Record<string, boolean>, parentId: string | null = null, depth = 0): Row[] {
  const out: Row[] = [];
  for (const node of [...childrenOf(project, parentId)].reverse()) {
    if (node.type === 'camera') continue;
    out.push({ node, depth });
    if (isContainerNode(node) && !collapsed[node.id]) out.push(...rowsOf(project, collapsed, node.id, depth + 1));
  }
  return out;
}

export default function LayerPanel() {
  const host = useRenderHost();
  const project = useStore((s) => s.project);
  const collapsed = useStore((s) => s.collapsed);
  const selection = useStore((s) => s.selection);
  const also = useStore((s) => s.also);
  const select = useStore((s) => s.select);
  const toggleAlso = useStore((s) => s.toggleAlso);
  const selectMany = useStore((s) => s.selectMany);
  const toggleCollapsed = useStore((s) => s.toggleCollapsed);
  const camera = liveCamera(project);
  const addLayer = useStore((s) => s.addLayer);
  const removeLayer = useStore((s) => s.removeLayer);
  const duplicateLayer = useStore((s) => s.duplicateLayer);
  const moveLayer = useStore((s) => s.moveLayer);
  const updateLayer = useStore((s) => s.updateLayer);
  const addKeyframe = useStore((s) => s.addKeyframe);
  const setLayerLocked = useStore((s) => s.setLayerLocked);
  const groupSelection = useStore((s) => s.groupSelection);
  const addMapContext = useStore((s) => s.addMapContext);
  const ungroup = useStore((s) => s.ungroup);

  const rows = rowsOf(project, collapsed);
  const selectedIds = new Set(selection?.kind === 'layer' ? [selection.id, ...also] : []);

  /**
   * Click, ⌘-click, shift-click — the three gestures every layer list has.
   *
   * The range is taken over the *rendered* rows rather than the document, because the rows
   * are what you can see: shift-clicking two rows either side of a collapsed group should
   * not silently take in the children you cannot see.
   */
  const onRowClick = (e: React.MouseEvent, id: string) => {
    if (e.metaKey || e.ctrlKey) return toggleAlso(id);
    if (e.shiftKey && selection?.kind === 'layer') {
      const from = rows.findIndex((r) => r.node.id === selection.id);
      const to = rows.findIndex((r) => r.node.id === id);
      if (from >= 0 && to >= 0) {
        const span = rows.slice(Math.min(from, to), Math.max(from, to) + 1).map((r) => r.node.id);
        return selectMany(id, span);
      }
    }
    select({ kind: 'layer', id });
  };

  return (
    <div className="layer-panel">
      <div className="panel-head">
        <span>Layers</span>
        {selectedIds.size > 1 && (
          <button className="mini" onClick={groupSelection} title="Group the selected layers (⌘G)">
            Group {selectedIds.size}
          </button>
        )}
      </div>

      {/*
        * One button rather than a seven-button grid.
        *
        * The grid put every type one click away, which is faster — but it held about a
        * fifth of the panel's height permanently for an action taken a handful of times
        * per project, and the layer list is what the panel is for. The second click buys
        * back the space the list actually needs.
        */}
      <div className="add-row">
        <Menu
          align="left"
          trigger={{ text: 'Add layer', icon: 'plus' }}
          items={[
            ...ADD.map((a) => ({
              label: a.label,
              icon: a.icon,
              iconClass: 't-' + a.type,
              onSelect: () => addLayer(a.type),
            })),
            // A container rather than a layer, so it sits apart from the seven.
            { label: 'Map context', icon: 'regions' as const, onSelect: addMapContext },
          ]}
        />
      </div>

      <div className="layer-list">
        <div
          className={'layer-item camera' + (selection?.kind === 'keyframe' ? ' sel' : '')}
          onClick={() => camera && select({ kind: 'keyframe', id: camera.id })}
        >
          <span className="glyph t-camera"><Icon name="camera" size={13} /></span>
          <span className="lname">Camera</span>
          <span className="count">{camera ? shotsOf(camera).length : 0} keys</span>
          <button
            className="icon-btn"
            title="Add a keyframe at the playhead using the current map view"
            onClick={(e) => {
              e.stopPropagation();
              const map = host?.map;
              if (!map) return addKeyframe();
              const c = map.getCenter();
              addKeyframe({
                center: [c.lng, c.lat],
                zoom: map.getZoom(),
                bearing: map.getBearing(),
                pitch: map.getPitch(),
              });
            }}
          >
            <Icon name="plus" size={13} />
          </button>
        </div>

        {rows.map(({ node, depth }) => {
          const sel = selectedIds.has(node.id);
          const locked = 'locked' in node && node.locked === true;
          const container = isContainerNode(node);
          const context = isMapContextNode(node);
          const visible = 'visible' in node ? node.visible : true;
          /*
           * A row inside a hidden or locked group shows it: the child's own `visible` is
           * still true and its own lock still off, and a panel that drew them as if the
           * inheritance were not there would be lying about what renders.
           */
          const inherited = { hidden: false, locked: false };
          for (let p = node.parentId; p; ) {
            const ancestor: DocNode | undefined = project.nodes[p];
            if (!ancestor) break;
            if ('visible' in ancestor && !ancestor.visible) inherited.hidden = true;
            if ('locked' in ancestor && ancestor.locked === true) inherited.locked = true;
            p = ancestor.parentId;
          }

          return (
            <div
              key={node.id}
              className={
                'layer-item' +
                (sel ? ' sel' : '') +
                (locked || inherited.locked ? ' locked' : '') +
                (container ? ' group-row' : '') +
                (inherited.hidden || !visible ? ' dim' : '')
              }
              style={depth > 0 ? { paddingLeft: 8 + depth * 14 } : undefined}
              onClick={(e) => onRowClick(e, node.id)}
            >
              {container ? (
                <button
                  className={'icon-btn twist' + (collapsed[node.id] ? ' shut' : '')}
                  title={collapsed[node.id] ? 'Expand' : 'Collapse'}
                  aria-expanded={!collapsed[node.id]}
                  onClick={(e) => (e.stopPropagation(), toggleCollapsed(node.id))}
                >
                  <Icon name={collapsed[node.id] ? 'arrow-right' : 'arrow-down'} size={11} />
                </button>
              ) : (
                <button
                  className={'icon-btn eye' + (visible ? '' : ' off')}
                  title={locked ? 'Locked' : inherited.hidden ? 'Hidden by its group' : visible ? 'Hide' : 'Show'}
                  disabled={locked || inherited.locked}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateLayer(node.id, { visible: !visible });
                  }}
                >
                  <Icon name={visible ? 'eye-open' : 'eye-off'} size={13} />
                </button>
              )}
              {/* A dot in the type's colour before the icon: at a glance down the list
                  you read *kinds* by colour without decoding seven glyphs. */}
              <span className={'row-dot t-' + node.type} />
              <span className={'glyph t-' + node.type}>
                <Icon
                  name={context ? 'regions' : container ? 'folder' : (ADD.find((a) => a.type === node.type)?.icon ?? 'shape')}
                  size={13}
                />
              </span>
              <span className="lname">{node.name}</span>
              {container && (
                <>
                  <span className="count">{childrenOf(project, node.id).length}</span>
                  <button
                    className={'icon-btn eye' + (visible ? '' : ' off')}
                    title={visible ? 'Hide the group and everything in it' : 'Show'}
                    disabled={locked || inherited.locked}
                    onClick={(e) => {
                      e.stopPropagation();
                      updateLayer(node.id, { visible: !visible });
                    }}
                  >
                    <Icon name={visible ? 'eye-open' : 'eye-off'} size={13} />
                  </button>
                </>
              )}
              <div className="layer-actions">
                {/* Lock stays on the row rather than in the menu: it is a *state* you
                    need to see without opening anything, and the row is how you read
                    which layers are pinned down. It shows through when engaged. */}
                <button
                  className={'icon-btn lock' + (locked ? ' on' : '')}
                  title={
                    inherited.locked
                      ? 'Locked by its group'
                      : locked
                        ? 'Unlock'
                        : 'Lock — refuse edits to this layer'
                  }
                  aria-pressed={locked}
                  disabled={inherited.locked}
                  onClick={(e) => (e.stopPropagation(), setLayerLocked(node.id, !locked))}
                >
                  <Icon name={locked ? 'lock' : 'unlock'} size={12} />
                </button>
                <Menu
                  label={`Actions for ${node.name}`}
                  items={[
                    { label: 'Move up', icon: 'arrow-up', onSelect: () => moveLayer(node.id, 1), disabled: locked },
                    { label: 'Move down', icon: 'arrow-down', onSelect: () => moveLayer(node.id, -1), disabled: locked },
                    ...(container && !context
                      ? [{ label: 'Ungroup', icon: 'shape' as const, onSelect: () => ungroup(node.id), disabled: locked }]
                      : []),
                    // Duplicating a locked layer is allowed — it reads the layer and
                    // writes a new one, so nothing the lock protects is touched. The
                    // copy comes out unlocked, which is what you want if you locked the
                    // original to keep a version of it.
                    { label: 'Duplicate', icon: 'duplicate', onSelect: () => duplicateLayer(node.id) },
                    { label: 'Delete', icon: 'close', onSelect: () => removeLayer(node.id), danger: true, disabled: locked },
                  ]}
                />
              </div>
            </div>
          );
        })}

        {rows.length === 0 && <p className="hint pad">No layers yet. Add a route, marker or title above.</p>}
      </div>
    </div>
  );
}
