import { scheduleFrom, type AudioCue, type GainPoint } from '@geomotion/document';

/**
 * A gain node following a clip's curve: its level, its fades, and any ducking.
 *
 * Linear ramps rather than exponential, because that is the shape the curve describes
 * and the shape ffmpeg reproduces on the render side. An exponential ramp would sound
 * different in the preview than in the file, and cannot reach zero anyway.
 *
 * `offset` matters when the playhead lands mid-clip: the curve is in clip time, so
 * points before the offset are behind us and the value at the offset is where the
 * automation has to start.
 */
export function applyCurve(
  ctx: BaseAudioContext,
  curve: GainPoint[],
  startAt: number,
  offset: number,
  duration: number,
): GainNode {
  const node = ctx.createGain();
  if (!curve.length) return node;

  node.gain.setValueAtTime(valueAt(curve, offset), startAt);
  const end = offset + duration;
  for (const point of curve) {
    if (point.t <= offset) continue;
    if (point.t > end) break;
    node.gain.linearRampToValueAtTime(point.gain, startAt + (point.t - offset));
  }
  return node;
}

/** The curve's value at a time, interpolating between the points around it. */
function valueAt(curve: GainPoint[], t: number): number {
  let prev = curve[0]!;
  for (const p of curve) {
    if (p.t >= t) {
      if (p.t === prev.t) return p.gain;
      return prev.gain + (p.gain - prev.gain) * ((t - prev.t) / (p.t - prev.t));
    }
    prev = p;
  }
  return prev.gain;
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
        // Level, fades and ducking, so music sits under a voice.
        const clipGain = applyCurve(ctx, s.curve, at, s.offset, s.duration);
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
