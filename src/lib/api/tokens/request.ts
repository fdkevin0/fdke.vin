import { jsonError } from "@/lib/api/http";
import { type ApiScope, parseApiScopes } from "@/lib/api/tokens/scopes";
import type { CloudflareAccessUser } from "@/lib/cloudflare-access";

export interface TokenWriteInput {
	name: string;
	scopes: ApiScope[];
	expiresAt: string | null;
}

interface RawTokenWriteInput {
	name?: string;
	scopes?: unknown;
	expiresAt?: string | null;
}

export function requireAccessUser(
	user: CloudflareAccessUser | null,
): CloudflareAccessUser | Response {
	if (!user) {
		return jsonError(401, "Unauthorized");
	}

	return user;
}

export async function readJson<T>(request: Request): Promise<T> {
	return (await request.json()) as T;
}

export async function readTokenWriteInput(request: Request): Promise<TokenWriteInput | Response> {
	const body = await readJson<RawTokenWriteInput>(request);
	const name = body.name?.trim();
	const scopes = parseApiScopes(body.scopes);

	if (!name) {
		return jsonError(400, "Token name is required");
	}

	if (scopes.length === 0) {
		return jsonError(400, "At least one scope is required");
	}

	const expiresAt = normalizeExpiresAt(body.expiresAt);
	if (body.expiresAt !== undefined && body.expiresAt !== null && !expiresAt) {
		return jsonError(400, "Invalid expiresAt value");
	}

	return {
		name,
		scopes,
		expiresAt,
	};
}

function normalizeExpiresAt(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return null;
	}

	return date.toISOString();
}
