/** The long edge a draft is capped to. Chosen with the encoder's cost in mind. */
export const DRAFT_LONG_EDGE = 960;

/**
 * The size a draft renders at, for a composition of `width` x `height`.
 *
 * A draft exists to check timing and layout, so the one thing it must not change is
 * the framing. This used to pick between 960x540 and 540x960 on nothing but
 * portrait-versus-landscape, which is right for the two 16:9 presets and wrong for the
 * others: a 1080x1080 square composition rendered as a 960x540 widescreen draft, so
 * everything positioned relative to the frame — titles, the legend, the readout card —
 * sat somewhere it would not sit in the final render. Square is a shipped preset.
 *
 * Scaling down only. A draft of an already-small composition has nothing to gain from
 * being enlarged, and enlarging it costs encoder time for pixels nobody asked for.
 *
 * Both dimensions are rounded to even numbers because H.264 4:2:0 chroma is subsampled
 * by two and an odd dimension is not encodable.
 */
export function draftSize(width, height) {
  const long = Math.max(width, height);
  if (!Number.isFinite(long) || long <= 0) return { width: DRAFT_LONG_EDGE, height: DRAFT_LONG_EDGE };

  const k = Math.min(1, DRAFT_LONG_EDGE / long);
  const even = (n) => Math.max(2, Math.round((n * k) / 2) * 2);
  return { width: even(width), height: even(height) };
}
