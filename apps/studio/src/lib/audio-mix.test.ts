import { describe, expect, it } from 'vitest';
import type { AudioCue } from '@geomotion/document';
import { decodeReport } from './audio-mix';

const cue = (id: string, text: string, url: string): AudioCue =>
  ({ id, t: 0, d: 1, text, url }) as AudioCue;

describe('decodeReport', () => {
  it('reports everything playing when nothing failed', () => {
    const cues = [cue('a', 'music', 'u1'), cue('b', 'voice', 'u2')];
    expect(decodeReport(cues, new Set())).toEqual({ count: 2, failed: [] });
  });

  it('names the clip that failed and drops it from the count', () => {
    const cues = [cue('a', 'music', 'u1'), cue('b', 'voice', 'u2')];
    expect(decodeReport(cues, new Set(['u2']))).toEqual({ count: 1, failed: ['voice'] });
  });

  it('counts every cue using a broken file, not the file once', () => {
    /*
     * The bug. Decoding is deduplicated by URL, and importing one sting at two points
     * gives both cues an identical data URL — so a single failure silenced both while
     * being reported once. Measured before the fix: "count: 1, failed: [sting one]",
     * when in truth nothing played and both were gone. Someone publishes on that number.
     */
    const cues = [cue('a', 'sting one', 'same'), cue('b', 'sting two', 'same')];
    expect(decodeReport(cues, new Set(['same']))).toEqual({
      count: 0,
      failed: ['sting one', 'sting two'],
    });
  });

  it('keeps a working clip that shares nothing with the broken one', () => {
    const cues = [cue('a', 'sting', 'bad'), cue('b', 'sting', 'bad'), cue('c', 'music', 'good')];
    expect(decodeReport(cues, new Set(['bad']))).toEqual({
      count: 1,
      failed: ['sting', 'sting'],
    });
  });

  it('falls back to the start of the url when a clip has no name', () => {
    // An imported file that was never renamed. The head of a data URL is not useful
    // text, but it is better than an empty row in the "these did not play" list.
    const url = 'data:audio/wav;base64,' + 'A'.repeat(60);
    expect(decodeReport([cue('a', '', url)], new Set([url])).failed).toEqual([url.slice(0, 40)]);
  });

  it('has nothing to report for no cues', () => {
    expect(decodeReport([], new Set())).toEqual({ count: 0, failed: [] });
  });
});
