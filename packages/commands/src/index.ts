/**
 * `@geomotion/commands` — the command registry.
 *
 * Governing sections: ENGINEERING_GUIDE §11, ARCHITECTURE §13. Depends on `core` only, and
 * knows nothing about the editor: a command's `run` is a closure the app supplies. That is
 * what keeps the mechanism testable in node, and what will let the AI framework (§12) and
 * plugins (§15) register through the same door humans use.
 */
export { createRegistry, type Command, type Registry } from './registry.ts';
export { RESERVED, chordOf, formatShortcut, normalizeShortcut, type KeyPress } from './keys.ts';
