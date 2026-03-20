import { createRemoteJWKSet, jwtVerify } from "jose";

const publicPaths = ["/tools/mail/login"];
const protectedApiPaths = ["/api/emails"];

export const onRequest = async (context: any, next: any) => {
	const { url, request } = context;
	const pathname = new URL(url).pathname;

	// Allow public paths
	if (publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
		return next();
	}

	// Check if it's a protected API path
	const isProtectedApi = protectedApiPaths.some(
		(path) => pathname === path || pathname.startsWith(`${path}/`),
	);

	// Only protect /tools/mail routes and mail API routes
	if (!pathname.startsWith("/tools/mail") && !isProtectedApi) {
		return next();
	}

	// Skip auth during prerendering (build time)
	if (!context.runtime?.env) {
		return next();
	}

	// Get JWT from header (preferred) or cookie
	const token =
		request.headers.get("cf-access-jwt-assertion") ||
		context.cookies.get("CF_Authorization")?.value;

	if (!token) {
		// For API routes, return 401 instead of redirect
		if (isProtectedApi) {
			return new Response(JSON.stringify({ error: "Unauthorized" }), {
				status: 401,
				headers: { "Content-Type": "application/json" },
			});
		}

		// For page routes, redirect to Cloudflare Access login
		const teamDomain = context.runtime.env.CLOUDFLARE_TEAM_DOMAIN;
		const callbackUrl = new URL("/tools/mail", url).toString();
		const loginUrl = `${teamDomain}/cdn-cgi/access/login?redirect_url=${encodeURIComponent(callbackUrl)}`;
		return Response.redirect(loginUrl);
	}

	try {
		// Validate JWT
		const teamDomain = context.runtime.env.CLOUDFLARE_TEAM_DOMAIN;
		const policyAud = context.runtime.env.CLOUDFLARE_POLICY_AUD;

		const JWKS = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));

		const { payload } = await jwtVerify(token, JWKS, {
			issuer: teamDomain,
			audience: policyAud,
		});

		// Store user info in locals for use in templates
		context.locals.user = {
			email: payload.email as string,
			name: (payload.name || payload.common_name) as string | undefined,
			uid: payload.uid as string | undefined,
		};

		return next();
	} catch (error) {
		console.error("Cloudflare Access JWT validation failed:", error);
		return new Response("Unauthorized", { status: 403 });
	}
};
