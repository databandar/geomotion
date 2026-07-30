/**
 * `@geomotion/testing` — shared test utilities.
 *
 * Governing sections: ENGINEERING_GUIDE §2, §12. Dev-only: shipped code may not
 * import this package, which the boundary law enforces.
 *
 * The capture driver is deliberately not re-exported here — it needs a browser
 * and a running dev server, so it is reached through the package's
 * `golden:capture` / `golden:check` scripts rather than by importing it.
 */

export {
  DEFAULT_TOLERANCE,
  compare,
  describe,
  identical,
  matches,
  variance,
  type Baseline,
  type Diff,
  type Signature,
} from './signature.ts';
