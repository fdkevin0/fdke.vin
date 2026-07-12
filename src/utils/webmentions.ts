import { WEBMENTION_API_KEY } from "astro:env/server";
import * as fs from "node:fs";
import { z } from "zod";
import type { WebmentionsCache, WebmentionsChildren, WebmentionsFeed } from "@/types";

/**
 * Guard the fields the merge/filter logic dereferences (`wm-id` keys the merge
 * map; `wm-property`/`wm-target`/`content.text` drive filtering). `looseObject`
 * preserves the remaining fields (author, photo, url, …) that templates render.
 */
const webmentionChildSchema = z.looseObject({
	"wm-id": z.number(),
	"wm-property": z.string(),
	"wm-target": z.string(),
	content: z.looseObject({ text: z.string().optional() }).nullish(),
});

const webmentionsFeedSchema = z.object({
	children: z.array(webmentionChildSchema).default([]),
	name: z.string().default(""),
	type: z.string().default(""),
});

const DOMAIN = import.meta.env.SITE;
const CACHE_DIR = ".data";
const filePath = `${CACHE_DIR}/webmentions.json`;
const validWebmentionTypes = ["like-of", "mention-of", "in-reply-to"];

const hostName = new URL(DOMAIN).hostname;

// Calls webmention.io api.
async function fetchWebmentions(
	timeFrom: string | null,
	perPage = 1000,
): Promise<WebmentionsFeed | null> {
	if (!DOMAIN) {
		console.warn("No domain specified. Please set in astro.config.ts");
		return null;
	}

	if (!WEBMENTION_API_KEY) {
		console.warn("No webmention api token specified in .env");
		return null;
	}

	let url = `https://webmention.io/api/mentions.jf2?domain=${hostName}&token=${WEBMENTION_API_KEY}&sort-dir=up&per-page=${perPage}`;

	if (timeFrom) url += `&since${timeFrom}`;

	const res = await fetch(url);

	if (res.ok) {
		const parsed = webmentionsFeedSchema.safeParse(await res.json().catch(() => null));
		if (!parsed.success) {
			console.warn("Unexpected webmention.io response shape; skipping this fetch");
			return null;
		}
		return parsed.data as unknown as WebmentionsFeed;
	}

	return null;
}

// Merge cached entries [a] with fresh webmentions [b], merge by wm-id
function mergeWebmentions(a: WebmentionsCache, b: WebmentionsFeed): WebmentionsChildren[] {
	return Array.from(
		[...a.children, ...b.children]
			.reduce((map, obj) => map.set(obj["wm-id"], obj), new Map())
			.values(),
	);
}

// filter out WebmentionChildren
export function filterWebmentions(webmentions: WebmentionsChildren[]) {
	return webmentions.filter((webmention) => {
		// make sure the mention has a property so we can sort them later
		if (!validWebmentionTypes.includes(webmention["wm-property"])) return false;

		// make sure 'mention-of' or 'in-reply-to' has text content.
		if (webmention["wm-property"] === "mention-of" || webmention["wm-property"] === "in-reply-to") {
			return webmention.content && webmention.content.text !== "";
		}

		return true;
	});
}

// save combined webmentions in cache file
function writeToCache(data: WebmentionsCache) {
	const fileContent = JSON.stringify(data, null, 2);

	// create cache folder if it doesn't exist already
	if (!fs.existsSync(CACHE_DIR)) {
		fs.mkdirSync(CACHE_DIR);
	}

	// write data to cache json file
	fs.writeFile(filePath, fileContent, (err) => {
		if (err) throw err;
		console.log(`Webmentions saved to ${filePath}`);
	});
}

function getFromCache(): WebmentionsCache {
	if (fs.existsSync(filePath)) {
		const data = fs.readFileSync(filePath, "utf-8");
		return JSON.parse(data);
	}
	// no cache found
	return {
		lastFetched: null,
		children: [],
	};
}

async function getAndCacheWebmentions() {
	const cache = getFromCache();
	const mentions = await fetchWebmentions(cache.lastFetched);

	if (mentions) {
		mentions.children = filterWebmentions(mentions.children);
		const webmentions: WebmentionsCache = {
			lastFetched: new Date().toISOString(),
			// Make sure the first arg is the cache
			children: mergeWebmentions(cache, mentions),
		};

		writeToCache(webmentions);
		return webmentions;
	}

	return cache;
}

let webMentions: WebmentionsCache;

export async function getWebmentionsForUrl(url: string) {
	if (!webMentions) webMentions = await getAndCacheWebmentions();

	return webMentions.children.filter((entry) => entry["wm-target"] === url);
}
