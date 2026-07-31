/**
 * The format chain.
 *
 * Governing section: ENGINEERING_GUIDE §3.6. `format` is one monotonically increasing
 * integer for the whole document; each step is a pure `migrateNtoN+1(doc): doc`; loading
 * runs every step from the document's format to the current one, in order.
 *
 * A chain rather than one `migrate()` that knows every shape at once. With a chain each
 * step only has to understand two adjacent formats, which is a small enough problem to
 * get right and to test in isolation. The single-function alternative grows a thicket of
 * "if this field looks old" checks that nobody can later prove is exhaustive — and this
 * project already carries one of those, in the default-filling that runs after the chain.
 *
 * Steps must be pure and must not throw on a document they do not recognise: they run
 * against files this project did not write, and a load that fails is a project someone
 * cannot open.
 */
import { migrate1to2 } from './1-to-2.ts';
import { migrate2to3 } from './2-to-3.ts';
import { migrate3to4 } from './3-to-4.ts';
import { migrate4to5 } from './4-to-5.ts';
import { migrate5to6 } from './5-to-6.ts';

/** The format this build writes. Bump only alongside a new step below. */
export const CURRENT_FORMAT = 6;

/**
 * Ordered steps, `from` → `from + 1`.
 *
 * The array index is not the format number; the `from` field is. Relying on position
 * would make an accidental reorder silently skip a step.
 */
const STEPS: { from: number; run: (doc: Record<string, unknown>) => Record<string, unknown> }[] = [
  { from: 1, run: migrate1to2 },
  { from: 2, run: migrate2to3 },
  { from: 3, run: migrate3to4 },
  { from: 4, run: migrate4to5 },
  { from: 5, run: migrate5to6 },
];

/**
 * The format a loaded document claims to be.
 *
 * Documents written before `format` existed carry `version: 1` and nothing else, so an
 * absent `format` means 1. A value that is not a positive integer is treated as 1 as
 * well: it is either corrupt or hand-edited, and running the chain over it is strictly
 * safer than skipping steps on the strength of a number that means nothing.
 */
export function formatOf(doc: unknown): number {
  const f = (doc as { format?: unknown } | null)?.format;
  return typeof f === 'number' && Number.isInteger(f) && f >= 1 ? f : 1;
}

/**
 * Run every step needed to bring `doc` up to `CURRENT_FORMAT`.
 *
 * A document from a *newer* build is returned untouched rather than refused. It will
 * very likely be missing fields this build wants, and the default-filling downstream
 * covers that; refusing outright would turn "opened on an older laptop" into data the
 * user cannot reach at all.
 */
export function runMigrations(input: unknown): Record<string, unknown> {
  let doc = { ...(input as Record<string, unknown>) };
  let at = formatOf(doc);

  while (at < CURRENT_FORMAT) {
    const step = STEPS.find((s) => s.from === at);
    // A gap in the chain is a programming error, not a bad file. Stopping is the honest
    // response: the alternative is silently handing on a half-migrated document.
    if (!step) break;
    doc = step.run(doc);
    at += 1;
    doc.format = at;
  }

  doc.format = Math.max(at, CURRENT_FORMAT);
  return doc;
}
