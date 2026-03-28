import { type CollectionEntry, getCollection } from "astro:content";
import { DEFAULT_SITE_LANG, getPostSlug, SITE_LANGS, type SiteLang } from "@/lib/i18n";

function assertPostShape(posts: CollectionEntry<"post">[]) {
	const seen = new Set<string>();

	for (const post of posts) {
		const match = post.id.match(/^\d{4}-\d{2}-\d{2}-(.+)-([a-z]{2,3})$/);
		if (!match) {
			throw new Error(
				`Post "${post.id}" must follow the "{date}-{slug}-{lang}" naming convention.`,
			);
		}

		const [, fileSlug, fileLang] = match;
		if (post.data.lang !== fileLang) {
			throw new Error(
				`Post "${post.id}" has lang "${post.data.lang}" but filename lang "${fileLang}".`,
			);
		}

		const key = `${fileSlug}:${post.data.lang}`;
		if (seen.has(key)) {
			throw new Error(`Duplicate post locale entry "${key}".`);
		}
		seen.add(key);
	}

	return posts;
}

/** filter out draft posts based on the environment */
export async function getAllPosts(lang?: SiteLang): Promise<CollectionEntry<"post">[]> {
	const posts = await getCollection("post", ({ data }) => {
		const draftAllowed = import.meta.env.PROD ? !data.draft : true;
		return draftAllowed && (lang ? data.lang === lang : true);
	});
	return assertPostShape(posts);
}

function getPostFallbackLangs(lang: SiteLang) {
	return [
		lang,
		...(lang === DEFAULT_SITE_LANG ? [] : [DEFAULT_SITE_LANG]),
		...SITE_LANGS.filter((candidate) => candidate !== lang && candidate !== DEFAULT_SITE_LANG),
	];
}

function pickPostByLangPriority(posts: CollectionEntry<"post">[], lang: SiteLang) {
	const fallbackLangs = getPostFallbackLangs(lang);
	return fallbackLangs
		.map((candidateLang) => posts.find((post) => post.data.lang === candidateLang))
		.find((post) => post !== undefined);
}

export async function getPostsByLang(lang: SiteLang = DEFAULT_SITE_LANG) {
	const allPosts = await getAllPosts();
	const postsBySlug = new Map<string, CollectionEntry<"post">[]>();

	for (const post of allPosts) {
		const slug = getPostSlug(post);
		if (!slug) {
			continue;
		}
		const groupedPosts = postsBySlug.get(slug);
		if (groupedPosts) {
			groupedPosts.push(post);
			continue;
		}
		postsBySlug.set(slug, [post]);
	}

	return [...postsBySlug.values()].flatMap((posts) => {
		const preferredPost = pickPostByLangPriority(posts, lang);
		return preferredPost ? [preferredPost] : [];
	});
}

export async function getPostBySlug(lang: SiteLang, slug: string) {
	const posts = await getPostsByLang(lang);
	return posts.find((post) => getPostSlug(post) === slug);
}

export async function getPostBySlugAnyLang(slug: string) {
	const allPosts = await getAllPosts();
	return allPosts.find((post) => getPostSlug(post) === slug);
}

export async function getPostBySlugWithFallback(lang: SiteLang, slug: string) {
	const allPosts = await getAllPosts();
	const matchedPosts = allPosts.filter((post) => getPostSlug(post) === slug);
	return pickPostByLangPriority(matchedPosts, lang);
}

/** Get tag metadata by tag name */
export async function getTagMeta(tag: string): Promise<CollectionEntry<"tag"> | undefined> {
	const tagEntries = await getCollection("tag", (entry) => {
		return entry.id === tag;
	});
	return tagEntries[0];
}

/** groups posts by year (based on option siteConfig.sortPostsByUpdatedDate), using the year as the key
 *  Note: This function doesn't filter draft posts, pass it the result of getAllPosts above to do so.
 */
export function groupPostsByYear(posts: CollectionEntry<"post">[]) {
	return Object.groupBy(posts, (post) => post.data.publishDate.getFullYear().toString());
}

/** returns all tags created from posts (inc duplicate tags)
 *  Note: This function doesn't filter draft posts, pass it the result of getAllPosts above to do so.
 *  */
export function getAllTags(posts: CollectionEntry<"post">[]) {
	return posts.flatMap((post) => [...post.data.tags]);
}

/** returns all unique tags created from posts
 *  Note: This function doesn't filter draft posts, pass it the result of getAllPosts above to do so.
 *  */
export function getUniqueTags(posts: CollectionEntry<"post">[]) {
	return [...new Set(getAllTags(posts))];
}

/** returns a count of each unique tag - [[tagName, count], ...]
 *  Note: This function doesn't filter draft posts, pass it the result of getAllPosts above to do so.
 *  */
export function getUniqueTagsWithCount(posts: CollectionEntry<"post">[]): [string, number][] {
	return [
		...getAllTags(posts).reduce(
			(acc, t) => acc.set(t, (acc.get(t) ?? 0) + 1),
			new Map<string, number>(),
		),
	].sort((a, b) => b[1] - a[1]);
}

export async function getPostTranslations(post: CollectionEntry<"post">) {
	const allPosts = await getAllPosts();
	return allPosts.filter(
		(candidate) => candidate.id !== post.id && getPostSlug(candidate) === getPostSlug(post),
	);
}

export async function getPostTranslationsByLang(post: CollectionEntry<"post">) {
	const translations = await getPostTranslations(post);
	return Object.fromEntries(
		SITE_LANGS.map((lang) => [
			lang,
			lang === post.data.lang
				? post
				: translations.find((candidate) => candidate.data.lang === lang),
		]),
	) as Record<SiteLang, CollectionEntry<"post"> | undefined>;
}
