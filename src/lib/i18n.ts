import type { CollectionEntry } from "astro:content";

export const SITE_LANG_QUERY_KEY = "lang";
export const SITE_LANG_STORAGE_KEY = "site-language";
export const SITE_LANG_COOKIE_KEY = "site-language";
export const SITE_LANGS = ["zh", "en", "ja"] as const;

export type SiteLang = (typeof SITE_LANGS)[number];

export const SITE_LANG_META: Record<
	SiteLang,
	{
		htmlLang: string;
		label: string;
		ogLocale: string;
		queryValue: string;
	}
> = {
	en: {
		htmlLang: "en-GB",
		label: "English",
		ogLocale: "en_GB",
		queryValue: "en",
	},
	ja: {
		htmlLang: "ja-JP",
		label: "日本語",
		ogLocale: "ja_JP",
		queryValue: "ja",
	},
	zh: {
		htmlLang: "zh-CN",
		label: "中文",
		ogLocale: "zh_CN",
		queryValue: "zh",
	},
};

export const DEFAULT_SITE_LANG: SiteLang = "en";

export function normalizeSiteLang(value: string | undefined): SiteLang | undefined {
	if (!value) return undefined;
	const normalized = value.toLowerCase();
	if (normalized === "en") return "en";
	if (normalized === "ja" || normalized === "jp" || normalized === "ja-jp") return "ja";
	if (normalized === "zh" || normalized === "cn" || normalized === "zh-cn") return "zh";
	return undefined;
}

export function isSiteLang(value: string | undefined): value is SiteLang {
	return normalizeSiteLang(value) !== undefined;
}

export function getSiteLangOrDefault(value: string | undefined): SiteLang {
	return normalizeSiteLang(value) ?? DEFAULT_SITE_LANG;
}

export function getSiteLangMeta(lang: SiteLang) {
	return SITE_LANG_META[lang];
}

export function getCountrySiteLang(country: string | undefined): SiteLang {
	const normalizedCountry = country?.toUpperCase();
	if (normalizedCountry === "CN") return "zh";
	if (normalizedCountry === "JP") return "ja";
	return "en";
}

export function getRequestSiteLang(url: URL, fallback: SiteLang): SiteLang {
	return normalizeSiteLang(url.searchParams.get(SITE_LANG_QUERY_KEY) ?? undefined) ?? fallback;
}

export function hasExplicitSiteLang(url: URL) {
	return normalizeSiteLang(url.searchParams.get(SITE_LANG_QUERY_KEY) ?? undefined) !== undefined;
}

export function withSiteLangQuery(path: string, lang: SiteLang, explicit = true) {
	const url = new URL(path, "https://fdke.vin");
	if (!explicit) return url.pathname;
	url.searchParams.set(SITE_LANG_QUERY_KEY, getSiteLangMeta(lang).queryValue);
	return `${url.pathname}${url.search}`;
}

export function getSiteUrlWithLang(url: URL, lang: SiteLang, explicit = true) {
	const nextUrl = new URL(url);
	if (!explicit) {
		nextUrl.searchParams.delete(SITE_LANG_QUERY_KEY);
		return `${nextUrl.pathname}${nextUrl.search}`;
	}
	nextUrl.searchParams.set(SITE_LANG_QUERY_KEY, getSiteLangMeta(lang).queryValue);
	return `${nextUrl.pathname}${nextUrl.search}`;
}

// Blog-specific functions

export function getPostSlug(post: Pick<CollectionEntry<"post">, "id">) {
	const match = post.id.match(/^\d{4}-\d{2}-\d{2}-(.+)-([a-z]{2,3})$/);
	if (!match) {
		throw new Error(`Post "${post.id}" must follow the "{date}-{slug}-{lang}" naming convention.`);
	}
	return match[1];
}

export function getPostPath(post: Pick<CollectionEntry<"post">, "id" | "data">, explicit = false) {
	return withSiteLangQuery(`/posts/${getPostSlug(post)}/`, post.data.lang, explicit);
}

export function getPostsPath(lang: SiteLang, page = 1, explicit = false) {
	const path = page === 1 ? "/posts/" : `/posts/${page}/`;
	return withSiteLangQuery(path, lang, explicit);
}

export function getTagPath(tag: string, lang: SiteLang, page = 1, explicit = false) {
	const path = page === 1 ? `/tags/${tag}/` : `/tags/${tag}/${page}/`;
	return withSiteLangQuery(path, lang, explicit);
}

export function getTagsIndexPath(lang: SiteLang, explicit = false) {
	return withSiteLangQuery("/tags/", lang, explicit);
}

export function getBlogRssPath(lang: SiteLang, explicit = false) {
	return withSiteLangQuery("/rss.xml", lang, explicit);
}

export function getSiteLanguageOptions(
	options: Partial<Record<SiteLang, { disabled?: boolean; href?: string }>> = {},
) {
	return SITE_LANGS.map((lang) => ({
		disabled: options[lang]?.disabled ?? false,
		href: options[lang]?.href,
		lang,
		meta: getSiteLangMeta(lang),
	}));
}
