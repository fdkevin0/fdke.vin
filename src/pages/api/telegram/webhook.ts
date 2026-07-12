export const prerender = false;

import type { APIRoute } from "astro";
import { applyChannelUpdate } from "@/lib/ap/ingest";
import { getApIngestEnv } from "@/lib/ap/runtime";
import { parseChannelUpdate, telegramUpdateSchema } from "@/lib/ap/telegram";
import { getErrorMessage, jsonError, jsonNoStore, logApiError, readJson } from "@/lib/api/http";
import { timingSafeEqual } from "@/lib/crypto";

/** Telegram sets this header to the secret token registered with `setWebhook`. */
const SECRET_HEADER = "x-telegram-bot-api-secret-token";

/**
 * Telegram channel-post webhook (issue AP-3).
 *
 * Authenticated by two independent checks: the shared webhook secret token
 * (proving the request came from Telegram's `setWebhook` for this bot) and the
 * allowlisted channel/chat id enforced inside `parseChannelUpdate` (proving the
 * post came from the author's own channel). A `channel_post` becomes a new Note
 * and an `edited_channel_post` updates the corresponding Note; every other
 * update is acknowledged and ignored.
 */
export const POST: APIRoute = async ({ request }) => {
	let env: Awaited<ReturnType<typeof getApIngestEnv>>;
	try {
		env = await getApIngestEnv();
	} catch (error) {
		logApiError("telegram.webhook", error);
		return jsonError(500, getErrorMessage(error, "Telegram ingestion is not configured"));
	}

	// Secret-token gate: reject anything not carrying the registered token.
	const provided = request.headers.get(SECRET_HEADER);
	if (
		!env.TELEGRAM_WEBHOOK_SECRET ||
		!provided ||
		!(await timingSafeEqual(provided, env.TELEGRAM_WEBHOOK_SECRET))
	) {
		return jsonError(401, "Unauthorized");
	}

	const allowedChatId = Number.parseInt(env.TELEGRAM_ALLOWED_CHAT_ID ?? "", 10);
	if (!Number.isFinite(allowedChatId)) {
		logApiError("telegram.webhook", new Error("TELEGRAM_ALLOWED_CHAT_ID is not a valid id"));
		return jsonError(500, "Telegram allowlist is not configured");
	}

	const update = await readJson(request, telegramUpdateSchema);
	if (update instanceof Response) return update;

	try {
		const result = parseChannelUpdate(update, { allowedChatId });
		const outcome = await applyChannelUpdate(env, result);
		return jsonNoStore(outcome, { status: 200 });
	} catch (error) {
		logApiError("telegram.webhook", error, { update_id: update.update_id });
		// A 500 lets Telegram retry transient failures (e.g. R2/D1 blips).
		return jsonError(500, getErrorMessage(error, "Failed to process update"));
	}
};
