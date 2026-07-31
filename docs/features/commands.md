# Commands and the palette

**Design-doc section:** ARCHITECTURE §02 (`⌘K` reaches everything; the reserved keys), §13
(the palette), ENGINEERING_GUIDE §11 ("Commands, not handlers") ·
**Owner package(s):** `@geomotion/commands`, `apps/studio` ·
**Status:** shipped

## Problem

Every action in the editor was a click handler or a `case` in one `switch`. Three things
follow, and the third is the one that matters:

- **Nothing can enumerate the actions.** A palette has to list them; there was no list.
- **Shortcuts were a switch statement.** Two features could claim one key and nobody would
  know — one of them simply never fires, and which one depends on source order.
- **There is no door for anything that is not a person clicking.** §12's copilots and §15's
  plugins consume "the same typed API as humans — one capability model, one security review".
  A React handler is not an API. Without a registry, "what can be done to a document" has no
  answer that anything other than a mouse can read.

## User story

As a **YouTuber** I want `⌘K` and the name of the thing I want, because I do not remember
where "ungroup" lives in a menu I use twice a week. As a **plugin author** (§15) I want to
contribute a command and have it appear in the palette, the keymap and the menus at once.

## UX

- `⌘K` opens the palette; typing filters; `↑`/`↓` move; `Enter` runs; `Esc` closes.
- Results are **ranked**, not filtered — title prefix, then word prefix, then anywhere,
  including category and keywords. Typing "gr" finds *Group selection* before *Toggle text
  background*, which a plain `includes` would not.
- A command that cannot run right now is **greyed, not hidden**. One that vanishes when it
  does not apply teaches nobody it exists: "why is Ungroup grey" is a better question than
  "why can I not find Ungroup".
- Every row shows the shortcut the keyboard actually obeys, because both read the same list.

## Document model

None. Commands are not document state; they are the door document state is changed through.
`@geomotion/commands` depends on `core` alone and never sees a document.

## The split

| Package | Holds |
| --- | --- |
| `@geomotion/commands` | The mechanism: registry, chord normalisation, key resolution, palette ranking, collision detection. No DOM, no React, no store — tested in node. |
| `apps/studio/src/lib/commands.ts` | The list: 35 commands closing over the editor's store. |

A command's `run` is a closure its registrar supplies. That is what keeps the registry a pure
mechanism, and it is why registering one from a plugin worker later needs no new concept —
the host supplies a closure that posts a proposed transaction instead of calling the store.

```ts
interface Command {
  id: string;            // 'layer.duplicate' — stable; menus and AI both cite it
  title: string;
  category?: string;
  shortcut?: string;     // 'mod+shift+g'
  keywords?: string[];   // what people type instead of the title
  enabled?: () => boolean;
  hidden?: boolean;      // keyboard-only; still bindable, never listed
  run: () => void;
}
```

### Chords

Written `mod+shift+g`: lower case, modifiers in a fixed order, `mod` meaning ⌘ on a Mac and
Ctrl elsewhere. One spelling for both platforms — two would drift the first time a shortcut
was added on one of them. Everything normalises before comparison, so `Shift+Mod+G` and
`mod+shift+g` are the same binding, which is what lets the collision check catch the pair most
likely to collide: one shortcut written two ways by two people.

Shift is part of a chord only where it is not already in the key: `Shift+G` reports `G` and
means something, but `?` is *produced* by shift and reporting `shift+?` would match no binding
anyone would write.

The package takes a `{ key, meta, ctrl, shift, alt }` record rather than a `KeyboardEvent` —
a browser type in a package that runs in node under test.

## Transactions & commands

Commands call the store's actions, which run inside `transact()` as before. Nothing about
undo changes: a command is undoable exactly because it is the same edit the button made.

The keymap keeps one decision of its own — `Backspace` deletes the selected *keyframe* when a
keyframe is selected rather than the layer. That is a selection-shaped choice the delete
command cannot make, so it stays in the one place that knows what is selected.

## Evaluation & rendering

Untouched.

## Timeline / Inspector

Unchanged in this milestone. Toolbar and menu buttons still call store actions directly;
routing them through `commands.run(id)` is mechanical and comes with the surfaces that need
it (a menu that shows its shortcut, a plugin contributing a toolbar item).

## Entities & data

None.

## Plugin API

This is the contribution point §15 names (`contributes.commands`). Two properties already
hold: a command is a value, not a component, and `run` is a closure the host controls.

## Performance

A key press is a map lookup over 35 entries. Palette search is a scan over the same, per
keystroke, on a list that will not plausibly reach a thousand.

## Tests

- **Mechanism** (`packages/commands`, 20 tests): normalisation, chord matching, disabled
  commands falling through rather than swallowing a key, ranking order, hidden commands,
  and collisions reported however they were spelled.
- **The shipped list** (17 tests): no two commands claim one shortcut — §11's "collisions
  fail CI", as a check; every command has an id, title and category; §02's reserved keys
  belong to the features the design doc reserved them for; commands run against the store,
  are undoable, and refuse rather than throw when nothing is selected.
- **The palette** (7 tests): lists, narrows, runs on Enter, moves with arrows, greys what is
  disabled, says so when nothing matches, and shows the shortcut the keyboard obeys.
- **In a real browser**: `⌘K` from a real key press, typed "add a marker", `Enter` added the
  layer and closed the palette, `⌘D` duplicated it through the registry, and `V` still
  selects the tool §02 reserved it for. No page errors.
- Golden frames unchanged.

## Docs

Changelog. This doc. `ENGINEERING_GUIDE §2`'s package table gains the `commands` row it
already described.

## Future extensions

- **Route the toolbar, menus and layer-panel rows through `commands.run`**, so a button and
  its shortcut cannot disagree and every menu item can show its binding.
- **User-editable keymaps.** The registry already separates a command from its chord; what is
  missing is a persisted override map and a UI, plus a rule for what happens when an override
  collides.
- **`when` clauses** — a declarative enablement context (`selection.kind === 'layer'`) in place
  of a closure, which is what a plugin's command will need since it cannot read the store.
- **Command history in the palette**, so the thing you ran last is the first thing offered.
- **Plugin and copilot registration** through the same door (§12, §15).
