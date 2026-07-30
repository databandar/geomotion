import { useRef, useState } from 'react';
import { useStore } from '../store';
import { canWriteToFolder, exportFrames, exportVideo, ffmpegCommand, type ExportOptions } from '../lib/export';
import { useRenderHost } from '../render/host';

export default function ExportDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const status = useStore((s) => s.exportStatus);
  const setExportStatus = useStore((s) => s.setExportStatus);
  const [mode, setMode] = useState<'video' | 'frames'>('video');
  const [opts, setOpts] = useState<ExportOptions>({
    attribution: true,
    waitForTiles: true,
    destination: canWriteToFolder() ? 'folder' : 'zip',
  });
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);
  const host = useRenderHost();

  const totalFrames = Math.round(project.duration * project.fps);
  const running = !!status?.active;

  const run = async () => {
    setError(null);
    // The map has to exist before anything can be composited from it.
    if (!host) return setError('The map is still loading.');
    cancelled.current = false;
    setExportStatus({ active: true, label: 'Preparing…', progress: 0, cancel: () => (cancelled.current = true) });
    try {
      if (mode === 'video') {
        await exportVideo(
          host,
          project,
          opts,
          (p) => setExportStatus({ active: true, label: 'Recording…', progress: p, cancel: () => (cancelled.current = true) }),
          () => cancelled.current,
        );
      } else {
        await exportFrames(
          host,
          project,
          opts,
          (p, label) => setExportStatus({ active: true, label, progress: p, cancel: () => (cancelled.current = true) }),
          () => cancelled.current,
        );
      }
    } catch (e) {
      if ((e as DOMException)?.name !== 'AbortError') setError((e as Error).message ?? String(e));
    } finally {
      setExportStatus(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => !running && onClose()}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Export</h2>

        <div className="mode-tabs">
          <button className={mode === 'video' ? 'active' : ''} onClick={() => setMode('video')} disabled={running}>
            Video (WebM)
          </button>
          <button className={mode === 'frames' ? 'active' : ''} onClick={() => setMode('frames')} disabled={running}>
            PNG sequence
          </button>
        </div>

        <p className="modal-desc">
          {mode === 'video' ? (
            <>
              Records in real time straight to a video file — quickest way to get something shareable. Heavy scenes or
              slow tiles can drop frames.
            </>
          ) : (
            <>
              Renders every frame at its exact time and waits for tiles, so nothing is ever half-loaded. Best quality;
              assemble it with ffmpeg afterwards.
            </>
          )}
        </p>

        <dl className="spec">
          <div>
            <dt>Resolution</dt>
            <dd>
              {project.width} × {project.height}
            </dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>
              {project.duration}s · {project.fps} fps
            </dd>
          </div>
          <div>
            <dt>Frames</dt>
            <dd>{totalFrames}</dd>
          </div>
        </dl>

        <label className="check">
          <input
            type="checkbox"
            checked={opts.attribution}
            disabled={running}
            onChange={(e) => setOpts({ ...opts, attribution: e.target.checked })}
          />
          Burn in map attribution <span className="dim">(required by most tile providers)</span>
        </label>

        {mode === 'frames' && (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={opts.waitForTiles}
                disabled={running}
                onChange={(e) => setOpts({ ...opts, waitForTiles: e.target.checked })}
              />
              Wait for every tile before capturing <span className="dim">(slower, no pop-in)</span>
            </label>
            <div className="dest-row">
              <span className="dim">Write frames to</span>
              <div className="mode-tabs inline">
                <button
                  className={opts.destination === 'folder' ? 'active' : ''}
                  disabled={running || !canWriteToFolder()}
                  title={canWriteToFolder() ? 'Pick a folder to stream PNGs into' : 'Your browser has no folder access'}
                  onClick={() => setOpts({ ...opts, destination: 'folder' })}
                >
                  A folder
                </button>
                <button
                  className={opts.destination === 'zip' ? 'active' : ''}
                  disabled={running}
                  onClick={() => setOpts({ ...opts, destination: 'zip' })}
                >
                  One .zip
                </button>
              </div>
            </div>
            <p className="modal-desc small">Then stitch them together:</p>
            <code className="cmd">{ffmpegCommand(project)}</code>
          </>
        )}

        {running && (
          <div className="progress">
            <div className="bar">
              <span style={{ width: `${Math.round((status?.progress ?? 0) * 100)}%` }} />
            </div>
            <span className="progress-label">
              {status?.label} · {Math.round((status?.progress ?? 0) * 100)}%
            </span>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          {running ? (
            <button className="tb-btn danger" onClick={() => status?.cancel?.()}>
              Cancel
            </button>
          ) : (
            <>
              <button className="tb-btn" onClick={onClose}>
                Close
              </button>
              <button className="tb-btn primary" onClick={run}>
                Start export
              </button>
            </>
          )}
        </div>

        {running && <p className="modal-desc small">Keep this tab visible — background tabs stop rendering frames.</p>}
      </div>
    </div>
  );
}
