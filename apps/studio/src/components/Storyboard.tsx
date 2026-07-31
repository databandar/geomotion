import { useStore } from '../store';
import { blockAt, layersOf, storyInOrder } from '@geomotion/document';

/**
 * The storyboard — v2 §10, §13's Story workspace.
 *
 * "Scenes as slide thumbnails … read the narration under each card." Scenes do not exist
 * yet, so the cards are story blocks, which is the unit that does: a block already owns a
 * narration line and the layers it choreographs. When scenes arrive they group these
 * rather than replace them.
 *
 * The point is reading. A timeline is the right tool for *when* something happens and the
 * wrong one for *what is being said* — the lane shows a truncated line in a chip a
 * centimetre wide. This shows the script, in order, with the beat you are looking at
 * marked.
 */
export default function Storyboard() {
  const story = useStore((s) => s.project.story);
  const time = useStore((s) => s.time);
  const scrub = useStore((s) => s.scrub);
  const layers = useStore((s) => layersOf(s.project));

  if (story.length === 0) {
    return (
      <div className="storyboard">
        <div className="panel-head">
          <span>Story</span>
        </div>
        <p className="hint pad">
          No story blocks. A composed project has one per beat; layers added by hand are
          not part of a block until you make one.
        </p>
      </div>
    );
  }

  const here = blockAt(story, time);

  return (
    <div className="storyboard">
      <div className="panel-head">
        <span>Story</span>
        <span className="dim">{story.length}</span>
      </div>

      {storyInOrder(story).map((b, i) => (
        <button
          key={b.id}
          type="button"
          className={'story-card' + (here?.id === b.id ? ' now' : '')}
          // Scrubbing to the block is what makes the card a way *into* the composition
          // rather than a read-only summary.
          onClick={() => scrub(b.t)}
          title={`Jump to ${b.t.toFixed(1)}s`}
        >
          <span className="card-n">{i + 1}</span>
          <span className="card-body">
            <span className="card-say">{b.say ?? b.onScreen ?? <em>no line</em>}</span>
            <span className="card-meta">
              {b.t.toFixed(1)}s · {b.d.toFixed(1)}s
              {b.kind ? ` · ${b.kind}` : ''}
              {' · '}
              {/* Counted against the project, so a block naming a deleted layer says so
                  rather than reporting a number that is no longer true. */}
              {b.nodes.filter((id) => layers.some((l) => l.id === id)).length} layer
              {b.nodes.length === 1 ? '' : 's'}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
