/**
 * Generate a ULID: an opaque, lexicographically-sortable Note id.
 *
 * Non-monotonic on purpose — ids derive their time component from an explicit
 * timestamp (a note's publish date), which during migration arrives out of
 * chronological order. A monotonic factory would clobber an older note's time
 * to match the last-seen one; the plain generator preserves each note's real
 * publish time while its 80 random bits keep same-instant
 * ids unique.
 */
export { ulid } from "ulid";
