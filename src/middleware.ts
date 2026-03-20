import { createRemoteJWKSet, jwtVerify } from "jose";

const protectedApiPaths = ["/api/emails"];
const protectedPagePaths = ["/tools/mail", "/tools/access"];

export const onRequest = async (
	context: {
		url: string;
		request: Request;
		cookies: { get: (name: string) => { value?: string } | undefined };
		locals: App.Locals;
		runtime?: { env: { CLOUDFLARE_TEAM_DOMAIN: string; CLOUDFLARE_POLICY_AUD: string } };
	},
	next: () => Promise<Response>,
) => {
	const { url, request } = context;
	const pathname = new URL(url).pathname;

	// Check if it's a protected API path
	const isProtectedApi = protectedApiPaths.some(
		(path) => pathname === path || pathname.startsWith(`${path}/`),
	);

	// Check if it's a protected page path
	const isProtectedPage = protectedPagePaths.some(
		(path) => pathname === path || pathname.startsWith(`${path}/`),
	);

	// Only protect configured routes
	if (!isProtectedPage && !isProtectedApi) {
		return next();
	}

	// Skip auth during prerendering (build time)
	if (!context.runtime?.env) {
		return next();
	}

	// Validate environment configuration
	const teamDomain = context.runtime.env.CLOUDFLARE_TEAM_DOMAIN;
	const policyAud = context.runtime.env.CLOUDFLARE_POLICY_AUD;

	if (!teamDomain || !policyAud) {
		console.error("Missing Cloudflare Access configuration");
		return new Response("Server configuration error", { status: 500 });
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
		const requestDomain = new URL(url).hostname;
		const callbackUrl = pathname;
		const loginUrl = `${teamDomain}/cdn-cgi/access/login/${requestDomain}?redirect_url=${encodeURIComponent(callbackUrl)}`;
		return Response.redirect(loginUrl);
	}

	try {
		// Validate JWT
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
			common_name: payload.common_name as string | undefined,
		};

		return next();
	} catch (error) {
		console.error("Cloudflare Access JWT validation failed:", error);
		return new Response("Unauthorized", { status: 403 });
	}
};
