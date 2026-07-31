import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { emptyProject, layersOf } from '@geomotion/document';
import { useStore } from '../store';
import { commands, registerEditorCommands } from '../lib/commands';
import Palette from './Palette';

/**
 * ⌘K (ARCHITECTURE §02, §13).
 *
 * What is tested is that the palette *is* the registry: it lists what is registered, runs
 * what it lists, and refuses what is disabled. Nothing here knows about a specific command
 * beyond the two it uses as stand-ins.
 */

registerEditorCommands(() => null);

let closed = 0;
const open = () => render(<Palette onClose={() => (closed += 1)} />);
const rows = () => screen.getAllByRole('option').map((el) => el.textContent ?? '');

beforeEach(() => {
  closed = 0;
  useStore.setState({ selection: null, also: [] });
  useStore.getState().replaceProject(emptyProject());
});

describe('the palette', () => {
  it('lists commands, and narrows as you type', async () => {
    open();
    const all = rows().length;
    expect(all).toBeGreaterThan(10);

    await userEvent.type(screen.getByLabelText('Search commands'), 'marker');
    expect(rows().length).toBeLessThan(all);
    expect(rows().join(' ')).toContain('Add a marker');
  });

  it('runs the highlighted command on Enter, and closes first', async () => {
    open();
    await userEvent.type(screen.getByLabelText('Search commands'), 'add a marker');
    await userEvent.keyboard('{Enter}');

    expect(layersOf(useStore.getState().project)).toHaveLength(1);
    expect(closed).toBe(1);
  });

  it('moves the highlight with the arrow keys', async () => {
    open();
    await userEvent.type(screen.getByLabelText('Search commands'), 'add');
    const first = screen.getAllByRole('option')[0];
    await userEvent.keyboard('{ArrowDown}');
    expect(first).toHaveAttribute('aria-selected', 'false');
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true');
  });

  it('shows a command that cannot run right now, greyed rather than gone', async () => {
    /*
     * A command that vanishes when it does not apply teaches nobody that it exists. "Why is
     * Ungroup grey" is a better question than "why can I not find Ungroup".
     */
    open();
    await userEvent.type(screen.getByLabelText('Search commands'), 'ungroup');
    const row = screen.getAllByRole('option')[0]!;
    expect(row).toHaveAttribute('aria-disabled', 'true');

    await userEvent.click(row);
    expect(closed).toBe(0);
  });

  it('says so when nothing matches', async () => {
    open();
    await userEvent.type(screen.getByLabelText('Search commands'), 'xyzzy');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText(/No command matches/)).toBeInTheDocument();
  });

  it('closes on Escape without running anything', async () => {
    open();
    await userEvent.keyboard('{Escape}');
    expect(closed).toBe(1);
    expect(layersOf(useStore.getState().project)).toHaveLength(0);
  });

  it('shows the shortcut the keyboard actually obeys', async () => {
    // The same list, so the label and the binding cannot disagree — which is the whole
    // reason the palette reads the registry rather than a table of its own.
    open();
    await userEvent.type(screen.getByLabelText('Search commands'), 'play or pause');
    const row = screen.getAllByRole('option')[0]!;
    expect(row.querySelector('kbd')?.textContent?.toLowerCase()).toContain('space');
    expect(commands.get('play.toggle')?.shortcut).toBe('space');
  });
});
