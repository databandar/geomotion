import { useStore } from '../store';
import Icon from './Icon';
import { formatClock } from './Timeline';

export default function Transport() {
  const time = useStore((s) => s.time);
  const playing = useStore((s) => s.playing);
  const loop = useStore((s) => s.loop);
  const duration = useStore((s) => s.project.duration);
  const fps = useStore((s) => s.project.fps);
  const setPlaying = useStore((s) => s.setPlaying);
  const scrub = useStore((s) => s.scrub);
  const toggleLoop = useStore((s) => s.toggleLoop);
  const muted = useStore((s) => s.muted);
  const toggleMuted = useStore((s) => s.toggleMuted);
  const hasAudio = useStore((s) => !!s.project.audio);

  const step = (frames: number) => scrub(time + frames / fps);

  return (
    <div className="transport">
      <button className="tp-btn" onClick={() => scrub(0)} title="Go to start (Home)">
        <Icon name="skip-start" />
      </button>
      <button className="tp-btn" onClick={() => step(-1)} title="Previous frame (←)">
        <Icon name="step-back" />
      </button>
      <button className="tp-btn play" onClick={() => setPlaying(!playing)} title="Play / pause (Space)">
        <Icon name={playing ? 'pause' : 'play'} size={15} />
      </button>
      <button className="tp-btn" onClick={() => step(1)} title="Next frame (→)">
        <Icon name="step-forward" />
      </button>
      <button className="tp-btn" onClick={() => scrub(duration)} title="Go to end (End)">
        <Icon name="skip-end" />
      </button>

      <span className="clock">
        {formatClock(time, fps)}
        <span className="dim"> / {formatClock(duration, fps)}</span>
      </span>

      <button className={'tp-btn' + (loop ? ' active' : '')} onClick={toggleLoop} title="Loop playback">
        <Icon name="loop" />
      </button>

      {hasAudio && (
        <button
          className={'tp-btn' + (muted ? '' : ' active')}
          onClick={toggleMuted}
          title={muted ? 'Unmute narration' : 'Mute narration'}
        >
          {muted ? '🔇' : '🔊'}
        </button>
      )}
    </div>
  );
}
