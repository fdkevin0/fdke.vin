import { getRequestSiteLang, hasExplicitSiteLang } from "@/lib/i18n";
import { buildBlogFeed } from "@/lib/rss";

export const prerender = false;

export const GET = async ({ url, locals }: { url: URL; locals: App.Locals }) => {
	const blogLang = getRequestSiteLang(url, locals.siteDefaultLang);
	return buildBlogFeed(blogLang, hasExplicitSiteLang(url));
};
