import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createLayer, emptyProject, projectWith, type StoryBlock } from '@geomotion/document';
import Storyboard from './Storyboard';
import { useStore } from '../store';

/**
 * The storyboard exists so a writer can read the script. A timeline is the right tool for
 * *when* something happens and the wrong one for *what is being said* — the lane shows a
 * truncated line in a chip a centimetre wide.
 */
const block = (id: string, t: number, d: number, say?: string, extra: Partial<StoryBlock> = {}): StoryBlock => ({
  id, t, d, nodes: [], ...(say ? { say } : {}), ...extra,
});

function withStory(story: StoryBlock[], layers = [createLayer('marker', 0)]) {
  useStore.setState({ project: projectWith(layers, { duration: 60, story }), time: 0 });
}

beforeEach(() => useStore.setState({ project: emptyProject(), time: 0 }));

describe('Storyboard', () => {
  it('says so plainly when a project has no story', () => {
    // Every project built layer by layer has none; an empty panel reads as broken.
    withStory([]);
    render(<Storyboard />);
    expect(screen.getByText(/No story blocks/)).toBeInTheDocument();
  });

  it('reads the script in playing order, not storage order', () => {
    withStory([block('b', 10, 5, 'Second line'), block('a', 0, 5, 'First line')]);
    render(<Storyboard />);
    const cards = screen.getAllByRole('button');
    expect(cards[0]).toHaveTextContent('First line');
    expect(cards[1]).toHaveTextContent('Second line');
  });

  it('marks the beat under the playhead', () => {
    // The script and the picture agreeing at a glance is the whole point of the panel.
    withStory([block('a', 0, 5, 'First'), block('b', 5, 5, 'Second')]);
    useStore.setState({ time: 7 });
    render(<Storyboard />);
    // The card is the container now that it holds a context picker beside the jump button.
    expect(screen.getByText('Second').closest('.story-card')).toHaveClass('now');
    expect(screen.getByText('First').closest('.story-card')).not.toHaveClass('now');
  });

  it('jumps the playhead to a block when its card is clicked', async () => {
    // What makes a card a way into the composition rather than a read-only summary.
    withStory([block('a', 0, 5, 'First'), block('b', 12, 5, 'Second')]);
    render(<Storyboard />);
    await userEvent.click(screen.getByText('Second'));
    expect(useStore.getState().time).toBe(12);
  });

  it('falls back to the on-screen heading, then says there is no line', () => {
    withStory([block('a', 0, 5, undefined, { onScreen: 'A heading' }), block('b', 5, 5)]);
    render(<Storyboard />);
    expect(screen.getByText('A heading')).toBeInTheDocument();
    expect(screen.getByText('no line')).toBeInTheDocument();
  });

  it('counts only layers the project still has', () => {
    /*
     * A block names layers by id, and a layer can be deleted from under it. Reporting the
     * stored count would keep claiming a number that is no longer true.
     */
    const layer = createLayer('marker', 0);
    withStory([block('a', 0, 5, 'Line', { nodes: [layer.id, 'deleted'] })], [layer]);
    render(<Storyboard />);
    expect(screen.getByText(/1 layers/)).toBeInTheDocument();
  });
});
