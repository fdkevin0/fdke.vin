import { DurableObject } from "cloudflare:workers";
import { handle } from "@astrojs/cloudflare/handler";
import { z } from "zod";
import { AP_DELIVERY_QUEUE_NAME } from "@/lib/ap/config";
import { processDeliveryMessage } from "@/lib/ap/delivery";
import type { ApDeliveryMessage } from "@/lib/ap/types";
import { getErrorMessage } from "@/lib/api/http";
import { processAiMessage } from "@/lib/feed/ai";
import { completeRunFeed, recoverTimedOutRun, startRun } from "@/lib/feed/coordinator";
import { processFeedFetchMessage } from "@/lib/feed/ingest";
import type { FeedEnv } from "@/lib/feed/runtime";
import type { FeedAiMessage, FeedFetchMessage } from "@/lib/feed/types";
import { FEED_COORDINATOR_NAME, RSS_AI_QUEUE_NAME, RSS_FETCH_QUEUE_NAME } from "@/lib/feed/types";

const startRunSchema = z.object({
	trigger: z.enum(["cron", "manual", "alarm"]).optional().default("manual"),
	triggeredByEmail: z.string().nullable().optional().default(null),
});

const completeRunSchema = z.object({
	runId: z.string().min(1),
	ok: z.boolean(),
});

export class FeedCoordinator extends DurableObject<FeedEnv> {
	override async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === "POST" && url.pathname === "/runs/start") {
			const body = startRunSchema.safeParse(await request.json().catch(() => null));
			if (!body.success) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
			const run = await startRun(this.ctx, this.env, body.data);
			return Response.json(run, { headers: { "Cache-Control": "no-store" } });
		}

		if (request.method === "POST" && url.pathname === "/runs/complete") {
			const body = completeRunSchema.safeParse(await request.json().catch(() => null));
			if (!body.success) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
			const run = await completeRunFeed(this.ctx, this.env, body.data);
			return Response.json(run ?? { ignored: true }, { headers: { "Cache-Control": "no-store" } });
		}

		return new Response("Not found", { status: 404 });
	}

	override async alarm(): Promise<void> {
		await recoverTimedOutRun(this.ctx, this.env);
	}
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		return handle(request, env, ctx);
	},
	async scheduled(_controller, env, _ctx): Promise<void> {
		const stub = env.FEED_COORDINATOR.get(env.FEED_COORDINATOR.idFromName(FEED_COORDINATOR_NAME));
		await stub.fetch("https://feed-coordinator.internal/runs/start", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ trigger: "cron", triggeredByEmail: null }),
		});
	},
	async queue(batch, env, ctx): Promise<void> {
		for (const message of batch.messages) {
			try {
				if (batch.queue === RSS_FETCH_QUEUE_NAME) {
					await processFeedFetchMessage(env, message.body as FeedFetchMessage);
				} else if (batch.queue === RSS_AI_QUEUE_NAME) {
					const body = message.body as FeedAiMessage;
					await processAiMessage(env, body.itemId);
				} else if (batch.queue === AP_DELIVERY_QUEUE_NAME) {
					await processDeliveryMessage(env, message.body as ApDeliveryMessage);
				}
				message.ack();
			} catch (error) {
				console.error(
					`[queue:${batch.queue}] message failed`,
					getErrorMessage(error, "Unknown queue error"),
				);
				message.retry({ delaySeconds: Math.min(message.attempts * 30, 300) });
			}
		}
		ctx.waitUntil(Promise.resolve());
	},
} satisfies ExportedHandler<FeedEnv>;
