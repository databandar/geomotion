import { useStore } from '../store';
import { useRenderHost } from '../render/host';
import type { LayerType } from '@geomotion/document';
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

export default function LayerPanel() {
  const host = useRenderHost();
  const layers = useStore((s) => s.project.layers);
  const selection = useStore((s) => s.selection);
  const camera = useStore((s) => s.project.camera);
  const select = useStore((s) => s.select);
  const addLayer = useStore((s) => s.addLayer);
  const removeLayer = useStore((s) => s.removeLayer);
  const duplicateLayer = useStore((s) => s.duplicateLayer);
  const moveLayer = useStore((s) => s.moveLayer);
  const updateLayer = useStore((s) => s.updateLayer);
  const addKeyframe = useStore((s) => s.addKeyframe);
  const setLayerLocked = useStore((s) => s.setLayerLocked);

  return (
    <div className="layer-panel">
      <div className="panel-head">
        <span>Layers</span>
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
          items={ADD.map((a) => ({
            label: a.label,
            icon: a.icon,
            iconClass: 't-' + a.type,
            onSelect: () => addLayer(a.type),
          }))}
        />
      </div>

      <div className="layer-list">
        <div
          className={'layer-item camera' + (selection?.kind === 'keyframe' ? ' sel' : '')}
          onClick={() => camera[0] && select({ kind: 'keyframe', id: camera[0].id })}
        >
          <span className="glyph t-camera"><Icon name="camera" size={13} /></span>
          <span className="lname">Camera</span>
          <span className="count">{camera.length} keys</span>
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

        {[...layers].reverse().map((l) => {
          const sel = selection?.kind === 'layer' && selection.id === l.id;
          const locked = l.locked === true;
          return (
            <div
              key={l.id}
              className={'layer-item' + (sel ? ' sel' : '') + (locked ? ' locked' : '')}
              onClick={() => select({ kind: 'layer', id: l.id })}
            >
              <button
                className={'icon-btn eye' + (l.visible ? '' : ' off')}
                title={locked ? 'Locked' : l.visible ? 'Hide' : 'Show'}
                disabled={locked}
                onClick={(e) => {
                  e.stopPropagation();
                  updateLayer(l.id, { visible: !l.visible });
                }}
              >
                <Icon name={l.visible ? 'eye-open' : 'eye-off'} size={13} />
              </button>
              {/* A dot in the type's colour before the icon: at a glance down the list
                  you read *kinds* by colour without decoding seven glyphs. */}
              <span className={'row-dot t-' + l.type} />
              <span className={'glyph t-' + l.type}>
                <Icon name={ADD.find((a) => a.type === l.type)?.icon ?? 'shape'} size={13} />
              </span>
              <span className="lname">{l.name}</span>
              <div className="layer-actions">
                {/* Lock stays on the row rather than in the menu: it is a *state* you
                    need to see without opening anything, and the row is how you read
                    which layers are pinned down. It shows through when engaged. */}
                <button
                  className={'icon-btn lock' + (locked ? ' on' : '')}
                  title={locked ? 'Unlock' : 'Lock — refuse edits to this layer'}
                  aria-pressed={locked}
                  onClick={(e) => (e.stopPropagation(), setLayerLocked(l.id, !locked))}
                >
                  <Icon name={locked ? 'lock' : 'unlock'} size={12} />
                </button>
                <Menu
                  label={`Actions for ${l.name}`}
                  items={[
                    { label: 'Move up', icon: 'arrow-up', onSelect: () => moveLayer(l.id, 1), disabled: locked },
                    { label: 'Move down', icon: 'arrow-down', onSelect: () => moveLayer(l.id, -1), disabled: locked },
                    // Duplicating a locked layer is allowed — it reads the layer and
                    // writes a new one, so nothing the lock protects is touched. The
                    // copy comes out unlocked, which is what you want if you locked the
                    // original to keep a version of it.
                    { label: 'Duplicate', icon: 'duplicate', onSelect: () => duplicateLayer(l.id) },
                    { label: 'Delete', icon: 'close', onSelect: () => removeLayer(l.id), danger: true, disabled: locked },
                  ]}
                />
              </div>
            </div>
          );
        })}

        {layers.length === 0 && <p className="hint pad">No layers yet. Add a route, marker or title above.</p>}
      </div>
    </div>
  );
}
