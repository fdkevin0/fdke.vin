import { DEFAULT_SITE_LANG, SITE_LANGS, type SiteLang, withSiteLangQuery } from "@/lib/i18n";

/** The post grammar: every post file is named `{date}-{slug}-{lang}`. */
const POST_ID_PATTERN = /^(\d{4}-\d{2}-\d{2})-(.+)-([a-z]{2,3})$/;

/** Minimal shape of a post entry; `CollectionEntry<"post">` satisfies it. */
export interface PostRef {
	id: string;
	data: { lang: SiteLang };
}

export interface PostId {
	date: string;
	slug: string;
	lang: string;
}

export function parsePostId(id: string): PostId {
	const match = id.match(POST_ID_PATTERN);
	if (!match?.[1] || !match[2] || !match[3]) {
		throw new Error(`Post "${id}" must follow the "{date}-{slug}-{lang}" naming convention.`);
	}
	return { date: match[1], lang: match[3], slug: match[2] };
}

export function getPostSlug(post: Pick<PostRef, "id">) {
	return parsePostId(post.id).slug;
}

export function getPostPath(post: PostRef, explicit = false) {
	return withSiteLangQuery(`/posts/${getPostSlug(post)}/`, post.data.lang, explicit);
}

/** Asserts every post follows the post grammar, declares a matching lang, and no locale entry repeats. */
export function validatePosts<T extends PostRef>(posts: T[]): T[] {
	const seen = new Set<string>();

	for (const post of posts) {
		const { slug, lang } = parsePostId(post.id);
		if (post.data.lang !== lang) {
			throw new Error(
				`Post "${post.id}" has lang "${post.data.lang}" but filename lang "${lang}".`,
			);
		}

		const key = `${slug}:${post.data.lang}`;
		if (seen.has(key)) {
			throw new Error(`Duplicate post locale entry "${key}".`);
		}
		seen.add(key);
	}

	return posts;
}

/** Fallback priority: requested lang, then the default lang, then the remaining site langs. */
export function getPostFallbackLangs(lang: SiteLang): SiteLang[] {
	return [
		lang,
		...(lang === DEFAULT_SITE_LANG ? [] : [DEFAULT_SITE_LANG]),
		...SITE_LANGS.filter((candidate) => candidate !== lang && candidate !== DEFAULT_SITE_LANG),
	];
}

function pickPostByLangPriority<T extends PostRef>(posts: T[], lang: SiteLang) {
	return getPostFallbackLangs(lang)
		.map((candidateLang) => posts.find((post) => post.data.lang === candidateLang))
		.find((post) => post !== undefined);
}

/** One post per slug, each resolved by fallback priority for the given lang. */
export function resolvePostsByLang<T extends PostRef>(posts: T[], lang: SiteLang): T[] {
	const postsBySlug = new Map<string, T[]>();

	for (const post of posts) {
		const slug = getPostSlug(post);
		const groupedPosts = postsBySlug.get(slug);
		if (groupedPosts) {
			groupedPosts.push(post);
		} else {
			postsBySlug.set(slug, [post]);
		}
	}

	return [...postsBySlug.values()].flatMap((group) => {
		const preferredPost = pickPostByLangPriority(group, lang);
		return preferredPost ? [preferredPost] : [];
	});
}

/** Resolves one post for the slug, applying fallback priority for the given lang. */
export function resolvePostBySlug<T extends PostRef>(posts: T[], lang: SiteLang, slug: string) {
	return pickPostByLangPriority(
		posts.filter((post) => getPostSlug(post) === slug),
		lang,
	);
}

/** Maps every site lang to the matching translation of the post, if one exists. */
export function resolveTranslationsByLang<T extends PostRef>(posts: T[], post: T) {
	const slug = getPostSlug(post);
	const translations = posts.filter(
		(candidate) => candidate.id !== post.id && getPostSlug(candidate) === slug,
	);
	return Object.fromEntries(
		SITE_LANGS.map((lang) => [
			lang,
			lang === post.data.lang
				? post
				: translations.find((candidate) => candidate.data.lang === lang),
		]),
	) as Record<SiteLang, T | undefined>;
}
