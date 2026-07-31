import { describe, expect, it, vi } from 'vitest';
import { createRegistry } from './registry.ts';
import { chordOf, formatShortcut, normalizeShortcut } from './keys.ts';

/**
 * The registry is the door every surface goes through (§11), so the properties that matter
 * are: a chord resolves to exactly one command, a disabled command is a no-op rather than a
 * throw, and two commands can never claim one shortcut without CI saying so.
 */

const cmd = (id: string, over: Partial<Parameters<ReturnType<typeof createRegistry>['register']>[0]> = {}) => ({
  id,
  title: id,
  run: () => {},
  ...over,
});

describe('normalizeShortcut', () => {
  it('puts modifiers in one order, so two spellings compare equal', () => {
    expect(normalizeShortcut('Shift+Mod+G')).toBe('mod+shift+g');
    expect(normalizeShortcut('mod+shift+g')).toBe('mod+shift+g');
  });

  it('treats cmd, ctrl and meta as the same modifier', () => {
    // Written once, bound on both platforms. Two spellings would drift the first time
    // someone added a shortcut on one of them.
    expect(normalizeShortcut('cmd+k')).toBe(normalizeShortcut('ctrl+k'));
  });

  it('names the keys nobody can write', () => {
    expect(normalizeShortcut('space')).toBe('space');
    expect(normalizeShortcut('Escape')).toBe('esc');
  });
});

describe('chordOf', () => {
  it('matches the binding a person wrote', () => {
    expect(chordOf({ key: 'g', meta: true, shift: true })).toBe('mod+shift+g');
    expect(chordOf({ key: ' ' })).toBe('space');
    expect(chordOf({ key: 'ArrowLeft', shift: true })).toBe('shift+left');
  });

  it('does not report shift twice for a key shift produced', () => {
    // `?` only exists with shift held; calling that chord `shift+?` would match no binding
    // anyone would ever write.
    expect(chordOf({ key: '?', shift: true })).toBe('?');
  });

  it('keeps shift for a letter, where it means something', () => {
    expect(chordOf({ key: 'G', shift: true })).toBe('shift+g');
    expect(chordOf({ key: 'g' })).toBe('g');
  });
});

describe('formatShortcut', () => {
  it('reads as the platform writes it', () => {
    expect(formatShortcut('mod+shift+g', true)).toBe('⌘⇧G');
    expect(formatShortcut('mod+shift+g', false)).toBe('Ctrl+Shift+G');
    expect(formatShortcut('space', true)).toBe('Space');
  });
});

describe('the registry', () => {
  it('runs a command by id', () => {
    const run = vi.fn();
    const r = createRegistry();
    r.register(cmd('a.b', { run }));
    expect(r.run('a.b')).toBe(true);
    expect(run).toHaveBeenCalledOnce();
  });

  it('is a no-op for an id nobody registered', () => {
    // A stale menu item and a keystroke both reach here; neither should throw.
    expect(createRegistry().run('nothing')).toBe(false);
  });

  it('refuses to run a disabled command', () => {
    const run = vi.fn();
    const r = createRegistry();
    r.register(cmd('a.b', { run, enabled: () => false }));
    expect(r.run('a.b')).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it('resolves a key press to its command', () => {
    const r = createRegistry();
    r.register(cmd('group', { shortcut: 'Mod+G' }), cmd('ungroup', { shortcut: 'mod+shift+g' }));
    expect(r.forKey({ key: 'g', meta: true })?.id).toBe('group');
    expect(r.forKey({ key: 'G', meta: true, shift: true })?.id).toBe('ungroup');
    expect(r.forKey({ key: 'q' })).toBeUndefined();
  });

  it('lets a disabled command fall through rather than swallowing the key', () => {
    // Otherwise ⌘G would do nothing at all while a *different* command that could have
    // handled it sat behind it.
    const r = createRegistry();
    r.register(cmd('off', { shortcut: 'mod+g', enabled: () => false }));
    expect(r.forKey({ key: 'g', meta: true })).toBeUndefined();
  });

  it('replaces a command registered twice, so a dev reload does not throw', () => {
    const r = createRegistry();
    r.register(cmd('a.b', { title: 'first' }));
    r.register(cmd('a.b', { title: 'second' }));
    expect(r.all()).toHaveLength(1);
    expect(r.get('a.b')?.title).toBe('second');
  });

  it('reports two commands claiming one shortcut, however it was spelled', () => {
    // §11: collisions fail CI. Spelling is why this normalises first — the pair most likely
    // to collide is the same binding written two ways by two people.
    const r = createRegistry();
    r.register(cmd('one', { shortcut: 'mod+g' }), cmd('two', { shortcut: 'Cmd+G' }));
    expect(r.collisions()).toEqual([{ shortcut: 'mod+g', ids: ['one', 'two'] }]);
  });

  it('reports nothing when every shortcut is unique', () => {
    const r = createRegistry();
    r.register(cmd('one', { shortcut: 'mod+g' }), cmd('two', { shortcut: 'mod+d' }), cmd('three'));
    expect(r.collisions()).toEqual([]);
  });
});

describe('palette search', () => {
  const r = createRegistry();
  r.register(
    cmd('layer.group', { title: 'Group selection', category: 'Layer' }),
    cmd('text.background', { title: 'Toggle text background', category: 'Text' }),
    cmd('view.grid', { title: 'Show grid', category: 'View', keywords: ['graticule'] }),
    cmd('secret', { title: 'Internal thing', hidden: true }),
  );

  it('lists everything visible for an empty query', () => {
    expect(r.search('').map((c) => c.id)).toEqual(['layer.group', 'text.background', 'view.grid']);
  });

  it('puts a title prefix before a word prefix before a loose match', () => {
    // "gr" should find Group first, not Background, which is the whole reason for ranking.
    expect(r.search('gr').map((c) => c.id)).toEqual(['layer.group', 'view.grid', 'text.background']);
  });

  it('matches a keyword nobody put in the title', () => {
    expect(r.search('graticule').map((c) => c.id)).toEqual(['view.grid']);
  });

  it('matches the category, so "layer" finds a layer command', () => {
    expect(r.search('layer').map((c) => c.id)).toContain('layer.group');
  });

  it('never shows a hidden command', () => {
    expect(r.search('internal')).toEqual([]);
  });
});
