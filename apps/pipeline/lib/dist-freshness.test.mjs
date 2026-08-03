import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { checkDistFreshness, stalenessWarning } from './dist-freshness.mjs';

/**
 * The failure this guards: `access(dist/index.html)` reported "dist/ present" for a
 * bundle built before the source change being rendered, and a new colour ramp came out
 * as the fallback colour for a full-length render with nothing logged anywhere.
 */
async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'freshness-'));
  await fs.mkdir(path.join(root, 'packages/core/src'), { recursive: true });
  await fs.mkdir(path.join(root, 'apps/studio/dist'), { recursive: true });
  await fs.writeFile(path.join(root, 'packages/core/src/palettes.ts'), 'export const x = 1;');
  await fs.writeFile(path.join(root, 'apps/studio/dist/index.html'), '<!doctype html>');
  return { root, dist: path.join(root, 'apps/studio/dist') };
}

const touch = (file, msAgo) => {
  const when = new Date(Date.now() - msAgo);
  return fs.utimes(file, when, when);
};

describe('checkDistFreshness', () => {
  it('is fresh when the bundle is newer than the source', async () => {
    const { root, dist } = await fixture();
    await touch(path.join(root, 'packages/core/src/palettes.ts'), 60_000);
    const r = await checkDistFreshness(root, dist);
    expect(r.stale).toBe(false);
    expect(stalenessWarning(r)).toBeNull();
  });

  it('is stale when a watched source file is newer than the bundle', async () => {
    const { root, dist } = await fixture();
    await touch(path.join(dist, 'index.html'), 3_600_000);
    const r = await checkDistFreshness(root, dist);
    expect(r.stale).toBe(true);
    expect(stalenessWarning(r)).toMatch(/will NOT include recent changes/);
    expect(stalenessWarning(r)).toMatch(/--rebuild/);
  });

  it('watches apps/studio/src too, not only packages', async () => {
    const { root, dist } = await fixture();
    await fs.mkdir(path.join(root, 'apps/studio/src'), { recursive: true });
    await fs.writeFile(path.join(root, 'apps/studio/src/main.tsx'), 'export {};');
    await touch(path.join(dist, 'index.html'), 3_600_000);
    expect((await checkDistFreshness(root, dist)).stale).toBe(true);
  });

  it('ignores node_modules and dist, which the build itself churns', async () => {
    const { root, dist } = await fixture();
    await fs.mkdir(path.join(root, 'packages/core/node_modules'), { recursive: true });
    await fs.writeFile(path.join(root, 'packages/core/node_modules/dep.js'), 'x');
    await touch(path.join(root, 'packages/core/src/palettes.ts'), 60_000);
    expect((await checkDistFreshness(root, dist)).stale).toBe(false);
  });

  it('ignores non-source files, so touching a README is not a warning', async () => {
    const { root, dist } = await fixture();
    await fs.writeFile(path.join(root, 'packages/core/NOTES.md'), 'hello');
    await touch(path.join(root, 'packages/core/src/palettes.ts'), 60_000);
    expect((await checkDistFreshness(root, dist)).stale).toBe(false);
  });

  it('reports a missing bundle as not stale — the caller builds it anyway', async () => {
    const { root } = await fixture();
    const r = await checkDistFreshness(root, path.join(root, 'nope'));
    expect(r.stale).toBe(false);
    expect(stalenessWarning(r)).toBeNull();
  });
});
