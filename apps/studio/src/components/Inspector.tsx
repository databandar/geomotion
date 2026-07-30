import { useState } from 'react';
import { useStore, useSelectedKeyframe, useSelectedLayer } from '../store';
import type { CloudsLayer, ImageLayer, MarkerLayer, RegionsLayer, RouteLayer, ShapeLayer, TextLayer } from '../types';
import { regionSet } from '../lib/regions';
import { tourDuration } from '../lib/scene';
import { RAMPS, getRamp, rampColor } from '../lib/palettes';
import indiaStatesOfficial from '../data/india-states-official.json';
import indiaStatesNE from '../data/india-states.json';
import { EASING_NAMES } from '../lib/easing';
import { getMap } from '../lib/mapref';
import { BASEMAPS, getBasemap } from '../lib/basemaps';
import { Color, Field, Num, Section, Select, Slider, Text, Toggle } from './ui';
import { haversine, measure, buildPath } from '@geomotion/geometry';

export default function Inspector() {
  const layer = useSelectedLayer();
  const kf = useSelectedKeyframe();

  return (
    <div className="inspector">
      {kf && <KeyframeInspector />}
      {layer?.type === 'route' && <RouteInspector layer={layer} />}
      {layer?.type === 'marker' && <MarkerInspector layer={layer} />}
      {layer?.type === 'text' && <TextInspector layer={layer} />}
      {layer?.type === 'shape' && <ShapeInspector layer={layer} />}
      {layer?.type === 'regions' && <RegionsInspector layer={layer} />}
      {layer?.type === 'clouds' && <CloudsInspector layer={layer} />}
      {layer?.type === 'image' && <ImageInspector layer={layer} />}
      {!layer && !kf && (
        <div className="empty-hint">
          <p>Nothing selected.</p>
          <p>Pick a layer or a camera keyframe, or edit the composition below.</p>
        </div>
      )}
      {layer && <TimingInspector />}
      <CompositionInspector />
    </div>
  );
}

/* ---------------------------------------------------------------- timing */

function TimingInspector() {
  const layer = useSelectedLayer()!;
  const update = useStore((s) => s.updateLayer);
  const duration = useStore((s) => s.project.duration);
  return (
    <Section title="Timing">
      <Field label="Name">
        <Text value={layer.name} onChange={(name) => update(layer.id, { name })} />
      </Field>
      <Field label="In" hint="When the layer appears">
        <Num value={layer.in} onChange={(v) => update(layer.id, { in: v })} step={0.1} min={0} max={duration} suffix="s" />
      </Field>
      <Field label="Out">
        <Num value={layer.out} onChange={(v) => update(layer.id, { out: v })} step={0.1} min={0} max={duration} suffix="s" />
      </Field>
      <Field label="Fade" hint="Cross-fade ramp at both ends">
        <Num value={layer.fade} onChange={(v) => update(layer.id, { fade: v })} step={0.1} min={0} suffix="s" />
      </Field>
    </Section>
  );
}

/* -------------------------------------------------------------- keyframe */

function KeyframeInspector() {
  const kf = useSelectedKeyframe()!;
  const update = useStore((s) => s.updateKeyframe);
  const remove = useStore((s) => s.removeKeyframe);
  const duration = useStore((s) => s.project.duration);

  const captureView = () => {
    const map = getMap();
    if (!map) return;
    const c = map.getCenter();
    update(kf.id, {
      center: [c.lng, c.lat],
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    });
  };

  const applyToMap = () => {
    getMap()?.jumpTo({ center: kf.center, zoom: kf.zoom, bearing: kf.bearing, pitch: kf.pitch });
  };

  return (
    <Section
      title="Camera keyframe"
      right={
        <button className="mini danger" onClick={() => remove(kf.id)}>
          Delete
        </button>
      }
    >
      <div className="row-buttons">
        <button className="mini primary" onClick={captureView} title="Store the current map view in this keyframe">
          Capture view
        </button>
        <button className="mini" onClick={applyToMap}>
          Go to
        </button>
      </div>
      <Field label="Time">
        <Num value={kf.t} onChange={(t) => update(kf.id, { t })} step={0.1} min={0} max={duration} suffix="s" />
      </Field>
      <Field label="Longitude">
        <Num value={kf.center[0]} onChange={(v) => update(kf.id, { center: [v, kf.center[1]] })} step={0.001} precision={5} />
      </Field>
      <Field label="Latitude">
        <Num value={kf.center[1]} onChange={(v) => update(kf.id, { center: [kf.center[0], v] })} step={0.001} precision={5} />
      </Field>
      <Field label="Zoom">
        <Slider value={kf.zoom} onChange={(zoom) => update(kf.id, { zoom }, 'zoom')} min={0} max={22} step={0.01} />
      </Field>
      <Field label="Bearing">
        <Slider value={kf.bearing} onChange={(bearing) => update(kf.id, { bearing }, 'bearing')} min={-180} max={180} step={0.5} precision={1} />
      </Field>
      <Field label="Pitch">
        <Slider value={kf.pitch} onChange={(pitch) => update(kf.id, { pitch }, 'pitch')} min={0} max={85} step={0.5} precision={1} />
      </Field>
      <Field label="Easing" hint="Applied on the move out of this keyframe">
        <Select value={kf.easing} onChange={(easing) => update(kf.id, { easing })} options={EASING_NAMES} />
      </Field>
      <Field label="Arc" hint="Zoom out mid-move for a cinematic hop">
        <Slider value={kf.dip} onChange={(dip) => update(kf.id, { dip }, 'dip')} min={0} max={4} step={0.05} />
      </Field>
    </Section>
  );
}

/* ----------------------------------------------------------------- route */

function RouteInspector({ layer }: { layer: RouteLayer }) {
  const update = useStore((s) => s.updateLayer);
  const setTool = useStore((s) => s.setTool);
  const tool = useStore((s) => s.tool);
  const duration = useStore((s) => s.project.duration);

  const path = measure(buildPath(layer.coords, layer.curve));
  const km = path.length / 1000;
  const straight =
    layer.coords.length >= 2 ? haversine(layer.coords[0], layer.coords[layer.coords.length - 1]) / 1000 : 0;

  const set = (patch: Partial<RouteLayer>, key?: string) => update<RouteLayer>(layer.id, patch, key);

  return (
    <>
      <Section
        title="Route"
        right={
          <button className={'mini' + (tool === 'route' ? ' primary' : '')} onClick={() => setTool(tool === 'route' ? 'select' : 'route')}>
            {tool === 'route' ? 'Done' : 'Add points'}
          </button>
        }
      >
        {tool === 'route' && <p className="hint">Click the map to append points. Drag the numbered handles to adjust.</p>}
        <div className="stat-row">
          <span>{layer.coords.length} points</span>
          <span>{km >= 1 ? km.toFixed(0) : km.toFixed(2)} km</span>
          {straight > 0 && <span className="dim">direct {straight.toFixed(0)} km</span>}
        </div>
        <div className="point-list">
          {layer.coords.map((c, i) => (
            <div className="point" key={i}>
              <span className="idx">{i + 1}</span>
              <Num
                value={c[0]}
                precision={4}
                step={0.01}
                onChange={(v) => {
                  const coords = layer.coords.slice();
                  coords[i] = [v, c[1]];
                  set({ coords });
                }}
              />
              <Num
                value={c[1]}
                precision={4}
                step={0.01}
                onChange={(v) => {
                  const coords = layer.coords.slice();
                  coords[i] = [c[0], v];
                  set({ coords });
                }}
              />
              <button
                className="mini danger"
                onClick={() => set({ coords: layer.coords.filter((_, j) => j !== i) })}
                title="Remove point"
              >
                ×
              </button>
            </div>
          ))}
          {layer.coords.length === 0 && <p className="hint">No points yet — hit “Add points” and click the map.</p>}
        </div>
        <div className="row-buttons">
          <button
            className="mini"
            onClick={() => {
              const c = getMap()?.getCenter();
              if (c) set({ coords: [...layer.coords, [c.lng, c.lat]] });
            }}
          >
            Add map centre
          </button>
          <button
            className="mini"
            disabled={layer.coords.length < 2}
            onClick={() => {
              const map = getMap();
              if (!map || layer.coords.length < 2) return;
              const b = layer.coords.reduce(
                (acc, c) => [Math.min(acc[0], c[0]), Math.min(acc[1], c[1]), Math.max(acc[2], c[0]), Math.max(acc[3], c[1])],
                [180, 90, -180, -90],
              );
              map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 80, duration: 600 });
            }}
          >
            Frame route
          </button>
        </div>
      </Section>

      <Section title="Line style">
        <Field label="Shape" hint="How the line is drawn between your points">
          <Select
            value={layer.curve}
            onChange={(curve) => set({ curve })}
            options={[
              { value: 'geodesic', label: 'Geodesic (great circle)' },
              { value: 'arc', label: 'Arc (flight path)' },
              { value: 'straight', label: 'Straight' },
            ]}
          />
        </Field>
        <Field label="Colour">
          <Color value={layer.color} onChange={(color) => set({ color })} />
        </Field>
        <Field label="Width">
          <Slider value={layer.width} onChange={(width) => set({ width }, 'width')} min={0.5} max={20} step={0.1} precision={1} />
        </Field>
        <Field label="Opacity">
          <Slider value={layer.opacity} onChange={(opacity) => set({ opacity }, 'opacity')} min={0} max={1} />
        </Field>
        <Field label="Glow">
          <Toggle value={layer.glow} onChange={(glow) => set({ glow })} />
        </Field>
        <Field label="Dashed">
          <Toggle value={layer.dashed} onChange={(dashed) => set({ dashed })} />
        </Field>
      </Section>

      <Section title="Reveal">
        <Field label="Start">
          <Num value={layer.drawStart} onChange={(drawStart) => set({ drawStart })} step={0.1} min={0} max={duration} suffix="s" />
        </Field>
        <Field label="End">
          <Num value={layer.drawEnd} onChange={(drawEnd) => set({ drawEnd })} step={0.1} min={0} max={duration} suffix="s" />
        </Field>
        <Field label="Easing">
          <Select value={layer.drawEasing} onChange={(drawEasing) => set({ drawEasing })} options={EASING_NAMES} />
        </Field>
        {path.length > 0 && layer.drawEnd > layer.drawStart && (
          <p className="hint">
            ≈ {(km / (layer.drawEnd - layer.drawStart)).toFixed(0)} km/s of travel over {(layer.drawEnd - layer.drawStart).toFixed(1)}s
          </p>
        )}
      </Section>

      <Section title="Travelling marker">
        <Field label="Icon">
          <Select
            value={layer.marker.icon}
            onChange={(icon) => set({ marker: { ...layer.marker, icon, enabled: icon !== 'none' } })}
            options={['dot', 'plane', 'car', 'pin', 'none']}
          />
        </Field>
        <Field label="Colour">
          <Color value={layer.marker.color} onChange={(color) => set({ marker: { ...layer.marker, color } })} />
        </Field>
        <Field label="Size">
          <Slider
            value={layer.marker.size}
            onChange={(size) => set({ marker: { ...layer.marker, size } }, 'msize')}
            min={2}
            max={40}
            step={0.5}
            precision={1}
          />
        </Field>
        <Field label="Face travel">
          <Toggle value={layer.marker.rotate} onChange={(rotate) => set({ marker: { ...layer.marker, rotate } })} />
        </Field>
      </Section>

      <Section title="Camera follow">
        <p className="hint">While the route draws, the camera rides the leading point and ignores keyframes.</p>
        <Field label="Enabled">
          <Toggle value={layer.follow.enabled} onChange={(enabled) => set({ follow: { ...layer.follow, enabled } })} />
        </Field>
        {layer.follow.enabled && (
          <>
            <Field label="Zoom">
              <Slider
                value={layer.follow.zoom}
                onChange={(zoom) => set({ follow: { ...layer.follow, zoom } }, 'fzoom')}
                min={0}
                max={20}
                step={0.1}
                precision={1}
              />
            </Field>
            <Field label="Pitch">
              <Slider
                value={layer.follow.pitch}
                onChange={(pitch) => set({ follow: { ...layer.follow, pitch } }, 'fpitch')}
                min={0}
                max={85}
                step={1}
                precision={0}
              />
            </Field>
            <Field label="Face heading">
              <Toggle
                value={layer.follow.faceHeading}
                onChange={(faceHeading) => set({ follow: { ...layer.follow, faceHeading } })}
              />
            </Field>
          </>
        )}
      </Section>
    </>
  );
}

/* ---------------------------------------------------------------- marker */

function MarkerInspector({ layer }: { layer: MarkerLayer }) {
  const update = useStore((s) => s.updateLayer);
  const setTool = useStore((s) => s.setTool);
  const tool = useStore((s) => s.tool);
  const set = (patch: Partial<MarkerLayer>, key?: string) => update<MarkerLayer>(layer.id, patch, key);

  return (
    <>
      <Section
        title="Marker"
        right={
          <button className={'mini' + (tool === 'marker' ? ' primary' : '')} onClick={() => setTool(tool === 'marker' ? 'select' : 'marker')}>
            {tool === 'marker' ? 'Click map…' : 'Place'}
          </button>
        }
      >
        <Field label="Longitude">
          <Num value={layer.coord[0]} onChange={(v) => set({ coord: [v, layer.coord[1]] })} step={0.001} precision={5} />
        </Field>
        <Field label="Latitude">
          <Num value={layer.coord[1]} onChange={(v) => set({ coord: [layer.coord[0], v] })} step={0.001} precision={5} />
        </Field>
        <div className="row-buttons">
          <button
            className="mini"
            onClick={() => {
              const c = getMap()?.getCenter();
              if (c) set({ coord: [c.lng, c.lat] });
            }}
          >
            Use map centre
          </button>
          <button className="mini" onClick={() => getMap()?.flyTo({ center: layer.coord, duration: 700 })}>
            Go to
          </button>
        </div>
      </Section>

      <Section title="Style">
        <Field label="Colour">
          <Color value={layer.color} onChange={(color) => set({ color })} />
        </Field>
        <Field label="Size">
          <Slider value={layer.size} onChange={(size) => set({ size }, 'size')} min={2} max={40} step={0.5} precision={1} />
        </Field>
        <Field label="Halo">
          <Toggle value={layer.halo} onChange={(halo) => set({ halo })} />
        </Field>
        <Field label="Pulse">
          <Toggle value={layer.pulse} onChange={(pulse) => set({ pulse })} />
        </Field>
        <Field label="Pop in">
          <Toggle value={layer.pop} onChange={(pop) => set({ pop })} />
        </Field>
      </Section>

      <Section title="Label">
        <Field label="Text">
          <Text value={layer.label} onChange={(label) => set({ label })} />
        </Field>
        <Field label="Size">
          <Slider value={layer.labelSize} onChange={(labelSize) => set({ labelSize }, 'lsize')} min={8} max={120} step={1} precision={0} />
        </Field>
        <Field label="Colour">
          <Color value={layer.labelColor} onChange={(labelColor) => set({ labelColor })} />
        </Field>
        <Field label="Offset">
          <Slider value={layer.labelOffset} onChange={(labelOffset) => set({ labelOffset }, 'loff')} min={-80} max={80} step={1} precision={0} />
        </Field>
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ text */

function TextInspector({ layer }: { layer: TextLayer }) {
  const update = useStore((s) => s.updateLayer);
  const set = (patch: Partial<TextLayer>, key?: string) => update<TextLayer>(layer.id, patch, key);

  return (
    <>
      <Section title="Text">
        <p className="hint">Drag the text directly on the canvas to reposition it.</p>
        <Field label="Content">
          <Text value={layer.text} onChange={(text) => set({ text })} multiline />
        </Field>
        <Field label="Animation">
          <Select
            value={layer.anim}
            onChange={(anim) => set({ anim })}
            options={[
              { value: 'fade', label: 'Fade' },
              { value: 'slideUp', label: 'Slide up' },
              { value: 'typewriter', label: 'Typewriter' },
              { value: 'wipe', label: 'Wipe' },
              { value: 'none', label: 'None' },
            ]}
          />
        </Field>
      </Section>

      <Section title="Style">
        <Field label="Size" hint="In 1080p pixels — scales automatically with the output resolution">
          <Slider value={layer.size} onChange={(size) => set({ size }, 'size')} min={8} max={160} step={1} precision={0} />
        </Field>
        <Field label="Weight">
          <Select
            value={String(layer.weight)}
            onChange={(w) => set({ weight: parseInt(w, 10) })}
            options={['300', '400', '500', '600', '700', '800', '900']}
          />
        </Field>
        <Field label="Colour">
          <Color value={layer.color} onChange={(color) => set({ color })} />
        </Field>
        <Field label="Tracking">
          <Slider value={layer.letterSpacing} onChange={(letterSpacing) => set({ letterSpacing }, 'ls')} min={-4} max={24} step={0.5} precision={1} />
        </Field>
        <Field label="Align">
          <Select value={layer.align} onChange={(align) => set({ align })} options={['left', 'center', 'right']} />
        </Field>
        <Field label="Backing">
          <Toggle value={layer.background} onChange={(background) => set({ background })} />
        </Field>
        {layer.background && (
          <Field label="Backing colour">
            <Color value={layer.backgroundColor} onChange={(backgroundColor) => set({ backgroundColor })} />
          </Field>
        )}
      </Section>

      <Section title="Position">
        <Field label="X">
          <Slider value={layer.x} onChange={(x) => set({ x }, 'x')} min={0} max={1} step={0.001} precision={3} />
        </Field>
        <Field label="Y">
          <Slider value={layer.y} onChange={(y) => set({ y }, 'y')} min={0} max={1} step={0.001} precision={3} />
        </Field>
      </Section>
    </>
  );
}

/* ----------------------------------------------------------------- shape */

function ShapeInspector({ layer }: { layer: ShapeLayer }) {
  const update = useStore((s) => s.updateLayer);
  const set = (patch: Partial<ShapeLayer>, key?: string) => update<ShapeLayer>(layer.id, patch, key);

  return (
    <>
      <Section title="GeoJSON">
        <p className="hint">Paste a Feature, FeatureCollection or bare geometry — polygons, lines, anything.</p>
        <Text value={layer.geojson} onChange={(geojson) => set({ geojson })} multiline mono placeholder='{"type":"Polygon","coordinates":[[…]]}' />
        <div className="row-buttons">
          <button
            className="mini"
            onClick={async () => {
              const [handle] = await (
                window as unknown as { showOpenFilePicker?: (o: unknown) => Promise<FileSystemFileHandle[]> }
              ).showOpenFilePicker?.({ types: [{ accept: { 'application/geo+json': ['.json', '.geojson'] } }] }) ?? [];
              if (!handle) return;
              const file = await handle.getFile();
              set({ geojson: await file.text() });
            }}
          >
            Load file…
          </button>
        </div>
      </Section>
      <Section title="Style">
        <Field label="Fill">
          <Color value={layer.fillColor} onChange={(fillColor) => set({ fillColor })} />
        </Field>
        <Field label="Fill opacity">
          <Slider value={layer.fillOpacity} onChange={(fillOpacity) => set({ fillOpacity }, 'fo')} min={0} max={1} />
        </Field>
        <Field label="Outline">
          <Color value={layer.lineColor} onChange={(lineColor) => set({ lineColor })} />
        </Field>
        <Field label="Outline width">
          <Slider value={layer.lineWidth} onChange={(lineWidth) => set({ lineWidth }, 'lw')} min={0} max={16} step={0.5} precision={1} />
        </Field>
        <Field label="Trace outline" hint="Draw the outline on over the first 2 seconds">
          <Toggle value={layer.traceOutline} onChange={(traceOutline) => set({ traceOutline })} />
        </Field>
        <Field label="Extrude 3D">
          <Toggle value={layer.extrude} onChange={(extrude) => set({ extrude })} />
        </Field>
        {layer.extrude && (
          <Field label="Height">
            <Num value={layer.extrudeHeight} onChange={(extrudeHeight) => set({ extrudeHeight })} step={1000} suffix="m" />
          </Field>
        )}
      </Section>
    </>
  );
}

/* --------------------------------------------------------------- regions */

function RegionsInspector({ layer }: { layer: RegionsLayer }) {
  const update = useStore((s) => s.updateLayer);
  const patch = useStore((s) => s.patch);
  const basemap = useStore((s) => s.project.basemap);
  const duration = useStore((s) => s.project.duration);
  const setTime = useStore((s) => s.setTime);
  const [paste, setPaste] = useState('');
  const [pasteMsg, setPasteMsg] = useState<string | null>(null);

  const set = regionSet(layer, getBasemap(basemap).dark);
  const tourLength = tourDuration(layer, getBasemap(basemap).dark);
  const apply = (p: Partial<RegionsLayer>, key?: string) => update<RegionsLayer>(layer.id, p, key);

  /** Accept "Name, value" / "Name<tab>value" per line, and JSON objects too. */
  const importValues = (raw: string, replace: boolean) => {
    const text = raw.trim();
    if (!text) return;
    const parsed: Record<string, number> = {};
    try {
      const j = JSON.parse(text);
      const src = (j && typeof j === 'object' && 'values' in j ? j.values : j) as Record<string, unknown>;
      for (const [k, v] of Object.entries(src)) {
        const n = typeof v === 'number' ? v : parseFloat(String(v));
        if (isFinite(n)) parsed[k.trim()] = n;
      }
    } catch {
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const m = line.match(/^\s*"?(.+?)"?\s*[,;\t]\s*"?(-?[\d.]+)"?\s*$/);
        if (m && isFinite(parseFloat(m[2]))) parsed[m[1].trim()] = parseFloat(m[2]);
      }
    }

    const keys = Object.keys(parsed);
    if (!keys.length) {
      setPasteMsg('Could not read any “name, value” pairs from that.');
      return;
    }

    // Report names that will not land on a region, so typos are visible.
    const known = new Set(set.regions.map((r) => r.name.toLowerCase()));
    const unmatched = keys.filter((k) => !known.has(k.toLowerCase()));
    apply({ values: replace ? parsed : { ...layer.values, ...parsed } });
    setPasteMsg(
      `Imported ${keys.length} value${keys.length === 1 ? '' : 's'}` +
        (unmatched.length ? ` · ${unmatched.length} unmatched: ${unmatched.slice(0, 3).join(', ')}${unmatched.length > 3 ? '…' : ''}` : ''),
    );
  };

  const loadFile = async () => {
    const picker = (window as unknown as { showOpenFilePicker?: (o: unknown) => Promise<FileSystemFileHandle[]> })
      .showOpenFilePicker;
    if (!picker) return;
    const [handle] = (await picker({ types: [{ accept: { 'application/geo+json': ['.json', '.geojson'] } }] })) ?? [];
    if (!handle) return;
    const text = await (await handle.getFile()).text();
    apply({ geojson: text });
  };

  return (
    <>
      <Section title="Region data">
        <div className="stat-row">
          <span>{set.regions.length} regions</span>
          <span>{set.withValues} with values</span>
          {set.regions.length > set.withValues && <span className="dim">{set.regions.length - set.withValues} blank</span>}
        </div>
        <div className="row-buttons">
          <button className="mini" onClick={loadFile}>
            Load GeoJSON…
          </button>
          <button
            className="mini"
            onClick={() => apply({ geojson: JSON.stringify(indiaStatesOfficial), nameKey: 'name' })}
            title="37 states and union territories, India's official depiction"
          >
            India (official)
          </button>
          <button
            className="mini"
            onClick={() => apply({ geojson: JSON.stringify(indiaStatesNE), nameKey: 'name' })}
            title="Natural Earth boundaries — a global dataset, different depiction of disputed borders"
          >
            India (Natural Earth)
          </button>
        </div>
        <Field label="Name field" hint="Which feature property holds the region name">
          <Text value={layer.nameKey} onChange={(nameKey) => apply({ nameKey })} />
        </Field>
        {set.regions.length === 0 && layer.geojson.trim() !== '' && (
          <p className="hint warn">No polygons found — check that this is a FeatureCollection.</p>
        )}
        {set.regions.length === 0 && layer.geojson.trim() === '' && (
          <p className="hint">Load a GeoJSON of the regions you want to tour.</p>
        )}
      </Section>

      <Section title="Values">
        <Field label="Metric">
          <Text value={layer.metric} onChange={(metric) => apply({ metric })} />
        </Field>
        <Field label="Unit">
          <Text value={layer.unit} onChange={(unit) => apply({ unit })} />
        </Field>
        <Field label="Decimals">
          <Num value={layer.decimals} onChange={(decimals) => apply({ decimals: Math.round(decimals) })} step={1} min={0} max={4} precision={0} />
        </Field>

        <p className="hint">Paste one region per line as “Name, value” — or a JSON object.</p>
        <Text value={paste} onChange={setPaste} multiline placeholder={'Kerala, 36.3\nWest Bengal, 71.4'} />
        <div className="row-buttons">
          <button className="mini primary" onClick={() => importValues(paste, false)} disabled={!paste.trim()}>
            Merge
          </button>
          <button className="mini" onClick={() => importValues(paste, true)} disabled={!paste.trim()}>
            Replace all
          </button>
          <button className="mini danger" onClick={() => apply({ values: {} })}>
            Clear
          </button>
        </div>
        {pasteMsg && <p className="hint">{pasteMsg}</p>}

        {set.regions.length > 0 && (
          <div className="value-table">
            {set.regions.map((r) => (
              <div className="value-row" key={r.id}>
                <span className="swatch" style={{ background: r.value === null ? layer.noDataColor : r.fill }} />
                <span className="vname" title={r.name}>
                  {r.name}
                </span>
                <Num
                  value={r.value ?? NaN}
                  precision={layer.decimals}
                  step={0.1}
                  onChange={(v) => apply({ values: { ...layer.values, [r.name]: v } })}
                />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Colour scale">
        <Field label="Ramp" hint="Sequential, one hue, light→dark">
          <Select
            value={layer.ramp}
            onChange={(ramp) => apply({ ramp })}
            options={RAMPS.map((r) => ({ value: r.id, label: r.name }))}
          />
        </Field>
        <div className="ramp-preview">
          {Array.from({ length: 24 }, (_, i) => (
            <span key={i} style={{ background: rampColor(getRamp(layer.ramp), i / 23, layer.flipRamp ?? getBasemap(basemap).dark) }} />
          ))}
        </div>
        <Field label="Anchor" hint="Dark basemaps read better with the bright end on high values">
          <Select
            value={layer.flipRamp === null ? 'auto' : layer.flipRamp ? 'bright' : 'dark'}
            onChange={(v) => apply({ flipRamp: v === 'auto' ? null : v === 'bright' })}
            options={[
              { value: 'auto', label: 'Follow basemap' },
              { value: 'bright', label: 'High = bright' },
              { value: 'dark', label: 'High = dark' },
            ]}
          />
        </Field>
        <Field label="Auto range">
          <Toggle value={layer.autoDomain} onChange={(autoDomain) => apply({ autoDomain })} />
        </Field>
        {!layer.autoDomain && (
          <>
            <Field label="Min">
              <Num value={layer.min} onChange={(min) => apply({ min })} step={1} />
            </Field>
            <Field label="Max">
              <Num value={layer.max} onChange={(max) => apply({ max })} step={1} />
            </Field>
          </>
        )}
        {layer.autoDomain && set.withValues > 0 && (
          <p className="hint">
            Range {set.domain[0].toFixed(layer.decimals)} – {set.domain[1].toFixed(layer.decimals)}
            {layer.unit ? ' ' + layer.unit : ''}
          </p>
        )}
        <Field label="Fill opacity">
          <Slider value={layer.fillOpacity} onChange={(fillOpacity) => apply({ fillOpacity }, 'fo')} min={0} max={1} />
        </Field>
        <Field label="Dim others" hint="How far unvisited regions fade back">
          <Slider value={layer.dimOthers} onChange={(dimOthers) => apply({ dimOthers }, 'dim')} min={0} max={0.9} />
        </Field>
        <Field label="No-data colour">
          <Color value={layer.noDataColor} onChange={(noDataColor) => apply({ noDataColor })} />
        </Field>
      </Section>

      <Section title="Borders">
        <Field label="Base colour">
          <Color value={layer.borderColor} onChange={(borderColor) => apply({ borderColor })} />
        </Field>
        <Field label="Base width">
          <Slider value={layer.borderWidth} onChange={(borderWidth) => apply({ borderWidth }, 'bw')} min={0} max={4} step={0.1} precision={1} />
        </Field>
        <Field label="Highlight">
          <Color value={layer.highlightColor} onChange={(highlightColor) => apply({ highlightColor })} />
        </Field>
        <Field label="Highlight width">
          <Slider value={layer.highlightWidth} onChange={(highlightWidth) => apply({ highlightWidth }, 'hw')} min={0.5} max={12} step={0.5} precision={1} />
        </Field>
        <Field label="Trace on" hint="Draw the highlighted border rather than flashing it">
          <Toggle value={layer.traceBorder} onChange={(traceBorder) => apply({ traceBorder })} />
        </Field>
        <Field label="Dark casing" hint="Needed for borders to read over satellite imagery">
          <Toggle value={layer.borderCasing} onChange={(borderCasing) => apply({ borderCasing })} />
        </Field>
      </Section>

      <Section title="Opening & closing">
        <p className="hint">The tour opens on the whole map, visits each region, then pulls back out.</p>
        <Field label="Intro" hint="Overview held before the first region">
          <Num value={layer.intro} onChange={(intro) => apply({ intro: Math.max(0, intro) })} step={0.5} min={0} suffix="s" />
        </Field>
        <Field label="Draw borders" hint="Every border draws itself on during the intro">
          <Toggle value={layer.introTrace} onChange={(introTrace) => apply({ introTrace })} />
        </Field>
        <Field label="Outro" hint="Overview held after the last region">
          <Num value={layer.outro} onChange={(outro) => apply({ outro: Math.max(0, outro) })} step={0.5} min={0} suffix="s" />
        </Field>
        <Field label="Label everything" hint="Show every region's value in the closing overview">
          <Toggle value={layer.labelAll} onChange={(labelAll) => apply({ labelAll })} />
        </Field>
        {layer.labelAll && (
          <Field label="Label size">
            <Slider value={layer.labelSize} onChange={(labelSize) => apply({ labelSize }, 'ls')} min={8} max={40} step={1} precision={0} />
          </Field>
        )}
      </Section>

      <Section title="Tour">
        <Field label="Enabled">
          <Toggle value={layer.tour} onChange={(tour) => apply({ tour })} />
        </Field>
        <Field label="Order">
          <Select
            value={layer.order}
            onChange={(order) => apply({ order })}
            options={[
              { value: 'valueDesc', label: 'Highest value first' },
              { value: 'valueAsc', label: 'Lowest value first' },
              { value: 'alpha', label: 'Alphabetical' },
              { value: 'geojson', label: 'File order' },
              { value: 'custom', label: 'Custom list' },
            ]}
          />
        </Field>
        {layer.order === 'custom' && (
          <Text
            value={layer.customOrder.join('\n')}
            onChange={(v) => apply({ customOrder: v.split('\n').filter((x) => x.trim()) })}
            multiline
            placeholder={'Kerala\nTamil Nadu\n…'}
          />
        )}
        <Field label="Seconds each">
          <Num value={layer.dwell} onChange={(dwell) => apply({ dwell: Math.max(0.3, dwell) })} step={0.1} min={0.3} suffix="s" />
        </Field>
        <Field label="Fly time" hint="Camera travel at the start of each stop">
          <Num value={layer.moveTime} onChange={(moveTime) => apply({ moveTime: Math.max(0, moveTime) })} step={0.1} min={0} suffix="s" />
        </Field>
        <Field label="Drive camera" hint="The tour overrides camera keyframes while it runs">
          <Toggle value={layer.driveCamera} onChange={(driveCamera) => apply({ driveCamera })} />
        </Field>
        {layer.driveCamera && (
          <>
            <Field label="Framing pad">
              <Slider value={layer.padding} onChange={(padding) => apply({ padding }, 'pad')} min={0} max={0.45} />
            </Field>
            <Field label="Max zoom" hint="Keeps very small regions from filling the frame with empty context">
              <Slider value={layer.maxZoom} onChange={(maxZoom) => apply({ maxZoom }, 'mz')} min={2} max={16} step={0.5} precision={1} />
            </Field>
            <Field label="Pitch">
              <Slider value={layer.tourPitch} onChange={(tourPitch) => apply({ tourPitch }, 'tp')} min={0} max={70} step={1} precision={0} />
            </Field>
          </>
        )}
        <Field label="Count up">
          <Toggle value={layer.countUp} onChange={(countUp) => apply({ countUp })} />
        </Field>

        {set.order.length > 0 && (
          <>
            <p className="hint">
              {set.order.length} stops · {tourLength.toFixed(1)}s total (intro {layer.intro}s + tour{' '}
              {(set.order.length * layer.dwell).toFixed(1)}s + outro {layer.outro}s), ending at{' '}
              {(layer.in + tourLength).toFixed(1)}s
            </p>
            <div className="row-buttons">
              <button
                className="mini"
                onClick={() => {
                  const end = layer.in + tourLength;
                  apply({ out: end });
                  if (end + 0.5 > duration) patch((p) => void (p.duration = Math.ceil(end + 1)));
                }}
                title="Set the layer out point, and the composition, to fit the whole tour"
              >
                Fit timeline to tour
              </button>
              <button className="mini" onClick={() => setTime(layer.in + 0.01)}>
                Jump to start
              </button>
            </div>
            <div className="stop-list">
              {set.order.map((ri, i) => {
                const r = set.regions[ri];
                return (
                  <button
                    key={r.id}
                    className="stop"
                    onClick={() => setTime(layer.in + layer.intro + i * layer.dwell + Math.min(layer.moveTime + 0.3, layer.dwell - 0.05))}
                    title={`Stop ${i + 1} — jump the playhead here`}
                  >
                    <span className="swatch" style={{ background: r.value === null ? layer.noDataColor : r.fill }} />
                    <span className="vname">{r.name}</span>
                    <span className="dim">{r.value === null ? '—' : r.value.toFixed(layer.decimals)}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </Section>

      <Section title="Readouts">
        <Field label="Callout card">
          <Toggle value={layer.showCallout} onChange={(showCallout) => apply({ showCallout })} />
        </Field>
        {layer.showCallout && (
          <>
            <Field label="Card size">
              <Slider value={layer.calloutSize} onChange={(calloutSize) => apply({ calloutSize }, 'cs')} min={50} max={180} step={1} precision={0} />
            </Field>
            <Field label="Show rank">
              <Toggle value={layer.showRank} onChange={(showRank) => apply({ showRank })} />
            </Field>
          </>
        )}
        <Field label="Legend">
          <Toggle value={layer.showLegend} onChange={(showLegend) => apply({ showLegend })} />
        </Field>
        {layer.showLegend && (
          <Field label="Legend title">
            <Text value={layer.legendTitle} onChange={(legendTitle) => apply({ legendTitle })} placeholder={layer.metric} />
          </Field>
        )}
      </Section>
    </>
  );
}

/* ---------------------------------------------------------------- clouds */

function CloudsInspector({ layer }: { layer: CloudsLayer }) {
  const update = useStore((s) => s.updateLayer);
  const set = (p: Partial<CloudsLayer>, key?: string) => update<CloudsLayer>(layer.id, p, key);

  return (
    <>
      <Section title="Clouds">
        <p className="hint">Drifting cover for an opening shot. Sits over the map, under your titles.</p>
        <Field label="Coverage">
          <Slider value={layer.coverage} onChange={(coverage) => set({ coverage }, 'cov')} min={0} max={1.4} />
        </Field>
        <Field label="Formation size">
          <Slider value={layer.scale} onChange={(scale) => set({ scale }, 'sc')} min={0.3} max={3} step={0.05} />
        </Field>
        <Field label="Colour">
          <Color value={layer.color} onChange={(color) => set({ color })} />
        </Field>
        <Field label="Opacity">
          <Slider value={layer.opacity} onChange={(opacity) => set({ opacity }, 'op')} min={0} max={1} />
        </Field>
      </Section>

      <Section title="Drift">
        <Field label="Speed">
          <Slider value={layer.speed} onChange={(speed) => set({ speed }, 'sp')} min={0} max={120} step={1} precision={0} />
        </Field>
        <Field label="Direction">
          <Slider value={layer.direction} onChange={(direction) => set({ direction }, 'dir')} min={0} max={360} step={1} precision={0} />
        </Field>
      </Section>

      <Section title="Clearing">
        <p className="hint">The cloud parts from the centre outward to reveal the map.</p>
        <Field label="Enabled">
          <Toggle value={layer.dissipate} onChange={(dissipate) => set({ dissipate })} />
        </Field>
        {layer.dissipate && (
          <>
            <Field label="Starts">
              <Num value={layer.dissipateStart} onChange={(dissipateStart) => set({ dissipateStart })} step={0.1} min={0} suffix="s" />
            </Field>
            <Field label="Clear by">
              <Num value={layer.dissipateEnd} onChange={(dissipateEnd) => set({ dissipateEnd })} step={0.1} min={0} suffix="s" />
            </Field>
          </>
        )}
      </Section>
    </>
  );
}

/* ----------------------------------------------------------------- image */

function ImageInspector({ layer }: { layer: ImageLayer }) {
  const update = useStore((s) => s.updateLayer);
  const set = (p: Partial<ImageLayer>, key?: string) => update<ImageLayer>(layer.id, p, key);

  /** Inlined as a data URL so the project file stays self-contained. */
  const pickFile = async () => {
    const picker = (window as unknown as { showOpenFilePicker?: (o: unknown) => Promise<FileSystemFileHandle[]> })
      .showOpenFilePicker;
    if (!picker) return;
    const [handle] =
      (await picker({ types: [{ description: 'Image', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] } }] })) ?? [];
    if (!handle) return;
    const file = await handle.getFile();
    const reader = new FileReader();
    reader.onload = () => set({ src: String(reader.result), name: file.name.replace(/\.[^.]+$/, '') });
    reader.readAsDataURL(file);
  };

  const isData = layer.src.startsWith('data:');

  return (
    <>
      <Section title="Image">
        <div className="row-buttons">
          <button className="mini primary" onClick={pickFile}>
            Choose file…
          </button>
          {layer.src && (
            <button className="mini danger" onClick={() => set({ src: '' })}>
              Clear
            </button>
          )}
        </div>
        <p className="hint">
          {isData
            ? 'Embedded in the project file.'
            : 'A file you pick is embedded as a data URL, so the project stays self-contained. A URL is fetched instead — it must allow cross-origin reads or the export will drop it.'}
        </p>
        <Field label="Source">
          <Text value={isData ? `(embedded, ${Math.round(layer.src.length / 1366)} KB)` : layer.src} onChange={(src) => set({ src })} />
        </Field>
        <Field label="Caption">
          <Text value={layer.caption} onChange={(caption) => set({ caption })} />
        </Field>
        <Field label="Animation">
          <Select
            value={layer.anim}
            onChange={(anim) => set({ anim })}
            options={[
              { value: 'kenBurns', label: 'Slow push in' },
              { value: 'fade', label: 'Fade' },
              { value: 'slideUp', label: 'Slide up' },
              { value: 'none', label: 'None' },
            ]}
          />
        </Field>
      </Section>

      <Section title="Placement">
        <Field label="X">
          <Slider value={layer.x} onChange={(x) => set({ x }, 'x')} min={0} max={1} step={0.005} precision={3} />
        </Field>
        <Field label="Y">
          <Slider value={layer.y} onChange={(y) => set({ y }, 'y')} min={0} max={1} step={0.005} precision={3} />
        </Field>
        <Field label="Width" hint="Fraction of the frame width; height follows the image">
          <Slider value={layer.width} onChange={(width) => set({ width }, 'w')} min={0.05} max={1} step={0.005} precision={3} />
        </Field>
        <Field label="Anchor">
          <Select
            value={layer.anchor}
            onChange={(anchor) => set({ anchor })}
            options={[
              { value: 'center', label: 'Centre' },
              { value: 'topLeft', label: 'Top left' },
              { value: 'topRight', label: 'Top right' },
              { value: 'bottomLeft', label: 'Bottom left' },
              { value: 'bottomRight', label: 'Bottom right' },
            ]}
          />
        </Field>
      </Section>

      <Section title="Style">
        <Field label="Opacity">
          <Slider value={layer.opacity} onChange={(opacity) => set({ opacity }, 'op')} min={0} max={1} />
        </Field>
        <Field label="Corner radius">
          <Slider value={layer.radius} onChange={(radius) => set({ radius }, 'r')} min={0} max={60} step={1} precision={0} />
        </Field>
        <Field label="Border">
          <Toggle value={layer.border} onChange={(border) => set({ border })} />
        </Field>
        {layer.border && (
          <Field label="Border colour">
            <Color value={layer.borderColor} onChange={(borderColor) => set({ borderColor })} />
          </Field>
        )}
        <Field label="Shadow">
          <Toggle value={layer.shadow} onChange={(shadow) => set({ shadow })} />
        </Field>
      </Section>
    </>
  );
}

/* ----------------------------------------------------------- composition */

const PRESETS: [string, number, number][] = [
  ['1080p landscape', 1920, 1080],
  ['4K landscape', 3840, 2160],
  ['Vertical 9:16', 1080, 1920],
  ['Square 1:1', 1080, 1080],
  ['720p landscape', 1280, 720],
];

function CompositionInspector() {
  const project = useStore((s) => s.project);
  const patch = useStore((s) => s.patch);

  return (
    <Section title="Composition">
      <Field label="Name">
        <Text value={project.name} onChange={(name) => patch((p) => void (p.name = name), 'name')} />
      </Field>
      <Field label="Duration">
        <Num
          value={project.duration}
          onChange={(v) => patch((p) => void (p.duration = Math.max(0.5, v)))}
          step={0.5}
          min={0.5}
          suffix="s"
        />
      </Field>
      <Field label="FPS">
        <Select
          value={String(project.fps)}
          onChange={(v) => patch((p) => void (p.fps = parseInt(v, 10)))}
          options={['24', '25', '30', '50', '60']}
        />
      </Field>
      <Field label="Size">
        <Select
          value={`${project.width}x${project.height}`}
          onChange={(v) => {
            const [w, h] = v.split('x').map(Number);
            patch((p) => {
              p.width = w;
              p.height = h;
            });
          }}
          options={PRESETS.map(([label, w, h]) => ({ value: `${w}x${h}`, label: `${label} · ${w}×${h}` }))}
        />
      </Field>
      <Field label="Basemap">
        <Select
          value={project.basemap}
          onChange={(basemap) => patch((p) => void (p.basemap = basemap))}
          options={BASEMAPS.map((b) => ({ value: b.id, label: b.name }))}
        />
      </Field>
      <Field label="3D terrain">
        <Toggle value={project.terrain} onChange={(terrain) => patch((p) => void (p.terrain = terrain))} />
      </Field>
      {project.terrain && (
        <Field label="Exaggeration">
          <Slider
            value={project.terrainExaggeration}
            onChange={(v) => patch((p) => void (p.terrainExaggeration = v), 'exag')}
            min={0.2}
            max={4}
            step={0.1}
            precision={1}
          />
        </Field>
      )}
    </Section>
  );
}
