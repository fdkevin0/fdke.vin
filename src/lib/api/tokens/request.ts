import { z } from "zod";
import { jsonError, readJson } from "@/lib/api/http";
import { type ApiScope, apiScopeSchema } from "@/lib/api/tokens/scopes";
import type { CloudflareAccessUser } from "@/lib/cloudflare-access";

export interface TokenWriteInput {
	name: string;
	scopes: ApiScope[];
	expiresAt: string | null;
}

const tokenWriteSchema = z.object({
	name: z.string("Token name is required").trim().min(1, "Token name is required"),
	scopes: z
		.array(apiScopeSchema, "At least one scope is required")
		.min(1, "At least one scope is required")
		.transform((scopes) => [...new Set(scopes)]),
	expiresAt: z
		.union([z.string(), z.null()])
		.optional()
		.transform((value, context) => {
			if (!value) return null;
			const date = new Date(value);
			if (!Number.isNaN(date.getTime())) return date.toISOString();
			context.addIssue({ code: "custom", message: "Invalid expiresAt value" });
			return z.NEVER;
		}),
});

export function requireAccessUser(
	user: CloudflareAccessUser | null,
): CloudflareAccessUser | Response {
	if (!user) {
		return jsonError(401, "Unauthorized");
	}

	return user;
}

export async function readTokenWriteInput(request: Request): Promise<TokenWriteInput | Response> {
	return readJson(request, tokenWriteSchema);
}
