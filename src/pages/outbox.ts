export const prerender = false;

import type { APIRoute } from "astro";
import { AP_USERNAME } from "@/lib/ap/config";

export const GET: APIRoute = ({ url }) =>
	Response.redirect(new URL(`/users/${AP_USERNAME}/outbox`, url), 308);
