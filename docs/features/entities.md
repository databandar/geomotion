# Entities and facts

**Status:** M8 landed — the registry, and every import routed through it.

**Governing sections:** ARCHITECTURE §05 (smart objects, "the keystone"), Decision 02.

## The problem

§05 Decision 02 names the v1 mistake: "v1 joined by name inside the regions layer and
re-fought alias battles per dataset." This project had reproduced it exactly. The survey
reader carried a private table mapping `A & N Islands`, `Jammu & Kashmir` and the merged
territory `DNHDD` onto boundary names — invisible to everything else, and due to be
copied the moment a second dataset arrived.

The cost showed up in M42: a composition rendered "No data (1)" with no way to learn
which region, or whether it was a genuine gap or a spelling nobody had taught the reader.

## The shape

An entity is a thing in the world with a **stable id** — `geo:IN-WB` is West Bengal,
forever, whatever a dataset calls it. Facts attach to that id carrying `{value, source,
asOf}`, and everything downstream refers to the id rather than to a spelling.

Ids follow ISO 3166-2 so they can be checked against a published list rather than
invented here.

## Decisions

**Names fold before they compare.** Case, punctuation and spacing are normalised, and
`&` reads as `and`. Listing every ampersand variant as an alias would work until the one
nobody thought of, which is the one that goes blank on the map.

**`resolve` returns an array, not an entity.** One name legitimately covers several: the
survey reports the merged union territory while the official boundary set still carries
Dadra and Nagar Haveli and Daman and Diu separately. Answering with one would leave the
other blank with nothing to explain it.

**Unmatched and missing are reported separately.** They are different problems. An
unmatched name is a spelling this project has never seen and somebody must fix; a missing
entity is a region the dataset does not cover, which the legend honestly calls "no data".
Conflating them is how a typo hides among genuine gaps.

**The join returns a new registry.** A failed import can be discarded without having
half-written itself into the document.

**Provenance is functional.** `sourcesUsed` generates a credit line from the facts a
video actually used — §05's point, and only possible because every value carries its own
source.

## What it changed

The reader's private alias table is deleted. Joining the 35 raw survey names against the
registry — with no table — resolves **every one**, and reports the single genuine gap by
name: `geo:IN-MN`. Manipur is not in the NFHS-6 export at all, checked in the source
data rather than assumed.

## M8 — one join, everywhere

There were three private joins, each having learned different things:

1. the survey reader's alias table (deleted in M7);
2. the editor's paste box, comparing lowercased region names;
3. the regions layer's own name-keyed `values`.

The second was the visible one. Pasting `Jammu & Kashmir` into the editor was rejected as
unknown while the very same spelling imported cleanly on the command line — of four
survey-spelled names, three were refused. Both now go through `matchNames`, so a spelling
learned anywhere is known everywhere.

`matchNames` tries the name as written first and the registry only if that fails, so a
boundary set outside the ones shipped here still gets plain name matching rather than
nothing.

**The fold turned out to carry more than expected.** `Jammu & Kashmir` reaches
`Jammu and Kashmir` with no alias involved, because `&` folds to `and` — a test asserting
otherwise was wrong, and was corrected rather than the code. The registry is only needed
for names sharing no letters with their target, like `DNHDD`.

The import also now counts **what landed**, not what was typed: a merged name is one line
and two regions, a typo is one line and none, and the line count describes neither.

## Not yet

`bound` tracks, so a label or callout can read `{entity.rank}` directly — that needs this
registry and M1's track union. The regions layer still carries its own `values` map;
moving it onto entity facts proper is a later step.
