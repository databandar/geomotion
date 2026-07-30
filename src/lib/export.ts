import type { Project } from '../types';
import { getMap, getOverlayCanvas, renderFrameAt, waitForIdle } from './mapref';
import { useStore } from '../store';
import { ZipWriter } from './zip';
import { getBasemap } from './basemaps';

export interface ExportOptions {
  /** burn the basemap attribution into the frames (required by most tile terms) */
  attribution: boolean;
  /** PNG sequence only: wait for every tile before capturing each frame */
  waitForTiles: boolean;
  /** PNG sequence only: write straight into a folder, or bundle a .zip */
  destination: 'folder' | 'zip';
}

/** Folder writing needs the File System Access API (Chrome/Edge today). */
export const canWriteToFolder = () =>
  typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function attributionText(project: Project): string {
  const base = getBasemap(project.basemap);
  const extra = project.terrain ? ' · Terrain: Mapzen/AWS' : '';
  return `© OpenStreetMap contributors · ${base.name}${extra}`;
}

function composite(target: HTMLCanvasElement, project: Project, opts: ExportOptions) {
  const map = getMap();
  const overlay = getOverlayCanvas();
  const ctx = target.getContext('2d');
  if (!map || !overlay || !ctx) return;

  ctx.clearRect(0, 0, target.width, target.height);
  ctx.fillStyle = project.background;
  ctx.fillRect(0, 0, target.width, target.height);
  ctx.drawImage(map.getCanvas(), 0, 0, target.width, target.height);
  ctx.drawImage(overlay, 0, 0, target.width, target.height);

  if (opts.attribution) {
    const s = target.height / 1080;
    const text = attributionText(project);
    ctx.save();
    ctx.font = `${Math.round(13 * s)}px system-ui, sans-serif`;
    const w = ctx.measureText(text).width;
    const pad = 8 * s;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(target.width - w - pad * 2.5, target.height - 26 * s, w + pad * 2.5, 26 * s);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'right';
    ctx.fillText(text, target.width - pad, target.height - 9 * s);
    ctx.restore();
  }
}

/**
 * The stage already renders at exact output pixels, so there is nothing to
 * resize — we just suppress the editor-only chrome and give the map a moment to
 * settle before the first capture.
 */
async function withExportStage<T>(project: Project, run: (canvas: HTMLCanvasElement) => Promise<T>): Promise<T> {
  const store = useStore.getState();
  const restoreTime = store.time;
  store.setPlaying(false);
  store.setExporting(true);

  await nextFrame();
  await nextFrame();
  await waitForIdle(getMap()!, 12000);

  const canvas = document.createElement('canvas');
  canvas.width = project.width;
  canvas.height = project.height;

  try {
    return await run(canvas);
  } finally {
    useStore.getState().setExporting(false);
    useStore.getState().setTime(restoreTime);
  }
}

function pickMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4;codecs=avc1',
    'video/mp4',
  ];
  for (const c of candidates) if (MediaRecorder.isTypeSupported(c)) return c;
  return '';
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const safeName = (p: Project) => (p.name.replace(/[^\w-]+/g, '_') || 'animation').toLowerCase();

/* -------------------------------------------------------------- video */

/**
 * Real-time capture. Timing is driven by the wall clock so the resulting file
 * always has the right duration, at the cost of dropping frames if the scene is
 * heavy or tiles are still streaming in.
 */
export async function exportVideo(project: Project, opts: ExportOptions, onProgress: (p: number) => void, isCancelled: () => boolean) {
  const mime = pickMimeType();
  if (!mime) throw new Error('This browser cannot record video. Use the PNG sequence export instead.');

  return withExportStage(project, async (canvas) => {
    const stream = canvas.captureStream(project.fps);
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: Math.round(project.width * project.height * project.fps * 0.14),
    });
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);

    const done = new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
    });

    // Pre-roll: get frame zero fully painted before the recorder starts.
    renderFrameAt(0);
    await waitForIdle(getMap()!, 10000);
    await nextFrame();

    recorder.start();
    const started = performance.now();
    let t = 0;

    while (t < project.duration) {
      if (isCancelled()) break;
      t = (performance.now() - started) / 1000;
      renderFrameAt(Math.min(t, project.duration));
      await nextFrame();
      composite(canvas, project, opts);
      onProgress(Math.min(1, t / project.duration));
    }

    // Hold the last frame briefly so the final moment isn't clipped.
    renderFrameAt(project.duration);
    await nextFrame();
    composite(canvas, project, opts);
    await sleep(250);

    recorder.stop();
    const blob = await done;
    const ext = mime.includes('mp4') ? 'mp4' : 'webm';
    download(blob, `${safeName(project)}.${ext}`);
    return blob;
  });
}

/* -------------------------------------------------------- png sequence */

interface FrameSink {
  write(name: string, blob: Blob): Promise<void>;
  close(): Promise<void>;
}

async function makeSink(project: Project, opts: ExportOptions): Promise<FrameSink> {
  const picker = (window as unknown as { showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle> })
    .showDirectoryPicker;

  // Must be called while the click that started the export still counts as user
  // activation — so this happens before anything else awaits.
  if (opts.destination === 'folder' && picker) {
    const dir = await picker.call(window);
    return {
      async write(name, blob) {
        const fh = await dir.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        await w.write(blob);
        await w.close();
      },
      async close() {},
    };
  }

  const zip = new ZipWriter();
  return {
    async write(name, blob) {
      await zip.add(name, blob);
    },
    async close() {
      download(zip.finish(), `${safeName(project)}-frames.zip`);
    },
  };
}

/**
 * Deterministic export: every frame is rendered at its exact timeline position
 * and (optionally) waits for all tiles, so nothing is ever half-loaded.
 */
export async function exportFrames(
  project: Project,
  opts: ExportOptions,
  onProgress: (p: number, label: string) => void,
  isCancelled: () => boolean,
) {
  const sink = await makeSink(project, opts);
  const total = Math.max(1, Math.round(project.duration * project.fps));
  const pad = String(total).length + 1;

  return withExportStage(project, async (canvas) => {
    for (let i = 0; i < total; i++) {
      if (isCancelled()) break;
      const t = i / project.fps;
      renderFrameAt(t);
      if (opts.waitForTiles) await waitForIdle(getMap()!, 6000);
      await nextFrame();
      await nextFrame();
      composite(canvas, project, opts);

      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
      if (blob) await sink.write(`frame_${String(i).padStart(pad, '0')}.png`, blob);
      onProgress((i + 1) / total, `Frame ${i + 1} / ${total}`);
    }
    await sink.close();
  });
}

export function ffmpegCommand(project: Project): string {
  const pad = String(Math.max(1, Math.round(project.duration * project.fps))).length + 1;
  return `ffmpeg -framerate ${project.fps} -i frame_%0${pad}d.png -c:v libx264 -pix_fmt yuv420p -crf 18 ${safeName(project)}.mp4`;
}
