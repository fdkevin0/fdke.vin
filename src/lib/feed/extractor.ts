import { XMLParser } from "fast-xml-parser";

export interface FeedDocumentEntry {
	id: string;
	link: string | undefined;
	title: string | undefined;
	summary: string | undefined;
	published: string | undefined;
	author: string | null | undefined;
}

export interface FeedDocument {
	title: string | undefined;
	link: string | undefined;
	description: string | undefined;
	generator: string | undefined;
	language: string | undefined;
	published: string | undefined;
	entries: FeedDocumentEntry[] | undefined;
}

export const FEED_USER_AGENT = "fdke.vin feed bot/1.0 (+https://fdke.vin)";
const FEED_XML_ENTITY_LIMIT = 100_000;

export interface FeedSourceMetadata {
	title: string;
	siteUrl: string | null;
}

export async function resolveFeedSourceMetadata(feedUrl: string): Promise<FeedSourceMetadata> {
	const response = await fetch(feedUrl, createFeedFetchOptions());
	if (!response.ok) {
		throw new Error(`Feed request failed with ${response.status}`);
	}

	const feed = extractFeedDocument(await response.text(), {
		contentType: response.headers.get("content-type"),
		baseUrl: feedUrl,
	});
	const title = feed.title?.trim();

	if (!title) {
		throw new Error("Feed did not provide a title");
	}

	return {
		title,
		siteUrl: normalizeUrl(feed.link),
	};
}

export function extractFeedDocument(
	input: string,
	options: { contentType?: string | null; baseUrl?: string } = {},
): FeedDocument {
	if (isJsonFeed(input, options.contentType)) {
		return parseJsonFeed(JSON.parse(input), options.baseUrl);
	}

	const parser = new XMLParser({
		ignoreAttributes: false,
		attributeNamePrefix: "@_",
		allowBooleanAttributes: true,
		processEntities: {
			enabled: true,
			maxTotalExpansions: FEED_XML_ENTITY_LIMIT,
		},
	});

	const result = parser.parse(input);

	if (result.rss?.channel) {
		return parseRssFeed(result.rss.channel, options.baseUrl);
	}

	if (result.feed?.xmlns === "http://www.w3.org/2005/Atom") {
		return parseAtomFeed(result.feed, options.baseUrl);
	}

	if (result["rdf:RDF"]) {
		return parseRdfFeed(result["rdf:RDF"], options.baseUrl);
	}

	throw new Error("Feed does not contain supported item nodes");
}

function createFeedFetchOptions(): RequestInit {
	return {
		headers: {
			"user-agent": FEED_USER_AGENT,
			accept:
				"application/rss+xml, application/atom+xml, application/feed+json, application/json, application/xml, text/xml;q=0.9, */*;q=0.8",
		},
		signal: AbortSignal.timeout(15000),
	};
}

function isJsonFeed(input: string, contentType?: string | null): boolean {
	if (contentType?.includes("json")) {
		return true;
	}

	const normalized = input.trimStart();
	return normalized.startsWith("{") || normalized.startsWith("[");
}

function normalizeUrl(value: string | undefined): string | null {
	if (!value) {
		return null;
	}

	try {
		const url = new URL(value);
		return ["http:", "https:"].includes(url.protocol) ? url.toString() : null;
	} catch {
		return null;
	}
}

function normalizeDate(
	value: string | null | undefined,
	useISODateFormat = true,
): string | undefined {
	if (!value) {
		return undefined;
	}

	if (useISODateFormat) {
		const parsed = new Date(value);
		return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
	}

	return value;
}

function getText(value: unknown): string {
	if (typeof value === "string") {
		return value.trim();
	}
	if (typeof value === "object" && value !== null && "#text" in value) {
		return String(value["#text"]).trim();
	}
	return "";
}

function getPureUrl(link: string | undefined, baseUrl?: string): string | undefined {
	if (!link) {
		return undefined;
	}

	try {
		if (link.startsWith("http://") || link.startsWith("https://")) {
			return link;
		}
		if (baseUrl) {
			return new URL(link, baseUrl).toString();
		}
	} catch {
		return undefined;
	}

	return undefined;
}

function parseRssFeed(channel: Record<string, unknown>, baseUrl?: string): FeedDocument {
	const items = Array.isArray(channel.item) ? channel.item : channel.item ? [channel.item] : [];

	return {
		title: getText(channel.title),
		link: getPureUrl(getText(channel.link as string), baseUrl),
		description: getText(channel.description),
		generator: getText(channel.generator),
		language: getText(channel.language),
		published: normalizeDate(channel.lastBuildDate as string),
		entries: items.map((item: Record<string, unknown>, index: number) => {
			const title = getText(item.title);
			const link = getPureUrl(getText(item.link as string), baseUrl);
			const guid = getText(item.guid as string) || link || `${title}-${index}`;
			const summary = getText(item.description);
			const author =
				getText(item.author as string) ||
				getText(item["dc:creator"] as string) ||
				getText(item["itunes:author"] as string) ||
				null;

			return {
				id: guid,
				title: title || "Untitled item",
				link,
				summary,
				published: normalizeDate(item.pubDate as string),
				author,
			};
		}),
	};
}

function parseAtomFeed(feed: Record<string, unknown>, baseUrl?: string): FeedDocument {
	const entries = Array.isArray(feed.entry) ? feed.entry : feed.entry ? [feed.entry] : [];

	return {
		title: getText(feed.title),
		link: getPureUrl(
			getText((feed.link as Record<string, unknown>)?.["@_href"] as string),
			baseUrl,
		),
		description: getText(feed.subtitle),
		generator: getText((feed.generator as Record<string, unknown>)?.["#text"] as string),
		language: getText(feed.lang),
		published: normalizeDate(feed.updated as string),
		entries: entries.map((entry: Record<string, unknown>, index: number) => {
			const title = getText(entry.title);
			const linkEntry = entry.link as Record<string, unknown>;
			const link = getPureUrl(getText(linkEntry?.["@_href"] as string), baseUrl);
			const id = getText(entry.id as string) || link || `${title}-${index}`;
			const summary = getText(entry.summary);
			const author = getText((entry.author as Record<string, unknown>)?.name as string) || null;

			return {
				id,
				title: title || "Untitled item",
				link,
				summary,
				published: normalizeDate((entry.updated as string) || (entry.published as string)),
				author,
			};
		}),
	};
}

function parseRdfFeed(rdf: Record<string, unknown>, baseUrl?: string): FeedDocument {
	const items = Array.isArray(rdf.item) ? rdf.item : rdf.item ? [rdf.item] : [];
	const channel = rdf.channel as Record<string, unknown> | undefined;

	return {
		title: getText(channel?.title),
		link: getPureUrl(getText(channel?.link as string), baseUrl),
		description: getText(channel?.description),
		generator: undefined,
		language: undefined,
		published: undefined,
		entries: items.map((item: Record<string, unknown>, index: number) => {
			const title = getText(item.title);
			const link = getPureUrl(getText(item.link as string), baseUrl);
			const id = getText(item["dc:identifier"] as string) || link || `${title}-${index}`;
			const summary = getText(item.description);
			const author = getText(item["dc:creator"] as string) || null;

			return {
				id,
				title: title || "Untitled item",
				link,
				summary,
				published: normalizeDate(item["dc:date"] as string),
				author,
			};
		}),
	};
}

function parseJsonFeed(json: unknown, baseUrl?: string): FeedDocument {
	if (typeof json !== "object" || json === null) {
		throw new Error("Invalid JSON feed");
	}

	const feed = json as Record<string, unknown>;
	const items = Array.isArray(feed.items) ? feed.items : [];

	return {
		title: getText(feed.title),
		link: getPureUrl(getText(feed.home_page_url as string), baseUrl),
		description: getText(feed.description),
		generator: getText(feed.generator),
		language: getText(feed.language),
		published: normalizeDate((feed.last_modified as string) || (feed.expiration_date as string)),
		entries: items.map((item: Record<string, unknown>, index: number) => {
			const title = getText(item.title);
			const link = getPureUrl(getText(item.url as string), baseUrl);
			const id = getText(item.id as string) || link || `${title}-${index}`;
			const summary = getText(item.summary);
			const author = getText(item.author as string) || null;

			return {
				id,
				title: title || "Untitled item",
				link,
				summary,
				published: normalizeDate((item.date_published as string) || (item.date_modified as string)),
				author,
			};
		}),
	};
}
