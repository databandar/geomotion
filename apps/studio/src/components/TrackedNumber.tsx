/**
 * The tracked-number row, and the expression box behind its amber pip.
 *
 * Its own module because two things draw it now: the hand-written layer panels, and the
 * generated inspector (SchemaRows). §11 puts reusable property editors in one place for
 * exactly this reason — a control written inline in one feature is a control the next
 * feature reimplements slightly differently.
 */
import { useState } from 'react';
import { hasKeyAt } from '@geomotion/document';
import type { Track } from '@geomotion/document';
import { compileExpr, evalTrack } from '@geomotion/animation';
import { useStore } from '../store';
import { Field, Slider, TrackPip } from './ui';

export default function TrackedNumber({
  label,
  layerId,
  prop,
  track,
  ...num
}: {
  label: string;
  layerId: string;
  prop: string;
  track: Track<number>;
  min: number;
  max: number;
  step?: number;
  precision?: number;
}) {
  const time = useStore((s) => s.time);
  const setTrack = useStore((s) => s.setLayerTrack);
  const toggleTrack = useStore((s) => s.toggleLayerTrack);
  const toggleKey = useStore((s) => s.toggleLayerKey);
  const toggleExpr = useStore((s) => s.toggleLayerExpr);
  // A fallback of 0 rather than none: this feeds a slider and a readout, and an
  // `undefined` here makes React swap the input to uncontrolled mid-edit.
  const value = evalTrack(track, time, { fallback: 0 });

  return (
    <Field
      label={label}
      right={
        <TrackPip
          kind={track.kind}
          hasKey={hasKeyAt(track, time)}
          onToggleTrack={() => toggleTrack(layerId, prop, value)}
          onToggleKey={() => toggleKey(layerId, prop, value)}
          onToggleExpr={() => toggleExpr(layerId, prop, value)}
        />
      }
    >
      {track.kind === 'expr' ? (
        <ExprField layerId={layerId} prop={prop} track={track} value={value} />
      ) : (
        <Slider value={value} onChange={(v) => setTrack(layerId, prop, v, prop)} {...num} />
      )}
    </Field>
  );
}

/**
 * The formula, with what it currently evaluates to.
 *
 * Held in local state and committed on change rather than bound straight to the store:
 * an expression is invalid at almost every keystroke on the way to being right — `8 + ` is
 * a normal thing to have typed — and writing each prefix into the document would fill the
 * undo stack with fragments.
 *
 * The readout underneath is the whole point of the control. An expression is the one
 * track kind whose value you cannot see by looking at it, so the panel says both what was
 * written and what it comes to at the playhead.
 */
function ExprField({
  layerId,
  prop,
  track,
  value,
}: {
  layerId: string;
  prop: string;
  track: Extract<Track<number>, { kind: 'expr' }>;
  value: number;
}) {
  const setExpr = useStore((s) => s.setLayerExpr);
  const [draft, setDraft] = useState(track.source);
  const compiled = compileExpr(draft);
  // Names the formula reads that nothing has bound. Reported separately from a syntax
  // error because the formula is *right* — it is the wiring that is missing.
  const unbound = compiled.refs.filter((r) => !track.inputs?.[r]);

  // A source changed from elsewhere — undo, or loading a project — has to reach the box.
  if (track.source !== draft && document.activeElement?.getAttribute('data-expr') !== prop) {
    setDraft(track.source);
  }

  return (
    <div className="expr-field">
      <input
        className={'text-in mono' + (compiled.ok ? '' : ' bad')}
        data-expr={prop}
        value={draft}
        spellCheck={false}
        aria-label={`${prop} expression`}
        onChange={(e) => {
          setDraft(e.target.value);
          setExpr(layerId, prop, e.target.value);
        }}
      />
      <span className={'expr-note' + (compiled.ok ? '' : ' bad')}>
        {!compiled.ok
          ? compiled.error
          : unbound.length
            ? `unbound: ${unbound.join(', ')}`
            : `= ${Number(value.toFixed(3))}`}
      </span>
    </div>
  );
}
