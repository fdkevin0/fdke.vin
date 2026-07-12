import { z } from "zod";

export const API_SCOPES = ["api.ping", "api.dlsite.read", "api.exhentai.read", "api.*"] as const;

export const apiScopeSchema = z.enum(API_SCOPES);

export type ApiScope = z.infer<typeof apiScopeSchema>;

export function isApiScope(value: string): value is ApiScope {
	return API_SCOPES.includes(value as ApiScope);
}

export function hasRequiredScope(grantedScopes: string[], requiredScope: string): boolean {
	if (grantedScopes.includes("api.*")) {
		return true;
	}

	return grantedScopes.includes(requiredScope);
}
