import { type CollectionEntry, getCollection } from "astro:content";
import { DEFAULT_SITE_LANG, type SiteLang } from "@/lib/i18n";
import {
	resolvePostBySlug,
	resolvePostsByLang,
	resolveTranslationsByLang,
	validatePosts,
} from "@/lib/post";

/** filter out draft posts based on the environment */
export async function getAllPosts(lang?: SiteLang): Promise<CollectionEntry<"post">[]> {
	const posts = await getCollection("post", ({ data }) => {
		const draftAllowed = import.meta.env.PROD ? !data.draft : true;
		return draftAllowed && (lang ? data.lang === lang : true);
	});
	return validatePosts(posts);
}

export async function getPostsByLang(lang: SiteLang = DEFAULT_SITE_LANG) {
	return resolvePostsByLang(await getAllPosts(), lang);
}

export async function getPostBySlug(lang: SiteLang, slug: string) {
	return resolvePostBySlug(await getAllPosts(), lang, slug);
}

export async function getPostTranslationsByLang(post: CollectionEntry<"post">) {
	return resolveTranslationsByLang(await getAllPosts(), post);
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
