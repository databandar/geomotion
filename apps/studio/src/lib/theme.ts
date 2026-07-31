/**
 * Which theme the editor is wearing.
 *
 * ENGINEERING_GUIDE §4 puts this in the editor store: it is about how *you* are looking
 * at the document, not about the document, so it is not undoable and never exported. It
 * is one of the few pieces of editor state that persists, because a tool that forgets
 * your theme every morning is a tool you notice.
 *
 * `system` is a real third value rather than the absence of a choice. Someone whose
 * laptop turns dark at sunset wants the editor to follow; someone who has picked light
 * wants it light at midnight. Storing only a boolean cannot tell those apart.
 */
export type Theme = 'system' | 'light' | 'dark';

const KEY = 'geomotion.theme';

export function loadTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    // Private browsing, or storage disabled. Following the system is the right default
    // for someone who has never expressed a preference anyway.
    return 'system';
  }
}

/**
 * Put the choice on `<html>`, where the stylesheet's overrides can see it.
 *
 * `system` *removes* the attribute rather than writing the resolved value, so the media
 * query stays live: the editor then follows a laptop that switches at sunset without
 * anything having to listen for it.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* nothing to do — the theme still applies for this session */
  }
}

/** What `system` currently resolves to, for a control that wants to show it. */
export function resolvedTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
