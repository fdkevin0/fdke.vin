export const API_SCOPES = ["api.ping", "api.dlsite.read", "api.exhentai.read", "api.*"] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export function isApiScope(value: string): value is ApiScope {
	return API_SCOPES.includes(value as ApiScope);
}

export function parseApiScopes(input: unknown): ApiScope[] {
	if (!Array.isArray(input)) {
		return [];
	}

	const scopes = input.filter(
		(value): value is ApiScope => typeof value === "string" && isApiScope(value),
	);
	return Array.from(new Set(scopes));
}

export function hasRequiredScope(grantedScopes: string[], requiredScope: string): boolean {
	if (grantedScopes.includes("api.*")) {
		return true;
	}

	return grantedScopes.includes(requiredScope);
}

export function getRequiredApiScope(pathname: string): ApiScope | null {
	if (/^\/api\/ping\/?$/.test(pathname)) {
		return "api.ping";
	}

	if (/^\/api\/dlsite(?:\/.*)?$/.test(pathname)) {
		return "api.dlsite.read";
	}

	if (/^\/api\/exhentai(?:\/.*)?$/.test(pathname)) {
		return "api.exhentai.read";
	}

	return null;
}
