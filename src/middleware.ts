import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";
import { parseAudienceList, verifyCloudflareAccessToken } from "@/lib/cloudflare-access";

const PROTECTED_ROUTE_PATTERNS = [
	/^\/api\/emails(?:\/.*)?$/,
	/^\/tools\/access\/?$/,
	/^\/tools\/mail(?:\/.*)?$/,
];

function routeNeedsAuth(pathname: string): boolean {
	return PROTECTED_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
}

export const onRequest = defineMiddleware(async (context, next) => {
	const { request, url } = context;

	if (!routeNeedsAuth(url.pathname)) {
		context.locals.user = null;
		return next();
	}

	const teamDomain = env.CLOUDFLARE_TEAM_DOMAIN;
	const policyAud = parseAudienceList(env.CLOUDFLARE_POLICY_AUD);

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

		const loginUrl = `${teamDomain}/cdn-cgi/access/login/${url.hostname}?redirect_url=${encodeURIComponent(url.pathname)}`;
		return Response.redirect(loginUrl);
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
		return new Response("Unauthorized", { status: 403 });
	}
});
