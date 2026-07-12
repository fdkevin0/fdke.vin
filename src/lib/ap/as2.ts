/**
 * Small shared helpers for reading loosely-typed inbound ActivityStreams 2.0
 * JSON, where a field may be either a bare URI string or an embedded object
 * carrying an `id` (and sometimes a `type`).
 */

/** An AS2 value that may be a bare URI string or an object carrying `id`/`type`. */
export type Referenceable =
	| string
	| { id?: string; type?: string; [key: string]: unknown }
	| null
	| undefined;

/** Resolve an AS2 reference to its URI string, or `null` if there isn't one. */
export function refToString(value: Referenceable): string | null {
	if (typeof value === "string") return value;
	if (value && typeof value.id === "string") return value.id;
	return null;
}
