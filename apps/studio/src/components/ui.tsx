import Icon from './Icon';
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

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="field" title={hint}>
      <span className="field-label">{label}</span>
      <div className="field-control">
        <FieldLabel.Provider value={label}>{children}</FieldLabel.Provider>
      </div>
    </label>
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
