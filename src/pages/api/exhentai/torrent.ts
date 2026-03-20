export const prerender = false;

import type { APIRoute } from "astro";
import { getExhentaiTorrentInfo } from "@/lib/api/exhentai";
import { getErrorMessage, jsonError, jsonNoStore, logApiError } from "@/lib/api/http";

export const GET: APIRoute = async ({ url }) => {
	const gid = url.searchParams.get("gid")?.trim();
	const token = url.searchParams.get("t")?.trim();

	if (!gid || !token) {
		return jsonError(400, "Missing required parameters: gid and t are required");
	}

	try {
		const result = await getExhentaiTorrentInfo(gid, token);
		return jsonNoStore(result);
	} catch (error) {
		logApiError("exhentai.torrent", error, { gid });
		const message = getErrorMessage(error, "Failed to fetch ExHentai torrent data");
		if (message === "Torrent page not found") {
			return jsonError(404, message);
		}

		return jsonError(500, message);
	}
};
