/**
 * Is the built studio bundle older than the source it was built from?
 *
 * Every renderer in this pipeline draws through `apps/studio/dist`, never through the
 * source tree — so a change under `packages/` or `apps/studio/src` has no effect on a
 * render until the bundle is rebuilt. Nothing said so. The check that existed was
 * `access(dist/index.html)`, which reports "dist/ present" and is satisfied by a bundle
 * built weeks ago.
 *
 * The failure is worth this file: a colour ramp added to `packages/core` rendered as
 * plain blue for a full-length pass, because `getRamp` falls back to the first ramp for
 * an id it does not know and the stale bundle did not know the new one. Nothing threw,
 * nothing logged, and the only symptom was a map that looked deliberate and was wrong.
 *
 * Deliberately a warning, not an error. Rebuilding automatically would surprise anyone
 * rendering with intentionally-pinned output, and refusing to render would make a
 * pipeline hostage to a timestamp — which is exactly the kind of check people learn to
 * bypass. It says the one sentence that would have saved the render.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

/** Source trees whose contents end up inside the bundle. */
const WATCHED = ['packages', 'apps/studio/src'];

const IGNORED_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', '.turbo', '.vite']);

/** Newest mtime under `dir`, in epoch ms; 0 if it cannot be read. */
async function newestMtime(dir) {
  let newest = 0;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      newest = Math.max(newest, await newestMtime(path.join(dir, entry.name)));
      continue;
    }
    // Only files that can change what the bundle draws. A README or a .md note
    // touching the tree should not make every render print a warning.
    if (!/\.(ts|tsx|js|jsx|mjs|cjs|css|json|html)$/.test(entry.name)) continue;
    try {
      const st = await fs.stat(path.join(dir, entry.name));
      newest = Math.max(newest, st.mtimeMs);
    } catch {
      /* raced with a delete — not this check's problem */
    }
  }
  return newest;
}

/**
 * `{ stale, builtAt, newestSourceAt, aheadBy }`, or `stale: false` if there is nothing
 * to compare against. A missing bundle is *not* stale — the caller builds it anyway,
 * and reporting a fresh build as out of date would be a lie.
 */
export async function checkDistFreshness(repoRoot, distDir) {
  let builtAt;
  try {
    builtAt = (await fs.stat(path.join(distDir, 'index.html'))).mtimeMs;
  } catch {
    return { stale: false, builtAt: 0, newestSourceAt: 0, aheadBy: 0 };
  }

  const times = await Promise.all(WATCHED.map((rel) => newestMtime(path.join(repoRoot, rel))));
  const newestSourceAt = Math.max(0, ...times);

  /*
   * A couple of seconds of slack. The build itself writes into the tree it is built
   * from (type declarations, caches), so an exact comparison can flag a bundle that was
   * literally just produced.
   */
  const aheadBy = newestSourceAt - builtAt;
  return { stale: aheadBy > 2000, builtAt, newestSourceAt, aheadBy };
}

/** The warning line, or `null` when the bundle is current. */
export function stalenessWarning(result) {
  if (!result.stale) return null;
  const mins = result.aheadBy / 60000;
  const ago = mins < 60 ? `${Math.round(mins)} min` : `${(mins / 60).toFixed(1)} h`;
  return (
    `dist/ is ${ago} older than your source — this render will NOT include recent ` +
    `changes to packages/ or apps/studio/src. Pass --rebuild (or run ` +
    `\`pnpm --filter @geomotion/studio build\`).`
  );
}
