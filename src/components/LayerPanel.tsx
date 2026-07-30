import { useStore } from '../store';
import { getMap } from '../lib/mapref';
import type { LayerType } from '../types';

const ADD: { type: LayerType; label: string; glyph: string }[] = [
  { type: 'route', label: 'Route', glyph: '↗' },
  { type: 'marker', label: 'Marker', glyph: '◉' },
  { type: 'text', label: 'Text', glyph: 'T' },
  { type: 'shape', label: 'Shape', glyph: '⬡' },
  { type: 'regions', label: 'Regions', glyph: '▦' },
  { type: 'clouds', label: 'Clouds', glyph: '☁' },
  { type: 'image', label: 'Image', glyph: '▤' },
];

export default function LayerPanel() {
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
            <span className={'glyph t-' + a.type}>{a.glyph}</span>
            {a.label}
          </button>
        ))}
      </div>

      <div className="layer-list">
        <div
          className={'layer-item camera' + (selection?.kind === 'keyframe' ? ' sel' : '')}
          onClick={() => camera.length && select({ kind: 'keyframe', id: camera[0].id })}
        >
          <span className="glyph t-camera">▣</span>
          <span className="lname">Camera</span>
          <span className="count">{camera.length} keys</span>
          <button
            className="icon-btn"
            title="Add a keyframe at the playhead using the current map view"
            onClick={(e) => {
              e.stopPropagation();
              const map = getMap();
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
            ＋
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
                {l.visible ? '◉' : '○'}
              </button>
              <span className={'glyph t-' + l.type}>{ADD.find((a) => a.type === l.type)?.glyph}</span>
              <span className="lname">{l.name}</span>
              <div className="layer-actions">
                <button className="icon-btn" title="Move up" onClick={(e) => (e.stopPropagation(), moveLayer(l.id, 1))}>
                  ↑
                </button>
                <button className="icon-btn" title="Move down" onClick={(e) => (e.stopPropagation(), moveLayer(l.id, -1))}>
                  ↓
                </button>
                <button className="icon-btn" title="Duplicate" onClick={(e) => (e.stopPropagation(), duplicateLayer(l.id))}>
                  ⧉
                </button>
                <button className="icon-btn danger" title="Delete" onClick={(e) => (e.stopPropagation(), removeLayer(l.id))}>
                  ×
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
