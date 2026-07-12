import { Temporal as TemporalPolyfill } from "@js-temporal/polyfill";

/**
 * `@fedify/vocab`'s public types (e.g. `published`/`updated` on `Create`,
 * `Update`, `Note`) reference TypeScript's ambient `esnext.temporal` lib
 * `Temporal.Instant`. Cloudflare Workers has no native Temporal yet, so this
 * codebase builds instants with `@js-temporal/polyfill` — a runtime-identical
 * implementation of the same TC39 spec, but a structurally distinct type.
 * Bridge the two here instead of casting at every call site.
 */
export function toInstant(iso: string): Temporal.Instant {
	return TemporalPolyfill.Instant.from(iso) as unknown as Temporal.Instant;
}
