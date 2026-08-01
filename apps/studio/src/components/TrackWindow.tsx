import { staticTrack, windowOf } from '@geomotion/document';
import type { Track } from '@geomotion/document';
import { EASING_NAMES } from '@geomotion/animation';
import { useStore } from '../store';
import { Field, Num, Select, Toggle } from './ui';

/**
 * Start / End / Easing over a track that happens to be a plain two-key ramp.
 *
 * The controls people already know, kept — but the model underneath is now general, so
 * the same property can also be given a pause, a reversal, or a different curve per
 * segment by working on the timeline. §06's progressive disclosure, applied to a track:
 * the simple skin stays the front door.
 *
 * Once the track stops being a simple window the fields step aside rather than flatten
 * it. A Start box that quietly threw away a third keyframe would undo deliberate work
 * and give no sign it had.
 *
 * Lives here rather than inside `Inspector.tsx` because two panels drew it by hand and the
 * generated inspector now draws it for a third — `SchemaRows` cannot import from the panel
 * it replaces. See docs/features/generated-panels.md.
 */
export default function TrackWindow({
  label,
  layerId,
  prop,
  track,
  max,
}: {
  label: string;
  layerId: string;
  prop: string;
  track: Track<number>;
  max: number;
}) {
  const setWindow = useStore((s) => s.setLayerWindow);
  const w = windowOf(track);

  if (!w) {
    return (
      <p className="hint">
        {label} is keyframed beyond a simple window — edit its keys on the timeline.
      </p>
    );
  }

  return (
    <>
      <Field label="Start">
        <Num
          value={w.from}
          onChange={(from) => setWindow(layerId, prop, from, w.to, w.easing)}
          step={0.1}
          min={0}
          max={max}
          suffix="s"
        />
      </Field>
      <Field label="End">
        <Num
          value={w.to}
          onChange={(to) => setWindow(layerId, prop, w.from, to, w.easing)}
          step={0.1}
          min={0}
          max={max}
          suffix="s"
        />
      </Field>
      <Field label="Easing">
        <Select
          value={w.easing}
          onChange={(easing) => setWindow(layerId, prop, w.from, w.to, easing)}
          options={EASING_NAMES}
        />
      </Field>
    </>
  );
}

/**
 * The window, plus the toggle that turns it on.
 *
 * "Enabled" is derived, never stored: a property that never moves is a flat static track.
 * Turning it on restores a window over the layer's span — which is what the boolean used to
 * imply, and what a fresh layer's defaults give. This pairing is what the `window` row kind
 * generates, and what the clouds panel drew by hand before it was generated.
 */
export function TrackWindowRow({
  label,
  layerId,
  prop,
  track,
  from,
  max,
  off = 0,
  switchable = false,
}: {
  label: string;
  layerId: string;
  prop: string;
  track: Track<number>;
  /** Where a restored window starts — the layer's own `in`, so it opens over its span. */
  from: number;
  max: number;
  /** The constant a disabled property collapses to. */
  off?: number;
  /** Whether this property can be switched off entirely — see the `window` row kind. */
  switchable?: boolean;
}) {
  const update = useStore((s) => s.updateLayer);
  const setWindow = useStore((s) => s.setLayerWindow);
  const on = track.kind !== 'static';

  return (
    <>
      {switchable && (
        <Field label="Enabled">
          <Toggle
            value={on}
            onChange={(next) =>
              next
                ? setWindow(layerId, prop, from + 1.6, from + 4.6, 'easeInOutCubic')
                : update(layerId, { [prop]: staticTrack(off) } as never, prop)
            }
          />
        </Field>
      )}
      {(on || !switchable) && (
        <TrackWindow label={label} layerId={layerId} prop={prop} track={track} max={max} />
      )}
    </>
  );
}
