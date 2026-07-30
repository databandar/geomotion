import { useEffect, useRef } from 'react';
import { canPlayPerCue } from '@geomotion/document';
import { useStore } from '../store';
import { NarrationPlayer } from '../lib/narration-player';

/**
 * Plays the composition's narration against the picture.
 *
 * The timeline is the clock, not the audio: on play we start from the playhead and
 * let it run, and any scrub restarts from the new position. That keeps a single
 * source of truth — letting audio drive time would fight the frame-accurate export,
 * which has no audio at all.
 *
 * Two paths, because two kinds of document exist:
 *
 * - Cues with their own URLs are played individually, at the positions the cues
 *   hold. This is the one that stays correct after a retime.
 * - Older documents have only the pre-mixed bed, so they get an <audio> element
 *   seeked to the playhead. Retiming those moves the picture and leaves the voice
 *   behind; the timeline marks them, and regenerating from Studio fixes it.
 */
export default function Narration() {
  const audio = useStore((s) => s.project.audio);
  const perCue = useStore((s) => canPlayPerCue(s.project));
  const playing = useStore((s) => s.playing);
  const muted = useStore((s) => s.muted);
  const el = useRef<HTMLAudioElement>(null);
  const player = useRef<NarrationPlayer | null>(null);

  // One player for the component's life. It reads the cues fresh on every play, so
  // editing them does not need a new instance.
  useEffect(() => {
    player.current = new NarrationPlayer(() => useStore.getState().project.audio?.cues ?? []);
    return () => {
      player.current?.dispose();
      player.current = null;
    };
  }, []);

  useEffect(() => {
    player.current?.setMuted(muted);
  }, [muted]);

  // Follow play/pause.
  useEffect(() => {
    if (!audio) return;
    if (!playing) {
      player.current?.stop();
      el.current?.pause();
      return;
    }
    const time = Math.max(0, useStore.getState().time);
    if (perCue) {
      void player.current?.play(time, useStore.getState().muted);
    } else if (el.current) {
      el.current.currentTime = time;
      el.current.play().catch(() => {
        /* autoplay policy — the user has to interact first */
      });
    }
    // Mute is read through the store rather than closed over, so toggling it
    // changes the gain in its own effect instead of restarting playback here.
  }, [playing, perCue, audio]);

  // Follow scrubs, and correct drift while playing.
  useEffect(() => {
    return useStore.subscribe((s, prev) => {
      if (s.time === prev.time) return;
      if (perCue) {
        // Restart from the new position: scheduled sources cannot be re-seeked.
        if (s.playing) void player.current?.play(Math.max(0, s.time), s.muted);
        else player.current?.stop();
        return;
      }
      const node = el.current;
      if (!node) return;
      if (!s.playing) node.currentTime = Math.max(0, s.time);
      else if (Math.abs(node.currentTime - s.time) > 0.25) node.currentTime = Math.max(0, s.time);
    });
  }, [perCue]);

  // Nothing to render on the per-cue path. And a CLI-rendered project carries the
  // bed as a path rather than a URL, so there is nothing a page can play.
  if (!audio || perCue || !audio.url) return null;
  return <audio ref={el} src={audio.url} muted={muted} preload="auto" style={{ display: 'none' }} />;
}
