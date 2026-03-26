import { CLOUDFLARE_POLICY_AUD, CLOUDFLARE_TEAM_DOMAIN } from "astro:env/server";
import { defineMiddleware } from "astro:middleware";
import { getRequiredApiScope } from "@/lib/api/tokens/scopes";
import { verifyApiToken } from "@/lib/api/tokens/storage";
import {
	getLocalMockUser,
	parseAudienceList,
	verifyCloudflareAccessToken,
} from "@/lib/cloudflare-access";
import {
	DEFAULT_SITE_LANG,
	SITE_LANG_COOKIE_KEY,
	getCountrySiteLang,
	getSiteLangOrDefault,
} from "@/lib/i18n";

const PROTECTED_ROUTE_PATTERNS = [
	/^\/auth\/?$/,
	/^\/api\/tokens(?:\/.*)?$/,
	/^\/api\/ping\/?$/,
	/^\/api\/dlsite(?:\/.*)?$/,
	/^\/api\/exhentai(?:\/.*)?$/,
	/^\/api\/emails(?:\/.*)?$/,
	/^\/api\/feed(?:\/.*)?$/,
	/^\/dashboard(?:\/.*)?$/,
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
	const { url } = context;
	context.locals.apiToken = null;
	const requestHeaders = !context.isPrerendered ? context.request.headers : null;
	context.locals.siteCountry = requestHeaders?.get("cf-ipcountry") ?? null;
	const siteLangCookie = !context.isPrerendered
		? context.cookies.get(SITE_LANG_COOKIE_KEY)?.value
		: undefined;
	context.locals.siteDefaultLang = siteLangCookie
		? getSiteLangOrDefault(siteLangCookie)
		: context.isPrerendered
			? DEFAULT_SITE_LANG
			: getCountrySiteLang(context.locals.siteCountry ?? undefined);

	if (!routeNeedsAuth(url.pathname)) {
		context.locals.user = null;
		return next();
	}

	const requiredApiScope = getRequiredApiScope(url.pathname);
	const authorization = requestHeaders?.get("authorization");
	if (requiredApiScope && authorization?.startsWith("Bearer ")) {
		const bearerToken = authorization.slice("Bearer ".length).trim();

		if (bearerToken) {
			try {
				const verifiedToken = await verifyApiToken(bearerToken, requiredApiScope);
				if (verifiedToken) {
					context.locals.user = verifiedToken.owner;
					context.locals.apiToken = {
						id: verifiedToken.token.id,
						scopes: verifiedToken.token.scopes,
						ownerEmail: verifiedToken.token.ownerEmail,
					};
					return next();
				}
			} catch (error) {
				console.error("API token verification failed:", error);
			}

			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			});
		}
	}

	const isLocalDev = import.meta.env.DEV;

	if (isLocalDev) {
		context.locals.user = getLocalMockUser();
		console.log(
			"[Cloudflare Access] Bypassed for local dev - using mock user:",
			getLocalMockUser().email,
		);
		return next();
	}

	const teamDomain = CLOUDFLARE_TEAM_DOMAIN;
	const policyAud = CLOUDFLARE_POLICY_AUD ? parseAudienceList(CLOUDFLARE_POLICY_AUD) : [];

	if (!teamDomain || policyAud.length === 0) {
		console.error("Missing Cloudflare Access configuration");
		return new Response("Server configuration error", { status: 500 });
	}

	const token =
		requestHeaders?.get("cf-access-jwt-assertion") ||
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
