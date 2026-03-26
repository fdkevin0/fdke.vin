import rss from "@astrojs/rss";
import { getPostsByLang } from "@/data/post";
import { getPostPath, getRequestSiteLang, hasExplicitSiteLang } from "@/lib/i18n";
import { siteConfig } from "@/site.config";

export const prerender = false;

export const GET = async ({ url, locals }: { url: URL; locals: App.Locals }) => {
	const blogLang = getRequestSiteLang(url, locals.siteDefaultLang);
	const explicitLang = hasExplicitSiteLang(url);
	const posts = await getPostsByLang(blogLang);

	return rss({
		title: `${siteConfig.title} (${blogLang})`,
		description: siteConfig.description,
		site: import.meta.env.SITE,
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.publishDate,
			link: getPostPath(post, explicitLang),
		})),
	});
};
