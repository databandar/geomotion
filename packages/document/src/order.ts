/**
 * Fractional indices — the `order` field every node carries.
 *
 * Governing sections: ARCHITECTURE §04 Decision 01 ("flat `Map<NodeId, Node>` with
 * `parentId` + fractional-index `order`"), ENGINEERING_GUIDE §3.1 ("Reparenting = one patch
 * to `parentId` + `order`").
 *
 * A key is read as a fraction written in base 62, most significant digit first: `V` is a
 * little under a half, `V5` a little under `V`'s successor. Between any two keys there is
 * always another key — append a digit if you must — which is the whole point. Integer
 * positions run out of room on the second drop into the same gap and force a renumbering
 * pass that rewrites every sibling; that is exactly the patch storm Decision 01 exists to
 * avoid, and it would arrive precisely when two people are dragging at once.
 *
 * The alphabet is `0-9A-Za-z` because those ranges are contiguous and ascending in ASCII in
 * that order, so ordinary string `<` *is* the ordering. No comparator, nothing to get wrong
 * at a call site, and a key sorts correctly in a database, in a JSON dump, and in an eye
 * scan of a diff.
 */

/** Ascending in ASCII, so `a < b` on strings is `value(a) < value(b)`. */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const BASE = DIGITS.length;

/**
 * How deep a key may go before we call it a bug.
 *
 * Keys grow: halving a gap costs about a sixth of a digit, so a thousand drops onto the
 * *same* boundary produces a key around 170 characters long. That is the trade fractional
 * indices make — unbounded key length instead of a renumbering pass that rewrites every
 * sibling — and 1,024 digits is roughly six thousand consecutive insertions into one gap,
 * which no sequence of human drags reaches.
 *
 * The limit is here for the other case: inverted or malformed arguments, which the guard
 * below rejects outright. This is the second line, so a document nobody wrote by hand
 * cannot hang the editor in a loop that produces one digit per iteration forever.
 */
const MAX_DIGITS = 1024;

const digitAt = (key: string, i: number): number => {
  const found = i < key.length ? DIGITS.indexOf(key[i] as string) : 0;
  // An unknown character sorts as the lowest digit rather than as -1, which would make the
  // arithmetic below produce keys out of order. Hand-edited files reach this.
  return found < 0 ? 0 : found;
};

/**
 * A key that sorts strictly between `a` and `b`.
 *
 * Either end may be `null` for "there is no neighbour that way": `orderBetween(null, null)`
 * is the first key in an empty list, `orderBetween(last, null)` appends, and
 * `orderBetween(null, first)` prepends.
 *
 * The result never ends in the lowest digit. That matters: `V` and `V0` denote the same
 * fraction but are different strings, so allowing trailing zeroes would let two distinct
 * keys compare as different while meaning the same position — an ordering that is stable
 * until someone appends one more digit.
 */
export function orderBetween(a: string | null, b: string | null): string {
  if (a !== null && b !== null && a >= b) {
    throw new Error(`orderBetween: "${a}" is not before "${b}"`);
  }

  const lo = a ?? '';
  // `hi` is dropped to null the moment a shared prefix ends, because from that point no
  // suffix we append can reach it: `V…` is below `W` whatever follows the V.
  let hi = b;
  let prefix = '';

  for (let i = 0; i < MAX_DIGITS; i++) {
    const da = digitAt(lo, i);
    const db = hi === null ? BASE : digitAt(hi, i);

    // Room between the two digits: take the midpoint and stop. It is strictly above `da`,
    // hence never the lowest digit, hence never a trailing zero.
    if (db - da > 1) return prefix + DIGITS[Math.floor((da + db) / 2)];

    prefix += DIGITS[da];
    if (db === da + 1) hi = null;
  }

  throw new Error('orderBetween: ran out of precision');
}

/** The key for the only node in an empty list. */
export const FIRST_ORDER = orderBetween(null, null);

/**
 * `count` keys in ascending order — what a migration or a bulk import wants.
 *
 * Successive appends rather than an even spread: appending is the cheap case (one digit
 * each until the alphabet runs out, then two), and a list built this way still has room
 * everywhere for the drops that come later.
 */
export function orderKeys(count: number): string[] {
  const keys: string[] = [];
  let last: string | null = null;
  for (let i = 0; i < count; i++) {
    last = orderBetween(last, null);
    keys.push(last);
  }
  return keys;
}

/**
 * Compare two nodes by order, breaking ties by id.
 *
 * Equal keys are unreachable through the mutators — every insertion asks `orderBetween` for
 * a key strictly between its neighbours — but a hand-edited or truncated file can carry
 * them, and "which of these two draws on top" must have an answer that is the same on every
 * machine and every reload. Id is that answer: stable, already unique, and nothing else in
 * the document depends on it.
 */
export function compareOrder(a: { order: string; id: string }, b: { order: string; id: string }): number {
  if (a.order !== b.order) return a.order < b.order ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
