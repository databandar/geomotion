import { useCallback, useRef } from 'react';
import { useStore } from '../store';
import type { RouteLayer } from '../types';
import { clamp } from '@geomotion/core';

const GUTTER = 148;

export default function Timeline() {
  const project = useStore((s) => s.project);
  const time = useStore((s) => s.time);
  const pxPerSec = useStore((s) => s.pxPerSec);
  const selection = useStore((s) => s.selection);
  const scrub = useStore((s) => s.scrub);
  const select = useStore((s) => s.select);
  const updateLayer = useStore((s) => s.updateLayer);
  const updateKeyframe = useStore((s) => s.updateKeyframe);
  const removeKeyframe = useStore((s) => s.removeKeyframe);
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
          <button onClick={() => setPxPerSec(pxPerSec / 1.4)} title="Zoom out">−</button>
          <button onClick={() => setPxPerSec(pxPerSec * 1.4)} title="Zoom in">+</button>
        </div>
      </div>

      <div className="tl-body">
        <div className="tl-gutter" style={{ width: GUTTER }} ref={gutterRef}>
          <div className="tl-gutter-row tl-ruler-spacer" />
          <div className="tl-gutter-row track-camera">Camera</div>
          {project.audio && <div className="tl-gutter-row track-voice">Narration</div>}
          {project.layers.map((l) => (
            <div
              key={l.id}
              className={'tl-gutter-row' + (selection?.kind === 'layer' && selection.id === l.id ? ' sel' : '')}
              onClick={() => select({ kind: 'layer', id: l.id })}
              title={l.name}
            >
              <span className={'dot t-' + l.type} />
              {l.name}
            </div>
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

            {/* Order here must match the gutter above: Camera, then Narration. */}
            {project.audio && (
              <div className="tl-row voice-row" onPointerDown={startScrub}>
                {project.audio.cues.map((c, i) => (
                  <div
                    className="cue"
                    key={i}
                    style={{ left: c.t * pxPerSec, width: Math.max(3, c.d * pxPerSec) }}
                    title={c.text}
                  >
                    <span>{c.text}</span>
                  </div>
                ))}
              </div>
            )}

            {project.layers.map((l) => (
              <div
                key={l.id}
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

                {l.type === 'route' && <DrawWindow layer={l} pxPerSec={pxPerSec} snap={snap} dragSeconds={dragSeconds} />}
              </div>
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

function DrawWindow({
  layer,
  pxPerSec,
  snap,
  dragSeconds,
}: {
  layer: RouteLayer;
  pxPerSec: number;
  snap: (t: number) => number;
  dragSeconds: (e: React.PointerEvent, cb: (dt: number, done: boolean) => void) => void;
}) {
  const updateLayer = useStore((s) => s.updateLayer);
  return (
    <div
      className="draw-window"
      style={{ left: layer.drawStart * pxPerSec, width: Math.max(4, (layer.drawEnd - layer.drawStart) * pxPerSec) }}
      title="Route draw window — drag to retime the reveal"
      onPointerDown={(e) => {
        const s0 = layer.drawStart;
        const e0 = layer.drawEnd;
        const len = e0 - s0;
        dragSeconds(e, (dt) => {
          const ns = Math.max(0, snap(s0 + dt));
          updateLayer<RouteLayer>(layer.id, { drawStart: ns, drawEnd: ns + len }, 'draw');
        });
      }}
    >
      <i
        className="grip l"
        onPointerDown={(e) => {
          const s0 = layer.drawStart;
          dragSeconds(e, (dt) =>
            updateLayer<RouteLayer>(layer.id, { drawStart: Math.min(snap(s0 + dt), layer.drawEnd - 0.1) }, 'draw-in'),
          );
        }}
      />
      <i
        className="grip r"
        onPointerDown={(e) => {
          const e0 = layer.drawEnd;
          dragSeconds(e, (dt) =>
            updateLayer<RouteLayer>(layer.id, { drawEnd: Math.max(snap(e0 + dt), layer.drawStart + 0.1) }, 'draw-out'),
          );
        }}
      />
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
