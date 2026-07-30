import fs from 'node:fs/promises';
import path from 'node:path';
import { renderInPage } from './render.mjs';

/**
 * Render straight to an H.264 elementary stream, encoded inside the page.
 *
 * Why this exists, with numbers. The screenshot path costs about 48 ms a frame at
 * 960×540, measured as: 3.6 ms to draw the frame, 11.5 ms waiting two animation
 * frames for MapLibre to paint, and **33.6 ms in `page.screenshot`** — a PNG encoded
 * in the browser, shipped over CDP, and written to disk. Encoding the same frame
 * in-page costs 0.8 ms.
 *
 * Swapping only the capture gives about 3x, because those two paint waits are four
 * CDP round-trips per frame that remain. Moving the *whole loop* into the page removes
 * them: 17.6 ms a frame, 57 fps against the 11 fps the screenshot pipeline actually
 * achieves. Roughly 5x — not the 10-20x the design doc estimated, and worth having.
 *
 * **Draft only, deliberately.** A realtime encoder does not match
 * `libx264 -preset slow -crf 18` per byte, and a final render happens once while a
 * draft happens constantly. Speed is the right trade for reviewing timing and layout;
 * it is the wrong trade for the file that gets published.
 */

/** Keyframe every two seconds, so a draft is still seekable while reviewing. */
const KEYFRAME_SECONDS = 2;

/**
 * Thrown when the browser cannot encode in-page, so the caller can fall back to
 * frames instead of failing a render over an optimisation.
 *
 * WebCodecs needs a secure context, which `http://127.0.0.1` satisfies. Support is
 * checked inside the run rather than by launching a browser twice; it fails on the
 * first line, before any frame is drawn.
 */
export class EncoderUnavailable extends Error {}

export async function renderEncoded(project, outFile, opts = {}) {
  const { onProgress = () => {}, waitForTiles = false } = opts;
  await fs.mkdir(path.dirname(outFile), { recursive: true });

  const chunks = [];
  const result = await renderInPage(project, {
    ...opts,
    onChunk: (base64) => chunks.push(Buffer.from(base64, 'base64')),
    onProgress,
    run: async (page, { total, fps }) =>
      page.evaluate(
        async (frames, framerate, keyEvery, wait) => {
          if (typeof VideoEncoder === 'undefined') return { unsupported: 'this browser has no VideoEncoder' };
          const support = await VideoEncoder.isConfigSupported({
            codec: 'avc1.640028',
            avc: { format: 'annexb' },
            width: 1280,
            height: 720,
            bitrate: 4_000_000,
            framerate: framerate,
          });
          if (!support.supported) return { unsupported: 'H.264 Annex-B encoding is not supported here' };

          const map = document.querySelector('.maplibregl-canvas');
          const overlay = document.querySelector('.overlay-canvas');
          if (!map) throw new Error('no map canvas');

          let lastShape = -1;
          const canvas = document.createElement('canvas');
          canvas.width = map.width;
          canvas.height = map.height;
          const ctx = canvas.getContext('2d');

          const pending = [];
          const encoder = new VideoEncoder({
            output: (chunk) => {
              const bytes = new Uint8Array(chunk.byteLength);
              chunk.copyTo(bytes);
              pending.push(bytes);
            },
            error: (e) => {
              window.__gmEncodeError = String(e);
            },
          });
          encoder.configure({
            // High profile in Annex-B, so ffmpeg can stream-copy it into MP4
            // instead of transcoding — which would give the speed straight back.
            codec: 'avc1.640028',
            avc: { format: 'annexb' },
            width: canvas.width,
            height: canvas.height,
            /*
             * 0.6 bits per pixel per frame — about 4.7 Mbps at 960x540/15.
             *
             * Deliberately generous. A realtime encoder is far less efficient than
             * `libx264 -crf 26`: at 0.15 bpp the frames measured SSIM 0.75-0.96
             * against the frame path and were visibly soft on satellite imagery and
             * small text. Disk is cheap next to re-rendering, and a draft that is
             * hard to read is a draft that has to be rendered again.
             */
            bitrate: Math.round(canvas.width * canvas.height * framerate * 0.6),
            framerate,
          });

          /** Ship what the encoder has produced so far, then clear it. */
          const flushOut = async () => {
            while (pending.length) {
              const bytes = pending.shift();
              let binary = '';
              for (let i = 0; i < bytes.length; i += 0x8000) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
              }
              await window.__gmChunk(btoa(binary));
            }
          };

          for (let i = 0; i < frames; i++) {
            window.geomotion.renderFrameAt(i / framerate);

            /*
             * Wait only when the composition's *structure* changed.
             *
             * Skipping the wait entirely produced a draft missing the outline and the
             * choropleth for seven seconds: a layer entering the composition means
             * adding a GeoJSON source, which has to be parsed and tiled, and two
             * animation frames is nowhere near enough. The frame path never noticed
             * because its four CDP round-trips per frame handed MapLibre about 48 ms
             * of slack it never asked for.
             *
             * But waiting on *every* frame costs the whole speed advantage — measured
             * at 111 s against 29 s, no better than capturing PNGs. A tour moves the
             * camera constantly, so the map is rarely idle and the wait rarely returns
             * early.
             *
             * The GL layer count is the cheap signal for "something was added", and
             * that is exactly what needs the extra time. Paint-property changes during
             * a tour do not move it, so steady state pays nothing. It must stay cheap:
             * asking for the whole style instead serialises the region layer's inlined
             * GeoJSON on every frame, which stalled the render past puppeteer's
             * protocol timeout.
             */
            const shape = window.geomotion.shape().layers;
            if (wait) {
              await window.geomotion.waitIdle(12000);
            } else if (shape !== lastShape) {
              lastShape = shape;
              await window.geomotion.waitIdle(3000);
            }

            // Two frames: one for MapLibre to paint, one for the compositor.
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

            ctx.drawImage(map, 0, 0);
            if (overlay) ctx.drawImage(overlay, 0, 0, canvas.width, canvas.height);

            const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1e6) / framerate) });
            encoder.encode(frame, { keyFrame: i % (framerate * keyEvery) === 0 });
            frame.close();

            // Keep the encoder's queue bounded, and hand chunks out as they appear so
            // a long render does not accumulate the whole video in page memory.
            if (encoder.encodeQueueSize > 8) await new Promise((r) => setTimeout(r, 0));
            if (pending.length > 8) await flushOut();
            if (i % 10 === 0) window.__gmProgress(i + 1);
          }

          await encoder.flush();
          await flushOut();
          encoder.close();
          window.__gmProgress(frames);
          if (window.__gmEncodeError) throw new Error(window.__gmEncodeError);
          return { frames };
        },
        total,
        fps,
        KEYFRAME_SECONDS,
        waitForTiles,
      ),
  });

  if (result.unsupported) throw new EncoderUnavailable(result.unsupported);
  const bytes = Buffer.concat(chunks);
  if (!bytes.length) throw new EncoderUnavailable('the encoder produced no data');
  await fs.writeFile(outFile, bytes);
  return { file: outFile, bytes: bytes.length, total: result.total, problems: result.problems };
}
