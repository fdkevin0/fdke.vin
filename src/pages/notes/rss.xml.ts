import { getApEnv } from "@/lib/ap/runtime";
import { buildNotesFeed } from "@/lib/rss";

export const prerender = false;

export const GET = async () => {
	const env = await getApEnv();
	return buildNotesFeed(env);
};
