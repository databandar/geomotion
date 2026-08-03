import path from 'node:path';
import { speak } from './tts.mjs';

/** Round to hundredths — schedule times are seconds, and float noise past that
 * is never meaningful against a 30fps or even 60fps timeline. */
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Narrate a list of `[id, text]` lines and build the timing schedule from their
 * *real* measured durations — never a word-count estimate. Every hand-route
 * episode this pipeline has produced (Four Doors, Malacca, Arctic, Dandi March)
 * wrote this exact loop by hand in its own `narrate.mjs` + `retime.mjs`, calling
 * Voicebox directly and re-synthesising every line on every run. This wraps
 * `speak()` — this package's own TTS abstraction, already hash-cached and
 * already handling five engines, Voicebox included — instead of a second
 * implementation of the same HTTP polling.
 *
 * Returns the same `{ at, DUR }` shape `retime.mjs` scripts have always written
 * to `schedule.json`, so an existing episode's `build-project.mjs` doesn't have
 * to change how it reads the schedule, only how the schedule gets built.
 *
 * `gaps` is deliberate dead air after a line — earned visual dwell time, not
 * padding — as either a flat number applied to every line or a `{ id: seconds }`
 * map for per-line control, matching how every episode has actually used it.
 */
export async function narrateSchedule(lines, { voice, outDir, gaps = 0 }) {
  let t = 0;
  const at = {};
  for (const [id, text] of lines) {
    const file = path.join(outDir, `${id}.wav`);
    const { duration } = await speak(text, file, voice);
    const gap = typeof gaps === 'number' ? gaps : (gaps[id] ?? 0);
    at[id] = { start: round2(t), end: round2(t + duration), duration: round2(duration) };
    t += duration + gap;
  }
  return { at, DUR: round2(t) };
}

/**
 * Scene bounds from a schedule: each beat's span runs from its own start to the
 * *next* beat's start, not its own end — the gap after a line counts as part of
 * the scene it follows, which is what a camera hold or a layer's `out` set to
 * `S.sXX[1]` actually wants. Every episode's `build-project.mjs` computed this
 * identically, by hand, from `schedule.json` — this is that loop, named once,
 * rather than a sixth copy of it.
 */
export function sceneBoundsFrom({ at, DUR }) {
  const ids = Object.keys(at);
  const S = {};
  for (let i = 0; i < ids.length; i++) {
    const cur = ids[i];
    const nextStart = i + 1 < ids.length ? at[ids[i + 1]].start : DUR;
    S[cur] = [at[cur].start, nextStart];
  }
  return S;
}
