import type { APIRoute } from "astro";

export const prerender = false;

const fallbackPath = "/tools/mail/";

function getSafeRedirectTarget(value: string | null): string {
	if (!value || !value.startsWith("/")) {
		return fallbackPath;
	}

	if (value.startsWith("//") || value === "/auth" || value.startsWith("/auth?")) {
		return fallbackPath;
	}

	return value;
}

export const GET: APIRoute = ({ url, redirect }) => {
	const redirectTarget = getSafeRedirectTarget(url.searchParams.get("redirect"));
	return redirect(redirectTarget);
};
