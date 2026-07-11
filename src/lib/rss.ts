import rss, { type RSSFeedItem } from "@astrojs/rss";
import { getPostsByLang } from "@/data/post";
import type { ApEnv } from "@/lib/ap/runtime";
import { listNotes } from "@/lib/ap/storage";
import type { SiteLang } from "@/lib/i18n";
import { getPostPath } from "@/lib/post";
import { siteConfig } from "@/site.config";

// The site's own feeds. The unrelated feed *aggregator* lives in @/lib/feed.

function buildSiteFeed(title: string, items: RSSFeedItem[]) {
	return rss({
		title,
		description: siteConfig.description,
		site: import.meta.env.SITE,
		items,
	});
}

export async function buildBlogFeed(lang: SiteLang, explicit: boolean) {
	const posts = await getPostsByLang(lang);
	return buildSiteFeed(
		`${siteConfig.title} (${lang})`,
		posts.map((post) => ({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.publishDate,
			link: getPostPath(post, explicit),
		})),
	);
}

export async function buildNotesFeed(env: ApEnv) {
	const notes = await listNotes(env);
	return buildSiteFeed(
		siteConfig.title,
		notes.map((note) => ({
			title: note.title ?? `Note on ${note.publishDate.toLocaleDateString()}`,
			pubDate: note.publishDate,
			link: `notes/${note.id}/`,
		})),
	);
}
