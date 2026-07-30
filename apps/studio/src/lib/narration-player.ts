import { scheduleFrom, type AudioCue } from '@geomotion/document';

/**
 * Plays narration line by line, at the positions the cues actually hold.
 *
 * The editor used to play the pre-mixed bed, which is correct only until something
 * is retimed — after that the picture moved and the voice did not, so the preview
 * sounded right while only the export was right. That is the worst kind of wrong for
 * an editor: it disagrees with the thing it is previewing, quietly.
 *
 * The timeline stays the clock. Nothing here drives `time`; a play schedules from
 * wherever the playhead is, and a scrub cancels and reschedules. Letting audio drive
 * time would fight the frame-accurate export, which has no audio at all.
 *
 * Decoded clips are cached by URL, so scrubbing back and forth does not refetch.
 */
export class NarrationPlayer {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private readonly buffers = new Map<string, Promise<AudioBuffer | null>>();
  private live: AudioBufferSourceNode[] = [];
  /** Bumped on every start/stop so a slow decode from an old run cannot play late. */
  private generation = 0;

  constructor(private readonly cues: () => AudioCue[]) {}

  /** Created lazily: an AudioContext before a user gesture starts suspended. */
  private context(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  private load(url: string): Promise<AudioBuffer | null> {
    const hit = this.buffers.get(url);
    if (hit) return hit;
    const task = (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return await this.context().decodeAudioData(await res.arrayBuffer());
      } catch {
        // A missing clip should cost that line, not the whole preview.
        return null;
      }
    })();
    this.buffers.set(url, task);
    return task;
  }

  setMuted(muted: boolean) {
    if (this.gain) this.gain.gain.value = muted ? 0 : 1;
  }

  /** Stop everything currently sounding. Safe to call when nothing is. */
  stop() {
    this.generation++;
    for (const src of this.live) {
      try {
        src.stop();
      } catch {
        // Already ended; nothing to stop.
      }
    }
    this.live = [];
  }

  /**
   * Play from `time` on the composition's timeline.
   *
   * Each clip is scheduled against the same `origin`, captured once, so a slow
   * decode delays that line's *fetch* and not its position — the line still starts
   * where the cue says, or is skipped if that moment has already passed.
   */
  async play(time: number, muted: boolean) {
    this.stop();
    const run = this.generation;
    const ctx = this.context();
    if (ctx.state === 'suspended') await ctx.resume();
    this.setMuted(muted);

    const origin = ctx.currentTime;
    await Promise.all(
      scheduleFrom(this.cues(), time).map(async (s) => {
        const buffer = await this.load(s.url);
        if (!buffer || run !== this.generation) return;

        const startAt = origin + s.when;
        // The moment passed while this was decoding; starting now would be late.
        if (startAt + 0.02 < ctx.currentTime) return;

        const src = ctx.createBufferSource();
        src.buffer = buffer;
        if (this.gain) src.connect(this.gain);
        src.onended = () => {
          this.live = this.live.filter((n) => n !== src);
        };
        src.start(Math.max(startAt, ctx.currentTime), s.offset, s.duration);
        this.live.push(src);
      }),
    );
  }

  dispose() {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.gain = null;
    this.buffers.clear();
  }
}
