import type { MiddlewareHandler } from "astro";
import { createRemoteJWKSet, jwtVerify } from "jose";

const EXTENSIONS = ["astro", "ts"] as const;

/**
 * Generate candidate module paths for a URL pathname.
 * Handles static routes, index files, and Astro dynamic segments ([key], [...slug]).
 */
function* candidatePaths(pathname: string): Generator<string> {
	const clean = pathname.replace(/^\//, "").replace(/\/$/, "") || "index";
	const segments = clean.split("/");

	// Static direct matches: /tools/mail → pages/tools/mail.astro, pages/tools/mail/index.astro
	for (const ext of EXTENSIONS) {
		yield `../pages/${clean}.${ext}`;
		yield `../pages/${clean}/index.${ext}`;
	}

	// Walk up directories trying dynamic segments from the deepest level
	// /tools/mail/email/abc123 → tries [key] at email/, [email] at mail/, etc.
	for (let i = segments.length - 1; i >= 1; i--) {
		const prefix = segments.slice(0, i).join("/");
		for (const ext of EXTENSIONS) {
			yield `../pages/${prefix}/[...slug].${ext}`;
			yield `../pages/${prefix}/[...slug]/index.${ext}`;
			yield `../pages/${prefix}/[${segments[i]}].${ext}`;
			yield `../pages/${prefix}/[${segments[i]}]/index.${ext}`;
		}
	}
}

/**
 * Check if a route module exports `needAuth = true`.
 * Resolves dynamic route segments so e.g. /tools/mail/email/abc123
 * matches src/pages/tools/mail/email/[key].astro.
 */
async function routeNeedsAuth(pathname: string): Promise<boolean> {
	for (const modPath of candidatePaths(pathname)) {
		try {
			const mod = await import(/* @vite-ignore */ modPath);
			if (mod.needAuth === true) return true;
		} catch {
			// Module not found at this path, try next candidate
		}
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
