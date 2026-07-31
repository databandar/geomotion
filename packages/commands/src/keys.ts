/**
 * Shortcuts, as data.
 *
 * Governing sections: ENGINEERING_GUIDE §11 ("New shortcuts are proposed in the feature doc
 * and registered centrally; collisions fail CI"), ARCHITECTURE §02 (the reserved keys).
 *
 * A chord is written `mod+shift+g` — lower-case, modifiers first, in a fixed order, one
 * printable key or named key at the end. `mod` is ⌘ on a Mac and Ctrl elsewhere, which is the
 * only sane way to write a shortcut down once: spelling it `cmd+g` would mean every binding
 * needs a second Windows spelling, and the two would drift.
 *
 * Deliberately free of the DOM. A `KeyboardEvent` is a browser type and this package runs in
 * node under test; the caller passes the four flags and the key, which is all a chord is.
 */

/** The pieces of a key press this package needs. The app maps a DOM event onto it. */
export interface KeyPress {
  key: string;
  /** ⌘ on a Mac, the Windows/Meta key elsewhere. */
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
}

const MODIFIER_ORDER = ['mod', 'alt', 'shift'] as const;

/**
 * Keys whose `event.key` is not what a person would write.
 *
 * Space is the obvious one — `event.key` is a single space, and a binding written `' '` is
 * invisible in a diff and impossible to grep for.
 */
const NAMED: Record<string, string> = {
  ' ': 'space',
  arrowleft: 'left',
  arrowright: 'right',
  arrowup: 'up',
  arrowdown: 'down',
  escape: 'esc',
  delete: 'del',
};

/**
 * The canonical form of a chord, so two spellings of one shortcut compare equal.
 *
 * `Shift+Mod+G`, `mod+shift+g` and `g+shift+mod` all normalise to `mod+shift+g`. Without
 * this the collision check would miss exactly the pair it exists to catch: the same binding
 * written two ways by two people.
 */
export function normalizeShortcut(shortcut: string): string {
  const parts = shortcut
    .toLowerCase()
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);

  const mods = new Set<string>();
  let key = '';
  for (const part of parts) {
    if (part === 'mod' || part === 'cmd' || part === 'meta' || part === 'ctrl' || part === 'control') mods.add('mod');
    else if (part === 'alt' || part === 'option') mods.add('alt');
    else if (part === 'shift') mods.add('shift');
    // The last non-modifier wins, so a malformed `a+b` binds `b` rather than silently
    // binding nothing.
    else key = NAMED[part] ?? part;
  }

  const ordered = MODIFIER_ORDER.filter((m) => mods.has(m));
  return key ? [...ordered, key].join('+') : ordered.join('+');
}

/** The chord a key press represents, in the same canonical form as a binding. */
export function chordOf(press: KeyPress): string {
  const raw = press.key.toLowerCase();
  const key = NAMED[raw] ?? raw;
  const parts: string[] = [];
  // Ctrl and ⌘ are one modifier here. A user pressing Ctrl on a Mac gets the Mac binding,
  // which is what every editor does and what people with external keyboards expect.
  if (press.meta || press.ctrl) parts.push('mod');
  if (press.alt) parts.push('alt');
  /*
   * Shift counts only where it is not already in the key.
   *
   * Shift+G reports `G`, lower-cased here to `g` — the shift is real information and
   * `shift+g` is a different binding from `g`. But `?` is *produced* by Shift+`/` and reports
   * as `?`, so calling that chord `shift+?` would describe the same press twice and no
   * binding anyone writes would ever match it. Named keys (`left`, `space`) always count.
   */
  const shiftIsInTheKey = key.length === 1 && !/^[a-z0-9]$/.test(key);
  if (press.shift && !shiftIsInTheKey) parts.push('shift');
  parts.push(key);
  return parts.join('+');
}

/** How a chord is written for a human — `⌘⇧G` on a Mac, `Ctrl+Shift+G` elsewhere. */
export function formatShortcut(shortcut: string, mac = true): string {
  const parts = normalizeShortcut(shortcut).split('+');
  const key = parts[parts.length - 1] ?? '';
  const mods = parts.slice(0, -1);
  const glyph: Record<string, string> = { mod: mac ? '⌘' : 'Ctrl', alt: mac ? '⌥' : 'Alt', shift: mac ? '⇧' : 'Shift' };
  const label = key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
  const prefix = mods.map((m) => glyph[m] ?? m);
  return mac ? [...prefix, label].join('') : [...prefix, label].join('+');
}

/**
 * The keys §02 reserves, so a feature cannot quietly take one.
 *
 * Listed rather than assumed: "V select, H pan world, P pen, C camera, Space/JKL transport,
 * U reveal animated, ⌘K palette". A command claiming one of these has to be the feature the
 * design doc says it is.
 */
export const RESERVED: Record<string, string> = {
  v: 'select tool (§02)',
  h: 'pan world (§02)',
  p: 'pen tool (§02)',
  c: 'camera tool (§02)',
  space: 'play/pause (§02)',
  j: 'transport reverse (§02)',
  k: 'transport (§02)',
  l: 'transport forward (§02)',
  u: 'reveal animated properties (§02)',
  'mod+k': 'command palette (§02)',
};
