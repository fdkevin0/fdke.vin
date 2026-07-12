export const prerender = false;

import type { APIRoute } from "astro";
import { z } from "zod";
import { addBlockedDomain, listBlockedDomains } from "@/lib/ap/blocklist";
import { getApEnv } from "@/lib/ap/runtime";
import { getErrorMessage, jsonError, jsonNoStore, logApiError, readJson } from "@/lib/api/http";
import { requireAccessUser } from "@/lib/api/tokens/request";

/** List the domain blocklist enforced by the inbox (issues AP-7, AP-8). */
export const GET: APIRoute = async ({ locals }) => {
	const user = requireAccessUser(locals.user);
	if (user instanceof Response) return user;

	try {
		const env = await getApEnv();
		const domains = await listBlockedDomains(env);
		return jsonNoStore({ domains });
	} catch (error) {
		logApiError("ap.blocklist.list", error, { user: user.email });
		return jsonError(500, getErrorMessage(error, "Failed to list blocklist"));
	}
};

/** Add (or update the reason of) a blocked domain. */
export const POST: APIRoute = async ({ request, locals }) => {
	const user = requireAccessUser(locals.user);
	if (user instanceof Response) return user;

	try {
		const body = await readJson(
			request,
			z.object({
				domain: z.string("Domain is required").trim().min(1, "Domain is required"),
				reason: z.string().nullable().optional(),
			}),
		);
		if (body instanceof Response) return body;

		const env = await getApEnv();
		const domain = await addBlockedDomain(env, {
			domain: body.domain,
			reason: body.reason ?? null,
		});
		if (!domain) return jsonError(400, "Invalid domain");

		return jsonNoStore({ domain }, { status: 201 });
	} catch (error) {
		logApiError("ap.blocklist.add", error, { user: user.email });
		return jsonError(500, getErrorMessage(error, "Failed to add domain"));
	}
};
