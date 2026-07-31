import { Fragment, useCallback, useRef } from 'react';
import { useStore } from '../store';
import Icon from './Icon';
import { isRetimable, storyInOrder, trackedProps } from '@geomotion/document';
import type { Track } from '@geomotion/document';
import { clamp } from '@geomotion/core';

const GUTTER = 148;

export default function Timeline() {
  const project = useStore((s) => s.project);
  // Whether the voice will follow if anything is retimed; see planAudio.
  const retimable = useStore((s) => isRetimable(s.project));
  const time = useStore((s) => s.time);
  const pxPerSec = useStore((s) => s.pxPerSec);
  const selection = useStore((s) => s.selection);
  const scrub = useStore((s) => s.scrub);
  const select = useStore((s) => s.select);
  const updateLayer = useStore((s) => s.updateLayer);
  const updateKeyframe = useStore((s) => s.updateKeyframe);
  const removeKeyframe = useStore((s) => s.removeKeyframe);
  const updateAudioCue = useStore((s) => s.updateAudioCue);
  const moveStoryBlock = useStore((s) => s.moveStoryBlock);
  const resizeStoryBlock = useStore((s) => s.resizeStoryBlock);
  const removeAudioCue = useStore((s) => s.removeAudioCue);
  const setPxPerSec = useStore((s) => s.setPxPerSec);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);

  const snap = useCallback(
    (t: number) => {
      const step = 1 / project.fps;
      return clamp(Math.round(t / step) * step, 0, project.duration);
    },
    [project.fps, project.duration],
  );

  const width = project.duration * pxPerSec;

  const xFromEvent = (e: { clientX: number }) => {
    const el = scrollRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return e.clientX - rect.left + el.scrollLeft;
  };

  const startScrub = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent | React.PointerEvent) => scrub(snap(xFromEvent(ev) / pxPerSec));
    move(e);
    const onMove = (ev: PointerEvent) => move(ev);
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  /** Generic horizontal drag returning the delta in seconds. */
  const dragSeconds = (e: React.PointerEvent, onDelta: (dt: number, done: boolean) => void) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const onMove = (ev: PointerEvent) => onDelta((ev.clientX - startX) / pxPerSec, false);
    const onUp = (ev: PointerEvent) => {
      onDelta((ev.clientX - startX) / pxPerSec, true);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const ticks = buildTicks(project.duration, pxPerSec);

  return (
    <div className="timeline">
      <div className="tl-toolbar">
        <span className="tl-title">Timeline</span>
        <div className="tl-zoom">
          {/*
            * A slider between the two steppers. Doubling and halving is the fast way to a
            * rough zoom and a poor way to a particular one; a range gives both, and the
            * value is logarithmic because timeline zoom is multiplicative — linear pixels
            * per second spends most of the track on the last few useful values.
            */}
          <button onClick={() => setPxPerSec(pxPerSec / 1.4)} title="Zoom out"><Icon name="zoom-out" size={12} /></button>
          <input
            className="zoom-range"
            type="range"
            min={Math.log(4)}
            max={Math.log(400)}
            step={0.01}
            value={Math.log(pxPerSec)}
            onChange={(e) => setPxPerSec(Math.exp(Number(e.target.value)))}
            aria-label="Timeline zoom"
            title="Timeline zoom"
          />
          <button onClick={() => setPxPerSec(pxPerSec * 1.4)} title="Zoom in"><Icon name="zoom-in" size={12} /></button>
        </div>
      </div>

      <div className="tl-body">
        <div className="tl-gutter" style={{ width: GUTTER }} ref={gutterRef}>
          <div className="tl-gutter-row tl-ruler-spacer" />
          <div className="tl-gutter-row track-camera">Camera</div>
          {project.story.length > 0 && <div className="tl-gutter-row track-story">Story</div>}
          {project.audio && (
            <div className="tl-gutter-row track-voice">
              Audio
              {!retimable && (
                <span
                  className="warn-dot"
                  title={
                    'This is a single pre-mixed track, so retiming moves the picture and leaves ' +
                    'the sound behind — in the preview and in the export. Audio imported here is ' +
                    'per-clip and follows the timeline.'
                  }
                >
                  !
                </span>
              )}
            </div>
          )}
          {project.layers.map((l) => (
            <Fragment key={l.id}>
              <div
                className={'tl-gutter-row' + (selection?.kind === 'layer' && selection.id === l.id ? ' sel' : '')}
                onClick={() => select({ kind: 'layer', id: l.id })}
                title={l.name}
              >
                <span className={'dot t-' + l.type} />
                {l.name}
              </div>
              {/* One label per animated property, mirroring the track rows opposite —
                  the two lists walk the same `animatedProps`, so they cannot drift. */}
              {animatedProps(l).map((prop) => (
                <div key={prop} className="tl-gutter-row track-prop" title={`${l.name} · ${propLabel(prop)}`}>
                  <span className="prop-kf" />
                  {propLabel(prop)}
                </div>
              ))}
            </Fragment>
          ))}
        </div>

        <div
          className="tl-scroll"
          ref={scrollRef}
          onScroll={(e) => {
            // Keep the track names locked to the rows they belong to.
            if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
          }}
        >
          <div className="tl-content" style={{ width }}>
            <div className="tl-ruler" onPointerDown={startScrub}>
              {ticks.map((t) => (
                <div key={t} className="tl-tick" style={{ left: t * pxPerSec }}>
                  <span>{formatTime(t)}</span>
                </div>
              ))}
            </div>

            <div className="tl-row camera-row" onPointerDown={startScrub}>
              {project.camera.map((k) => (
                <div
                  key={k.id}
                  className={'kf' + (selection?.kind === 'keyframe' && selection.id === k.id ? ' sel' : '')}
                  style={{ left: k.t * pxPerSec }}
                  title={`t=${k.t.toFixed(2)}s · zoom ${k.zoom.toFixed(1)}`}
                  onPointerDown={(e) => {
                    select({ kind: 'keyframe', id: k.id });
                    const t0 = k.t;
                    dragSeconds(e, (dt) => updateKeyframe(k.id, { t: snap(t0 + dt) }, 'move'));
                  }}
                  onDoubleClick={() => removeKeyframe(k.id)}
                />
              ))}
            </div>

            {project.story.length > 0 && (
              <div className="tl-row story-row" onPointerDown={startScrub}>
                {storyInOrder(project.story).map((b) => (
                  <div
                    key={b.id}
                    className="story-block"
                    style={{ left: b.t * pxPerSec, width: Math.max(4, b.d * pxPerSec) }}
                    onPointerDown={(e) => {
                      // The whole ripple is one gesture and one undo step: half a ripple
                      // is a composition whose narration and picture disagree.
                      e.stopPropagation();
                      const t0 = b.t;
                      dragSeconds(e, (dt) => moveStoryBlock(b.id, snap(t0 + dt)));
                    }}
                    title={`${b.kind ?? 'block'} · ${b.d.toFixed(1)}s · ${b.nodes.length} layer${b.nodes.length === 1 ? '' : 's'}${b.say ? `\n${b.say}` : ''}`}
                  >
                    <span className="story-label">{b.say ?? b.onScreen ?? b.kind ?? 'block'}</span>
                    <i
                      className="grip r"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        const d0 = b.d;
                        dragSeconds(e, (dt) => resizeStoryBlock(b.id, Math.max(0.1, d0 + dt)));
                      }}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Order here must match the gutter above: Camera, then Narration. */}
            {project.audio && (
              <div className="tl-row voice-row" onPointerDown={startScrub}>
                {project.audio.cues.map((c) => (
                  <div
                    className={'cue' + (selection?.kind === 'cue' && selection.id === c.id ? ' sel' : '')}
                    key={c.id}
                    style={{ left: c.t * pxPerSec, width: Math.max(3, c.d * pxPerSec) }}
                    title={`${c.text} · ${c.d.toFixed(2)}s — drag to retime, double-click to remove`}
                    onPointerDown={(e) => {
                      // Retiming is the whole point of keeping per-line audio: the
                      // export re-mixes from these positions, so a drag here moves
                      // the voice in the finished video too.
                      e.stopPropagation();
                      select({ kind: 'cue', id: c.id });
                      const t0 = c.t;
                      dragSeconds(e, (dt) => updateAudioCue(c.id, { t: Math.max(0, snap(t0 + dt)) }, 'move'));
                    }}
                    onDoubleClick={() => removeAudioCue(c.id)}
                  >
                    <span>{c.text}</span>
                  </div>
                ))}
              </div>
            )}

            {project.layers.map((l) => (
              <Fragment key={l.id}>
                <div
                  className={'tl-row' + (selection?.kind === 'layer' && selection.id === l.id ? ' sel' : '')}
                  onPointerDown={startScrub}
                >
                <div
                  className={'bar t-' + l.type + (l.visible ? '' : ' hidden')}
                  style={{ left: l.in * pxPerSec, width: Math.max(6, (l.out - l.in) * pxPerSec) }}
                  onPointerDown={(e) => {
                    select({ kind: 'layer', id: l.id });
                    const { in: i0, out: o0 } = l;
                    const len = o0 - i0;
                    dragSeconds(e, (dt) => {
                      const ni = clamp(snap(i0 + dt), 0, project.duration - len);
                      updateLayer(l.id, { in: ni, out: ni + len }, 'move');
                    });
                  }}
                >
                  <span className="bar-label">{l.name}</span>
                  <i
                    className="grip l"
                    onPointerDown={(e) => {
                      const i0 = l.in;
                      dragSeconds(e, (dt) => updateLayer(l.id, { in: clamp(snap(i0 + dt), 0, l.out - 0.1) }, 'in'));
                    }}
                  />
                  <i
                    className="grip r"
                    onPointerDown={(e) => {
                      const o0 = l.out;
                      dragSeconds(e, (dt) =>
                        updateLayer(l.id, { out: clamp(snap(o0 + dt), l.in + 0.1, project.duration) }, 'out'),
                      );
                    }}
                  />
                </div>
                </div>
                {animatedProps(l).map((prop) => (
                  <TrackRow
                    key={prop}
                    layerId={l.id}
                    prop={prop}
                    track={(l as unknown as Record<string, Track<number>>)[prop]!}
                    pxPerSec={pxPerSec}
                    snap={snap}
                    dragSeconds={dragSeconds}
                  />
                ))}
              </Fragment>
            ))}

            <div className="playhead" style={{ left: time * pxPerSec }}>
              <div className="playhead-cap" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


/**
 * A layer's properties that actually move.
 *
 * Static tracks are left out: a row of nothing for every property that happens to be
 * tracked would bury the ones that matter, and after the bespoke tweens fold in there
 * will be dozens. A property earns a row by being animated.
 */
function animatedProps(layer: object): string[] {
  return trackedProps(layer).filter(
    (p) => (layer as Record<string, Track<number>>)[p]?.kind === 'keyframed',
  );
}

/** `labelSize` -> `Label size`. The document's names are not display copy. */
function propLabel(prop: string): string {
  const spaced = prop.replace(/([A-Z])/g, ' $1').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * One property's keyframes, laid on the timeline.
 *
 * The keys are the same diamond the inspector's pip uses, in the same colour, because
 * they are the same thing seen from two places — a person should not have to learn twice
 * that a diamond is a keyframe.
 */
function TrackRow({
  layerId,
  prop,
  track,
  pxPerSec,
  snap,
  dragSeconds,
}: {
  layerId: string;
  prop: string;
  track: Track<number>;
  pxPerSec: number;
  snap: (t: number) => number;
  dragSeconds: (e: React.PointerEvent, cb: (dt: number, done: boolean) => void) => void;
}) {
  const moveKey = useStore((s) => s.moveLayerKey);
  const scrub = useStore((s) => s.scrub);
  // Deliberately no second check on the track's kind. `animatedProps` decides which
  // properties get a row, and the gutter walks the same list — a guard here could
  // disagree with it and leave every row below labelled with the wrong name.
  const keys = track.kind === 'keyframed' ? track.keys : [];

  return (
    <div className="tl-row track-row">
      {keys.map((k) => (
        <div
          key={k.id}
          className="prop-kf"
          style={{ left: k.t * pxPerSec }}
          title={`${propLabel(prop)} ${k.value} at ${k.t.toFixed(2)}s — drag to retime`}
          onPointerDown={(e) => {
            e.stopPropagation();
            // Scrubbing to the key you grabbed shows the value you are about to move,
            // which is the difference between retiming deliberately and guessing.
            scrub(k.t);
            const t0 = k.t;
            dragSeconds(e, (dt) => moveKey(layerId, prop, k.id, snap(t0 + dt)));
          }}
        />
      ))}
    </div>
  );
}


function buildTicks(duration: number, pxPerSec: number): number[] {
  const targetPx = 90;
  const raw = targetPx / pxPerSec;
  const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60];
  const step = steps.find((s) => s >= raw) ?? 60;
  const out: number[] = [];
  for (let t = 0; t <= duration + 1e-6; t += step) out.push(Math.round(t * 1000) / 1000);
  return out;
}

function formatTime(t: number): string {
  if (t < 60) return `${Math.round(t * 100) / 100}s`;
  const m = Math.floor(t / 60);
  const s = Math.round(t - m * 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Exported for the transport read-out. */
export function formatClock(t: number, fps: number): string {
  const total = Math.round(t * fps);
  const f = total % fps;
  const secs = Math.floor(total / fps);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(f).padStart(2, '0')}`;
}
