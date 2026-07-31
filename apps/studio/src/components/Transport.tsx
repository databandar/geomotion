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
  const recording = useStore((s) => s.recording);
  const setRecording = useStore((s) => s.setRecording);

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

      {/*
        * Record arms the map, it does not render.
        *
        * "Record" in an animation tool means "capture what I do as keyframes", and that
        * is the gesture this app was missing: `K` writes one shot at a time, so building
        * a move meant framing, pressing K, framing, pressing K. Rendering to a file is
        * Export, and giving two controls that name would be the more confusing choice.
        */}
      <button
        className={'tp-btn record' + (recording ? ' armed' : '')}
        onClick={() => setRecording(!recording)}
        aria-pressed={recording}
        title={
          recording
            ? 'Recording — every map move writes a camera keyframe. Click to stop.'
            : 'Record camera moves as keyframes'
        }
      >
        <Icon name="record" size={12} />
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
