// Workers has URLPattern natively; Astro's build-time prerender runs this
// same module under plain Node, which may not (Cloudflare's pinned build
// Node lacks it as of Node 22). The polyfill only patches globalThis when
// the global is missing, so this is a no-op wherever URLPattern already
// exists.
import "urlpattern-polyfill";
import type { ApiScope } from "@/lib/api/tokens/scopes";

/**
 * The single source of truth for which routes require auth, and which of
 * those additionally accept an API token bearing the given scope.
 *
 * `URLPattern` rather than hand-written regexes: `{/*}?` reads as "this path,
 * optionally with anything under it" without the escaping noise, and the
 * matcher is the same one the platform uses for routing.
 */
const PROTECTED_ROUTES: { pattern: URLPattern; scope?: ApiScope }[] = [
	{ pattern: new URLPattern({ pathname: "/auth{/}?" }) },
	{ pattern: new URLPattern({ pathname: "/api/tokens{/*}?" }) },
	{ pattern: new URLPattern({ pathname: "/api/ping{/}?" }), scope: "api.ping" },
	{ pattern: new URLPattern({ pathname: "/api/dlsite{/*}?" }), scope: "api.dlsite.read" },
	{ pattern: new URLPattern({ pathname: "/api/exhentai{/*}?" }), scope: "api.exhentai.read" },
	{ pattern: new URLPattern({ pathname: "/api/emails{/*}?" }) },
	{ pattern: new URLPattern({ pathname: "/api/feed{/*}?" }) },
	// ActivityPub moderation APIs (issue AP-8). `/api/ap/media` stays public so
	// proxied avatars/attachments can be served without auth.
	{ pattern: new URLPattern({ pathname: "/api/ap/notes{/*}?" }) },
	{ pattern: new URLPattern({ pathname: "/api/ap/blocklist{/*}?" }) },
	{ pattern: new URLPattern({ pathname: "/api/ap/interactions{/*}?" }) },
	{ pattern: new URLPattern({ pathname: "/dashboard{/*}?" }) },
	{ pattern: new URLPattern({ pathname: "/tools/access{/}?" }) },
	{ pattern: new URLPattern({ pathname: "/tools/mail{/*}?" }) },
];

export function routeNeedsAuth(pathname: string): boolean {
	return PROTECTED_ROUTES.some((route) => route.pattern.test({ pathname }));
}

export function getRequiredApiScope(pathname: string): ApiScope | null {
	return PROTECTED_ROUTES.find((route) => route.pattern.test({ pathname }))?.scope ?? null;
}
