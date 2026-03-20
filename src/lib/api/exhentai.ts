import { getCloudflareEnv } from "@/lib/cloudflare-runtime";

export interface TorrentInfo {
	title?: string;
	torrents: Torrent[];
}

export interface Torrent {
	postedDate?: string;
	size?: string;
	seeds?: number;
	peers?: number;
	downloads?: number;
	uploader?: string;
	torrentUrl?: string;
	torrentName?: string;
	torrentId?: string;
}

export async function getExhentaiTorrentInfo(gid: string, token: string): Promise<TorrentInfo> {
	const cookie = await getExhentaiCookie();
	const parser = new TorrentParser(cookie);
	await parser.init(`https://exhentai.org/gallerytorrents.php?gid=${gid}&t=${token}`);
	return parser.getInfo();
}

async function getExhentaiCookie(): Promise<string> {
	const runtimeEnv = await getCloudflareEnv<{ EXHENTAI_COOKIE?: string }>();
	const cookie = runtimeEnv.EXHENTAI_COOKIE?.trim();

	if (!cookie) {
		throw new Error("EXHENTAI_COOKIE is not configured");
	}

	return cookie;
}

class TorrentParser {
	private info: TorrentInfo = {
		torrents: [],
	};

	constructor(private readonly cookie: string) {}

	async init(link: string): Promise<void> {
		if (!link) {
			throw new Error("Invalid link: link cannot be empty");
		}

		const html = await this.sendRequest(link);
		await this.parseTorrentInfo(html);
	}

	getInfo(): TorrentInfo {
		return structuredClone(this.info);
	}

	private async parseTorrentInfo(html: string): Promise<void> {
		const info: TorrentInfo = {
			torrents: [],
		};

		await new HTMLRewriter()
			.on("h1", {
				text(text) {
					info.title = `${info.title ?? ""}${text.text}`;
				},
			})
			.on("form input[name='gtid']", {
				element(element) {
					const torrentId = element.getAttribute("value");
					info.torrents.push(torrentId ? { torrentId } : {});
				},
			})
			.on("form tr:first-child > td:nth-child(1) span:nth-child(2)", {
				text(text) {
					const torrent = info.torrents.at(-1);
					const value = text.text.trim();
					if (torrent && value) {
						torrent.postedDate = value;
					}
				},
			})
			.on("form tr:first-child > td:nth-child(2)", {
				text(text) {
					const torrent = info.torrents.at(-1);
					const value = text.text.trim();
					if (torrent && value) {
						torrent.size = value;
					}
				},
			})
			.on("form tr:first-child > td:nth-child(4)", {
				text(text) {
					const torrent = info.torrents.at(-1);
					const value = Number.parseInt(text.text.trim(), 10);
					if (torrent && Number.isFinite(value)) {
						torrent.seeds = value;
					}
				},
			})
			.on("form tr:first-child > td:nth-child(5)", {
				text(text) {
					const torrent = info.torrents.at(-1);
					const value = Number.parseInt(text.text.trim(), 10);
					if (torrent && Number.isFinite(value)) {
						torrent.peers = value;
					}
				},
			})
			.on("form tr:first-child > td:nth-child(6)", {
				text(text) {
					const torrent = info.torrents.at(-1);
					const value = Number.parseInt(text.text.trim(), 10);
					if (torrent && Number.isFinite(value)) {
						torrent.downloads = value;
					}
				},
			})
			.on("form tr:nth-child(2) > td:nth-child(1)", {
				text(text) {
					const torrent = info.torrents.at(-1);
					const value = text.text.trim();
					if (torrent && value) {
						torrent.uploader = value;
					}
				},
			})
			.on("form tr td a[onclick]", {
				text(text) {
					const torrent = info.torrents.at(-1);
					const value = text.text.trim();
					if (torrent && value) {
						torrent.torrentName = value;
					}
				},
				element(element) {
					const torrent = info.torrents.at(-1);
					const href = element.getAttribute("href");
					if (torrent && href) {
						torrent.torrentUrl = href;
					}
				},
			})
			.transform(new Response(html))
			.text();

		this.info = info;
	}

	private async sendRequest(url: string): Promise<string> {
		const response = await fetch(url, {
			headers: {
				cookie: this.cookie,
				"User-Agent": USER_AGENT,
			},
		});

		if (response.status === 404) {
			throw new Error("Torrent page not found");
		}

		if (!response.ok) {
			throw new Error(`Failed to load torrent data: HTTP ${response.status}`);
		}

		return response.text();
	}
}

const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";
