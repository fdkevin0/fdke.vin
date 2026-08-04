import type { APIRoute } from "astro";
import { getSafeRedirectTarget } from "@/lib/auth-redirect";

export const prerender = false;

export const GET: APIRoute = ({ url, redirect }) => {
	return redirect(getSafeRedirectTarget(url.searchParams.get("redirect"), url));
};
