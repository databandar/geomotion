import { useEffect, useRef } from 'react';
import { useStore } from '../store';

/**
 * Plays the composition's narration against the picture.
 *
 * The timeline is the clock, not the audio element: on play we seek the element
 * to the playhead and let it run, and any scrub re-seeks it. That keeps a single
 * source of truth — the alternative (letting audio drive time) would fight the
 * frame-accurate export, which has no audio at all.
 */
export default function Narration() {
  const audio = useStore((s) => s.project.audio);
  const playing = useStore((s) => s.playing);
  const muted = useStore((s) => s.muted);
  const ref = useRef<HTMLAudioElement>(null);

  // Follow play/pause.
  useEffect(() => {
    const el = ref.current;
    if (!el || !audio) return;
    if (playing) {
      el.currentTime = Math.max(0, useStore.getState().time);
      el.play().catch(() => {
        /* autoplay policy — the user has to interact first */
      });
    } else {
      el.pause();
    }
  }, [playing, audio]);

  // Follow scrubs while paused, and correct drift while playing.
  useEffect(() => {
    const unsub = useStore.subscribe((s, prev) => {
      const el = ref.current;
      if (!el || s.time === prev.time) return;
      if (!s.playing) {
        el.currentTime = Math.max(0, s.time);
      } else if (Math.abs(el.currentTime - s.time) > 0.25) {
        el.currentTime = Math.max(0, s.time);
      }
    });
    return unsub;
  }, []);

  if (!audio) return null;
  return <audio ref={ref} src={audio.url} muted={muted} preload="auto" style={{ display: 'none' }} />;
}
