/**
 * Identifier generation.
 *
 * ENGINEERING_GUIDE §3.1 specifies prefixed, sortable ids (`nd_…`) for the v2
 * document. This is the v1 generator, moved verbatim so the migration is a pure
 * relocation; the prefixed-ULID form arrives with `packages/document`, at which
 * point the v1 importer maps old ids forward.
 */

/** A short, url-safe, non-sortable id. */
export const createId = () => Math.random().toString(36).slice(2, 10);
