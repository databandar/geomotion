import { scheduleFrom, type AudioCue } from '@geomotion/document';
import { applyCurve } from './narration-player';

/**
 * The composition's audio, as a track a MediaRecorder can record.
 *
 * The video export is wall-clock driven — it paints whichever frame matches real
 * elapsed time — so audio scheduled in real time against the same start instant lines
 * up without any extra bookkeeping. That is the reason this works at all, and the
 * reason it will need revisiting when the export moves to WebCodecs (D9) and stops
 * running in real time: then the mix has to be rendered offline and interleaved.
 *
 * Everything is decoded up front, before recording starts. A decode that landed
 * mid-recording would push its clip late by however long it took.
 */
export interface PreparedAudio {
  /** Null when there is nothing to play. */
  track: MediaStreamTrack | null;
  /** How many clips will actually sound, for reporting. */
  count: number;
  /** Clips that could not be decoded, by name. */
  failed: string[];
  /** Call at the instant recording begins. */
  start(): void;
  stop(): void;
}

/**
 * What the export can promise, given which files failed to decode.
 *
 * Counted per *cue*, not per URL. Decoding is deduplicated by URL — that is the whole
 * point of the buffer cache, and importing one sting at two points in the timeline
 * gives both cues an identical data URL. But a single failed URL silences *every* cue
 * using it, so attributing the failure once told the user "1 clip included, 1 failed"
 * when nothing at all would play and both clips were gone. Someone publishes on the
 * strength of that number.
 */
export function decodeReport(
  playable: readonly AudioCue[],
  failedUrls: ReadonlySet<string>,
): { count: number; failed: string[] } {
  const failed = playable
    .filter((c) => c.url && failedUrls.has(c.url))
    .map((c) => c.text || (c.url as string).slice(0, 40));
  return { count: playable.length - failed.length, failed };
}

const SILENT: PreparedAudio = {
  track: null,
  count: 0,
  failed: [],
  start() {},
  stop() {},
};

export async function prepareAudioTrack(cues: AudioCue[]): Promise<PreparedAudio> {
  const playable = cues.filter((c) => c.url && c.d > 0);
  if (!playable.length) return SILENT;

  const ctx = new AudioContext();
  const dest = ctx.createMediaStreamDestination();
  const failedUrls = new Set<string>();

  const buffers = new Map<string, AudioBuffer>();
  await Promise.all(
    [...new Set(playable.map((c) => c.url as string))].map(async (url) => {
      try {
        const res = await fetch(url);
        buffers.set(url, await ctx.decodeAudioData(await res.arrayBuffer()));
      } catch {
        failedUrls.add(url);
      }
    }),
  );
  const { count, failed } = decodeReport(playable, failedUrls);

  const sources: AudioBufferSourceNode[] = [];
  const track = dest.stream.getAudioTracks()[0] ?? null;

  return {
    track,
    count,
    failed,
    start() {
      // Scheduled from time 0 of the composition, against one captured origin so
      // every clip shares the same reference point.
      const origin = ctx.currentTime;
      void ctx.resume();
      for (const s of scheduleFrom(playable, 0)) {
        const buffer = buffers.get(s.url);
        if (!buffer) continue;
        const node = ctx.createBufferSource();
        node.buffer = buffer;
        const at = origin + s.when;
        // The same curve the preview applies, so the export sounds like it.
        node.connect(applyCurve(ctx, s.curve, at, s.offset, s.duration)).connect(dest);
        node.start(at, s.offset, s.duration);
        sources.push(node);
      }
    },
    stop() {
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          // Already ended.
        }
      }
      void ctx.close();
    },
  };
}
