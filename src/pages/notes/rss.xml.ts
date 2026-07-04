import { buildNotesFeed } from "@/lib/rss";

export const GET = async () => {
	return buildNotesFeed();
};
