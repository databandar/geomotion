import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const run = promisify(execFile);

/**
 * Frames + voice → an MP4 YouTube will accept without re-encoding surprises:
 * H.264 high profile, yuv420p, faststart, AAC audio, and EBU R128 loudness so
 * the narration sits where every other video on the platform sits.
 */
export async function encode({ framesDir, pad, fps, audio, out, crf = 18, music, musicGain = -22 }) {
  const args = ['-y', '-loglevel', 'error', '-stats'];

  args.push('-framerate', String(fps), '-i', path.join(framesDir, `frame_%0${pad}d.png`));
  if (audio) args.push('-i', audio);
  if (music) args.push('-stream_loop', '-1', '-i', music);

  if (audio && music) {
    args.push(
      '-filter_complex',
      `[2:a]volume=${musicGain}dB[m];[1:a][m]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]`,
      '-map', '0:v', '-map', '[a]',
    );
  } else if (audio) {
    args.push('-filter_complex', '[1:a]loudnorm=I=-14:TP=-1.5:LRA=11[a]', '-map', '0:v', '-map', '[a]');
  } else {
    args.push('-map', '0:v');
  }

  args.push(
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-preset', 'slow',
    '-crf', String(crf),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
  );
  if (audio) args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '48000');
  args.push('-shortest', out);

  await run('ffmpeg', args, { maxBuffer: 1024 * 1024 * 32 });
  return out;
}

/**
 * A still for the YouTube thumbnail, seeked out of the finished MP4 rather than
 * the frame folder — so it works after the frames are cleaned up, and can be
 * re-grabbed at a different timestamp without re-rendering anything.
 */
export async function grabThumbnail({ video, at, out }) {
  await run('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-ss', String(Math.max(0, at)),
    '-i', video,
    '-frames:v', '1',
    '-vf', 'scale=1280:-1',
    out,
  ]);
  return out;
}
