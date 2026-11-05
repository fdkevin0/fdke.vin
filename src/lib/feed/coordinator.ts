import type { FeedEnv } from "@/lib/feed/runtime";
import { listActiveFeedSources } from "@/lib/feed/storage";
import type { FeedRunState } from "@/lib/feed/types";
import { FEED_COORDINATOR_NAME } from "@/lib/feed/types";

const RUN_STATE_KEY = "feed-run-state";
const RUN_TIMEOUT_MS = 1000 * 60 * 30;

export async function triggerFeedRun(
	env: FeedEnv,
	trigger: FeedRunState["trigger"],
	triggeredByEmail: string | null,
) {
	const stub = env.FEED_COORDINATOR.get(env.FEED_COORDINATOR.idFromName(FEED_COORDINATOR_NAME));
	const response = await stub.fetch("https://feed-coordinator.internal/runs/start", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ trigger, triggeredByEmail }),
	});
	return response.json();
}

export async function startRun(
	state: DurableObjectState,
	env: FeedEnv,
	options: { trigger: FeedRunState["trigger"]; triggeredByEmail: string | null },
): Promise<FeedRunState> {
	const existing = await state.storage.get<FeedRunState>(RUN_STATE_KEY);
	if (existing && existing.pending > 0) {
		return existing;
	}

	const feeds = await listActiveFeedSources(env);
	const runId = crypto.randomUUID();

	const nextState: FeedRunState = {
		runId,
		total: feeds.length,
		pending: feeds.length,
		successCount: 0,
		failureCount: 0,
		trigger: options.trigger,
		startedAt: new Date().toISOString(),
		triggeredByEmail: options.triggeredByEmail,
	};

	if (feeds.length === 0) {
		await state.storage.delete(RUN_STATE_KEY);
		return { ...nextState, pending: 0 };
	}

	await state.storage.put(RUN_STATE_KEY, nextState);
	await state.storage.setAlarm(Date.now() + RUN_TIMEOUT_MS);
	for (let index = 0; index < feeds.length; index += 100) {
		const slice = feeds.slice(index, index + 100);
		await env.RSS_FETCH_QUEUE.sendBatch(
			slice.map((feed) => ({
				body: {
					runId,
					feedId: feed.id,
					feedUrl: feed.feedUrl,
					aiTranslationEnabled: feed.aiTranslationEnabled,
				},
			})),
		);
	}

	return nextState;
}

export async function completeRunFeed(
	state: DurableObjectState,
	payload: { runId: string; ok: boolean },
): Promise<(FeedRunState & { completed?: boolean }) | null> {
	const runState = await state.storage.get<FeedRunState>(RUN_STATE_KEY);
	if (!runState || runState.runId !== payload.runId) {
		return null;
	}

	runState.pending = Math.max(0, runState.pending - 1);
	runState.successCount += payload.ok ? 1 : 0;
	runState.failureCount += payload.ok ? 0 : 1;

	if (runState.pending === 0) {
		await state.storage.delete(RUN_STATE_KEY);
		await state.storage.deleteAlarm();
		return { ...runState, completed: true };
	}

	await state.storage.put(RUN_STATE_KEY, runState);
	return runState;
}

export async function recoverTimedOutRun(state: DurableObjectState): Promise<void> {
	const runState = await state.storage.get<FeedRunState>(RUN_STATE_KEY);
	if (!runState) {
		return;
	}

	await state.storage.delete(RUN_STATE_KEY);
	await state.storage.deleteAlarm();
}
