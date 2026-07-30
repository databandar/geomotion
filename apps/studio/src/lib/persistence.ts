import { migrate } from '@geomotion/document';
import type { Project } from '@geomotion/document';

/**
 * Browser persistence.
 *
 * Split out of the document model because §2 forbids `@geomotion/document` from
 * depending on the DOM, and both localStorage and the download trick below are
 * browser APIs. The pure half — schema, construction, migration — is in the
 * package; this is the part that only makes sense in a tab.
 */

const KEY = 'geomotion:project';

/**
 * Autosave, so a reload does not lose work.
 *
 * Reports failure instead of swallowing it. Embedded audio makes this reachable in
 * ordinary use — a few minutes of music is past the ~5 MB localStorage budget — and a
 * project that has quietly stopped autosaving while the user keeps editing is the
 * worst version of this feature. The caller surfaces it; Save still writes a file.
 */
export function saveLocal(p: Project): { ok: true } | { ok: false; reason: string } {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
    return { ok: true };
  } catch (err) {
    const quota = err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22);
    return {
      ok: false,
      reason: quota
        ? 'This project is too large to autosave in the browser — usually embedded audio. Use Save to keep a copy.'
        : 'Autosave failed. Use Save to keep a copy.',
    };
  }
}

/** Read the autosave back, migrating it forward. */
export function loadLocal(): Project | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Save a project to a file the user can keep or re-open. */
export function downloadProject(p: Project) {
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${p.name.replace(/[^\w-]+/g, '_') || 'animation'}.geomotion.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
