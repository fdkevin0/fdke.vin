import fs from "node:fs";
import path from "node:path";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import type { APIContext, InferGetStaticPropsType } from "astro";
import satori, { type SatoriOptions } from "satori";
import { html } from "satori-html";
import RobotoMonoBold from "@/assets/roboto-mono-700.ttf";
import RobotoMono from "@/assets/roboto-mono-regular.ttf";
import { getAllPosts } from "@/data/post";
import { siteConfig } from "@/site.config";
import { getFormattedDate } from "@/utils/date";

let wasmInitialized = false;

const ogOptions: SatoriOptions = {
	fonts: [
		{
			data: Buffer.from(RobotoMono),
			name: "Roboto Mono",
			style: "normal",
			weight: 400,
		},
		{
			data: Buffer.from(RobotoMonoBold),
			name: "Roboto Mono",
			style: "normal",
			weight: 700,
		},
	],
	height: 630,
	width: 1200,
};

const iconPathCandidates = [
	path.resolve("./public/icons/icon-120.png"),
	path.resolve("./public/icons/icon-source.png"),
];
const wasmPath = path.resolve("./node_modules/@resvg/resvg-wasm/index_bg.wasm");
const iconPath = iconPathCandidates.find((candidate) => fs.existsSync(candidate));

if (!iconPath) {
	throw new Error("Missing OG icon. Run `npm run icons:build` to generate it.");
}

if (!fs.existsSync(wasmPath)) {
	throw new Error("Missing Resvg wasm binary in node_modules.");
}

const iconDataUri = `data:image/png;base64,${fs.readFileSync(iconPath).toString("base64")}`;

const markup = (title: string, pubDate: string) =>
	html`<div tw="flex flex-col w-full h-full bg-[#1d1f21] text-[#c9cacc]">
		<div tw="flex flex-col flex-1 w-full p-10 justify-center">
			<p tw="text-2xl mb-6">${pubDate}</p>
			<h1 tw="text-6xl font-bold leading-snug text-white">${title}</h1>
		</div>
		<div tw="flex items-center justify-between w-full p-10 border-t border-[#2bbc89] text-xl">
			<div tw="flex items-center">
				<img src="${iconDataUri}" tw="w-[60px] h-[60px]" />
				<p tw="ml-3 font-semibold">${siteConfig.title}</p>
			</div>
			<p>by ${siteConfig.author}</p>
		</div>
	</div>`;

type Props = InferGetStaticPropsType<typeof getStaticPaths>;

export async function GET(context: APIContext) {
	if (!wasmInitialized) {
		await initWasm(fs.readFileSync(wasmPath));
		wasmInitialized = true;
	}

	const { pubDate, title } = context.props as Props;

	const postDate = getFormattedDate(pubDate, {
		month: "long",
		weekday: "long",
	});
	const svg = await satori(markup(title, postDate), ogOptions);
	const resvg = new Resvg(svg);
	const pngData = resvg.render();
	const pngBytes = pngData.asPng();
	return new Response(pngBytes as unknown as BodyInit, {
		headers: {
			"Cache-Control": "public, max-age=31536000, immutable",
			"Content-Type": "image/png",
		},
	});
}

export async function getStaticPaths() {
	const posts = await getAllPosts();
	return posts
		.filter(({ data }) => !data.ogImage)
		.map((post) => ({
			params: { slug: post.id },
			props: {
				pubDate: post.data.updatedDate ?? post.data.publishDate,
				title: post.data.title,
			},
		}));
}
