import { CLOUDFLARE_POLICY_AUD, CLOUDFLARE_TEAM_DOMAIN } from "astro:env/server";
import { defineMiddleware } from "astro:middleware";
import { parseAudienceList, verifyCloudflareAccessToken } from "@/lib/cloudflare-access";

const PROTECTED_ROUTE_PATTERNS = [
	/^\/auth\/?$/,
	/^\/api\/emails(?:\/.*)?$/,
	/^\/tools\/access\/?$/,
	/^\/tools\/mail(?:\/.*)?$/,
];

function routeNeedsAuth(pathname: string): boolean {
	return PROTECTED_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
}

function createAuthRedirect(url: URL): Response {
	const redirectTarget = `${url.pathname}${url.search}`;
	const authUrl = new URL("/auth", url);
	authUrl.searchParams.set("redirect", redirectTarget);
	return Response.redirect(authUrl);
}

export const onRequest = defineMiddleware(async (context, next) => {
	const { request, url } = context;

	if (!routeNeedsAuth(url.pathname)) {
		context.locals.user = null;
		return next();
	}

	const teamDomain = CLOUDFLARE_TEAM_DOMAIN;
	const policyAud = CLOUDFLARE_POLICY_AUD ? parseAudienceList(CLOUDFLARE_POLICY_AUD) : [];

	if (!teamDomain || policyAud.length === 0) {
		console.error("Missing Cloudflare Access configuration");
		return new Response("Server configuration error", { status: 500 });
	}

	const token =
		request.headers.get("cf-access-jwt-assertion") ||
		context.cookies.get("CF_Authorization")?.value;

	if (!token) {
		if (url.pathname.startsWith("/api/")) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			});
		}

		return createAuthRedirect(url);
	}

	try {
		context.locals.user = await verifyCloudflareAccessToken({
			token,
			teamDomain,
			policyAud,
		});
		return next();
	} catch (error) {
		console.error("Cloudflare Access JWT validation failed:", error);

		if (!url.pathname.startsWith("/api/")) {
			return createAuthRedirect(url);
		}

		return new Response("Unauthorized", { status: 403 });
	}
});
