export const prerender = false;

import type { APIRoute } from "astro";
import { jsonNoStore } from "@/lib/api/http";
import { getPingStatus } from "@/lib/api/ping";

export const GET: APIRoute = async () => {
	return jsonNoStore(getPingStatus());
};
