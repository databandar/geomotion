import { useEffect, useRef, useState } from 'react';
import { formatShortcut } from '@geomotion/commands';
import type { Command } from '@geomotion/commands';
import { commands } from '../lib/commands';
import Icon from './Icon';

/**
 * ⌘K — "the palette reaches everything" (ARCHITECTURE §02, §13).
 *
 * It draws the command registry and nothing else, which is the point: an action that is not
 * a registered command is unreachable here, and an action that is appears without anyone
 * adding it. That is the same property the keymap has, and it is why both read the same list.
 *
 * A disabled command is shown greyed rather than hidden. A command that vanishes when it does
 * not apply teaches nobody that it exists — "why can I not find Ungroup" is a worse question
 * than "why is Ungroup grey", and the answer to the second is visible on the row.
 */
export default function Palette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [at, setAt] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const results = commands.search(query);
  // Clamped rather than reset: typing narrows the list under a cursor that was already
  // moving, and jumping back to the top on every keystroke makes it impossible to aim.
  const index = Math.min(at, Math.max(0, results.length - 1));

  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    // Guarded: `scrollIntoView` is absent in jsdom and its options are not universal, and
    // keeping the highlighted row in view is a nicety — never a reason for a render to throw.
    const row = listRef.current?.querySelector('.palette-row.at');
    row?.scrollIntoView?.({ block: 'nearest' });
  }, [index, query]);

  const choose = (command: Command | undefined) => {
    if (!command || command.enabled?.() === false) return;
    // Closed first: a command that opens a dialog or moves focus should not have to fight a
    // palette that is still on top of it.
    onClose();
    command.run();
  };

  return (
    <div className="palette-backdrop" onPointerDown={onClose} role="presentation">
      <div
        className="palette"
        role="dialog"
        aria-label="Command palette"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="palette-input">
          <Icon name="search" size={15} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Type a command…"
            aria-label="Search commands"
            spellCheck={false}
            onChange={(e) => {
              setQuery(e.target.value);
              setAt(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setAt(Math.min(index + 1, results.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setAt(Math.max(index - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                choose(results[index]);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
          />
        </div>

        <div className="palette-list" ref={listRef} role="listbox" aria-label="Commands">
          {results.map((command, i) => {
            const disabled = command.enabled?.() === false;
            return (
              <div
                key={command.id}
                role="option"
                aria-selected={i === index}
                aria-disabled={disabled}
                className={'palette-row' + (i === index ? ' at' : '') + (disabled ? ' off' : '')}
                onPointerEnter={() => setAt(i)}
                onClick={() => choose(command)}
              >
                <span className="palette-title">{command.title}</span>
                {command.category && <span className="palette-cat">{command.category}</span>}
                {command.shortcut && <kbd>{formatShortcut(command.shortcut, isMac)}</kbd>}
              </div>
            );
          })}
          {results.length === 0 && <p className="hint pad">No command matches “{query}”.</p>}
        </div>
      </div>
    </div>
  );
}

/**
 * Which glyphs the shortcuts are drawn with.
 *
 * Read once from the platform rather than per render. `navigator.platform` is deprecated and
 * still the only thing that answers this in every browser; a wrong guess costs a `⌘` where a
 * `Ctrl` belongs, which is a cosmetic error, so a deprecated read is the right trade.
 */
const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform ?? '');
