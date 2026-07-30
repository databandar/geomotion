import { describe, expect, it } from 'vitest';
import type { AudioCue } from '@geomotion/document';
import { embeddedAudioBytes } from './audio-import';

/**
 * The measurable half of audio import.
 *
 * Decoding needs a browser, so `cueFromFile` is covered by the headless run instead.
 * What is testable here is the size accounting, which is what decides whether the
 * user is told their project has grown past what the browser will autosave.
 */

const cue = (url?: string): AudioCue => ({ id: 'c', t: 0, d: 1, text: '', ...(url ? { url } : {}) });

describe('embeddedAudioBytes', () => {
  it('is zero with nothing embedded', () => {
    expect(embeddedAudioBytes([])).toBe(0);
    expect(embeddedAudioBytes([cue()])).toBe(0);
  });

  it('ignores audio referenced by URL rather than embedded', () => {
    // Narration served by a dev server costs the document nothing.
    expect(embeddedAudioBytes([cue('/voice-out/s/1.wav')])).toBe(0);
  });

  it('decodes the base64 length back to bytes', () => {
    // 4 base64 characters per 3 bytes: 8 characters is 6 bytes.
    expect(embeddedAudioBytes([cue('data:audio/wav;base64,AAAAAAAA')])).toBe(6);
  });

  it('adds up across cues', () => {
    const one = cue('data:audio/wav;base64,' + 'A'.repeat(400));
    expect(embeddedAudioBytes([one, one, one])).toBe(900);
  });
});
