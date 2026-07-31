import Icon, { type IconName } from './Icon';
import { createContext, useContext, useEffect, useRef, useState } from 'react';

/*
 * The label a field is currently rendering.
 *
 * `Field` wraps its children in a `<label>`, which names an `<input>` but *not* a
 * `<button>` — the implicit association only applies to labelable elements. So the
 * switches read as an unnamed "button" to a screen reader despite sitting under
 * visible text. Passing the text down lets a non-labelable control name itself,
 * without every call site repeating the string it already gave `Field`.
 */
const FieldLabel = createContext<string | undefined>(undefined);

export function Field({
  label,
  children,
  hint,
  right,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  /**
   * A slot beside the label — the source pip, today.
   *
   * Rendered *outside* the `<label>` on purpose. A control's accessible name is the
   * label's whole text content, so nesting the pip inside would fold the pip's own
   * label into it — Chrome announces the slider as "Size Fixed value — click to
   * animate" nested, and "Size" as a sibling. Measured, not assumed; the click
   * forwarding one might expect from a label does not happen for a button, so the name
   * is the actual reason.
   */
  right?: React.ReactNode;
}) {
  const field = (
    <label className="field" title={hint}>
      <span className="field-label">{label}</span>
      <div className="field-control">
        <FieldLabel.Provider value={label}>{children}</FieldLabel.Provider>
      </div>
    </label>
  );
  if (!right) return field;
  return (
    <div className="field-with-slot">
      {field}
      {right}
    </div>
  );
}

export function Section({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className={'section' + (open ? '' : ' collapsed')}>
      <div className="section-head">
        <button className="section-toggle" onClick={() => setOpen((o) => !o)}>
          <span className="chev">
            <Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} />
          </span>
          {title}
        </button>
        {right}
      </div>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

/** Number input that can also be scrubbed by dragging the label. */
export function Num({
  value,
  onChange,
  step = 1,
  min,
  max,
  precision = 2,
  suffix,
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  precision?: number;
  suffix?: string;
}) {
  const [text, setText] = useState(String(round(value, precision)));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(String(round(value, precision)));
  }, [value, precision]);

  const commit = (raw: string) => {
    const n = parseFloat(raw);
    if (!isFinite(n)) {
      setText(String(round(value, precision)));
      return;
    }
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    onChange(v);
  };

  return (
    <span className="num-wrap">
      <input
        className="num"
        type="number"
        step={step}
        value={text}
        onFocus={() => (focused.current = true)}
        onChange={(e) => {
          setText(e.target.value);
          commit(e.target.value);
        }}
        onBlur={(e) => {
          focused.current = false;
          commit(e.target.value);
        }}
      />
      {suffix && <span className="suffix">{suffix}</span>}
    </span>
  );
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 0.01,
  precision = 2,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  precision?: number;
}) {
  return (
    <span className="slider-wrap">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <span className="slider-value">{round(value, precision)}</span>
    </span>
  );
}

export function Color({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <span className="color-wrap">
      <input type="color" value={value.slice(0, 7)} onChange={(e) => onChange(e.target.value)} />
      <input className="color-text" value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
    </span>
  );
}

export function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: readonly (T | { value: T; label: string })[];
}) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => {
        const v = typeof o === 'string' ? o : o.value;
        const l = typeof o === 'string' ? o : o.label;
        return (
          <option key={v} value={v}>
            {l}
          </option>
        );
      })}
    </select>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label?: string }) {
  const fieldLabel = useContext(FieldLabel);
  return (
    <button
      className={'toggle' + (value ? ' on' : '')}
      onClick={() => onChange(!value)}
      type="button"
      // `switch` rather than a plain button: it reports on/off as state, so the
      // control announces what it *is* rather than only what it is called.
      role="switch"
      aria-checked={value}
      aria-label={label ? undefined : fieldLabel}
    >
      <span className="knob" />
      {label && <span className="toggle-label">{label}</span>}
    </button>
  );
}

export function Text({
  value,
  onChange,
  multiline,
  placeholder,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  /** for code-ish content like pasted GeoJSON, not for prose */
  mono?: boolean;
}) {
  const cls = 'text-input' + (mono ? ' mono' : '');
  if (multiline) {
    return (
      <textarea className={cls} rows={3} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    );
  }
  return <input className={cls} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

const round = (v: number, p: number) => Math.round(v * 10 ** p) / 10 ** p;

/**
 * A property's source, and the controls for changing it.
 *
 * ARCHITECTURE §04: "the inspector shows a source pip per property (grey static · teal
 * keyframed · violet bound · amber expression) and any property can be retargeted
 * between kinds in place". The colour is the whole point — with one glance down the
 * inspector you can see which properties move and which are pinned, without opening
 * anything.
 *
 * The diamond beside it is the keyframe at the playhead: filled when there is one,
 * hollow when there is not, and clicking it adds or removes. That is the shape every
 * animation tool uses, and copying it here is worth more than any better idea.
 */
const PIP: Record<string, { color: string; title: string }> = {
  static: { color: 'var(--dim)', title: 'Fixed value — click to animate' },
  keyframed: { color: '#22d3ee', title: 'Animated — click to freeze at the current value' },
  bound: { color: '#a78bfa', title: 'Bound to an entity fact' },
  expr: { color: '#ffbd2e', title: 'Driven by an expression' },
};

export function TrackPip({
  kind,
  hasKey,
  onToggleTrack,
  onToggleKey,
}: {
  kind: string;
  hasKey: boolean;
  onToggleTrack: () => void;
  onToggleKey: () => void;
}) {
  const pip = PIP[kind] ?? PIP.static!;
  const animated = kind === 'keyframed';
  return (
    <span className="track-pip">
      <button
        type="button"
        className="pip-dot"
        style={{ background: pip.color }}
        title={pip.title}
        aria-label={pip.title}
        onClick={onToggleTrack}
      />
      {animated && (
        <button
          type="button"
          className={'pip-key' + (hasKey ? ' on' : '')}
          title={hasKey ? 'Remove the keyframe here' : 'Add a keyframe here'}
          aria-label={hasKey ? 'Remove the keyframe here' : 'Add a keyframe here'}
          onClick={onToggleKey}
        />
      )}
    </span>
  );
}

/** One entry in a `Menu`. `danger` tints it; `disabled` keeps it visible but inert. */
export interface MenuItem {
  label: string;
  icon?: IconName;
  /** Class on the icon — how the layer-type accents reach an entry. */
  iconClass?: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/**
 * A button that opens a short list of actions.
 *
 * The layer row had four icon buttons — up, down, duplicate, delete — visible on every
 * row at all times. That is four targets to read past to reach the layer's name, and it
 * put a delete button one pixel from a reorder button on a row people click constantly.
 * Folding them behind one control puts the destructive action two deliberate steps away
 * and gives the row back to the thing it is actually about.
 *
 * Closes on outside pointer-down, on Escape, and after any choice. Escape is handled on
 * the wrapper rather than the document so it does not swallow the key from the rest of
 * the editor, where it also cancels a drawing tool.
 */
export function Menu({
  items,
  label = 'More',
  className = '',
  trigger,
  align = 'right',
}: {
  items: MenuItem[];
  label?: string;
  className?: string;
  /** Replaces the `…` button. The wrapper still owns open/close and the popover. */
  trigger?: { text: string; icon?: IconName; className?: string };
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  return (
    <div
      className={'menu ' + className}
      ref={box}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        className={trigger ? trigger.className ?? 'add-layer-btn' : 'icon-btn' + (open ? ' on' : '')}
        title={trigger ? undefined : label}
        aria-label={trigger ? undefined : label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {trigger ? (
          <>
            {trigger.icon && <Icon name={trigger.icon} size={13} />}
            {trigger.text}
          </>
        ) : (
          <Icon name="more" size={13} />
        )}
      </button>

      {open && (
        <div className={'menu-pop' + (align === 'left' ? ' left' : '')} role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              className={'menu-item' + (it.danger ? ' danger' : '')}
              disabled={it.disabled}
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                it.onSelect();
              }}
            >
              {it.icon && (
                <span className={'menu-glyph ' + (it.iconClass ?? '')}>
                  <Icon name={it.icon} size={12} />
                </span>
              )}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
