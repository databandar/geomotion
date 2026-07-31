import { beforeEach, describe, expect, it } from 'vitest';
import { RESERVED, formatShortcut } from '@geomotion/commands';
import { emptyProject, layersOf, projectWith, createGroup, addNode, transact } from '@geomotion/document';
import { useStore } from '../store';
import { commands, registerEditorCommands } from './commands';

/**
 * The editor's command list (ENGINEERING_GUIDE §11).
 *
 * The registry's mechanism is tested in its own package; what is tested here is the list —
 * that the promises §11 makes about it hold for the commands this editor actually ships.
 */

registerEditorCommands(() => null);

beforeEach(() => {
  useStore.setState({ selection: null, also: [], time: 0 });
  useStore.getState().replaceProject(emptyProject());
});

describe('the shipped command list', () => {
  it('has no two commands claiming one shortcut', () => {
    // §11: "collisions fail CI". This is that check. A collision is invisible in use — one
    // of the two simply never fires, and which one depends on registration order.
    expect(commands.collisions()).toEqual([]);
  });

  it('gives every command an id, a title and a category', () => {
    for (const command of commands.all()) {
      expect(command.id, command.title).toMatch(/^[a-z]+(\.[a-zA-Z]+)+$/);
      expect(command.title.length, command.id).toBeGreaterThan(2);
      // Hidden commands are keyboard-only and never listed, so they need no heading.
      if (!command.hidden) expect(command.category, command.id).toBeTruthy();
    }
  });

  it('keeps §02\'s reserved keys for what the design doc says they are', () => {
    /*
     * `V`, `Space`, `K`, `F`… are named in the editing philosophy. A feature quietly taking
     * one is how an editor ends up with a shortcut that does something surprising in one
     * panel — so a command claiming a reserved key has to be the feature it was reserved for.
     */
    const claimed: Record<string, string> = {
      v: 'tool.select',
      space: 'play.toggle',
      k: 'camera.capture',
    };
    for (const [key, id] of Object.entries(claimed)) {
      expect(RESERVED[key], `${key} should be reserved`).toBeTruthy();
      expect(commands.all().find((c) => c.shortcut === key)?.id).toBe(id);
    }
  });

  it('writes every shortcut in a form a person can read', () => {
    for (const command of commands.all()) {
      if (command.shortcut) expect(formatShortcut(command.shortcut).length).toBeGreaterThan(0);
    }
  });
});

describe('commands run against the store', () => {
  it('adds a layer', () => {
    expect(commands.run('layer.add.marker')).toBe(true);
    expect(layersOf(useStore.getState().project)).toHaveLength(1);
  });

  it('is undoable, like any other edit', () => {
    commands.run('layer.add.text');
    commands.run('edit.undo');
    expect(layersOf(useStore.getState().project)).toHaveLength(0);
  });

  it('refuses a layer command with nothing selected, rather than throwing', () => {
    expect(commands.run('layer.duplicate')).toBe(false);
    expect(commands.run('layer.delete')).toBe(false);
  });

  it('only offers Ungroup when a group is selected', () => {
    const layer = useStore.getState().addLayer('marker');
    useStore.getState().select({ kind: 'layer', id: layer.id });
    expect(commands.get('layer.ungroup')?.enabled?.()).toBe(false);

    const group = createGroup('Beat');
    const project = transact(useStore.getState().project, (d) => addNode(d, group)).next;
    useStore.setState({ project, selection: { kind: 'layer', id: group.id } });
    expect(commands.get('layer.ungroup')?.enabled?.()).toBe(true);
  });

  it('resolves a key press to the command it names', () => {
    expect(commands.forKey({ key: 'd', meta: true })).toBeUndefined(); // nothing selected
    const layer = useStore.getState().addLayer('marker');
    useStore.getState().select({ kind: 'layer', id: layer.id });
    expect(commands.forKey({ key: 'd', meta: true })?.id).toBe('layer.duplicate');
  });

  it('groups through the same command the keyboard uses', () => {
    const a = useStore.getState().addLayer('marker');
    const b = useStore.getState().addLayer('marker');
    useStore.getState().selectMany(a.id, [a.id, b.id]);
    commands.run('layer.group');

    const project = useStore.getState().project;
    expect(Object.values(project.nodes).some((n) => n.type === 'group')).toBe(true);
    expect(layersOf(project)).toHaveLength(2);
  });

  it('steps the selection up and down the draw order', () => {
    const a = useStore.getState().addLayer('marker');
    const b = useStore.getState().addLayer('text');
    useStore.getState().select({ kind: 'layer', id: a.id });
    commands.run('select.next');
    expect(useStore.getState().selection?.id).toBe(b.id);
    commands.run('select.previous');
    expect(useStore.getState().selection?.id).toBe(a.id);
  });

  it('selects from nothing rather than doing nothing', () => {
    // A dead key is worse than a guess: with no selection, "the layer above" is the top one.
    useStore.getState().addLayer('marker');
    const top = useStore.getState().addLayer('text');
    useStore.getState().select(null);
    commands.run('select.next');
    expect(useStore.getState().selection?.id).toBe(top.id);
  });

  it('leaves the document alone for a view command', () => {
    const before = useStore.getState().project;
    commands.run('view.scenes');
    expect(useStore.getState().project).toBe(before);
    expect(useStore.getState().place).toBe('scenes');
  });
});

describe('the palette source', () => {
  it('finds a command by what someone would type', () => {
    expect(commands.search('group').map((c) => c.id)).toContain('layer.group');
    expect(commands.search('choropleth').map((c) => c.id)).toContain('layer.add.regions');
    expect(commands.search('zoom to fit').map((c) => c.id)).toContain('camera.fit');
  });

  it('hides the keyboard-only ones', () => {
    const ids = commands.search('').map((c) => c.id);
    expect(ids).not.toContain('play.stepForward');
    expect(ids).toContain('play.toggle');
  });

  it('offers something for every category', () => {
    const cats = new Set(commands.all().filter((c) => !c.hidden).map((c) => c.category));
    expect([...cats].sort()).toEqual(['Add', 'Camera', 'Edit', 'Layer', 'Select', 'Tools', 'Transport', 'View']);
  });
});

describe('a project built only through commands', () => {
  it('renders as a document like any other', () => {
    // The point of §11: an action taken from the palette, a shortcut or a toolbar button is
    // the same document edit, so a composition made entirely from commands is ordinary.
    useStore.getState().replaceProject(projectWith([]));
    commands.run('layer.add.regions');
    commands.run('layer.add.text');
    commands.run('layer.duplicate');
    expect(layersOf(useStore.getState().project).map((l) => l.type)).toEqual(['regions', 'text', 'text']);
  });
});
