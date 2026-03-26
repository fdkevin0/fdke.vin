import type { CollectionEntry } from "astro:content";
import {
	DEFAULT_SITE_LANG,
	SITE_LANG_COOKIE_KEY,
	SITE_LANG_META,
	SITE_LANG_QUERY_KEY,
	SITE_LANGS,
	SITE_LANG_STORAGE_KEY,
	getCountrySiteLang,
	getRequestSiteLang,
	getSiteLangMeta,
	getSiteLangOrDefault,
	hasExplicitSiteLang,
	isSiteLang,
	normalizeSiteLang,
	type SiteLang,
} from "@/lib/i18n";

export const BLOG_LANG_QUERY_KEY = SITE_LANG_QUERY_KEY;
export const BLOG_LANG_STORAGE_KEY = SITE_LANG_STORAGE_KEY;
export const BLOG_LANG_COOKIE_KEY = SITE_LANG_COOKIE_KEY;
export const BLOG_LANGS = SITE_LANGS;
export type BlogLang = SiteLang;
export const BLOG_LANG_META = SITE_LANG_META;
export const DEFAULT_BLOG_LANG: BlogLang = DEFAULT_SITE_LANG;
export const normalizeBlogLang = normalizeSiteLang;
export const isBlogLang = isSiteLang;
export const getBlogLangOrDefault = getSiteLangOrDefault;
export const getBlogLangMeta = getSiteLangMeta;
export const getCountryBlogLang = getCountrySiteLang;
export const getRequestBlogLang = getRequestSiteLang;
export const hasExplicitBlogLang = hasExplicitSiteLang;

export function getPostSlug(post: Pick<CollectionEntry<"post">, "id">) {
	const match = post.id.match(/^\d{4}-\d{2}-\d{2}-(.+)-([a-z]{2,3})$/);
	if (!match) {
		throw new Error(`Post "${post.id}" must follow the "{date}-{slug}-{lang}" naming convention.`);
	}
	return match[1];
}

export function withBlogLangQuery(path: string, lang: BlogLang, explicit = true) {
	const url = new URL(path, "https://fdke.vin");
	if (!explicit) return url.pathname;
	url.searchParams.set(BLOG_LANG_QUERY_KEY, getBlogLangMeta(lang).queryValue);
	return `${url.pathname}${url.search}`;
}

export function getBlogUrlWithLang(url: URL, lang: BlogLang, explicit = true) {
	const nextUrl = new URL(url);
	if (!explicit) {
		nextUrl.searchParams.delete(BLOG_LANG_QUERY_KEY);
		return nextUrl.pathname;
	}
	nextUrl.searchParams.set(BLOG_LANG_QUERY_KEY, getBlogLangMeta(lang).queryValue);
	return `${nextUrl.pathname}${nextUrl.search}`;
}

export function getPostPath(post: Pick<CollectionEntry<"post">, "id" | "data">, explicit = false) {
	return withBlogLangQuery(`/posts/${getPostSlug(post)}/`, post.data.lang, explicit);
}

export function getPostsPath(lang: BlogLang, page = 1, explicit = false) {
	const path = page === 1 ? "/posts/" : `/posts/${page}/`;
	return withBlogLangQuery(path, lang, explicit);
}

export function getTagPath(tag: string, lang: BlogLang, page = 1, explicit = false) {
	const path = page === 1 ? `/tags/${tag}/` : `/tags/${tag}/${page}/`;
	return withBlogLangQuery(path, lang, explicit);
}

export function getTagsIndexPath(lang: BlogLang, explicit = false) {
	return withBlogLangQuery("/tags/", lang, explicit);
}

export function getBlogRssPath(lang: BlogLang, explicit = false) {
	return withBlogLangQuery("/rss.xml", lang, explicit);
}

export function getBlogLanguageOptions(
	options: Partial<Record<BlogLang, { disabled?: boolean; href?: string }>> = {},
) {
	return BLOG_LANGS.map((lang) => ({
		disabled: options[lang]?.disabled ?? false,
		href: options[lang]?.href,
		lang,
		meta: getBlogLangMeta(lang),
	}));
}
