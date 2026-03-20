import type { MiddlewareHandler } from "astro";
import { createRemoteJWKSet, jwtVerify } from "jose";

type RouteModule = {
	needAuth?: boolean;
};

type RouteDefinition = {
	pattern: RegExp;
	specificity: number;
	load: () => Promise<RouteModule>;
};

const routeModules = import.meta.glob<RouteModule>("./pages/**/*.{astro,ts}");

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildRouteDefinition(filePath: string, load: () => Promise<RouteModule>): RouteDefinition {
	let routePath = filePath.replace(/^\.\/pages/, "").replace(/\.(astro|ts)$/, "");

	if (routePath.endsWith("/index")) {
		routePath = routePath.slice(0, -"/index".length) || "/";
	}

	const normalizedRoutePath = routePath === "" ? "/" : routePath;
	const segments = normalizedRoutePath.split("/").filter(Boolean);
	let specificity = segments.length;

	const patternParts = segments.map((segment) => {
		if (/^\[\.\.\.[^/]+\]$/.test(segment)) {
			specificity += 1;
			return "(?:/.+)?";
		}

		if (/^\[[^./][^/]*\]$/.test(segment)) {
			specificity += 2;
			return "/[^/]+";
		}

		specificity += 3;
		return `/${escapeRegex(segment)}`;
	});

	const pattern = patternParts.length === 0 ? /^\/$/ : new RegExp(`^${patternParts.join("")}/?$`);

	return {
		pattern,
		specificity,
		load,
	};
}

const routeDefinitions = Object.entries(routeModules)
	.map(([filePath, load]) => buildRouteDefinition(filePath, load))
	.sort((a, b) => b.specificity - a.specificity);

/**
 * Check if a route module exports `needAuth = true`.
 * Matches static, dynamic, and rest routes using the actual page file map.
 */
async function routeNeedsAuth(pathname: string): Promise<boolean> {
	for (const route of routeDefinitions) {
		if (!route.pattern.test(pathname)) {
			continue;
		}

		const mod = await route.load();
		if (mod.needAuth === true) {
			return true;
		}

		return false;
	}

	return false;
}

export const onRequest: MiddlewareHandler = async (context, next) => {
	const { request } = context;
	const pathname = new URL(request.url).pathname;

	// Cloudflare adapter adds runtime at runtime; absent during prerendering
	const runtime = (context as unknown as Record<string, unknown>).runtime as
		| { env: { CLOUDFLARE_TEAM_DOMAIN: string; CLOUDFLARE_POLICY_AUD: string | string[] } }
		| undefined;

	// Skip auth during prerendering (build time)
	if (!runtime?.env) {
		return next();
	}

	const needsAuth = await routeNeedsAuth(pathname);
	if (!needsAuth) {
		return next();
	}

	const teamDomain = runtime.env.CLOUDFLARE_TEAM_DOMAIN;
	const policyAud = runtime.env.CLOUDFLARE_POLICY_AUD;

	const parseAudienceList = (value: string | string[]): string[] =>
		typeof value === "string"
			? value
					.split(",")
					.map((v) => v.trim())
					.filter(Boolean)
			: value;

	const policyAudList = parseAudienceList(policyAud);

	if (!teamDomain || policyAudList.length === 0) {
		console.error("Missing Cloudflare Access configuration");
		return new Response("Server configuration error", { status: 500 });
	}

	// Get JWT from header (preferred) or cookie
	const token =
		request.headers.get("cf-access-jwt-assertion") ||
		context.cookies.get("CF_Authorization")?.value;

	if (!token) {
		// For API routes, return 401 instead of redirect
		if (pathname.startsWith("/api/")) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			});
		}

		// For page routes, redirect to Cloudflare Access login
		const requestDomain = new URL(request.url).hostname;
		const callbackUrl = pathname;
		const loginUrl = `${teamDomain}/cdn-cgi/access/login/${requestDomain}?redirect_url=${encodeURIComponent(callbackUrl)}`;
		return Response.redirect(loginUrl);
	}

	try {
		// Validate JWT
		const JWKS = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));

		const { payload } = await jwtVerify(token, JWKS, {
			issuer: teamDomain,
			audience: policyAudList,
		});

		// Store user info in locals for use in templates
		context.locals.user = {
			email: payload.email as string,
			name: (payload.name || payload.common_name) as string | undefined,
			uid: payload.uid as string | undefined,
			common_name: payload.common_name as string | undefined,
		};

		return next();
	} catch (error) {
		console.error("Cloudflare Access JWT validation failed:", error);
		return new Response("Unauthorized", { status: 403 });
	}
};
