import { useState } from 'react';
import { useStore, useSelectedCue, useSelectedGroup, useSelectedKeyframe, useSelectedLayer } from '../store';
import { envelopeOf, windowOf } from '@geomotion/document';
import { childrenOf, nodeTypeDef } from '@geomotion/document';
import type {
  AudioCue,
  GroupNode,
  ImageLayer,
  MarkerLayer,
  RegionsLayer,
  RegionTour,
  RouteLayer,
  ShapeLayer,
} from '@geomotion/document';
import { INDIA_STATES, matchNames, regionSet } from '@geomotion/entities';
import { tourDuration } from '@geomotion/evaluator';
import { RAMPS, getRamp, rampColor, removeBackground } from '@geomotion/core';
import indiaStatesOfficial from '../data/india-states-official.json';
import indiaStatesNE from '../data/india-states.json';
import { EASING_NAMES } from '@geomotion/animation';
import { useRenderHost } from '../render/host';
import { BASEMAPS, getBasemap } from '@geomotion/map';
import { Color, Field, Num, Section, Select, Slider, Text, Toggle } from './ui';
import TrackedNumber from './TrackedNumber';
import SchemaRows from './SchemaRows';
import Icon from './Icon';
import { haversine, measure, buildPath } from '@geomotion/geometry';

/** Display names and icons per layer type, for the subject header. */
const LAYER_ICON = {
  route: 'route', marker: 'marker', text: 'text', shape: 'shape',
  regions: 'regions', clouds: 'clouds', image: 'image',
} as const;

/**
 * What a node type is called, from the registry that also holds its defaults and its
 * property metadata (§3.4). It used to be a second table here, which is the drift the
 * registry exists to remove: a node type nobody added to this map showed up as nothing.
 */
const kindOf = (type: string) => nodeTypeDef(type)?.kind ?? 'Layer';

/** Which layer types this build draws a hand-written panel for. */
const HAS_PANEL = new Set(['regions']);

/** The banner a locked layer shows, with the one control that still works on it. */
function LockedNotice({ id }: { id: string }) {
  const setLayerLocked = useStore((s) => s.setLayerLocked);
  return (
    <div className="locked-notice">
      <Icon name="lock" size={13} />
      <span>Locked — edits are refused.</span>
      <button className="mini" onClick={() => setLayerLocked(id, false)}>
        Unlock
      </button>
    </div>
  );
}

export default function Inspector() {
  const layer = useSelectedLayer();
  const group = useSelectedGroup();
  const kf = useSelectedKeyframe();
  const cue = useSelectedCue();

  /** What is being edited, named once at the top so the panel is never anonymous. */
  const subject = cue
    ? { icon: 'audio' as const, name: cue.text || 'Audio clip', kind: 'Audio clip' }
    : kf
      ? { icon: 'camera' as const, name: 'Camera keyframe', kind: 'Camera' }
      : group
        ? { icon: 'folder' as const, name: group.name, kind: kindOf('group') }
        : layer
          ? { icon: LAYER_ICON[layer.type] ?? ('shape' as const), name: layer.name, kind: kindOf(layer.type) }
          : null;

  return (
    <div className="inspector">
      <div className="panel-head">
        <span>Properties</span>
      </div>

      {/*
        * A header naming the subject, because a column of fields called Size, Colour and
        * Opacity is the same column for six different layer types. Showing what you are
        * editing is the difference between an inspector and a form.
        */}
      {subject && (
        <div className={'subject t-' + (layer?.type ?? (cue ? 'text' : 'camera'))}>
          <span className="subject-icon">
            <Icon name={subject.icon} size={15} />
          </span>
          <span className="subject-body">
            <span className="subject-name">{subject.name}</span>
            <span className="subject-kind">{subject.kind}</span>
          </span>
        </div>
      )}

      {/*
        * A locked layer's fields still show — you selected it to read it — but the panel
        * has to say why nothing you type sticks. The store refuses the write silently,
        * and a silent refusal in a properties panel reads as a broken input.
        */}
      {(layer?.locked === true || group?.locked === true) && <LockedNotice id={(layer ?? group)!.id} />}

      {cue && <AudioInspector cue={cue} />}
      {kf && <KeyframeInspector />}

      {/*
        * `fieldset[disabled]` disables every control inside it, however deeply nested —
        * so a locked layer's fields go inert without each of the seven inspectors, or
        * each control in them, learning what a lock is. The banner above says why.
        *
        * Without this the fields stay live and refuse silently: a slider moves under the
        * pointer, the store declines the write, and the value snaps back. That reads as
        * a broken control rather than a protected one.
        */}
      <fieldset className="lock-guard" disabled={layer?.locked === true || group?.locked === true}>
        {group && <GroupInspector group={group} />}
        {/* Opacity, and anything else the group's metadata declares — the same generator a
            plugin's node type will get for free (§15). */}
        {group && <SchemaRows node={group} />}
        {/*
          * A node this build has no panel for: a document from a newer version, or a type a
          * plugin registered. Its metadata is all the editor needs to show it, which is the
          * whole argument for keeping the description in the document package (§3.4).
          */}
        {layer && !HAS_PANEL.has(layer.type) && (
          <SchemaRows
            node={layer}
            {...(layer.type === 'image'
              ? {
                  blocks: {
                    Image: { before: <ImageSource layer={layer} /> },
                    Background: { before: <ImageBackground layer={layer} /> },
                  },
                }
              : {})}
            {...(layer.type === 'shape'
              ? { blocks: { GeoJSON: { before: <ShapeSource layer={layer} /> } } }
              : {})}
            {...(layer.type === 'marker'
              ? {
                  blocks: {
                    Marker: { head: <MarkerPlace />, before: <MarkerPosition layer={layer} /> },
                    Behaviours: { before: <MarkerBehaviours layer={layer} /> },
                  },
                }
              : {})}
            {...(layer.type === 'route'
              ? {
                  blocks: {
                    Route: { head: <RouteAddPoints />, before: <RoutePoints layer={layer} /> },
                    Reveal: { after: <RouteSpeed layer={layer} /> },
                    'Travelling marker': { before: <RouteMarkerIcon layer={layer} /> },
                  },
                }
              : {})}
          />
        )}
        {layer?.type === 'regions' && <RegionsInspector layer={layer} />}
        {layer && <TimingInspector />}
      </fieldset>
      {!layer && !group && !kf && !cue && (
        <div className="empty-hint">
          <p>Nothing selected.</p>
          <p>Pick a layer, a camera keyframe or an audio clip, or edit the composition below.</p>
        </div>
      )}
      <CompositionInspector />
    </div>
  );
}

/**
 * A group: what it is called, and how much of it comes through.
 *
 * Opacity is the whole feature — a group multiplies into everything under it, so one
 * keyframed number fades a beat as a unit rather than as four layers that have to agree.
 * It uses the same tracked-number control as every other animatable property, which is
 * what makes it keyframable without a second mechanism.
 */
function GroupInspector({ group }: { group: GroupNode }) {
  const update = useStore((s) => s.updateLayer);
  const ungroup = useStore((s) => s.ungroup);
  const childCount = useStore((s) => childrenOf(s.project, group.id).length);

  return (
    <Section
      title="Group"
      right={
        <button className="mini" onClick={() => ungroup(group.id)} title="Put the contents back where the group is (⇧⌘G)">
          Ungroup
        </button>
      }
    >
      <Field label="Name">
        <Text value={group.name} onChange={(name) => update(group.id, { name } as never, 'name')} />
      </Field>
      <p className="hint">
        {childCount === 1 ? '1 layer' : `${childCount} layers`} — hiding, locking and opacity apply to all of them.
      </p>
    </Section>
  );
}

/* ---------------------------------------------------------------- timing */

/**
 * An audio clip: where it sits, how loud it is, and how it enters and leaves.
 *
 * Level and fades are the difference between "two files playing at once" and music
 * sitting under a voice, which is the main reason to have audio here at all.
 */
function AudioInspector({ cue }: { cue: AudioCue }) {
  const update = useStore((s) => s.updateAudioCue);
  const remove = useStore((s) => s.removeAudioCue);
  const setTime = useStore((s) => s.setTime);
  const set = (patch: Partial<AudioCue>, key?: string) => update(cue.id, patch, key);
  const env = envelopeOf(cue);

  return (
    <Section title="Audio clip">
      <Field label="Name">
        <input className="text-in" value={cue.text} onChange={(e) => set({ text: e.target.value }, 'name')} />
      </Field>
      <Field label="Start">
        <Num value={cue.t} onChange={(t) => set({ t: Math.max(0, t) }, 't')} step={0.1} min={0} suffix="s" />
      </Field>
      <Field label="Length">
        {/* Measured when the file was decoded; editing it would desync the audio. */}
        <span className="dim">{cue.d.toFixed(2)}s</span>
      </Field>
      <Field label="Level">
        <Slider
          value={env.gain}
          onChange={(gain) => set({ gain }, 'gain')}
          min={0}
          max={2}
          step={0.05}
          precision={2}
        />
      </Field>
      <Field label="Fade in">
        <Num value={env.fadeIn} onChange={(fadeIn) => set({ fadeIn }, 'fin')} step={0.1} min={0} suffix="s" />
      </Field>
      <Field label="Fade out">
        <Num value={env.fadeOut} onChange={(fadeOut) => set({ fadeOut }, 'fout')} step={0.1} min={0} suffix="s" />
      </Field>
      {/*
        * Three roles rather than a "music bed" toggle, because there are now three answers.
        * A toggle could only say music-or-not, so turning it on and off again would quietly
        * turn a sound effect into a foreground clip — one that ducks the score under a
        * two-hundred-millisecond click.
        */}
      <Field
        label="Role"
        hint="A music bed drops out of the way while anything speaks. An effect never moves the bed — it is too short to make room for."
      >
        <Select
          value={cue.role ?? 'voice'}
          onChange={(role) => set({ role: role === 'voice' ? undefined : role })}
          options={[
            { value: 'voice', label: 'Voice / foreground' },
            { value: 'music', label: 'Music bed' },
            { value: 'sfx', label: 'Sound effect' },
          ]}
        />
      </Field>
      {cue.role === 'music' && (
        <>
          <Field label="Duck to" hint="How far it drops while something plays over it.">
            <Slider
              value={cue.duck ?? 0.25}
              onChange={(duck) => set({ duck }, 'duck')}
              min={0}
              max={1}
              step={0.05}
              precision={2}
            />
          </Field>
          <Field label="Duck fade">
            <Num
              value={cue.duckFade ?? 0.3}
              onChange={(duckFade) => set({ duckFade }, 'dfade')}
              step={0.05}
              min={0}
              suffix="s"
            />
          </Field>
        </>
      )}
      <div className="row">
        <button className="mini" onClick={() => setTime(cue.t)}>
          Jump to start
        </button>
        <button className="mini danger" onClick={() => remove(cue.id)}>
          Remove
        </button>
      </div>
    </Section>
  );
}

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
  const host = useRenderHost();
  const kf = useSelectedKeyframe()!;
  const update = useStore((s) => s.updateKeyframe);
  const remove = useStore((s) => s.removeKeyframe);
  const duration = useStore((s) => s.project.duration);

  const captureView = () => {
    const map = host?.map;
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
    host?.map.jumpTo({ center: kf.center, zoom: kf.zoom, bearing: kf.bearing, pitch: kf.pitch });
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

/** "Add points" — a map-click mode, so it acts on the section rather than a field. */
function RouteAddPoints() {
  const setTool = useStore((s) => s.setTool);
  const tool = useStore((s) => s.tool);
  return (
    <button className={'mini' + (tool === 'route' ? ' primary' : '')} onClick={() => setTool(tool === 'route' ? 'select' : 'route')}>
      {tool === 'route' ? 'Done' : 'Add points'}
    </button>
  );
}

/**
 * The point list: an ordered, editable, removable set of coordinates with its own stats and
 * two map actions. `coords` is declared `custom: true` — the canvas is the real editor for
 * a coordinate, and this is its typed fallback.
 */
function RoutePoints({ layer }: { layer: RouteLayer }) {
  const host = useRenderHost();
  const update = useStore((s) => s.updateLayer);
  const tool = useStore((s) => s.tool);
  const set = (patch: Partial<RouteLayer>, key?: string) => update<RouteLayer>(layer.id, patch, key);

  const path = measure(buildPath(layer.coords, layer.curve));
  const km = path.length / 1000;
  const firstCoord = layer.coords[0];
  const lastCoord = layer.coords[layer.coords.length - 1];
  const straight = firstCoord && lastCoord ? haversine(firstCoord, lastCoord) / 1000 : 0;

  return (
    <>
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
            const c = host?.map.getCenter();
            if (c) set({ coords: [...layer.coords, [c.lng, c.lat]] });
          }}
        >
          Add map centre
        </button>
        <button
          className="mini"
          disabled={layer.coords.length < 2}
          onClick={() => {
            const map = host?.map;
            if (!map || layer.coords.length < 2) return;
            const b = layer.coords.reduce<[number, number, number, number]>(
              (acc, c) => [Math.min(acc[0], c[0]), Math.min(acc[1], c[1]), Math.max(acc[2], c[0]), Math.max(acc[3], c[1])],
              [180, 90, -180, -90],
            );
            map.fitBounds(
              [
                [b[0], b[1]],
                [b[2], b[3]],
              ],
              { padding: 80, duration: 600 },
            );
          }}
        >
          Frame route
        </button>
      </div>
    </>
  );
}

/** How fast the route travels, derived from the reveal window above it. */
function RouteSpeed({ layer }: { layer: RouteLayer }) {
  const path = measure(buildPath(layer.coords, layer.curve));
  const km = path.length / 1000;
  const w = windowOf(layer.progress);
  if (!w || path.length === 0 || w.to <= w.from) return null;
  return (
    <p className="hint">
      ≈ {(km / (w.to - w.from)).toFixed(0)} km/s of travel over {(w.to - w.from).toFixed(1)}s
    </p>
  );
}

/**
 * The travelling marker's icon. Bespoke because picking "none" also clears
 * `marker.enabled` — one control writing two fields, which a row cannot express.
 */
function RouteMarkerIcon({ layer }: { layer: RouteLayer }) {
  const update = useStore((s) => s.updateLayer);
  return (
    <Field label="Icon">
      <Select
        value={layer.marker.icon}
        onChange={(icon) =>
          update<RouteLayer>(layer.id, { marker: { ...layer.marker, icon, enabled: icon !== 'none' } })
        }
        options={['dot', 'plane', 'car', 'pin', 'none']}
      />
    </Field>
  );
}

/**
 * The marker's position: a [lng, lat] pair, not two independent numbers, with the two map
 * actions that make placing one bearable. `coord` is declared `custom: true`.
 */
function MarkerPosition({ layer }: { layer: MarkerLayer }) {
  const host = useRenderHost();
  const update = useStore((s) => s.updateLayer);
  const set = (patch: Partial<MarkerLayer>, key?: string) => update<MarkerLayer>(layer.id, patch, key);

  return (
    <>
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
            const c = host?.map.getCenter();
            if (c) set({ coord: [c.lng, c.lat] });
          }}
        >
          Use map centre
        </button>
        <button className="mini" onClick={() => host?.map.flyTo({ center: layer.coord, duration: 700 })}>
          Go to
        </button>
      </div>
    </>
  );
}

/** The "place it by clicking the map" mode, which acts on the section rather than a field. */
function MarkerPlace() {
  const setTool = useStore((s) => s.setTool);
  const tool = useStore((s) => s.tool);
  return (
    <button className={'mini' + (tool === 'marker' ? ' primary' : '')} onClick={() => setTool(tool === 'marker' ? 'select' : 'marker')}>
      {tool === 'marker' ? 'Click map…' : 'Place'}
    </button>
  );
}

/**
 * The behaviour stack (§06) — an ordered list you can toggle.
 *
 * Listing every behaviour rather than only the enabled ones is deliberate: a switch you
 * cannot see is a feature nobody finds. A document sub-structure, so not a row.
 */
function MarkerBehaviours({ layer }: { layer: MarkerLayer }) {
  const update = useStore((s) => s.updateLayer);
  const set = (patch: Partial<MarkerLayer>, key?: string) => update<MarkerLayer>(layer.id, patch, key);

  return (
    <>
      {Object.entries(layer.behaviours).map(([prop, stack]) =>
        stack.map((b) => (
          <Field key={b.id} label={BEHAVIOUR_LABELS[b.type] ?? b.type} hint={`Modifies ${prop}`}>
            <Toggle
              value={b.enabled}
              onChange={(enabled) =>
                set({
                  behaviours: {
                    ...layer.behaviours,
                    [prop]: stack.map((x) => (x.id === b.id ? { ...x, enabled } : x)),
                  },
                })
              }
            />
          </Field>
        )),
      )}
    </>
  );
}

/* ------------------------------------------------------------------ text */

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
  /** Merge into the nested tour behaviour, so one control cannot drop the rest. */
  const applyTour = (t: Partial<RegionTour>, key?: string) =>
    apply({ tour: { ...layer.tour, ...t } }, key);

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
        const name = m?.[1];
        const raw = m?.[2];
        if (name && raw && isFinite(parseFloat(raw))) parsed[name.trim()] = parseFloat(raw);
      }
    }

    const keys = Object.keys(parsed);
    if (!keys.length) {
      setPasteMsg('Could not read any “name, value” pairs from that.');
      return;
    }

    /*
     * One join, through the entity registry (§05 Decision 02).
     *
     * This used to be a lowercase `Set` of region names — a third private join beside
     * the survey reader's alias table and the layer's own name-keyed values. They had
     * each learned different things, so `Jammu & Kashmir` imported cleanly on the
     * command line and was rejected as unknown here. Routing both through `matchNames`
     * means a spelling learned anywhere is known everywhere.
     */
    const names = set.regions.map((r) => r.name);
    const landed: Record<string, number> = {};
    const unmatched: string[] = [];
    for (const [name, value] of Object.entries(parsed)) {
      const hits = matchNames(names, name, INDIA_STATES);
      if (hits.length === 0) {
        unmatched.push(name);
        continue;
      }
      // A merged name lands on every region it covers, or one of them stays blank with
      // nothing on screen to say why.
      for (const hit of hits) landed[hit] = value;
    }

    apply({ values: replace ? landed : { ...layer.values, ...landed } });
    const n = Object.keys(landed).length;
    setPasteMsg(
      `Imported ${n} value${n === 1 ? '' : 's'}` +
        (unmatched.length
          ? ` · ${unmatched.length} unmatched: ${unmatched.slice(0, 3).join(', ')}${unmatched.length > 3 ? '…' : ''}`
          : ''),
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
        <Field
          label="Grouping"
          hint="How digits are grouped and punctuated in the render. Stored in the project, so a video looks the same wherever it is exported."
        >
          <Select
            value={layer.numberLocale}
            onChange={(numberLocale) => apply({ numberLocale })}
            options={NUMBER_LOCALES}
          />
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
        <TrackedNumber label="Fill opacity" layerId={layer.id} prop="fillOpacity" track={layer.fillOpacity} min={0} max={1} />
        <Field label="Dim others" hint="How far unvisited regions fade back">
          <Slider value={layer.tour.dimOthers} onChange={(dimOthers) => applyTour({ dimOthers }, 'dim')} min={0} max={0.9} />
        </Field>
        <Field label="No-data colour">
          <Color value={layer.noDataColor} onChange={(noDataColor) => apply({ noDataColor })} />
        </Field>
      </Section>

      <Section title="Borders">
        <Field label="Base colour">
          <Color value={layer.borderColor} onChange={(borderColor) => apply({ borderColor })} />
        </Field>
        <TrackedNumber label="Base width" layerId={layer.id} prop="borderWidth" track={layer.borderWidth} min={0} max={4} step={0.1} precision={1} />
        <Field label="Highlight">
          <Color value={layer.highlightColor} onChange={(highlightColor) => apply({ highlightColor })} />
        </Field>
        <TrackedNumber label="Highlight width" layerId={layer.id} prop="highlightWidth" track={layer.highlightWidth} min={0.5} max={12} step={0.5} precision={1} />
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
          <Num value={layer.tour.intro} onChange={(intro) => applyTour({ intro: Math.max(0, intro) })} step={0.5} min={0} suffix="s" />
        </Field>
        <Field label="Draw borders" hint="Every border draws itself on during the intro">
          <Toggle value={layer.tour.introTrace} onChange={(introTrace) => applyTour({ introTrace })} />
        </Field>
        <Field label="Outro" hint="Overview held after the last region">
          <Num value={layer.tour.outro} onChange={(outro) => applyTour({ outro: Math.max(0, outro) })} step={0.5} min={0} suffix="s" />
        </Field>
        <Field label="Label everything" hint="Show every region's value in the closing overview">
          <Toggle value={layer.tour.labelAll} onChange={(labelAll) => applyTour({ labelAll })} />
        </Field>
        {layer.tour.labelAll && (
          <Field label="Label size">
            <Slider value={layer.tour.labelSize} onChange={(labelSize) => applyTour({ labelSize }, 'ls')} min={8} max={40} step={1} precision={0} />
          </Field>
        )}
      </Section>

      <Section title="Tour">
        <Field label="Enabled">
          <Toggle value={layer.tour.enabled} onChange={(enabled) => applyTour({ enabled })} />
        </Field>
        <Field label="Order">
          <Select
            value={layer.tour.order}
            onChange={(order) => applyTour({ order })}
            options={[
              { value: 'valueDesc', label: 'Highest value first' },
              { value: 'valueAsc', label: 'Lowest value first' },
              { value: 'alpha', label: 'Alphabetical' },
              { value: 'geojson', label: 'File order' },
              { value: 'custom', label: 'Custom list' },
            ]}
          />
        </Field>
        {layer.tour.order === 'custom' && (
          <Text
            value={layer.tour.customOrder.join('\n')}
            onChange={(v) => applyTour({ customOrder: v.split('\n').filter((x) => x.trim()) })}
            multiline
            placeholder={'Kerala\nTamil Nadu\n…'}
          />
        )}
        <Field label="Seconds each">
          <Num value={layer.tour.dwell} onChange={(dwell) => applyTour({ dwell: Math.max(0.3, dwell) })} step={0.1} min={0.3} suffix="s" />
        </Field>
        <Field label="Fly time" hint="Camera travel at the start of each stop">
          <Num value={layer.tour.moveTime} onChange={(moveTime) => applyTour({ moveTime: Math.max(0, moveTime) })} step={0.1} min={0} suffix="s" />
        </Field>
        <Field label="Drive camera" hint="The tour overrides camera keyframes while it runs">
          <Toggle value={layer.tour.driveCamera} onChange={(driveCamera) => applyTour({ driveCamera })} />
        </Field>
        {layer.tour.driveCamera && (
          <>
            <Field label="Framing pad">
              <Slider value={layer.tour.padding} onChange={(padding) => applyTour({ padding }, 'pad')} min={0} max={0.45} />
            </Field>
            <Field label="Max zoom" hint="Keeps very small regions from filling the frame with empty context">
              <Slider value={layer.tour.maxZoom} onChange={(maxZoom) => applyTour({ maxZoom }, 'mz')} min={2} max={16} step={0.5} precision={1} />
            </Field>
            <Field label="Pitch">
              <Slider value={layer.tour.pitch} onChange={(pitch) => applyTour({ pitch }, 'tp')} min={0} max={70} step={1} precision={0} />
            </Field>
          </>
        )}
        <Field label="Count up">
          <Toggle value={layer.tour.countUp} onChange={(countUp) => applyTour({ countUp })} />
        </Field>

        {set.order.length > 0 && (
          <>
            <p className="hint">
              {set.order.length} stops · {tourLength.toFixed(1)}s total (intro {layer.tour.intro}s + tour{' '}
              {(set.order.length * layer.tour.dwell).toFixed(1)}s + outro {layer.tour.outro}s), ending at{' '}
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
                if (!r) return null;
                return (
                  <button
                    key={r.id}
                    className="stop"
                    onClick={() => setTime(layer.in + layer.tour.intro + i * layer.tour.dwell + Math.min(layer.tour.moveTime + 0.3, layer.tour.dwell - 0.05))}
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
        <Field label="Readout" hint="How the active region’s value is shown">
          <Select
            value={layer.calloutStyle}
            onChange={(calloutStyle) => apply({ calloutStyle })}
            options={[
              { value: 'card', label: 'Card' },
              { value: 'plain', label: 'Just the number' },
              { value: 'pill', label: 'Pill' },
              { value: 'none', label: 'None' },
            ]}
          />
        </Field>
        {layer.calloutStyle !== 'none' && (
          <>
            {/* Scales every look, not just the card, so it is no longer "card size". */}
            <TrackedNumber label="Readout size" layerId={layer.id} prop="calloutSize" track={layer.calloutSize} min={50} max={180} step={1} precision={0} />
            {/* Only the card has a row to put a rank in. */}
            {layer.calloutStyle === 'card' && (
              <Field label="Show rank">
                <Toggle value={layer.showRank} onChange={(showRank) => apply({ showRank })} />
              </Field>
            )}
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

/* ------------------------------------------------------------ shape source */

/**
 * Shape's GeoJSON: a full-width mono textarea with a file loader beside it, drawn without a
 * field label because the value is a document, not a setting. `custom: true` on `geojson`
 * records that; it renders into the generated GeoJSON section through a slot.
 */
function ShapeSource({ layer }: { layer: ShapeLayer }) {
  const update = useStore((s) => s.updateLayer);
  const set = (patch: Partial<ShapeLayer>, key?: string) => update<ShapeLayer>(layer.id, patch, key);

  return (
    <>
      <Text
        value={layer.geojson}
        onChange={(geojson) => set({ geojson })}
        multiline
        mono
        placeholder='{"type":"Polygon","coordinates":[[…]]}'
      />
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
    </>
  );
}

/* ------------------------------------------------------- image background */

/**
 * Key a flat background out of an uploaded image.
 *
 * A button rather than a live slider: keying re-decodes the whole bitmap, so a slider wired
 * straight to it would re-run the flood on every pointer move. The two rows above set the
 * parameters, this applies them, and the result says what it did.
 *
 * **Non-destructive.** The upload is kept in `srcOriginal`, so the tolerance stays re-tunable
 * and "Restore" is exact rather than approximate — §01's first commitment is that everything
 * stays editable, and pixels you have thrown away are a bake step.
 */
function ImageBackground({ layer }: { layer: ImageLayer }) {
  const update = useStore((s) => s.updateLayer);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const apply = async () => {
    setBusy(true);
    setNote(null);
    try {
      // Always from the original, so re-applying at a new tolerance does not key an
      // already-keyed image — which would eat the subject a slice at a time.
      const source = layer.srcOriginal || layer.src;
      const out = await keyOutBackground(source, layer.bgTolerance, layer.bgFeather);
      update<ImageLayer>(layer.id, { src: out.url, srcOriginal: source }, 'bg-remove');
      setNote(out.warning ?? `Removed ${Math.round(out.removed * 100)}% of the image.`);
    } catch (err) {
      setNote(
        err instanceof Error && /tainted|cross-origin|SecurityError/i.test(err.message)
          ? 'That image is loaded from another site and will not allow its pixels to be read. Download it and pick the file instead.'
          : 'Could not read that image.',
      );
    } finally {
      setBusy(false);
    }
  };

  const clearProp = useStore((s) => s.clearNodeProp);
  const restore = () => {
    if (!layer.srcOriginal) return;
    // Removed rather than blanked: absent *is* "never keyed", which is what the button label
    // and the re-apply source both read. The shared history key keeps it one undo step.
    update<ImageLayer>(layer.id, { src: layer.srcOriginal }, 'bg-restore');
    clearProp(layer.id, 'srcOriginal');
    setNote(null);
  };

  return (
    <>
      <div className="row-buttons">
        <button className="mini primary" disabled={!layer.src || busy} onClick={apply}>
          {busy ? 'Working…' : layer.srcOriginal ? 'Re-apply' : 'Remove background'}
        </button>
        {layer.srcOriginal && (
          <button className="mini" onClick={restore}>
            Restore original
          </button>
        )}
      </div>
      <p className="hint">
        {note ??
          'Keys out a flat background connected to the edges — logos, flags, charts. It cannot cut a subject out of a photograph, and will say so when it has not worked.'}
      </p>
    </>
  );
}

/**
 * Decode, key, re-encode. The DOM half of `removeBackground`, which is pure and lives in
 * `@geomotion/core` so it can be tested without a canvas.
 */
async function keyOutBackground(
  src: string,
  tolerance: number,
  feather: number,
): Promise<{ url: string; warning: string | null; removed: number }> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('could not load the image'));
    img.src = src;
  });

  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(img, 0, 0);

  // Throws a SecurityError on a cross-origin image, which the caller turns into the one
  // message that tells the user what to do about it.
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const out = removeBackground(pixels, { tolerance, feather });
  // Written back into the bitmap the canvas already owns, rather than constructing a fresh
  // `ImageData` — its constructor overloads differ across lib.dom versions, and this needs
  // no allocation either.
  pixels.data.set(out.data);
  ctx.putImageData(pixels, 0, 0);
  return { url: canvas.toDataURL('image/png'), warning: out.warning, removed: out.removed };
}

/* ----------------------------------------------------------- image source */

/**
 * The one part of the image panel a generated row cannot be: a text field cannot open a
 * file, and the readout has to say "embedded, 42 KB" rather than print a data URL.
 *
 * §5.8 allows exactly this — "write a custom editor only when the default genuinely cannot
 * work" — and `src` is declared `custom: true` so the coverage test records the decision
 * rather than inferring it from a missing row. It renders into the generated Image section
 * through `SchemaRows`' slot, so the panel keeps one heading instead of growing a second.
 */
function ImageSource({ layer }: { layer: ImageLayer }) {
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
    </>
  );
}

/* ----------------------------------------------------------- composition */

/*
 * A short list, not every BCP 47 tag.
 *
 * These are the four grouping conventions that actually differ — thousands with a
 * comma, with a dot, with a space, and the Indian lakh/crore grouping the shipped demo
 * needs. Anything else can be typed into the project file; the point of the control is
 * that the common cases are one click and the setting is visible at all.
 */
/** Display names for behaviour types; the document's names are not display copy. */
const BEHAVIOUR_LABELS: Record<string, string> = {
  pop: 'Pop in',
  pulse: 'Pulse',
};

const NUMBER_LOCALES = [
  { value: 'en-US', label: '1,234.5 — comma groups' },
  { value: 'de-DE', label: '1.234,5 — dot groups' },
  { value: 'fr-FR', label: '1 234,5 — space groups' },
  { value: 'hi-IN', label: '12,34,567.8 — lakh / crore' },
];

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
            // The value comes from a fixed list, but parsing it unchecked would put
            // NaN straight into the document's width and height.
            if (!Number.isFinite(w) || !Number.isFinite(h)) return;
            patch((p) => {
              p.width = w as number;
              p.height = h as number;
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
