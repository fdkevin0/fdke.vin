export const prerender = false;

import type { APIRoute } from "astro";
import { buildWebFinger } from "@/lib/ap/actor";
import { AP_DOMAIN, AP_USERNAME } from "@/lib/ap/config";
import { jrdJson } from "@/lib/ap/response";

/**
 * WebFinger discovery (issue AP-4).
 *
 * Resolves `acct:fdkevin@fdke.vin` to the site's single {@link Actor} so remote
 * servers can find it from the `@fdkevin@fdke.vin` handle. Only the actor's own
 * `acct:` (and its actor URL) resolve; anything else is a 404.
 */
export const GET: APIRoute = ({ url }) => {
	const resource = url.searchParams.get("resource");
	if (!resource) {
		return new Response("Missing resource parameter", { status: 400 });
	}

	if (!resourceMatchesActor(resource, url.origin)) {
		return new Response("Not found", { status: 404 });
	}

	return jrdJson(buildWebFinger({ origin: url.origin }));
};

/** True if the WebFinger `resource` names this actor (its acct handle or URL). */
function resourceMatchesActor(resource: string, origin: string): boolean {
	const normalized = resource.trim().toLowerCase();
	const acct = `acct:${AP_USERNAME}@${AP_DOMAIN}`.toLowerCase();
	if (normalized === acct) return true;
	// Some clients pass the actor URL as the resource instead of an acct: URI.
	return normalized === new URL("/actor", origin).href.toLowerCase();
}
