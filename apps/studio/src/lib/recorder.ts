/**
 * Recording narration in the editor.
 *
 * A recording ends up as a `File`, which is what `cueFromFile` already takes — so a recorded
 * line becomes an ordinary audio cue with a measured duration, and everything downstream
 * (ripple, the mix, re-timing) works on it without knowing where it came from. That is the
 * whole reason this stops at a `File` instead of touching the document itself.
 *
 * §00's frozen-voice scar is the reason it matters: narration that is a clip on the timeline
 * can be re-recorded and re-measured, and the picture follows. A recording baked into a bed
 * could not be.
 */

export class RecordingError extends Error {}

/**
 * The container this browser will actually record.
 *
 * Chrome and Firefox give WebM/Opus; Safari only ever gives MP4/AAC. Asking rather than
 * assuming, because `MediaRecorder` throws on an unsupported type rather than falling back,
 * and the failure would land at "start recording" with nothing useful to say.
 */
export function pickMimeType(supported: (type: string) => boolean = isTypeSupported): string | null {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  return candidates.find(supported) ?? null;
}

function isTypeSupported(type: string): boolean {
  return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type);
}

/** The file extension a container should be saved under, so the name reads honestly. */
export function extensionFor(mimeType: string): string {
  if (mimeType.startsWith('audio/webm')) return 'webm';
  if (mimeType.startsWith('audio/mp4')) return 'm4a';
  if (mimeType.startsWith('audio/ogg')) return 'ogg';
  return 'bin';
}

/** A recording in progress. `stop` resolves with the file; `cancel` throws it away. */
export interface Recording {
  stop(): Promise<File>;
  cancel(): void;
}

/**
 * Start recording from the default microphone.
 *
 * Rejects with a `RecordingError` carrying something a person can act on — a denied
 * permission and an absent microphone are different problems and get different sentences.
 */
export async function startRecording(name = 'Recording'): Promise<Recording> {
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new RecordingError('This browser cannot record audio.');
  }

  const mimeType = pickMimeType();
  if (!mimeType) throw new RecordingError('This browser has no audio format we can record.');

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    const kind = err instanceof Error ? err.name : '';
    throw new RecordingError(
      kind === 'NotAllowedError'
        ? 'Microphone access was refused. Allow it for this site and try again.'
        : kind === 'NotFoundError'
          ? 'No microphone was found.'
          : 'Could not open the microphone.',
    );
  }

  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  recorder.start();

  // Released on both paths. A live microphone indicator that never goes out is the kind of
  // bug people notice in the menu bar long after they have forgotten what caused it.
  const release = () => stream.getTracks().forEach((t) => t.stop());

  return {
    stop: () =>
      new Promise<File>((resolve, reject) => {
        recorder.onstop = () => {
          release();
          const blob = new Blob(chunks, { type: mimeType });
          if (blob.size === 0) {
            reject(new RecordingError('Nothing was recorded.'));
            return;
          }
          resolve(new File([blob], `${name}.${extensionFor(mimeType)}`, { type: mimeType }));
        };
        recorder.stop();
      }),
    cancel: () => {
      recorder.onstop = release;
      if (recorder.state !== 'inactive') recorder.stop();
      else release();
    },
  };
}
