import { scheduleFrom, type AudioCue, type ClipEnvelope } from '@geomotion/document';

/**
 * A gain node carrying the clip's level and its fades.
 *
 * Linear ramps rather than exponential: these are short shapes on speech and music
 * beds, where a straight line is what people expect, and an exponential ramp cannot
 * reach zero anyway.
 */
export function applyEnvelope(
  ctx: BaseAudioContext,
  envelope: ClipEnvelope,
  startAt: number,
  duration: number,
): GainNode {
  const node = ctx.createGain();
  const { gain, fadeIn, fadeOut } = envelope;
  const end = startAt + duration;

  node.gain.setValueAtTime(fadeIn > 0 ? 0 : gain, startAt);
  if (fadeIn > 0) node.gain.linearRampToValueAtTime(gain, startAt + Math.min(fadeIn, duration));
  if (fadeOut > 0 && fadeOut < duration) {
    node.gain.setValueAtTime(gain, end - fadeOut);
    node.gain.linearRampToValueAtTime(0, end);
  }
  return node;
}

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
        const at = Math.max(startAt, ctx.currentTime);
        // Per-clip level and fades, so music can sit under a voice.
        const clipGain = applyEnvelope(ctx, s.envelope, at, s.duration);
        src.connect(clipGain);
        if (this.gain) clipGain.connect(this.gain);
        src.onended = () => {
          this.live = this.live.filter((n) => n !== src);
        };
        src.start(at, s.offset, s.duration);
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
