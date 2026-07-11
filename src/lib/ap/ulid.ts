import { decodeTime, ulid as makeUlid } from "ulid";

/**
 * Generate a ULID: an opaque, lexicographically-sortable Note id.
 *
 * Non-monotonic on purpose — ids derive their time component from an explicit
 * timestamp (a note's publish date), which during migration arrives out of
 * chronological order. A monotonic factory would clobber an older note's time
 * to match the last-seen one; the plain generator preserves each note's real
 * publish time (see `decodeUlidTime`) while its 80 random bits keep same-instant
 * ids unique.
 */
export function ulid(time: number = Date.now()): string {
	return makeUlid(time);
}

/** Decode the millisecond timestamp encoded in a ULID's time component. */
export function decodeUlidTime(id: string): number {
	return decodeTime(id);
}
