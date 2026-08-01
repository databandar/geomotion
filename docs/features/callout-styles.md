# The readout has a style, not a switch

**Design-doc section:** ARCHITECTURE §07 (region layers; legends bind to the same scale object
so they cannot disagree with the map), §02 (never a dialog; every number scrubs) ·
**Owner package(s):** `@geomotion/document`, `@geomotion/renderer`, `apps/studio` ·
**Status:** shipped — format 10

## Problem

The active region's readout had exactly one look — a glass card — and one control, a boolean.
Asked for: more looks, and *"no card at all where we just see the numbers"*.

**Half of that already worked.** `showCallout: false` drew nothing, and `tour.labelAll`
printed every region's value in the outro. So "no card" was reachable and nobody could find
it, which is a naming problem wearing a feature request's clothes: a checkbox called "Callout
card" does not read as "how do you want this shown".

The genuinely missing half is **looks**. A card is right when the value needs context — a
rank, the metric, where it sits in the range. It is wrong when the map is the story and the
panel is covering three states.

## Document model

**Format 9 → 10.** `showCallout: boolean` becomes:

```ts
calloutStyle: 'card' | 'plain' | 'pill' | 'none'
```

`false` was already "draw nothing", so it maps onto `'none'` exactly and **no existing project
changes what it shows**.

The boolean is **removed**, not kept beside the enum. Two fields meaning one thing let two
readers disagree about which is authoritative (§3.6.4), and these two would — the first time
someone picked a style while an old `showCallout: false` sat next to it.

## The looks

| Style | What it is | When |
| --- | --- | --- |
| `card` | The glass panel: name, value, rank, metric, range bar | The value needs its context |
| `plain` | The name and the number on the map, no furniture | The map is the story — the "just the numbers" ask |
| `pill` | One compact line, `NAME 16.1%` | Several regions named close together |
| `none` | Nothing | The legend or the labels carry it |

**They are not the card with pieces switched off.** A box you have removed still leaves its
padding, its shadow budget and the range bar's reserved row behind it, and the result reads as
a card that failed to draw rather than as a choice. `plain` and `pill` measure and lay
themselves out; they branch before any of the card's work.

All four anchor through the same `placeReadout`, so a readout never leaves the frame whichever
look it wears — the placement logic did not need to know a second thing.

## Rendering

`drawLightReadout` sits beside the card rather than inside it. The card's code path is
**untouched**, which is what lets the golden frames prove this change added looks rather than
altering the one that existed.

`plain` holds itself legible with a drop shadow rather than a halo stroke: a stroke thick
enough to read over satellite imagery starts eating the letterforms at 64 px, which is the
whole reason for choosing that look.

## Inspector

Regions is the one layer still drawing its own panel, so this is a hand-written `Select`
rather than a generated row — the metadata declares it either way, and the row appears for
free the day that panel is converted (see [[generated-panels]]).

Two follow-on rules: "Card size" became **"Readout size"**, because it scales every look now;
and **Show rank** only appears for `card`, because the other looks have no row to put a rank
in.

## Tests

- **The migration** (`migrations/callout-style.test.ts`) — `false` → `'none'`, `true` →
  `'card'`, the boolean removed, a style a newer build already wrote left alone, an
  unrecognised style falling back to the card, and other layer types untouched.
- **A frozen `format-10.geomotion.json`** (§12.3).
- **Golden frames: all ten byte-identical, max Δ0** — they use `card`, and the card did not
  move.

### Found on the way

**`plain` drew the region's name in the region's own colour.** The accent *is* the fill the
readout sits on — that is what a choropleth is — so accent-coloured type over it is the one
colour guaranteed to have no contrast. The first render showed "JHARKHAND" in dark red on a
dark red state. The name is white now, and the accent is left to the card, where it sits on
the panel rather than on the map.

## Future extensions

- **Goldens for the new looks.** The existing ten cover `card`; `plain` and `pill` are
  verified by eye and by their unit tests, not yet by a frame.
- **Per-style size defaults.** One `calloutSize` scales all four, and 100 is tuned for the
  card; `pill` wants a little more and `plain` a little less.
- **A `plain` variant that keeps the range bar** — the one piece of card context that costs
  almost no room.
