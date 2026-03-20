type DlsiteLocale = "ja_JP" | "zh_CN" | "zh_TW" | "en_US";

interface DlsiteEdition {
	lang: string;
}

interface DlsiteCreator {
	name: string;
}

interface DlsiteProductInfo {
	workno: string;
	work_name: string;
	maker_id: string;
	maker_name: string;
	maker_name_en: string;
	series_id: string;
	series_name: string;
	age_category: number;
	age_category_string: string;
	regist_date: string;
	update_date: string;
	genres: Array<{ name: string }>;
	editions: DlsiteEdition[] | Record<string, DlsiteEdition>;
	creaters: {
		created_by: DlsiteCreator[];
		scenario_by: DlsiteCreator[];
		illust_by: DlsiteCreator[];
		voice_by: DlsiteCreator[];
	};
	image_main: {
		url?: string | null;
	};
}

export interface DlsiteWorkInfo {
	workno: string;
	work_name: string;
	maker_id: string;
	maker_name: string;
	maker_name_en: string;
	series_id: string;
	series_name: string;
	age_category: number;
	age_category_string: string;
	created_by: string[];
	scenario_by: string[];
	illust_by: string[];
	voice_by: string[];
	release_date: string;
	update_date: string;
	main_genre: string[];
	languages: string[];
	cover_url: string;
}

export interface DlsiteScrapedWorkInfo {
	work_name?: string;
	maker_name?: string;
	category_type: string[];
	main_genre: string[];
	author: string[];
}

export function parseDlsiteLocale(locale: string | null): DlsiteLocale | undefined {
	if (!locale) {
		return undefined;
	}

	if (locale === "ja_JP" || locale === "zh_CN" || locale === "zh_TW" || locale === "en_US") {
		return locale;
	}

	return undefined;
}

export async function getDlsiteWorkInfo(code: string, locale?: DlsiteLocale) {
	const dlsite = new DLsiteClient(code, locale);

	if (code.startsWith("RJ")) {
		const product = await dlsite.fetchManiaxApi(code);
		return toManiaxWorkInfo(product);
	}

	const response = await dlsite.fetchProductPage();
	if (!response.ok) {
		throw new Error("DLsite scrape shield encountered");
	}

	return dlsite.parseProductWork(response);
}

function toManiaxWorkInfo(info: DlsiteProductInfo): DlsiteWorkInfo {
	const editions = Array.isArray(info.editions) ? info.editions : Object.values(info.editions);
	const languages = new Set<string>();

	for (const edition of editions) {
		for (const lang of edition.lang.split(",")) {
			const value = lang.trim();
			if (value) {
				languages.add(value);
			}
		}
	}

	const mapCreators = (creators: DlsiteCreator[]) => creators.map((creator) => creator.name);
	const coverUrl = info.image_main.url ?? "";

	return {
		workno: info.workno,
		work_name: info.work_name,
		maker_id: info.maker_id,
		maker_name: info.maker_name,
		maker_name_en: info.maker_name_en,
		series_id: info.series_id,
		series_name: info.series_name,
		age_category: info.age_category,
		age_category_string: info.age_category_string,
		release_date: info.regist_date,
		update_date: info.update_date,
		main_genre: info.genres.map((genre) => genre.name),
		languages: Array.from(languages),
		created_by: mapCreators(info.creaters.created_by),
		scenario_by: mapCreators(info.creaters.scenario_by),
		illust_by: mapCreators(info.creaters.illust_by),
		voice_by: mapCreators(info.creaters.voice_by),
		cover_url: coverUrl.startsWith("//") ? `https${coverUrl}` : coverUrl,
	};
}

class DLsiteClient {
	private readonly locale: DlsiteLocale;
	private readonly url: string;

	constructor(code: string, locale?: DlsiteLocale) {
		if (!code) {
			throw new Error("DLsite code is required");
		}

		this.locale = locale ?? "ja_JP";
		this.url = `https://www.dlsite.com/maniax/work/=/product_id/${code}.html/?locale=${this.locale}`;
	}

	async fetchManiaxApi(code: string): Promise<DlsiteProductInfo> {
		if (!code.startsWith("RJ")) {
			throw new Error("Invalid code format: must start with RJ for Maniax works");
		}

		const response = await fetch(
			`https://www.dlsite.com/maniax/api/=/product.json?workno=${code}&locale=${this.locale}`,
			{
				headers: {
					"User-Agent": USER_AGENT,
				},
			},
		);

		if (!response.ok) {
			throw new Error(`DLsite API request failed with status ${response.status}`);
		}

		const data = (await response.json()) as DlsiteProductInfo[];
		if (!data.length) {
			throw new Error("DLsite API returned empty data");
		}

		return data[0]!;
	}

	async fetchProductPage() {
		return fetch(this.url, {
			headers: {
				"User-Agent": USER_AGENT,
			},
		});
	}

	async parseProductWork(response: Response): Promise<DlsiteScrapedWorkInfo> {
		const result: DlsiteScrapedWorkInfo = {
			category_type: [],
			main_genre: [],
			author: [],
		};

		await new HTMLRewriter()
			.on("h1#work_name", {
				text(text) {
					result.work_name = `${result.work_name ?? ""}${text.text}`;
				},
			})
			.on("span.maker_name a", {
				text(text) {
					result.maker_name = `${result.maker_name ?? ""}${text.text}`;
				},
			})
			.on("div.work_genre#category_type a", {
				text(text) {
					const value = text.text.trim();
					if (value) {
						result.category_type.push(value);
					}
				},
			})
			.on("div.main_genre a", {
				text(text) {
					const value = text.text.trim();
					if (value) {
						result.main_genre.push(value);
					}
				},
			})
			.transform(response)
			.text();

		return result;
	}
}

const USER_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36";
