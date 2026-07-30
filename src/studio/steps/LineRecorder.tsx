import { useRef, useState } from 'react';
import { api } from '../api';

/**
 * Record one narration line in your own voice.
 *
 * A recording is stored beside the synthesised clips but in its own folder, and
 * always wins — so you can voice the lines that matter and leave the rest
 * generated, and re-running the pipeline never overwrites you.
 */
export function LineRecorder({
  slug,
  lineKey,
  text,
  manual,
  onChanged,
}: {
  slug: string;
  lineKey: string;
  text: string;
  manual: boolean;
  onChanged: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: Blob[] = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        window.clearInterval(timer.current);
        setRecording(false);
        setBusy(true);
        try {
          const blob = new Blob(chunks, { type: mr.mimeType });
          const b64 = await new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result));
            fr.onerror = reject;
            fr.readAsDataURL(blob);
          });
          await api.saveRecording(slug, lineKey, b64);
          onChanged();
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      };
      recorder.current = mr;
      mr.start();
      setRecording(true);
      setElapsed(0);
      const t0 = Date.now();
      timer.current = window.setInterval(() => setElapsed((Date.now() - t0) / 1000), 100);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await api.clearRecording(slug, lineKey);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="rec">
      {recording ? (
        <button className="mini danger" onClick={() => recorder.current?.stop()}>
          ■ {elapsed.toFixed(1)}s
        </button>
      ) : (
        <button className="mini" onClick={start} disabled={busy} title={`Record: ${text.slice(0, 60)}`}>
          {busy ? '…' : manual ? '↻ Re-record' : '● Record'}
        </button>
      )}
      {manual && !recording && (
        <button className="mini danger" onClick={clear} disabled={busy} title="Delete your recording and go back to the synthesised voice">
          ×
        </button>
      )}
      {error && <span className="hint warn">{error}</span>}
    </span>
  );
}
