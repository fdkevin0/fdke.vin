import type { SiteConfig } from "@/types";

export const siteConfig: SiteConfig = {
	author: "FDKevin",
	date: {
		locale: "en-GB",
		options: {
			day: "numeric",
			month: "short",
			year: "numeric",
		},
	},
	description:
		"FDKevin's personal site with writing, notes, photography tools, and practical web experiments.",
	lang: "en-GB",
	ogLocale: "en_GB",
	title: "fdke.vin",
	url: "https://fdke.vin/",
};

// Used to generate links in both the Header & Footer.
export const menuLinks: { path: string; title: string }[] = [
	{
		path: "/",
		title: "Home",
	},
	{
		path: "/about/",
		title: "About",
	},
	{
		path: "/posts/",
		title: "Blog",
	},
	{
		path: "/notes/",
		title: "Notes",
	},
	{
		path: "/tools/",
		title: "Tools",
	},
	{
		path: "/dashboard/",
		title: "Dashboard",
	},
];
