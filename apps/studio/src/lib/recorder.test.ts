import { describe, expect, it } from 'vitest';
import { extensionFor, pickMimeType } from './recorder';

/**
 * The parts of recording that are logic rather than browser.
 *
 * `MediaRecorder` and a live microphone are not worth simulating — a mock of them tests the
 * mock. What is worth pinning is the container negotiation, because getting it wrong fails at
 * "start recording" with nothing useful to say, and because Safari is the reason it exists.
 */

describe('pickMimeType', () => {
  it('prefers Opus in WebM, which is what Chrome and Firefox give', () => {
    expect(pickMimeType(() => true)).toBe('audio/webm;codecs=opus');
  });

  it('falls back to MP4 for Safari, which supports nothing else', () => {
    // The real reason this function exists rather than a hard-coded string.
    const safari = (t: string) => t.startsWith('audio/mp4');
    expect(pickMimeType(safari)).toBe('audio/mp4;codecs=mp4a.40.2');
  });

  it('returns null rather than a type that would throw at start', () => {
    expect(pickMimeType(() => false)).toBeNull();
  });
});

describe('extensionFor', () => {
  it('names the file after what is actually inside it', () => {
    expect(extensionFor('audio/webm;codecs=opus')).toBe('webm');
    expect(extensionFor('audio/mp4;codecs=mp4a.40.2')).toBe('m4a');
    expect(extensionFor('audio/ogg;codecs=opus')).toBe('ogg');
  });

  it('does not guess at a container it does not know', () => {
    expect(extensionFor('audio/flac')).toBe('bin');
  });
});
