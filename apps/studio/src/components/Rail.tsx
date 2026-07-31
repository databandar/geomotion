import { useStore } from '../store';
import Icon, { type IconName } from './Icon';
import { resolvedTheme } from '../lib/theme';

/**
 * The left rail — the editor's top-level places.
 *
 * Icons *with* labels, not icons alone. A rail of seven unlabelled glyphs is a memory
 * test, and the width it saves is width the panel beside it does not need. Every entry is
 * a real destination, so the rail says what the app can do without anything being opened.
 *
 * Sections that have no panel yet are shown and disabled rather than hidden: a tool that
 * reveals its shape as you unlock it is harder to learn than one whose shape is visible
 * from the first minute, and a disabled control with a reason is honest about what is
 * coming.
 */
const PLACES: { id: string; label: string; icon: IconName; ready?: boolean; why?: string }[] = [
  { id: 'layers', label: 'Layers', icon: 'layers', ready: true },
  { id: 'assets', label: 'Assets', icon: 'assets', why: 'The asset browser is not built yet' },
  { id: 'audio', label: 'Audio', icon: 'audio', ready: true },
  { id: 'camera', label: 'Camera', icon: 'camera', ready: true },
  { id: 'text', label: 'Text', icon: 'text', ready: true },
  { id: 'data', label: 'Data', icon: 'data', ready: true },
  { id: 'scenes', label: 'Scenes', icon: 'scenes', why: 'Story blocks do this job for now' },
];

export default function Rail() {
  const place = useStore((s) => s.place);
  const setPlace = useStore((s) => s.setPlace);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);

  // Cycles system → light → dark → system, so the icon always shows what you would get.
  const next = theme === 'system' ? 'light' : theme === 'light' ? 'dark' : 'system';
  const showing = resolvedTheme(theme);

  return (
    <nav className="rail" aria-label="Sections">
      {PLACES.map((p) => (
        <button
          key={p.id}
          type="button"
          className={'rail-btn' + (place === p.id ? ' on' : '')}
          disabled={!p.ready}
          title={p.ready ? p.label : `${p.label} — ${p.why}`}
          aria-current={place === p.id ? 'page' : undefined}
          onClick={() => setPlace(p.id)}
        >
          <Icon name={p.icon} size={17} />
          <span className="rail-label">{p.label}</span>
        </button>
      ))}

      <div className="rail-spacer" />

      <button
        type="button"
        className="rail-btn"
        title={`Theme: ${theme}${theme === 'system' ? ` (${showing})` : ''} — click for ${next}`}
        aria-label={`Theme: ${theme}. Switch to ${next}`}
        onClick={() => setTheme(next)}
      >
        <Icon name={showing === 'light' ? 'sun' : 'moon'} size={17} />
        <span className="rail-label">{theme === 'system' ? 'Auto' : showing === 'light' ? 'Light' : 'Dark'}</span>
      </button>
      <button type="button" className="rail-btn" disabled title="Help — not built yet">
        <Icon name="help" size={17} />
        <span className="rail-label">Help</span>
      </button>
      <button type="button" className="rail-btn" disabled title="Settings — not built yet">
        <Icon name="settings" size={17} />
        <span className="rail-label">Settings</span>
      </button>
    </nav>
  );
}
