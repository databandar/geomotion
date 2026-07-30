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

/** Autosave, so a reload does not lose work. */
export function saveLocal(p: Project) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* quota — ignore, the user can still export a file */
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
