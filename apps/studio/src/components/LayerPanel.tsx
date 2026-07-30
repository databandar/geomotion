import { useStore } from '../store';
import { useRenderHost } from '../render/host';
import type { LayerType } from '@geomotion/document';
import Icon, { type IconName } from './Icon';

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

  return (
    <div className="layer-panel">
      <div className="panel-head">
        <span>Layers</span>
      </div>

      <div className="add-row">
        {ADD.map((a) => (
          <button key={a.type} className="add-btn" onClick={() => addLayer(a.type)} title={`Add ${a.label.toLowerCase()} layer`}>
            <span className={'glyph t-' + a.type}><Icon name={a.icon} size={13} /></span>
            {a.label}
          </button>
        ))}
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
          return (
            <div key={l.id} className={'layer-item' + (sel ? ' sel' : '')} onClick={() => select({ kind: 'layer', id: l.id })}>
              <button
                className={'icon-btn eye' + (l.visible ? '' : ' off')}
                title={l.visible ? 'Hide' : 'Show'}
                onClick={(e) => {
                  e.stopPropagation();
                  updateLayer(l.id, { visible: !l.visible });
                }}
              >
                <Icon name={l.visible ? 'eye' : 'eye-off'} size={13} />
              </button>
              <span className={'glyph t-' + l.type}>
                <Icon name={ADD.find((a) => a.type === l.type)?.icon ?? 'shape'} size={13} />
              </span>
              <span className="lname">{l.name}</span>
              <div className="layer-actions">
                <button className="icon-btn" title="Move up" onClick={(e) => (e.stopPropagation(), moveLayer(l.id, 1))}>
                  <Icon name="arrow-up" size={12} />
                </button>
                <button className="icon-btn" title="Move down" onClick={(e) => (e.stopPropagation(), moveLayer(l.id, -1))}>
                  <Icon name="arrow-down" size={12} />
                </button>
                <button className="icon-btn" title="Duplicate" onClick={(e) => (e.stopPropagation(), duplicateLayer(l.id))}>
                  <Icon name="duplicate" size={12} />
                </button>
                <button className="icon-btn danger" title="Delete" onClick={(e) => (e.stopPropagation(), removeLayer(l.id))}>
                  <Icon name="close" size={12} />
                </button>
              </div>
            </div>
          );
        })}

        {layers.length === 0 && <p className="hint pad">No layers yet. Add a route, marker or title above.</p>}
      </div>
    </div>
  );
}
