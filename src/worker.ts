import { DurableObject } from "cloudflare:workers";
import { handle } from "@astrojs/cloudflare/handler";
import { getErrorMessage } from "@/lib/api/http";
import { processAiMessage } from "@/lib/feed/ai";
import { completeRunFeed, recoverTimedOutRun, startRun } from "@/lib/feed/coordinator";
import { processFeedFetchMessage } from "@/lib/feed/ingest";
import type { FeedEnv } from "@/lib/feed/runtime";
import type { FeedAiMessage, FeedFetchMessage } from "@/lib/feed/types";
import { FEED_COORDINATOR_NAME, RSS_AI_QUEUE_NAME, RSS_FETCH_QUEUE_NAME } from "@/lib/feed/types";

export class FeedCoordinator extends DurableObject<FeedEnv> {
	override async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (request.method === "POST" && url.pathname === "/runs/start") {
			const body = (await request.json()) as {
				trigger?: "cron" | "manual" | "alarm";
				triggeredByEmail?: string | null;
			};
			const run = await startRun(this.ctx, this.env, {
				trigger: body.trigger ?? "manual",
				triggeredByEmail: body.triggeredByEmail ?? null,
			});
			return Response.json(run, { headers: { "Cache-Control": "no-store" } });
		}

		if (request.method === "POST" && url.pathname === "/runs/complete") {
			const body = (await request.json()) as { runId: string; ok: boolean };
			const run = await completeRunFeed(this.ctx, this.env, body);
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
