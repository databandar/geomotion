import { useEffect, useState } from 'react';
import { fitBounds } from '@geomotion/entities';
import { useStore } from '../store';
import { useRenderHost } from '../render/host';
import { projectExtent } from '../lib/extent';
import Icon from './Icon';

/**
 * The controls that belong to the picture rather than to the document.
 *
 * Framing and fullscreen change what you can see, never what gets rendered — so they sit
 * on the stage instead of in the toolbar, where every other control writes to the
 * project. Overlaid on the letterbox, not on the composition: the frame's own pixels are
 * what the export will contain and nothing editor-only may sit on top of them.
 */
export default function StageChrome({ stage }: { stage: React.RefObject<HTMLElement | null> }) {
  const host = useRenderHost();
  const project = useStore((s) => s.project);
  const camera = useStore((s) => s.project.camera);
  const time = useStore((s) => s.time);
  const select = useStore((s) => s.select);
  const full = useFullscreen(stage);

  /*
   * The shot the picture is currently coming from — the last keyframe at or before the
   * playhead. Naming it turns the stage from an anonymous preview into something you can
   * navigate: the chip is how you get from "this framing is wrong" to the keyframe that
   * decides it, without hunting along the timeline for a diamond.
   */
  const shot = camera.reduce<{ i: number; t: number; id: string } | null>(
    (best, k, i) => (k.t <= time + 1e-6 && (!best || k.t >= best.t) ? { i, t: k.t, id: k.id } : best),
    null,
  );

  return (
    <div className="stage-chrome">
      <button
        className="stage-chip"
        title={shot ? 'Select the keyframe this shot comes from' : 'No camera keyframes yet'}
        disabled={!shot}
        onClick={() => shot && select({ kind: 'keyframe', id: shot.id })}
      >
        <Icon name="camera" size={12} />
        {shot ? `Shot ${shot.i + 1} of ${camera.length}` : 'No camera'}
      </button>

      <div className="stage-tools">
        <button
          className="stage-btn"
          title="Frame everything in the project — preview only, no keyframe is written"
          onClick={() => {
            const map = host?.map;
            const extent = projectExtent(project);
            if (!map || !extent) return;
            // The same solver the tour and double-click-to-fly use, so "fit" means one
            // thing in the app rather than three slightly different framings.
            const shot = fitBounds(extent, project.width, project.height, 0.12, 0);
            map.jumpTo({ center: shot.center, zoom: shot.zoom, bearing: shot.bearing, pitch: shot.pitch });
          }}
        >
          Fit
        </button>
        <button
          className="stage-btn icon"
          title={full ? 'Leave fullscreen' : 'Fullscreen'}
          aria-pressed={full}
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void stage.current?.requestFullscreen?.();
          }}
        >
          <Icon name="expand" size={12} />
        </button>
      </div>
    </div>
  );
}

/**
 * Whether `el` is the fullscreen element.
 *
 * Read from the event rather than tracked locally, because fullscreen has exits this
 * app never sees — Escape, the browser's own control, the OS. A local boolean toggled on
 * click drifts out of step the first time someone presses Escape, and then the button
 * offers to leave a fullscreen that ended a minute ago.
 */
function useFullscreen(el: React.RefObject<HTMLElement | null>): boolean {
  const [full, setFull] = useState(false);
  useEffect(() => {
    const sync = () => setFull(document.fullscreenElement === el.current);
    document.addEventListener('fullscreenchange', sync);
    sync();
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [el]);
  return full;
}
