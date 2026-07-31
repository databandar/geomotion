/**
 * The command registry — ENGINEERING_GUIDE §11, ARCHITECTURE §13.
 *
 * "Every user-visible action is a registered command with an id, a title, and an optional
 * shortcut; toolbars, menus, shortcuts, and the ⌘K palette all bind to commands. UI
 * components never call `transact()` directly."
 *
 * Why one registry rather than handlers on buttons: four surfaces need the same list, and
 * three of them cannot be written by hand. A palette has to enumerate every action. A keymap
 * has to resolve a chord to exactly one of them. An AI copilot (§12) and a plugin (§15)
 * consume the same door humans do — "one capability model, one security review" — and neither
 * can call a React handler. The list also becomes the thing a shortcut-collision test can
 * read, which is what makes §11's "collisions fail CI" a check rather than a hope.
 *
 * What this package deliberately does not know: the editor. A command's `run` is a closure
 * the app supplies, already holding whatever it needs. That keeps the registry a pure
 * mechanism — registration, resolution, search — testable in node, with no store, no DOM and
 * no React anywhere near it.
 */
import { chordOf, normalizeShortcut, type KeyPress } from './keys.ts';

export interface Command {
  /** Stable, dotted, and never rewritten: `layer.duplicate`. Menus and AI both cite it. */
  id: string;
  /** How a person reads it in the palette. Sentence case, no trailing punctuation. */
  title: string;
  /** Groups it in the palette — "Layer", "Timeline", "Camera". */
  category?: string;
  /** A chord, written `mod+shift+g`. See keys.ts. */
  shortcut?: string;
  /** Extra words the palette should match on — synonyms for what people actually type. */
  keywords?: string[];
  /**
   * Whether it can run right now.
   *
   * The palette greys it out rather than hiding it: a command that vanishes when it does not
   * apply teaches nobody that it exists, and "why can I not find Ungroup" is a worse question
   * than "why is Ungroup grey".
   */
  enabled?: () => boolean;
  /** Hidden from the palette — still bindable and still runnable by id. */
  hidden?: boolean;
  run: () => void;
}

export interface Registry {
  register: (...commands: Command[]) => void;
  /** Everything registered, in registration order. */
  all: () => Command[];
  get: (id: string) => Command | undefined;
  /**
   * Run a command by id. Returns whether it ran — a disabled or unknown command is a
   * no-op rather than a throw, because a keystroke and a stale menu item both reach here.
   */
  run: (id: string) => boolean;
  /** The command a key press invokes, if any. */
  forKey: (press: KeyPress) => Command | undefined;
  /** Palette results for `query`, best first. */
  search: (query: string) => Command[];
  /** Shortcuts claimed by more than one command. Empty, or CI fails (§11). */
  collisions: () => { shortcut: string; ids: string[] }[];
}

export function createRegistry(): Registry {
  const commands = new Map<string, Command>();

  const register: Registry['register'] = (...incoming) => {
    for (const command of incoming) {
      /*
       * Replacing by id is deliberate: a dev-server reload re-runs the registration module,
       * and throwing on the second pass would make the editor unusable in development. Two
       * *different* commands wanting one id is a real conflict, but it is not detectable
       * here — the collision check covers the case that actually bites, which is two
       * commands claiming one shortcut.
       */
      commands.set(command.id, { ...command, ...(command.shortcut ? { shortcut: normalizeShortcut(command.shortcut) } : {}) });
    }
  };

  const enabled = (command: Command) => command.enabled?.() !== false;

  return {
    register,
    all: () => [...commands.values()],
    get: (id) => commands.get(id),

    run: (id) => {
      const command = commands.get(id);
      if (!command || !enabled(command)) return false;
      command.run();
      return true;
    },

    forKey: (press) => {
      const chord = chordOf(press);
      for (const command of commands.values()) {
        if (command.shortcut === chord && enabled(command)) return command;
      }
      return undefined;
    },

    search: (query) => {
      const q = query.trim().toLowerCase();
      const visible = [...commands.values()].filter((c) => !c.hidden);
      if (!q) return visible;

      /*
       * Ranked, not filtered: someone typing "gr" wants Group before Background, and a
       * flat `includes` filter puts them in registration order, which is arbitrary. Three
       * tiers — title prefix, word prefix, anywhere — is enough to feel right and small
       * enough to reason about. Ties keep registration order, so the list never reshuffles
       * for reasons the user cannot see.
       */
      const scored = visible
        .map((command) => {
          const title = command.title.toLowerCase();
          const words = title.split(/\s+/);
          const hay = [title, command.category?.toLowerCase() ?? '', ...(command.keywords ?? [])].join(' ');
          if (title.startsWith(q)) return { command, rank: 0 };
          if (words.some((w) => w.startsWith(q))) return { command, rank: 1 };
          if (hay.includes(q)) return { command, rank: 2 };
          return { command, rank: -1 };
        })
        .filter((s) => s.rank >= 0);

      return scored.sort((a, b) => a.rank - b.rank).map((s) => s.command);
    },

    collisions: () => {
      const byShortcut = new Map<string, string[]>();
      for (const command of commands.values()) {
        if (!command.shortcut) continue;
        const ids = byShortcut.get(command.shortcut);
        if (ids) ids.push(command.id);
        else byShortcut.set(command.shortcut, [command.id]);
      }
      return [...byShortcut.entries()]
        .filter(([, ids]) => ids.length > 1)
        .map(([shortcut, ids]) => ({ shortcut, ids }));
    },
  };
}
