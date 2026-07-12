import type { ApiScope } from "@/lib/api/tokens/scopes";

/**
 * The single source of truth for which routes require auth, and which of
 * those additionally accept an API token bearing the given scope.
 */
const PROTECTED_ROUTES: { pattern: RegExp; scope?: ApiScope }[] = [
	{ pattern: /^\/auth\/?$/ },
	{ pattern: /^\/api\/tokens(?:\/.*)?$/ },
	{ pattern: /^\/api\/ping\/?$/, scope: "api.ping" },
	{ pattern: /^\/api\/dlsite(?:\/.*)?$/, scope: "api.dlsite.read" },
	{ pattern: /^\/api\/exhentai(?:\/.*)?$/, scope: "api.exhentai.read" },
	{ pattern: /^\/api\/emails(?:\/.*)?$/ },
	{ pattern: /^\/api\/feed(?:\/.*)?$/ },
	// ActivityPub moderation APIs (issue AP-8). `/api/ap/media` stays public so
	// proxied avatars/attachments can be served without auth.
	{ pattern: /^\/api\/ap\/notes(?:\/.*)?$/ },
	{ pattern: /^\/api\/ap\/blocklist(?:\/.*)?$/ },
	{ pattern: /^\/api\/ap\/interactions(?:\/.*)?$/ },
	{ pattern: /^\/dashboard(?:\/.*)?$/ },
	{ pattern: /^\/tools\/access\/?$/ },
	{ pattern: /^\/tools\/mail(?:\/.*)?$/ },
];

export function routeNeedsAuth(pathname: string): boolean {
	return PROTECTED_ROUTES.some((route) => route.pattern.test(pathname));
}

export function getRequiredApiScope(pathname: string): ApiScope | null {
	return PROTECTED_ROUTES.find((route) => route.pattern.test(pathname))?.scope ?? null;
}
