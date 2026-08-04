import { CLOUDFLARE_POLICY_AUD, CLOUDFLARE_TEAM_DOMAIN } from "astro:env/server";
import { defineMiddleware, sequence } from "astro:middleware";
import { jsonError } from "@/lib/api/http";
import { verifyApiToken } from "@/lib/api/tokens/storage";
import {
	getLocalMockUser,
	parseAudienceList,
	verifyCloudflareAccessToken,
} from "@/lib/cloudflare-access";
import {
	DEFAULT_SITE_LANG,
	getCountrySiteLang,
	getSiteLangOrDefault,
	SITE_LANG_COOKIE_KEY,
} from "@/lib/i18n";
import { getRequiredApiScope, routeNeedsAuth } from "@/lib/protected-routes";

function createAuthRedirect(url: URL): Response {
	const redirectTarget = `${url.pathname}${url.search}`;
	const authUrl = new URL("/auth", url);
	authUrl.searchParams.set("redirect", redirectTarget);
	return Response.redirect(authUrl);
}

/** Resolves the reader's language before anything else needs it. */
const localeMiddleware = defineMiddleware(async (context, next) => {
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

	return next();
});

/** Gates protected routes on an Access session or a scoped API token. */
const authMiddleware = defineMiddleware(async (context, next) => {
	const { url } = context;
	context.locals.apiToken = null;
	context.locals.accessClaims = null;

	if (!routeNeedsAuth(url.pathname)) {
		context.locals.user = null;
		return next();
	}

	const isApiRoute = url.pathname.startsWith("/api/");
	const requestHeaders = !context.isPrerendered ? context.request.headers : null;
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

			return jsonError(401, "Unauthorized");
		}
	}

	if (import.meta.env.DEV) {
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
		return isApiRoute ? jsonError(401, "Unauthorized") : createAuthRedirect(url);
	}

	try {
		const verified = await verifyCloudflareAccessToken({ token, teamDomain, policyAud });
		context.locals.user = verified.user;
		// Held so pages that display the session do not have to verify a second
		// time, which would cost another JWKS lookup per render.
		context.locals.accessClaims = verified.claims;
		return next();
	} catch (error) {
		console.error("Cloudflare Access JWT validation failed:", error);
		// A token that fails verification is not an authenticated caller, so this
		// is 401 rather than 403 on both the API and page paths.
		return isApiRoute ? jsonError(401, "Unauthorized") : createAuthRedirect(url);
	}
});

export const onRequest = sequence(localeMiddleware, authMiddleware);
